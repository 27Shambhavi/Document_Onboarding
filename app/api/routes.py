import asyncio
import json
import uuid
from pathlib import Path
from typing import Any, Dict, List

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
)

from app.core.auth import authenticate_client
from app.schemas.registry import schema_registry
from app.services.ingestion.blueprint_parser import blueprint_parser
from app.services.ingestion.document_loader import save_document
from app.services.ingestion.pdf_processor import pdf_processor
from app.services.qwen.client import qwen_client
from app.services.resilience.rate_limiter import rate_limiter
from app.services.schema_registry import schema_registry_service

router = APIRouter(tags=["Document Onboarding & Intelligence"])


# ================================================================
# 1. REGISTER COMPANY BLUEPRINT (JSON)
# ================================================================


@router.post("/company/register-blueprint-json")
async def register_blueprint_json(
    payload: dict,
    client: dict = Depends(authenticate_client),
):
    """
    Register document blueprint for the authenticated company.
    Company ID is retrieved directly from JWT token.
    """
    company_id = client.get("company_id")
    if not company_id:
        raise HTTPException(
            status_code=401,
            detail="Authenticated client does not have a company_id",
        )

    try:
        master_schemas = blueprint_parser.parse_raw_dict(payload)
        result = schema_registry_service.save_blueprint(
            master_schemas=master_schemas,
            company_id=company_id,
        )
        schema_registry.reload_company(company_id)
        return {**result, "company_id": company_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ================================================================
# 2. REGISTER COMPANY BLUEPRINT (FILE: DOCX / DOC / JSON)
# ================================================================


@router.post("/company/register-blueprint-doc")
async def register_blueprint_doc(
    file: UploadFile = File(...),
    client: dict = Depends(authenticate_client),
):
    """
    Register company blueprint through DOCX, DOC, or JSON file.
    Company ID is retrieved directly from JWT token.
    """
    company_id = client.get("company_id")
    if not company_id:
        raise HTTPException(
            status_code=401,
            detail="Authenticated client does not have a company_id",
        )

    try:
        content = await file.read()
        filename = file.filename.lower() if file.filename else ""

        if filename.endswith(".docx") or filename.endswith(".doc"):
            master_schemas = blueprint_parser.parse_docx(content)
        elif filename.endswith(".json"):
            try:
                raw_data = json.loads(content.decode("utf-8"))
            except json.JSONDecodeError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid JSON blueprint.",
                )
            master_schemas = blueprint_parser.parse_raw_dict(raw_data)
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file format. Use .json, .docx or .doc.",
            )

        result = schema_registry_service.save_blueprint(
            master_schemas=master_schemas,
            company_id=company_id,
        )
        schema_registry.reload_company(company_id)
        return {**result, "company_id": company_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ================================================================
# 3. SINGLE-PASS PAGE WORKER & INFERENCE
# ================================================================


def _execute_page_inference(
    image_bytes: bytes, company_schemas: Dict[str, Any]
) -> Dict[str, Any]:
    """Single Qwen 3.5 VL model call per page executing Quality + Dynamic Category Match + Extraction."""
    prompt = f"""
You are an enterprise document intelligence and automated onboarding system.
Inspect the attached document page image carefully and evaluate it against the Company Schemas.

COMPANY SCHEMAS:
{json.dumps(company_schemas, indent=2)}

INSTRUCTIONS:
1. QUALITY CHECK:
   - Check if this page is legible and readable.
   - If severely blurred, dark, cutoff, or corrupt, set "quality": "BAD" and provide "quality_reason".
   - If clear and readable, set "quality": "GOOD".

2. DYNAMIC CATEGORY MATCH:
   - Match this document against the keys in COMPANY SCHEMAS based on layout, text, and visual markers.
   - If it matches a defined schema, set "document_type" to the exact schema key name.
   - If it does not match any company schema, set "document_type": "unknown".

3. FIELD EXTRACTION:
   - If matched, extract only the required fields defined in that schema.
   - If a field is not present on the document, return null. Do not hallucinate.
   - If document_type is "unknown", return "extracted_data": {{}}.

Respond ONLY with valid JSON in this exact structure:
{{
  "quality": "GOOD",
  "quality_reason": null,
  "document_type": "<matched_schema_key_or_unknown>",
  "confidence": 0.95,
  "extracted_data": {{
    "<field_name>": "<extracted_value_or_null>"
  }}
}}
"""
    try:
        raw_output = qwen_client.vision(
            image_bytes=image_bytes,
            prompt=prompt,
            system_prompt="You are a strict enterprise document extraction engine. Return valid JSON only.",
        )
        clean_text = raw_output.replace("json", "").replace("", "").strip()
        return json.loads(clean_text)
    except Exception as e:
        return {
            "quality": "BAD",
            "quality_reason": f"Inference error: {str(e)}",
            "document_type": "unknown",
            "confidence": 0.0,
            "extracted_data": {},
        }


async def _process_single_page(
    page_number: int, image_path: str, company_schemas: Dict[str, Any]
) -> Dict[str, Any]:
    """Async worker bounded by rate limiter and exponential backoff."""
    loop = asyncio.get_running_loop()
    image_bytes = await loop.run_in_executor(
        None, pdf_processor.image_to_bytes, image_path
    )

    result = await rate_limiter.execute_with_resilience(
        _execute_page_inference, image_bytes, company_schemas
    )
    result["page_number"] = page_number
    return result


def _stitch_contiguous_pages(
    page_results: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Merges contiguous pages belonging to the same document type."""
    merged_documents = []
    current_doc = None

    for page in page_results:
        doc_type = page.get("document_type", "unknown")
        quality = page.get("quality", "GOOD")

        if quality == "BAD":
            merged_documents.append({
                "document_type": doc_type,
                "pages": [page["page_number"]],
                "status": "QUALITY_FAILED",
                "quality_reason": page.get(
                    "quality_reason", "Low document legibility"
                ),
                "extracted_data": {},
            })
            continue

        if (
            current_doc
            and current_doc["document_type"] == doc_type
            and doc_type != "unknown"
        ):
            current_doc["pages"].append(page["page_number"])
            for k, v in page.get("extracted_data", {}).items():
                if v is not None:
                    current_doc["extracted_data"][k] = v
        else:
            if current_doc:
                merged_documents.append(current_doc)

            current_doc = {
                "document_type": doc_type,
                "pages": [page["page_number"]],
                "status": (
                    "SUCCESS" if doc_type != "unknown" else "UNMATCHED_UNKNOWN"
                ),
                "confidence": page.get("confidence", 1.0),
                "extracted_data": page.get("extracted_data", {}),
            }

    if current_doc:
        merged_documents.append(current_doc)

    return merged_documents


# ================================================================
# 4. PROCESS CANDIDATE PDF ENDPOINT
# ================================================================


@router.post("/documents/process")
async def process_document(
    file: UploadFile = File(...),
    client: dict = Depends(authenticate_client),
):
    """
    Process candidate PDF using the authenticated company's blueprint.
    Authentication: JWT -> company_id.
    """
    request_id = f"REQ-{uuid.uuid4().hex[:12].upper()}"
    company_id = client.get("company_id")

    if not company_id:
        raise HTTPException(
            status_code=401,
            detail="Authenticated client does not have a company_id",
        )

    # 1. Load registered schemas for this company
    company_document_types = schema_registry.list_company_document_types(
        company_id
    )
    if not company_document_types:
        raise HTTPException(
            status_code=400,
            detail="No document blueprint is registered for this company.",
        )

    company_schemas = {}
    for doc_type in company_document_types:
        schema = schema_registry.get(
            document_type=doc_type, company_id=company_id
        )
        if schema:
            company_schemas[doc_type] = [
                field.model_dump() for field in schema.fields
            ]

    try:
        # 2. File validation
        filename = file.filename.lower() if file.filename else ""
        if not filename.endswith(".pdf"):
            raise HTTPException(
                status_code=400,
                detail="Only PDF candidate documents are supported.",
            )

        # 3. PDF to images
        file_path = await save_document(file)
        loop = asyncio.get_running_loop()
        page_images = await loop.run_in_executor(
            None, pdf_processor.pdf_to_images, file_path
        )

        if not page_images:
            raise HTTPException(
                status_code=400,
                detail="The uploaded PDF contains no readable pages.",
            )

        # 4. Concurrent Single-Pass Worker Tasks
        tasks = [
            _process_single_page(idx, img_path, company_schemas)
            for idx, img_path in enumerate(page_images, start=1)
        ]
        raw_results = await asyncio.gather(*tasks)
        raw_results = sorted(raw_results, key=lambda x: x["page_number"])

        # 5. Contiguous Page Stitching
        documents = _stitch_contiguous_pages(raw_results)

        # 6. Response
        return {
            "request_id": request_id,
            "company_id": company_id,
            "status": "PROCESSED",
            "total_pages": len(page_images),
            "configured_document_types": company_document_types,
            "documents": documents,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))