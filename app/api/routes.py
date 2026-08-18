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

<<<<<<< HEAD
from app.core.config import settings
from app.services.ingestion.blueprint_parser import blueprint_parser
from app.services.ingestion.document_loader import save_document
from app.services.ingestion.pdf_processor import pdf_processor
from app.services.qwen.qwen_client import qwen_client
from app.services.resilience.rate_limiter import rate_limiter
from app.services.schema_registry import MASTER_REQUIREMENTS_PATH, schema_registry_service
=======
from app.schemas.registry import schema_registry
>>>>>>> a2b377fd29c152cecc437ab8f4b8117a386516e1

from app.services.classification.document_classifier import (
    document_classifier,
)

from app.services.extraction.document_extractor import (
    document_extractor,
)

from app.services.ingestion.blueprint_parser import (
    blueprint_parser,
)

from app.services.ingestion.document_loader import (
    save_document,
)

from app.services.ingestion.pdf_processor import (
    pdf_processor,
)

from app.services.quality.quality_checker import (
    quality_checker,
)

from app.services.schema_registry import (
    schema_registry_service,
)

from app.services.segmentation.document_segmenter import (
    document_segmenter,
)

from app.services.validation.field_validator import (
    field_validator,
)


<<<<<<< HEAD
# =====================================================================
# 1. HELPERS & BLUEPRINT MANAGEMENT
# =====================================================================
=======
router = APIRouter(
    tags=["Document Onboarding & Intelligence"]
)


# ================================================================
# 1. REGISTER COMPANY BLUEPRINT JSON
# ================================================================
>>>>>>> a2b377fd29c152cecc437ab8f4b8117a386516e1


def load_active_company_blueprint() -> Dict[str, Any]:
    """Loads all active document schemas registered by the company."""
    if MASTER_REQUIREMENTS_PATH.exists():
        try:
            with open(MASTER_REQUIREMENTS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("schemas", {})
        except Exception:
            return {}
    return {}


@router.post("/admin/tier-config", tags=["Admin & System Configuration"])
async def update_tier(tier: str):
    """
    Switch tier dynamically at runtime ('FREE' or 'PAID').
    Updates throughput and semaphores without restarting the server.
    """
    success = settings.set_tier(tier)
    if not success:
        raise HTTPException(
            status_code=400, detail="Invalid tier. Choose 'FREE' or 'PAID'."
        )
    rate_limiter.sync_semaphore()
    return {
        "status": "updated",
        "active_tier": settings.active_tier,
        "limits": settings.limits.model_dump(),
    }


@router.post("/company/register-blueprint-json")
<<<<<<< HEAD
async def register_blueprint_json(payload: dict):
    """Registers dynamic document schemas directly from JSON."""
    try:
        master_schemas = blueprint_parser.parse_raw_dict(payload)
        result = schema_registry_service.save_blueprint(master_schemas)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/company/register-blueprint-doc")
async def register_blueprint_doc(file: UploadFile = File(...)):
    """Uploads .docx/.json requirement file, infers document requirements, and saves schemas."""
    try:
        content = await file.read()
        filename_lower = file.filename.lower()

        if filename_lower.endswith(".docx") or filename_lower.endswith(".doc"):
            master_schemas = blueprint_parser.parse_docx(content)
        elif filename_lower.endswith(".json"):
            raw_data = json.loads(content.decode("utf-8"))
            master_schemas = blueprint_parser.parse_raw_dict(raw_data)
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported format. Please upload .docx, .doc, or .json.",
            )

        result = schema_registry_service.save_blueprint(master_schemas)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# =====================================================================
# 2. SINGLE-PASS JOINT QUALITY & SCHEMA-BOUND EXTRACTION
# =====================================================================


def _execute_page_inference(image_bytes: bytes, company_schemas: Dict[str, Any]) -> Dict[str, Any]:
    """
    Synchronous Qwen 3.5 VL call that performs in 1 unified prompt:
    1. Visual quality inspection (legible vs bad/blurred).
    2. Dynamic semantic match against company requirements.
    3. Schema-bound field extraction.
    """
    prompt = f"""
You are an enterprise document intelligence and automated verification system.
Inspect the attached document page image carefully and evaluate it against the Company Schemas.

COMPANY SCHEMAS:
{json.dumps(company_schemas, indent=2)}

INSTRUCTIONS:
1. QUALITY CHECK:
   - Check if this page is legible and clear.
   - If severely blurred, dark, cutoff, or corrupt, set "quality": "BAD" and provide the reason in "quality_reason".
   - If clear and legible, set "quality": "GOOD".

2. DYNAMIC CATEGORY MATCH:
   - Match this document against the keys in COMPANY SCHEMAS based on its context, layout, and visual markers.
   - If it matches a defined schema, set "document_type" to the exact schema key name.
   - If it does not belong to any defined schema (e.g., random picture, unrelated letter), set "document_type": "unknown".

3. FIELD EXTRACTION:
   - If matched, extract only the required fields defined in that schema.
   - If a field is missing on the document, return null. Do not hallucinate values.
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
            system_prompt="You are a strict enterprise document extraction engine. Return valid JSON only."
        )
        clean_text = raw_output.replace("```json", "").replace("```", "").strip()
        return json.loads(clean_text)
    except Exception as e:
        return {
            "quality": "BAD",
            "quality_reason": f"Inference error: {str(e)}",
            "document_type": "unknown",
            "confidence": 0.0,
            "extracted_data": {},
        }


async def _process_single_page(page_number: int, image_path: str, company_schemas: Dict[str, Any]) -> Dict[str, Any]:
    """Async worker bounded by the dynamic rate limiter and backoff engine."""
    loop = asyncio.get_running_loop()
    image_bytes = await loop.run_in_executor(
        None, pdf_processor.image_to_bytes, image_path
    )

    result = await rate_limiter.execute_with_resilience(
        _execute_page_inference, image_bytes, company_schemas
    )

    result["page_number"] = page_number
    return result


def _stitch_contiguous_pages(page_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Merges contiguous pages belonging to the same document type (e.g. 2-page resumes, marksheets)."""
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
                "quality_reason": page.get("quality_reason", "Low document legibility"),
                "extracted_data": {},
            })
            continue

        if current_doc and current_doc["document_type"] == doc_type and doc_type != "unknown":
            current_doc["pages"].append(page["page_number"])
            # Update extracted data with non-null values from current page
            for k, v in page.get("extracted_data", {}).items():
                if v is not None:
                    current_doc["extracted_data"][k] = v
        else:
            if current_doc:
                merged_documents.append(current_doc)

            current_doc = {
                "document_type": doc_type,
                "pages": [page["page_number"]],
                "status": "SUCCESS" if doc_type != "unknown" else "UNMATCHED_UNKNOWN",
                "confidence": page.get("confidence", 1.0),
                "extracted_data": page.get("extracted_data", {}),
            }

    if current_doc:
        merged_documents.append(current_doc)

    return merged_documents


# =====================================================================
# 3. MAIN DOCUMENT PROCESSING ENDPOINT
# =====================================================================


@router.post("/documents/process")
async def process_document(file: UploadFile = File(...)):
    """
    Single-Pass High-Speed Pipeline:
    PDF Ingestion -> Parallel Quality + Dynamic Schema Match + Extraction -> Contiguous Page Stitching.
    """
    request_id = f"REQ-{uuid.uuid4().hex[:12].upper()}"
    company_schemas = load_active_company_blueprint()

    if not company_schemas:
        raise HTTPException(
            status_code=400,
            detail="No company blueprint found. Please register requirements via /company/register-blueprint-json first.",
        )

    try:
        # 1. Save Document
        file_path = await save_document(file)
        if Path(file_path).suffix.lower() != ".pdf":
            raise HTTPException(
                status_code=400,
                detail="Please upload a valid PDF document.",
            )

        # 2. PDF to Page Images
        loop = asyncio.get_running_loop()
        page_images = await loop.run_in_executor(
            None, pdf_processor.pdf_to_images, file_path
        )

        if not page_images:
            raise HTTPException(
                status_code=400,
                detail="The uploaded PDF contains no readable pages.",
            )

        # 3. Parallel Single-Pass Execution across all pages
        tasks = [
            _process_single_page(idx, img_path, company_schemas)
            for idx, img_path in enumerate(page_images, start=1)
        ]
        raw_results = await asyncio.gather(*tasks)
        raw_results = sorted(raw_results, key=lambda x: x["page_number"])

        # 4. Stitch contiguous multi-page documents
        documents = _stitch_contiguous_pages(raw_results)

        # 5. Build Audit Summary Checklist against company blueprint
        required_types = list(company_schemas.keys())
        detected_types = list({d["document_type"] for d in documents if d["document_type"] != "unknown"})
        missing_types = [t for t in required_types if t not in detected_types]

        return {
            "request_id": request_id,
            "status": "PROCESSED",
            "total_pages": len(page_images),
            "audit_summary": {
                "total_requirements": len(required_types),
                "total_detected": len(detected_types),
                "completeness_percentage": round((len(detected_types) / len(required_types)) * 100, 2) if required_types else 100.0,
                "missing_documents": missing_types,
            },
            "documents": documents,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
=======
async def register_blueprint_json(
    payload: dict,
    client: dict = Depends(
        authenticate_client
    ),
):
    """
    Register a document blueprint for
    the authenticated company.
    """

    company_id = client.get(
        "company_id"
    )

    if not company_id:

        raise HTTPException(
            status_code=401,
            detail=(
                "Authenticated client does not "
                "have a company_id"
            ),
        )

    try:

        master_schemas = (
            blueprint_parser.parse_raw_dict(
                payload
            )
        )

        result = (
            schema_registry_service.save_blueprint(
                master_schemas=master_schemas,
                company_id=company_id,
            )
        )

        # Reload only this company
        schema_registry.reload_company(
            company_id
        )

        return {
            **result,
            "company_id": company_id,
        }

    except HTTPException:
        raise

    except Exception as e:

        raise HTTPException(
            status_code=400,
            detail=str(e),
        )


# ================================================================
# 2. REGISTER COMPANY BLUEPRINT FILE
# ================================================================


@router.post("/company/register-blueprint-doc")
async def register_blueprint_doc(
    file: UploadFile = File(...),
    client: dict = Depends(
        authenticate_client
    ),
):
    """
    Register company blueprint through
    JSON / DOCX / DOC.
    """

    company_id = client.get(
        "company_id"
    )

    if not company_id:

        raise HTTPException(
            status_code=401,
            detail=(
                "Authenticated client does not "
                "have a company_id"
            ),
        )

    try:

        content = await file.read()

        filename = (
            file.filename.lower()
            if file.filename
            else ""
        )

        # --------------------------------------------------------
        # DOCX / DOC
        # --------------------------------------------------------

        if (
            filename.endswith(".docx")
            or filename.endswith(".doc")
        ):

            master_schemas = (
                blueprint_parser.parse_docx(
                    content
                )
            )

        # --------------------------------------------------------
        # JSON
        # --------------------------------------------------------

        elif filename.endswith(".json"):

            try:

                raw_data = json.loads(
                    content.decode(
                        "utf-8"
                    )
                )

            except json.JSONDecodeError:

                raise HTTPException(
                    status_code=400,
                    detail="Invalid JSON blueprint.",
                )

            master_schemas = (
                blueprint_parser.parse_raw_dict(
                    raw_data
                )
            )

        else:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Unsupported file format. "
                    "Use .json, .docx or .doc."
                ),
            )

        # --------------------------------------------------------
        # SAVE
        # --------------------------------------------------------

        result = (
            schema_registry_service.save_blueprint(
                master_schemas=master_schemas,
                company_id=company_id,
            )
        )

        # --------------------------------------------------------
        # RELOAD COMPANY
        # --------------------------------------------------------

        schema_registry.reload_company(
            company_id
        )

        return {
            **result,
            "company_id": company_id,
        }

    except HTTPException:
        raise

    except Exception as e:

        raise HTTPException(
            status_code=400,
            detail=str(e),
        )


# ================================================================
# 3. PROCESS SINGLE PAGE
# ================================================================


async def _process_single_page(
    page_number: int,
    image_path: str,
    company_id: str,
) -> Dict[str, Any]:

    loop = asyncio.get_running_loop()

    # --------------------------------------------------------
    # IMAGE
    # --------------------------------------------------------

    image_bytes = await loop.run_in_executor(
        None,
        pdf_processor.image_to_bytes,
        image_path,
    )

    # --------------------------------------------------------
    # QUALITY
    # --------------------------------------------------------

    quality_result = await loop.run_in_executor(
        None,
        quality_checker.check,
        image_bytes,
    )

    # --------------------------------------------------------
    # BAD QUALITY
    # --------------------------------------------------------

    if (
        quality_result.get(
            "quality"
        )
        == "BAD"
    ):

        return {
            "page_number": page_number,
            "quality": quality_result,
            "classification": {
                "document_type": "unknown",
                "confidence": 0.0,
                "reason": (
                    "Quality check failed"
                ),
            },
            "image_path": image_path,
        }

    # --------------------------------------------------------
    # COMPANY-AWARE CLASSIFICATION
    # --------------------------------------------------------

    classification = await loop.run_in_executor(
        None,
        document_classifier.classify,
        image_bytes,
        company_id,
    )

    return {
        "page_number": page_number,
        "quality": quality_result,
        "classification": classification,
        "image_path": image_path,
    }


# ================================================================
# 4. EXTRACTION + VALIDATION
# ================================================================


async def _extract_and_validate_group(
    group: Dict[str, Any],
    page_results: List[Dict[str, Any]],
    company_id: str,
) -> Dict[str, Any]:

    loop = asyncio.get_running_loop()

    document_type = group[
        "document_type"
    ]

    pages = group[
        "pages"
    ]

    # --------------------------------------------------------
    # UNKNOWN
    # --------------------------------------------------------

    if document_type == "unknown":

        return {
            "document_type": "unknown",
            "pages": pages,
            "status": "UNSUPPORTED_DOCUMENT",
        }

    # --------------------------------------------------------
    # COMPANY SCHEMA
    # --------------------------------------------------------

    schema = schema_registry.get(
        document_type=document_type,
        company_id=company_id,
    )

    if schema is None:

        return {
            "document_type": document_type,
            "pages": pages,
            "status": "SCHEMA_NOT_FOUND",
            "reason": (
                "Document type is not configured "
                "for this company."
            ),
        }

    # --------------------------------------------------------
    # GROUP PAGES
    # --------------------------------------------------------

    group_page_results = (
        document_segmenter.get_group_pages(
            group,
            page_results,
        )
    )

    # --------------------------------------------------------
    # IMAGES
    # --------------------------------------------------------

    document_images: List[
        Tuple[bytes, str]
    ] = []

    for page in group_page_results:

        image_bytes = await loop.run_in_executor(
            None,
            pdf_processor.image_to_bytes,
            page["image_path"],
        )

        document_images.append(
            (
                image_bytes,
                "jpeg",
            )
        )

    # --------------------------------------------------------
    # COMPANY FIELDS
    # --------------------------------------------------------

    fields = [
        field.model_dump()
        for field in schema.fields
    ]

    # --------------------------------------------------------
    # EXTRACTION
    # --------------------------------------------------------

    extracted_data = await loop.run_in_executor(
        None,
        document_extractor.extract,
        document_images,
        document_type,
        fields,
    )

    # --------------------------------------------------------
    # VALIDATION
    # --------------------------------------------------------

    validation = await loop.run_in_executor(
        None,
        field_validator.validate,
        extracted_data,
        fields,
    )

    # --------------------------------------------------------
    # CONFIDENCE
    # --------------------------------------------------------

    confidences = [
        page.get(
            "classification",
            {},
        ).get(
            "confidence",
            0.0,
        )
        for page in group_page_results
    ]

    average_confidence = (
        sum(confidences)
        / len(confidences)
        if confidences
        else 0.0
    )

    # --------------------------------------------------------
    # STATUS
    # --------------------------------------------------------

    document_status = (
        "SUCCESS"
        if validation.get("valid")
        else "PARTIAL"
    )

    return {
        "document_type": document_type,
        "pages": pages,
        "status": document_status,
        "classification": {
            "confidence": round(
                average_confidence,
                4,
            )
        },
        "validation": validation,
        "extracted_data": extracted_data,
    }


# ================================================================
# 5. PROCESS CANDIDATE PDF
# ================================================================


@router.post("/documents/process")
async def process_document(
    file: UploadFile = File(...),
    client: dict = Depends(
        authenticate_client
    ),
):
    """
    Process a candidate PDF using the
    authenticated company's blueprint.
    """

    request_id = (
        f"REQ-{uuid.uuid4().hex[:12].upper()}"
    )

    company_id = client.get(
        "company_id"
    )

    if not company_id:

        raise HTTPException(
            status_code=401,
            detail=(
                "Authenticated client does not "
                "have a company_id"
            ),
        )

    try:

        # ========================================================
        # 1. CHECK COMPANY BLUEPRINT
        # ========================================================

        company_document_types = (
            schema_registry
            .list_company_document_types(
                company_id
            )
        )

        if not company_document_types:

            raise HTTPException(
                status_code=400,
                detail=(
                    "No document blueprint is "
                    "registered for this company."
                ),
            )

        # ========================================================
        # 2. CHECK FILE
        # ========================================================

        filename = (
            file.filename.lower()
            if file.filename
            else ""
        )

        if not filename.endswith(".pdf"):

            raise HTTPException(
                status_code=400,
                detail=(
                    "Only PDF candidate documents "
                    "are supported."
                ),
            )

        # ========================================================
        # 3. SAVE PDF
        # ========================================================

        file_path = await save_document(
            file
        )

        # ========================================================
        # 4. PDF → IMAGES
        # ========================================================

        loop = asyncio.get_running_loop()

        page_images = await loop.run_in_executor(
            None,
            pdf_processor.pdf_to_images,
            file_path,
        )

        if not page_images:

            raise HTTPException(
                status_code=400,
                detail=(
                    "The uploaded PDF contains "
                    "no readable pages."
                ),
            )

        # ========================================================
        # 5. CONCURRENT PAGE PROCESSING
        # ========================================================

        page_tasks = [
            _process_single_page(
                page_number=page_number,
                image_path=image_path,
                company_id=company_id,
            )
            for page_number, image_path
            in enumerate(
                page_images,
                start=1,
            )
        ]

        page_results = await asyncio.gather(
            *page_tasks
        )

        page_results = sorted(
            page_results,
            key=lambda x: x[
                "page_number"
            ],
        )

        # ========================================================
        # 6. GROUP DOCUMENTS
        # ========================================================

        document_groups = (
            document_segmenter.group_pages(
                page_results
            )
        )

        # ========================================================
        # 7. EXTRACTION + VALIDATION
        # ========================================================

        group_tasks = [
            _extract_and_validate_group(
                group=group,
                page_results=page_results,
                company_id=company_id,
            )
            for group in document_groups
        ]

        documents = await asyncio.gather(
            *group_tasks
        )

        # ========================================================
        # 8. RESPONSE
        # ========================================================

        return {
            "request_id": request_id,
            "company_id": company_id,
            "status": "PROCESSED",
            "total_pages": len(
                page_images
            ),
            "configured_document_types":
                company_document_types,
            "documents": documents,
        }

    except HTTPException:
        raise

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )
>>>>>>> a2b377fd29c152cecc437ab8f4b8117a386516e1
