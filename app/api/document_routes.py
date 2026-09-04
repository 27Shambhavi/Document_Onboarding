import asyncio
import io
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)

from app.core.auth import authenticate_client
from app.services.guidelines.guideline_parser import extract_raw_text_from_file
from app.services.guidelines.guideline_registry import guideline_registry
from app.services.pipeline import run_pipeline

router = APIRouter(tags=["Document Onboarding & Intelligence"])
logger = logging.getLogger("document_routes")


def _get_google_drive_download_url(url: str) -> Optional[str]:
    """
    Convert common Google Drive sharing URLs into a direct download URL.
    """
    parsed = urlparse(url)

    if parsed.netloc.lower() not in {
        "drive.google.com",
        "www.drive.google.com",
    }:
        return None

    file_id = None

    match = re.search(r"/file/d/([^/]+)", parsed.path)
    if match:
        file_id = match.group(1)

    if not file_id:
        query_params = parse_qs(parsed.query)
        file_id_values = query_params.get("id")
        if file_id_values:
            file_id = file_id_values[0]

    if not file_id:
        return None

    return f"https://drive.google.com/uc?export=download&id={file_id}"


async def _download_file_from_url(url: str) -> tuple[bytes, str]:
    """
    Download a document from a public HTTP/HTTPS URL.
    """
    if not url or not url.strip():
        raise HTTPException(
            status_code=400,
            detail="URL cannot be empty.",
        )

    original_url = url.strip()
    parsed_input_url = urlparse(original_url)

    if parsed_input_url.scheme not in {"http", "https"}:
        raise HTTPException(
            status_code=400,
            detail="URL must use HTTP or HTTPS.",
        )

    google_drive_url = _get_google_drive_download_url(original_url)
    download_url = google_drive_url if google_drive_url else original_url

    if google_drive_url:
        logger.info("Google Drive sharing URL detected. Using direct download URL.")

    def _download():
        request = Request(
            download_url,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        with urlopen(request, timeout=30) as response:
            content = response.read()
            final_url = response.geturl()
            content_type = response.headers.get("Content-Type", "").lower()
            return content, final_url, content_type

    try:
        content, final_url, content_type = await asyncio.to_thread(_download)
    except Exception as exc:
        logger.error("URL download failed: %s", exc)
        raise HTTPException(
            status_code=400,
            detail=f"Unable to download document from URL: {str(exc)}",
        )

    if not content:
        raise HTTPException(
            status_code=400,
            detail="The URL returned an empty response.",
        )

    content_start = content[:100].lower()
    is_pdf = content.startswith(b"%PDF") or "application/pdf" in content_type
    is_zip = (
        content.startswith(b"PK")
        or "application/zip" in content_type
        or "application/x-zip-compressed" in content_type
    )
    is_html = (
        "text/html" in content_type
        or b"<html" in content_start
        or b"<!doctype html" in content_start
    )

    if is_html and not is_pdf and not is_zip:
        raise HTTPException(
            status_code=400,
            detail="The provided URL did not return a downloadable PDF or ZIP document. For Google Drive, make sure the file is shared as 'Anyone with the link'.",
        )

    parsed_final_url = urlparse(final_url)
    filename = os.path.basename(parsed_final_url.path)

    if not filename or "." not in filename:
        if is_pdf:
            filename = "document.pdf"
        elif is_zip:
            filename = "candidate.zip"
        else:
            filename = "document.pdf"

    return content, filename


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
    summary="Raw OCR Process Document (Direct File/URL Extraction)",
    status_code=status.HTTP_200_OK,
    include_in_schema=False,  # Successfully merged this!
)
async def process_document_ocr(
    file: Optional[UploadFile] = File(
        None,
        description="Upload candidate PDF/ZIP for OCR scan. Optional when URL is provided.",
    ),
    url: Optional[str] = Form(
        None,
        description="Optional public document URL. Used when no file is uploaded or to associate the source URL with the uploaded document.",
    ),
    enable_signature_detection: bool = False,
    client: dict = Depends(authenticate_client),
):
    source_url = url.strip() if url and url.strip() else None

    if file is not None:
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        filename = file.filename or "document.pdf"
    elif source_url:
        file_bytes, filename = await _download_file_from_url(source_url)
    else:
        raise HTTPException(status_code=400, detail="Please upload a document file or provide a document URL.")

    company_id = client.get("company_id") or client.get("sub") or "DEFAULT_COMPANY"
    blueprint = guideline_registry.get_blueprint(company_id)

    if not blueprint:
        raise HTTPException(
            status_code=400,
            detail="Company blueprint is not configured. Please register the document blueprint before processing.",
        )

    result = await run_pipeline(
        file_bytes,
        filename,
        blueprint,
        source_url=source_url,
    )
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