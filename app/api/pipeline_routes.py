import asyncio
import io
import logging
import os
import uuid
import zipfile
from typing import Annotated, Any, Dict, List, Optional, Union
from urllib.parse import urlparse
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
from pydantic import BaseModel

from app.core.auth import authenticate_client
from app.schemas.guidelines import DocumentFileItem
from app.services.guidelines.guideline_registry import guideline_registry
from app.services.guidelines.verifier import guideline_verifier
from app.services.pipeline import run_pipeline


logger = logging.getLogger("audit_pipeline")

router = APIRouter(
    tags=["2-Stage Candidate Audit & ID Contract Verification"]
)

MAX_CONCURRENT_WORKERS = 4
worker_semaphore = asyncio.Semaphore(
    MAX_CONCURRENT_WORKERS
)


async def _download_file_from_url(
    url: str,
) -> tuple[bytes, str]:

    if not url or not url.strip():
        raise HTTPException(
            status_code=400,
            detail="URL cannot be empty.",
        )

    parsed_input_url = urlparse(
        url.strip()
    )

    if parsed_input_url.scheme not in {
        "http",
        "https",
    }:
        raise HTTPException(
            status_code=400,
            detail="URL must use HTTP or HTTPS.",
        )

    def _download():
        request = Request(
            url.strip(),
            headers={
                "User-Agent": "Mozilla/5.0",
            },
        )

        with urlopen(
            request,
            timeout=30,
        ) as response:

            content = response.read()
            final_url = response.geturl()

            content_type = response.headers.get(
                "Content-Type",
                "",
            ).lower()

            return (
                content,
                final_url,
                content_type,
            )

    try:
        (
            content,
            final_url,
            content_type,
        ) = await asyncio.to_thread(
            _download
        )

    except Exception as exc:
        logger.error(
            f"URL download failed: {exc}"
        )

        raise HTTPException(
            status_code=400,
            detail=(
                "Unable to download document from URL: "
                f"{str(exc)}"
            ),
        )

    if not content:
        raise HTTPException(
            status_code=400,
            detail="The URL returned an empty response.",
        )

    parsed_url = urlparse(
        final_url
    )

    filename = os.path.basename(
        parsed_url.path
    )

    if not filename or "." not in filename:

        if "pdf" in content_type:
            filename = "document.pdf"

        elif "zip" in content_type:
            filename = "candidate.zip"

        else:
            filename = "document.pdf"

    return content, filename


class CandidateOCRInput(BaseModel):
    candidate_file: str
    requestId: str
    customer_id: str
    total_documents_detected: int
    files: List[Dict[str, Any]]


async def _process_single_candidate_stage1(
    file_bytes: bytes,
    filename: str,
    blueprint: Dict[str, Any],
    source_url: Optional[str] = None,
) -> Dict[str, Any]:

    req_id = (
        f"REQ-{uuid.uuid4().hex[:8].upper()}"
    )

    cust_id = (
        f"CUST-{uuid.uuid4().hex[:6].upper()}"
    )

    async with worker_semaphore:

        # Dynamic blueprint passed directly into
        # single-pass pipeline
        extraction_output = await run_pipeline(
            file_bytes,
            filename,
            blueprint,
            source_url,
        )

        files_payload = extraction_output.get(
            "documents",
            [],
        )

        return {
            "candidate_file": filename,
            "requestId": req_id,
            "customer_id": cust_id,
            "total_documents_detected": len(
                files_payload
            ),
            "files": files_payload,
        }


# ================================================================
# STAGE 1: OCR EXTRACTION & BLUEPRINT ALIGNMENT
# ================================================================

@router.post(
    "/documents/stage1-extract-ocr",
    summary=(
        "Stage 1: Upload Candidate (.ZIP / PDF) "
        "or URL -> Get Blueprint OCR & Document IDs"
    ),
    status_code=status.HTTP_200_OK,
)
async def stage1_extract_ocr(
    file: Annotated[
        Optional[UploadFile],
        File(
            description=(
                "Optional Candidate Folder (.ZIP) "
                "or a single candidate PDF bundle"
            )
        ),
    ] = None,
    url: Annotated[
        Optional[str],
        Form(
            description=(
                "Optional source URL of the candidate document"
            )
        ),
    ] = None,
    client: dict = Depends(
        authenticate_client
    ),
):

    company_id = (
        client.get("company_id")
        or client.get("sub")
        or "DEFAULT_COMPANY"
    )

    blueprint = (
        guideline_registry.get_blueprint(
            company_id
        )
    )

    candidate_payloads = []

    # ------------------------------------------------------------
    # INPUT: FILE OR URL
    # ------------------------------------------------------------

    if file is not None:

        file_bytes = await file.read()

        if not file_bytes:
            raise HTTPException(
                status_code=400,
                detail="Uploaded file is empty.",
            )

        input_filename = (
            file.filename
            or "document.pdf"
        )

        source_url = url

    elif url:

        file_bytes, input_filename = (
            await _download_file_from_url(
                url
            )
        )

        source_url = url

    else:

        raise HTTPException(
            status_code=400,
            detail=(
                "Please provide either a file "
                "or a URL."
            ),
        )

    # ------------------------------------------------------------
    # EXISTING ZIP / PDF PROCESSING
    # ------------------------------------------------------------

    if input_filename.lower().endswith(
        ".zip"
    ):

        try:
            with zipfile.ZipFile(
                io.BytesIO(file_bytes)
            ) as z:

                for info in z.infolist():

                    if (
                        info.filename.lower().endswith(
                            ".pdf"
                        )
                        and not info.is_dir()
                    ):

                        fname = os.path.basename(
                            info.filename
                        )

                        candidate_payloads.append(
                            (
                                z.read(
                                    info.filename
                                ),
                                fname,
                            )
                        )

        except zipfile.BadZipFile:
            raise HTTPException(
                status_code=400,
                detail="Invalid ZIP file.",
            )

    elif input_filename.lower().endswith(
        ".pdf"
    ):

        candidate_payloads.append(
            (
                file_bytes,
                input_filename,
            )
        )

    else:

        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported format. Upload a "
                ".ZIP file, .PDF file, or provide "
                "a URL pointing to one."
            ),
        )

    if not candidate_payloads:

        raise HTTPException(
            status_code=400,
            detail="No PDF files detected.",
        )

    # ------------------------------------------------------------
    # PARALLEL CANDIDATE PROCESSING
    # ------------------------------------------------------------

    tasks = [
        _process_single_candidate_stage1(
            content,
            fname,
            blueprint,
            source_url,
        )
        for content, fname in candidate_payloads
    ]

    results = await asyncio.gather(
        *tasks,
        return_exceptions=True,
    )

    successful = [
        r
        for r in results
        if not isinstance(
            r,
            Exception,
        )
    ]

    failures = [
        {
            "error": str(r)
        }
        for r in results
        if isinstance(
            r,
            Exception,
        )
    ]

    return {
        "status": "SUCCESS",
        "company_id": company_id,
        "blueprint_applied": bool(
            blueprint
        ),
        "total_candidates": len(
            successful
        ),
        "candidates_ocr_data": successful,
        "failures": failures,
    }


# ================================================================
# STAGE 2: GUIDELINE REASONING CHECK (FLEXIBLE PAYLOAD)
# ================================================================

@router.post(
    "/documents/stage2-verify-guidelines",
    summary=(
        "Stage 2: Pass Stage 1 Output -> "
        "Execute Guideline Reasoning Verification"
    ),
    status_code=status.HTTP_200_OK,
)
async def stage2_verify_guidelines(
    payload: Union[
        Dict[str, Any],
        List[Dict[str, Any]],
    ] = Body(
        ...,
        description=(
            "Accepts either the full Stage 1 "
            "output JSON or just the "
            "'candidates_ocr_data' list"
        ),
    ),
    client: dict = Depends(
        authenticate_client
    ),
):

    company_id = (
        client.get("company_id")
        or client.get("sub")
        or "DEFAULT_COMPANY"
    )

    active_guidelines = (
        guideline_registry.get_guidelines(
            company_id
        )
    )

    if not active_guidelines:

        raise HTTPException(
            status_code=400,
            detail=(
                "No guidelines found. "
                "Please upload policy document first."
            ),
        )

    if isinstance(
        payload,
        dict,
    ):

        candidates_ocr_data = (
            payload.get(
                "candidates_ocr_data"
            )
            or [payload]
        )

    elif isinstance(
        payload,
        list,
    ):

        candidates_ocr_data = payload

    else:

        raise HTTPException(
            status_code=422,
            detail="Invalid payload format.",
        )

    verified_results = []

    for cand in candidates_ocr_data:

        raw_files = cand.get(
            "files",
            [],
        )

        files_items = [
            DocumentFileItem(**f)
            for f in raw_files
        ]

        verdicts = (
            await guideline_verifier.verify_all(
                files=files_items,
                guidelines=active_guidelines,
                evidence_map={},
            )
        )

        verified_results.append(
            {
                "candidate_file": cand.get(
                    "candidate_file"
                ),
                "requestId": cand.get(
                    "requestId"
                ),
                "customer_id": cand.get(
                    "customer_id"
                ),
                "total_documents_detected": len(
                    files_items
                ),
                "guideline": [
                    v.model_dump()
                    for v in verdicts
                ],
            }
        )

    return {
        "status": "SUCCESS",
        "company_id": company_id,
        "total_guidelines_evaluated": len(
            active_guidelines
        ),
        "verified_candidates": verified_results,
    }


# ================================================================
# 1-CLICK ALL-IN-ONE AUDIT
# ================================================================

@router.post(
    "/documents/audit-candidate-folder",
    summary=(
        "1-Click Audit: Upload .ZIP / PDF "
        "or URL -> Direct Full Report"
    ),
    status_code=status.HTTP_200_OK,
)
async def audit_candidate_folder(
    file: Annotated[
        Optional[UploadFile],
        File(
            description=(
                "Optional Candidate Folder as .ZIP "
                "or a single candidate bundle PDF"
            )
        ),
    ] = None,
    url: Annotated[
        Optional[str],
        Form(
            description=(
                "Optional source URL of the candidate document"
            )
        ),
    ] = None,
    client: dict = Depends(
        authenticate_client
    ),
):

    company_id = (
        client.get("company_id")
        or client.get("sub")
        or "DEFAULT_COMPANY"
    )

    blueprint = (
        guideline_registry.get_blueprint(
            company_id
        )
    )

    active_guidelines = (
        guideline_registry.get_guidelines(
            company_id
        )
    )

    if not active_guidelines:

        raise HTTPException(
            status_code=400,
            detail=(
                "No guidelines found. Upload policy "
                "document at /company/guidelines/"
                "upload-policy first."
            ),
        )

    candidate_payloads = []

    # ------------------------------------------------------------
    # INPUT: FILE OR URL
    # ------------------------------------------------------------

    if file is not None:

        file_bytes = await file.read()

        if not file_bytes:
            raise HTTPException(
                status_code=400,
                detail="Uploaded file is empty.",
            )

        input_filename = (
            file.filename
            or "document.pdf"
        )

        source_url = url

    elif url:

        file_bytes, input_filename = (
            await _download_file_from_url(
                url
            )
        )

        source_url = url

    else:

        raise HTTPException(
            status_code=400,
            detail=(
                "Please provide either a file "
                "or a URL."
            ),
        )

    # ------------------------------------------------------------
    # EXISTING ZIP / PDF PROCESSING
    # ------------------------------------------------------------

    if input_filename.lower().endswith(
        ".zip"
    ):

        try:
            with zipfile.ZipFile(
                io.BytesIO(file_bytes)
            ) as z:

                for info in z.infolist():

                    if (
                        info.filename.lower().endswith(
                            ".pdf"
                        )
                        and not info.is_dir()
                    ):

                        fname = os.path.basename(
                            info.filename
                        )

                        candidate_payloads.append(
                            (
                                z.read(
                                    info.filename
                                ),
                                fname,
                            )
                        )

        except zipfile.BadZipFile:
            raise HTTPException(
                status_code=400,
                detail="Invalid ZIP file.",
            )

    elif input_filename.lower().endswith(
        ".pdf"
    ):

        candidate_payloads.append(
            (
                file_bytes,
                input_filename,
            )
        )

    else:

        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported format. Upload a "
                ".ZIP file, .PDF file, or provide "
                "a URL pointing to one."
            ),
        )

    if not candidate_payloads:

        raise HTTPException(
            status_code=400,
            detail="No PDF files detected.",
        )

    async def _run_full(
        content: bytes,
        fname: str,
    ) -> Dict[str, Any]:

        ocr_res = (
            await _process_single_candidate_stage1(
                content,
                fname,
                blueprint,
                source_url,
            )
        )

        files_items = [
            DocumentFileItem(**f)
            for f in ocr_res["files"]
        ]

        verdicts = (
            await guideline_verifier.verify_all(
                files=files_items,
                guidelines=active_guidelines,
                evidence_map={},
            )
        )

        return {
            "candidate_file": fname,
            "requestId": ocr_res[
                "requestId"
            ],
            "customer_id": ocr_res[
                "customer_id"
            ],
            "total_documents_detected": (
                ocr_res[
                    "total_documents_detected"
                ]
            ),
            "guideline": [
                v.model_dump()
                for v in verdicts
            ],
        }

    # ------------------------------------------------------------
    # PARALLEL CANDIDATE PROCESSING
    # ------------------------------------------------------------

    tasks = [
        _run_full(
            content,
            fname,
        )
        for content, fname in candidate_payloads
    ]

    results = await asyncio.gather(
        *tasks,
        return_exceptions=True,
    )

    successful = [
        r
        for r in results
        if not isinstance(
            r,
            Exception,
        )
    ]

    failures = [
        {
            "error": str(r)
        }
        for r in results
        if isinstance(
            r,
            Exception,
        )
    ]

    return {
        "status": "SUCCESS",
        "company_id": company_id,
        "total_candidates_processed": len(
            successful
        ),
        "total_guidelines_applied": len(
            active_guidelines
        ),
        "candidates": successful,
        "failures": failures,
    }