import io
import json
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile, status

from app.core.auth import authenticate_client
from app.services.guidelines.guideline_parser import extract_raw_text_from_file
from app.services.guidelines.guideline_registry import guideline_registry
from app.services.pipeline import run_pipeline

router = APIRouter(tags=["Document Onboarding & Intelligence"])


@router.post(
    "/company/register-blueprint-json",
    summary="Register Document Requirement Checklist via JSON",
    status_code=status.HTTP_200_OK,
)
async def register_blueprint_json(
    blueprint: Dict[str, Any] = Body(
        ...,
        openapi_examples={
            "default": {
                "summary": "Standard Onboarding Requirements",
                "value": {
                    "Resume": ["resume_name", "resume_email", "resume_mobile_no"],
                    "Employee Photo": ["face detected(Y/N)"],
                    "PAN": ["pan_name", "pan_dob", "pan_number", "pan_father_name"],
                    "Aadhar": ["aadhar_name", "aadhar_dob", "aadhar_number", "aadhar_address"]
                },
            }
        },
        description="Nested dictionary of document types and required field lists",
    ),
    client: dict = Depends(authenticate_client),
):
    """
    Registers or updates custom required document blueprint definitions for a company.
    """
    company_id = client.get("company_id") or client.get("sub") or "DEFAULT_COMPANY"
    guideline_registry.save_blueprint(company_id, blueprint)

    return {
        "status": "SUCCESS",
        "company_id": company_id,
        "message": "Company blueprint registered successfully.",
        "total_document_types": len(blueprint),
        "configured_blueprint": blueprint,
    }


@router.post(
    "/company/register-blueprint-doc",
    summary="Upload Policy/Requirement Document to Auto-Create Blueprint",
    status_code=status.HTTP_200_OK,
)
async def register_blueprint_doc(
    file: UploadFile = File(
        ...,
        description="Upload requirement checklist document (.pdf, .docx, .txt)",
    ),
    client: dict = Depends(authenticate_client),
):
    company_id = client.get("company_id") or client.get("sub") or "DEFAULT_COMPANY"
    file_bytes = await file.read()
    raw_text = extract_raw_text_from_file(file_bytes, file.filename)

    blueprint = {
        "source_document": file.filename,
        "raw_requirements": raw_text[:3000],
    }
    guideline_registry.save_blueprint(company_id, blueprint)

    return {
        "status": "SUCCESS",
        "company_id": company_id,
        "filename": file.filename,
        "message": "Requirement document registered successfully.",
    }


@router.post(
    "/documents/process",
    summary="Raw OCR Process Document (Direct File Extraction)",
    status_code=status.HTTP_200_OK,
    include_in_schema=False,  # This hides the endpoint from Swagger UI
)
async def process_document_ocr(
    file: UploadFile = File(
        ...,
        description="Upload candidate PDF for single OCR scan",
    ),
    client: dict = Depends(authenticate_client),
):
    file_bytes = await file.read()
    result = await run_pipeline(file_bytes, file.filename)
    return result


@router.get(
    "/company/blueprint",
    summary="Get Company Document Blueprint",
    status_code=status.HTTP_200_OK,
)
async def get_company_blueprint(
    client: dict = Depends(authenticate_client),
):
    company_id = client.get("company_id") or client.get("sub") or "DEFAULT_COMPANY"
    blueprint = guideline_registry.get_blueprint(company_id)
    return {
        "status": "SUCCESS",
        "company_id": company_id,
        "blueprint": blueprint,
    }