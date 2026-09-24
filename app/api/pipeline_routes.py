import asyncio
import io
import logging
import os
import uuid
import zipfile
from datetime import datetime, timezone
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
from sqlalchemy.orm import Session

from app.core.auth import authenticate_client
from app.db.database import get_db
from app.db.models import Company, DocumentScan
from app.models.billing import storage_manager
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
    signature_unlocked: bool = False,
) -> Dict[str, Any]:

    # Persist file bytes to disk so PDF preview is guaranteed
    for dest_dir in ["data/uploads", "uploads"]:
        try:
            os.makedirs(dest_dir, exist_ok=True)
            target = os.path.join(dest_dir, os.path.basename(filename))
            if not os.path.exists(target) and file_bytes:
                with open(target, "wb") as f_out:
                    f_out.write(file_bytes)
        except Exception as exc:
            logger.warning(f"[cache_file] Could not cache {filename} to {dest_dir}: {exc}")

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
            signature_unlocked=signature_unlocked,
        )

        files_payload = extraction_output.get(
            "documents",
            [],
        )

        # Build nested JSON grouped by Document Type
        nested_extracted: Dict[str, Dict[str, Any]] = {}
        for f in files_payload:
            doc_label = f.get("label") or "Document"
            if "nested_data" in f and isinstance(f["nested_data"], dict):
                for k_doc, v_fields in f["nested_data"].items():
                    if k_doc not in nested_extracted:
                        nested_extracted[k_doc] = {}
                    if isinstance(v_fields, dict):
                        nested_extracted[k_doc].update(v_fields)
            else:
                ocr = f.get("ocr_data", {})
                if isinstance(ocr, dict):
                    clean_fields = {
                        k: v for k, v in ocr.items()
                        if not k.startswith("_") and k not in {
                            "doc_quality", "doc_quality_issues", "is_signed", "signatory_type", "signer_name"
                        }
                    }
                    if doc_label not in nested_extracted:
                        nested_extracted[doc_label] = {}
                    nested_extracted[doc_label].update(clean_fields)

        return {
            "candidate_file": filename,
            "requestId": req_id,
            "customer_id": cust_id,
            "total_documents_detected": len(
                files_payload
            ),
            "files": files_payload,
            "extracted_fields": nested_extracted,
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
    db: Session = Depends(get_db),
):

    company_id = (
        client.get("company_id")
        or client.get("sub")
        or "DEFAULT_COMPANY"
    )

    company_rec = (
        db.query(Company)
        .filter(Company.company_id == company_id)
        .first()
    )
    is_signature_unlocked = bool(
        company_rec.signature_unlocked if company_rec else False
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
            signature_unlocked=is_signature_unlocked,
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

    # --------------------------------------------------------
    # PERSIST each successful OCR extraction to PostgreSQL
    # --------------------------------------------------------
    for ocr_res in successful:
        _persist_scan(
            db=db,
            company_id=company_id,
            filename=ocr_res.get("candidate_file", input_filename),
            ocr_result=ocr_res,
        )

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


def _persist_scan(
    db: Session,
    company_id: str,
    filename: str,
    ocr_result: Dict[str, Any],
) -> None:
    """
    Helper: write a DocumentScan row to PostgreSQL after a successful OCR extraction.
    Strictly isolated to the authenticated company_id. Cost is derived from global pricing.
    """
    if not company_id or not str(company_id).strip():
        logger.warning("[scan_persist] Rejected persistence: company_id is empty (tenant isolation violation).")
        return

    try:
        pages = len(ocr_result.get("files", []))
        if pages == 0:
            pages = 1
        pricing = storage_manager.get_pricing()
        cost = round(pages * pricing.price_per_page, 4)

        scan = DocumentScan(
            company_id=str(company_id).strip(),
            filename=filename,
            pages_count=pages,
            extracted_json=ocr_result,
            cost_inr=cost,
            created_at=datetime.now(timezone.utc),
        )
        db.add(scan)
        db.commit()
    except Exception as exc:
        logger.warning(f"[scan_persist] Non-fatal DB write failure: {exc}")
        db.rollback()


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
        if not isinstance(cand, dict):
            continue

        files_items: List[DocumentFileItem] = []
        raw_files = cand.get("files")

        if raw_files and isinstance(raw_files, list):
            for f in raw_files:
                if isinstance(f, dict):
                    f_copy = dict(f)
                    if "id" not in f_copy:
                        f_copy["id"] = "DOC-1"
                    if "label" not in f_copy:
                        f_copy["label"] = "Document"
                    if "ocr_data" not in f_copy:
                        f_copy["ocr_data"] = {}
                    files_items.append(DocumentFileItem(**f_copy))
        elif "id" in cand and ("ocr_data" in cand or "label" in cand):
            c_copy = dict(cand)
            if "label" not in c_copy:
                c_copy["label"] = "Document"
            if "ocr_data" not in c_copy:
                c_copy["ocr_data"] = {}
            files_items.append(DocumentFileItem(**c_copy))
        elif "extracted_fields" in cand and isinstance(cand["extracted_fields"], dict):
            is_nested = any(isinstance(v, dict) for v in cand["extracted_fields"].values())
            if is_nested:
                for idx, (doc_name, fields) in enumerate(cand["extracted_fields"].items(), start=1):
                    if isinstance(fields, dict):
                        files_items.append(
                            DocumentFileItem(
                                id=f"DOC-{idx:02d}",
                                label=doc_name,
                                ocr_data=fields,
                            )
                        )
            else:
                files_items.append(
                    DocumentFileItem(
                        id="DOC-1",
                        label=cand.get("label", "Document"),
                        ocr_data=cand["extracted_fields"],
                    )
                )
        elif "ocr_data" in cand and isinstance(cand["ocr_data"], dict):
            files_items.append(
                DocumentFileItem(
                    id="DOC-1",
                    label=cand.get("label", "Document"),
                    ocr_data=cand["ocr_data"],
                )
            )
        else:
            # cand is itself a dictionary of key-values (e.g. {"Candidate Name": "...", "Email": "..."})
            fields = {
                k: v
                for k, v in cand.items()
                if k not in {
                    "candidate_file",
                    "requestId",
                    "customer_id",
                    "status",
                    "total_documents_detected",
                }
            }
            if fields:
                files_items.append(
                    DocumentFileItem(
                        id="DOC-1",
                        label="Document",
                        ocr_data=fields,
                    )
                )

        verdicts = await guideline_verifier.verify_all(
            files=files_items,
            guidelines=active_guidelines,
            evidence_map={},
        )

        # Build grouped guidelines mapping for this candidate
        grouped_guidelines: Dict[str, Dict[str, Any]] = {}
        for v in verdicts:
            doc_name = v.document_label or f"Document {v.id}"
            if doc_name not in grouped_guidelines:
                grouped_guidelines[doc_name] = {
                    "document_id": v.id,
                    "document_label": doc_name,
                    "cleared_guidelines": [],
                    "uncleared_guidelines": [],
                    "rules": [],
                }
            grouped_guidelines[doc_name]["cleared_guidelines"].extend(v.cleared_guidelines)
            grouped_guidelines[doc_name]["uncleared_guidelines"].extend(v.uncleared_guidelines)
            if getattr(v, "rules", None):
                grouped_guidelines[doc_name]["rules"].extend(v.rules)

        verified_results.append(
            {
                "candidate_file": cand.get("candidate_file", "Candidate_Document"),
                "requestId": cand.get("requestId", "REQ-STAGE2"),
                "customer_id": cand.get("customer_id", "CUST-STAGE2"),
                "total_documents_detected": len(files_items),
                "guideline": [v.model_dump() for v in verdicts],
                "grouped_guidelines": grouped_guidelines,
                "rules_by_document": {k: val["rules"] for k, val in grouped_guidelines.items()},
            }
        )

    all_verdicts = []
    all_grouped_guidelines: Dict[str, Dict[str, Any]] = {}
    for r in verified_results:
        all_verdicts.extend(r.get("guideline", []))
        for doc_k, doc_val in r.get("grouped_guidelines", {}).items():
            if doc_k not in all_grouped_guidelines:
                all_grouped_guidelines[doc_k] = {
                    "document_id": doc_val.get("document_id"),
                    "document_label": doc_k,
                    "cleared_guidelines": [],
                    "uncleared_guidelines": [],
                    "rules": [],
                }
            all_grouped_guidelines[doc_k]["cleared_guidelines"].extend(doc_val.get("cleared_guidelines", []))
            all_grouped_guidelines[doc_k]["uncleared_guidelines"].extend(doc_val.get("uncleared_guidelines", []))
            all_grouped_guidelines[doc_k]["rules"].extend(doc_val.get("rules", []))

    return {
        "status": "SUCCESS",
        "company_id": company_id,
        "total_guidelines_evaluated": len(active_guidelines),
        "verified_candidates": verified_results,
        "guideline": all_verdicts,
        "grouped_guidelines": all_grouped_guidelines,
        "rules_by_document": {k: val["rules"] for k, val in all_grouped_guidelines.items()},
        "results": verified_results,
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
    db: Session = Depends(get_db),
):

    company_id = (
        client.get("company_id")
        or client.get("sub")
        or "DEFAULT_COMPANY"
    )

    company_rec = (
        db.query(Company)
        .filter(Company.company_id == company_id)
        .first()
    )
    is_signature_unlocked = bool(
        company_rec.signature_unlocked if company_rec else False
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
                signature_unlocked=is_signature_unlocked,
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

        grouped_guidelines: Dict[str, Dict[str, Any]] = {}
        for v in verdicts:
            doc_name = v.document_label or f"Document {v.id}"
            if doc_name not in grouped_guidelines:
                grouped_guidelines[doc_name] = {
                    "document_id": v.id,
                    "document_label": doc_name,
                    "cleared_guidelines": [],
                    "uncleared_guidelines": [],
                    "rules": [],
                }
            grouped_guidelines[doc_name]["cleared_guidelines"].extend(v.cleared_guidelines)
            grouped_guidelines[doc_name]["uncleared_guidelines"].extend(v.uncleared_guidelines)
            if getattr(v, "rules", None):
                grouped_guidelines[doc_name]["rules"].extend(v.rules)

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
            "grouped_guidelines": grouped_guidelines,
            "rules_by_document": {k: val["rules"] for k, val in grouped_guidelines.items()},
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

    # --------------------------------------------------------
    # PERSIST each 1-click audit scan to PostgreSQL
    # --------------------------------------------------------
    for cand_res in successful:
        _persist_scan(
            db=db,
            company_id=company_id,
            filename=cand_res.get("candidate_file", input_filename),
            ocr_result=cand_res,
        )

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


# ================================================================
# UNIFIED 1-CLICK AUDIT — /audit/1-click (Task 4)
# Returns both OCR data AND guideline verdicts side-by-side
# ================================================================

@router.post(
    "/audit/1-click",
    summary=(
        "Unified 1-Click Audit: Orchestrates OCR extraction "
        "then Guideline Verification entirely server-side. "
        "Returns both candidates_ocr_data and verified_candidates."
    ),
    status_code=status.HTTP_200_OK,
)
async def audit_one_click(
    file: Annotated[
        Optional[UploadFile],
        File(description="Optional Candidate Folder (.ZIP) or single PDF"),
    ] = None,
    url: Annotated[
        Optional[str],
        Form(description="Optional public URL of the candidate document"),
    ] = None,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
):
    """
    Fully server-side orchestrated pipeline:
    1. Await OCR extraction (Stage 1)
    2. Automatically pipe OCR JSON into Guideline Verification (Stage 2)
    3. Return unified response with both result sets for side-by-side rendering.
    """
    company_id = (
        client.get("company_id")
        or client.get("sub")
        or "DEFAULT_COMPANY"
    )

    company_rec = (
        db.query(Company)
        .filter(Company.company_id == company_id)
        .first()
    )
    is_signature_unlocked = bool(
        company_rec.signature_unlocked if company_rec else False
    )

    blueprint = guideline_registry.get_blueprint(company_id)
    active_guidelines = guideline_registry.get_guidelines(company_id)

    # Fallback to standard baseline verification guidelines if none uploaded
    if not active_guidelines:
        active_guidelines = [
            "Resume must contain Candidate Name, Email ID, and Mobile Number.",
            "PAN Card must contain Name, Date of Birth, and valid PAN Number.",
            "Aadhaar Card must contain Name, Date of Birth, and Address.",
            "Candidate Name on PAN Card must match the name provided on Resume.",
        ]

    candidate_payloads = []

    if file is not None and getattr(file, "filename", None):
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        input_filename = file.filename
        source_url = url
    elif url and url.strip():
        file_bytes, input_filename = await _download_file_from_url(url.strip())
        source_url = url.strip()
    else:
        raise HTTPException(
            status_code=400,
            detail="Please provide either a valid candidate file or a URL.",
        )

    if input_filename.lower().endswith(".zip"):
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
                for info in z.infolist():
                    if info.filename.lower().endswith(".pdf") and not info.is_dir():
                        fname = os.path.basename(info.filename)
                        candidate_payloads.append((z.read(info.filename), fname))
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Invalid ZIP file.")
    elif input_filename.lower().endswith((".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp")):
        candidate_payloads.append((file_bytes, input_filename))
    else:
        candidate_payloads.append((file_bytes, input_filename))

    if not candidate_payloads:
        raise HTTPException(status_code=400, detail="No candidate documents detected.")

    async def _run_unified(
        content: bytes,
        fname: str,
    ) -> Dict[str, Any]:
        """Runs OCR then pipes output into guideline verifier with resilient exception handling."""
        try:
            # Stage 1: OCR
            ocr_res = await _process_single_candidate_stage1(
                content, fname, blueprint, source_url, signature_unlocked=is_signature_unlocked
            )
        except Exception as ocr_err:
            logger.error(f"Stage 1 OCR error for {fname}: {ocr_err}")
            return {
                "candidate_file": fname,
                "requestId": f"REQ-ERR-{uuid.uuid4().hex[:6].upper()}",
                "customer_id": f"CUST-ERR",
                "total_documents_detected": 0,
                "files": [],
                "error": str(ocr_err),
                "guideline": [],
            }

        # Stage 2: Guideline verification
        files_items: List[DocumentFileItem] = []
        for f in ocr_res.get("files", []):
            if isinstance(f, dict):
                f_copy = dict(f)
                if "id" not in f_copy:
                    f_copy["id"] = "DOC-1"
                if "label" not in f_copy:
                    f_copy["label"] = "Document"
                if "ocr_data" not in f_copy:
                    f_copy["ocr_data"] = {}
                files_items.append(DocumentFileItem(**f_copy))
            elif isinstance(f, DocumentFileItem):
                files_items.append(f)

        if not files_items:
            files_items.append(
                DocumentFileItem(
                    id="DOC-1",
                    label=fname,
                    ocr_data={},
                )
            )

        try:
            verdicts = await guideline_verifier.verify_all(
                files=files_items,
                guidelines=active_guidelines,
                evidence_map={},
            )
            guidelines_verdicts = [v.model_dump() for v in verdicts]
        except Exception as v_err:
            logger.error(f"Stage 2 Verification error for {fname}: {v_err}")
            guidelines_verdicts = []

        # Build grouped guidelines mapping for this candidate
        grouped_guidelines: Dict[str, Dict[str, Any]] = {}
        for v in verdicts:
            doc_name = v.document_label or f"Document {v.id}"
            if doc_name not in grouped_guidelines:
                grouped_guidelines[doc_name] = {
                    "document_id": v.id,
                    "document_label": doc_name,
                    "cleared_guidelines": [],
                    "uncleared_guidelines": [],
                    "rules": [],
                }
            grouped_guidelines[doc_name]["cleared_guidelines"].extend(v.cleared_guidelines)
            grouped_guidelines[doc_name]["uncleared_guidelines"].extend(v.uncleared_guidelines)
            if getattr(v, "rules", None):
                grouped_guidelines[doc_name]["rules"].extend(v.rules)

        return {
            # ---- Stage 1 OCR payload ----
            "candidate_file": fname,
            "requestId": ocr_res.get("requestId", f"REQ-{uuid.uuid4().hex[:8].upper()}"),
            "customer_id": ocr_res.get("customer_id", f"CUST-{uuid.uuid4().hex[:6].upper()}"),
            "total_documents_detected": ocr_res.get("total_documents_detected", len(files_items)),
            "files": ocr_res.get("files", []),
            # ---- Stage 2 verdict payload ----
            "guideline": guidelines_verdicts,
            "grouped_guidelines": grouped_guidelines,
            "rules_by_document": {k: val["rules"] for k, val in grouped_guidelines.items()},
        }

    tasks = [
        _run_unified(content, fname)
        for content, fname in candidate_payloads
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    successful_unified = [
        r for r in results if not isinstance(r, Exception)
    ]
    failures_unified = [
        {"error": str(r)} for r in results if isinstance(r, Exception)
    ]

    # If all items failed, return graceful response
    if not successful_unified and failures_unified:
        err_msg = "; ".join(f.get("error", "Unknown pipeline error") for f in failures_unified)
        return {
            "status": "ERROR",
            "company_id": company_id,
            "detail": f"Document processing failed: {err_msg}",
            "candidates_ocr_data": [],
            "verified_candidates": [],
            "guideline": [],
            "results": [],
            "failures": failures_unified,
        }

    # Persist successful scans to DB
    for u_res in successful_unified:
        _persist_scan(
            db=db,
            company_id=company_id,
            filename=u_res.get("candidate_file", input_filename),
            ocr_result=u_res,
        )

    # Build separate lists for clean side-by-side rendering
    candidates_ocr_data = []
    for r in successful_unified:
        nested_ocr: Dict[str, Dict[str, Any]] = {}
        for f in r.get("files", []):
            if isinstance(f, dict):
                doc_label = f.get("label") or "Document"
                if "nested_data" in f and isinstance(f["nested_data"], dict):
                    for k_doc, v_fields in f["nested_data"].items():
                        if k_doc not in nested_ocr:
                            nested_ocr[k_doc] = {}
                        if isinstance(v_fields, dict):
                            nested_ocr[k_doc].update(v_fields)
                else:
                    ocr_data = f.get("ocr_data", {})
                    if isinstance(ocr_data, dict):
                        clean_fields = {
                            k: v for k, v in ocr_data.items()
                            if not k.startswith("_") and k not in {
                                "doc_quality", "doc_quality_issues", "is_signed", "signatory_type", "signer_name", "signature_location", "signature_confidence"
                            }
                        }
                        if doc_label not in nested_ocr:
                            nested_ocr[doc_label] = {}
                        nested_ocr[doc_label].update(clean_fields)
        candidates_ocr_data.append(
            {
                "candidate_file": r.get("candidate_file", input_filename),
                "requestId": r.get("requestId", "REQ-1CLICK"),
                "customer_id": r.get("customer_id", "CUST-1CLICK"),
                "total_documents_detected": r.get("total_documents_detected", 0),
                "files": r.get("files", []),
                "extracted_fields": nested_ocr,
            }
        )

    verified_candidates = [
        {
            "candidate_file": r.get("candidate_file", input_filename),
            "requestId": r.get("requestId", "REQ-1CLICK"),
            "customer_id": r.get("customer_id", "CUST-1CLICK"),
            "total_documents_detected": r.get("total_documents_detected", 0),
            "guideline": r.get("guideline", []),
            "grouped_guidelines": r.get("grouped_guidelines", {}),
            "rules_by_document": r.get("rules_by_document", {}),
        }
        for r in successful_unified
    ]

    all_verdicts = []
    all_grouped_guidelines: Dict[str, Dict[str, Any]] = {}
    for r in verified_candidates:
        all_verdicts.extend(r.get("guideline", []))
        for doc_k, doc_val in r.get("grouped_guidelines", {}).items():
            if doc_k not in all_grouped_guidelines:
                all_grouped_guidelines[doc_k] = {
                    "document_id": doc_val.get("document_id"),
                    "document_label": doc_k,
                    "cleared_guidelines": [],
                    "uncleared_guidelines": [],
                    "rules": [],
                }
            all_grouped_guidelines[doc_k]["cleared_guidelines"].extend(doc_val.get("cleared_guidelines", []))
            all_grouped_guidelines[doc_k]["uncleared_guidelines"].extend(doc_val.get("uncleared_guidelines", []))
            all_grouped_guidelines[doc_k]["rules"].extend(doc_val.get("rules", []))

    return {
        "status": "SUCCESS",
        "company_id": company_id,
        "total_candidates_processed": len(candidates_ocr_data),
        "total_guidelines_evaluated": len(active_guidelines),
        "candidates_ocr_data": candidates_ocr_data,
        "verified_candidates": verified_candidates,
        "guideline": all_verdicts,
        "grouped_guidelines": all_grouped_guidelines,
        "rules_by_document": {k: val["rules"] for k, val in all_grouped_guidelines.items()},
        "results": verified_candidates,
        "failures": failures_unified,
    }