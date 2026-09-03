import asyncio
import json
from typing import List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
import httpx

from app.core.auth import authenticate_client
from app.schemas.guidelines import (
    GuidelineCheckRequest,
    WebhookPayload,
    DynamicGuidelinesPayload,
)
from app.services.guidelines.guideline_registry import guideline_registry
from app.services.guidelines.verifier import guideline_verifier
from app.services.guidelines.webhook_service import webhook_service
from app.services.guidelines.guideline_parser import (
    extract_raw_text_from_file,
    generate_structured_guidelines,
)
from app.services.ingestion.pdf_processor import pdf_processor
from app.services.qwen.client import qwen_client

router = APIRouter(tags=["Guideline Verification & Finetech Contract"])


# ================================================================
# 1. DYNAMIC GUIDELINES CONFIGURATION (JSON & POLICY DOC UPLOAD)
# ================================================================

@router.post("/company/guidelines")
async def save_company_guidelines(
    payload: DynamicGuidelinesPayload,
    client: dict = Depends(authenticate_client),
):
    """
    Allows an authenticated tenant to register or update custom verification guidelines via JSON.
    """
    company_id = client.get("company_id")
    if not company_id:
        raise HTTPException(status_code=401, detail="Authenticated client has no company_id")

    saved = guideline_registry.save_guidelines(company_id=company_id, guidelines=payload.guidelines)
    return {
        "status": "success",
        "company_id": company_id,
        "total_guidelines": len(saved),
        "guidelines": saved,
    }


@router.post(
    "/company/guidelines/upload-policy",
    summary="Upload Policy PDF/DOCX to Auto-Generate Verification Guidelines",
    status_code=status.HTTP_200_OK,
)
async def upload_company_policy_doc(
    file: UploadFile = File(..., description="Upload guideline document (.pdf, .docx, .txt)"),
    client: dict = Depends(authenticate_client),
):
    """
    Accepts a company policy document (PDF/Word), extracts discrete rules using LLM,
    and registers them as active compliance guidelines for this company.
    """
    company_id = client.get("company_id")
    if not company_id:
        raise HTTPException(status_code=401, detail="Authenticated client has no company_id")

    file_bytes = await file.read()
    raw_text = extract_raw_text_from_file(file_bytes, file.filename)
    extracted_guidelines = await generate_structured_guidelines(raw_text)

    if not extracted_guidelines:
        raise HTTPException(
            status_code=422,
            detail="No actionable verification rules could be extracted from this document."
        )

    guideline_registry.save_guidelines(company_id=company_id, guidelines=extracted_guidelines)

    return {
        "status": "success",
        "company_id": company_id,
        "filename": file.filename,
        "total_guidelines": len(extracted_guidelines),
        "guidelines": extracted_guidelines,
        "message": "Guidelines successfully parsed and activated for your company account.",
    }


@router.get("/company/guidelines")
async def get_company_guidelines(
    client: dict = Depends(authenticate_client),
):
    """
    Retrieves the currently registered verification guidelines for the authenticated company.
    """
    company_id = client.get("company_id")
    if not company_id:
        raise HTTPException(status_code=401, detail="Authenticated client has no company_id")

    active_rules = guideline_registry.get_guidelines(company_id=company_id)
    return {
        "company_id": company_id,
        "total_guidelines": len(active_rules),
        "guidelines": active_rules,
    }


# ================================================================
# 2. ASYNCHRONOUS PIPELINE WORKER (THE ID CONTRACT VERIFIER)
# ================================================================

async def _process_guidelines_async_pipeline(request_data: GuidelineCheckRequest):
    """
    Background worker that runs evidence resolution, guideline verification,
    and webhook delivery without blocking the initial HTTP response.
    """
    customer_id = request_data.customer_id
    evidence_map = {}

    # 1. Evidence Resolution: Use pre-existing ocr_data or download and process URL
    for file_item in request_data.files:
        if file_item.ocr_data and len(file_item.ocr_data) > 0:
            evidence_map[file_item.id] = file_item.ocr_data
        elif file_item.url:
            try:
                async with httpx.AsyncClient(timeout=60.0) as http_client:
                    resp = await http_client.get(file_item.url)
                    resp.raise_for_status()
                    pdf_bytes = resp.content

                image_paths = pdf_processor.pdf_bytes_to_images(pdf_bytes)
                if image_paths:
                    img_bytes = pdf_processor.image_to_bytes(image_paths[0])
                    extraction_prompt = (
                        f"Extract all readable key-value fields for this {file_item.label} document. "
                        "Return ONLY valid JSON format: {\"field_name\": \"value\"}"
                    )
                    raw_extracted = qwen_client.vision(
                        image_bytes=img_bytes,
                        prompt=extraction_prompt,
                    )
                    clean_json = raw_extracted.replace("```json", "").replace("```", "").strip()
                    evidence_map[file_item.id] = json.loads(clean_json)
                else:
                    evidence_map[file_item.id] = {}
            except Exception as e:
                print(f"[ERROR] Failed to extract evidence from URL for {file_item.id}: {str(e)}")
                evidence_map[file_item.id] = {}
        else:
            evidence_map[file_item.id] = {}

    # 2. Determine Guidelines: Use request-level rules or fallback to dynamic company store
    effective_guidelines = request_data.guidelines
    if not effective_guidelines:
        effective_guidelines = guideline_registry.get_guidelines(customer_id)

    # 3. Execute Verification with Strict Target ID Attribution (The ID Contract)
    verdicts = await guideline_verifier.verify_all(
        files=request_data.files,
        guidelines=effective_guidelines,
        evidence_map=evidence_map,
    )

    # 4. Construct Egress Payload
    webhook_payload = WebhookPayload(
        requestId=request_data.requestId,
        customer_id=customer_id,
        guideline=verdicts,
    )

    # 5. Dispatch Webhook
    await webhook_service.dispatch_with_retry(
        webhook_url=request_data.webhook_url,
        payload=webhook_payload,
    )


# ================================================================
# 3. FINETECH UPLOAD DATA ENDPOINT (THE ID CONTRACT GATEWAY)
# ================================================================

@router.post(
    "/finetech/upload_data", 
    status_code=status.HTTP_202_ACCEPTED,
    include_in_schema=False,
)
async def finetech_upload_data(
    payload: GuidelineCheckRequest,
    background_tasks: BackgroundTasks,
):
    """
    Main Finetech Guideline Check Endpoint.
    Accepts candidate documents with client-assigned IDs, returns an immediate 202 acknowledgment,
    and delivers verdicts to webhook_url in the background.
    """
    if not payload.guideline_check:
        return {
            "status": "SKIPPED",
            "requestId": payload.requestId,
            "customer_id": payload.customer_id,
            "message": "guideline_check flag is false. No verification queued.",
        }

    background_tasks.add_task(_process_guidelines_async_pipeline, payload)

    return {
        "status": "QUEUED",
        "requestId": payload.requestId,
        "customer_id": payload.customer_id,
        "total_files": len(payload.files),
        "message": "Guideline verification queued successfully. Results will be delivered to webhook_url.",
    }