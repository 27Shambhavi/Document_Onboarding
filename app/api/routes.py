import asyncio
import json
import uuid
from pathlib import Path
from typing import Any, Dict, List, Tuple

from fastapi import (
    APIRouter,
    File,
    HTTPException,
    UploadFile,
)

from app.schemas.registry import schema_registry

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


router = APIRouter(
    tags=["Document Onboarding & Intelligence"]
)


# =====================================================================
# 1. COMPANY BLUEPRINT REGISTRATION
# =====================================================================


@router.post("/company/register-blueprint-json")
async def register_blueprint_json(
    payload: dict,
):
    """
    Register document requirements directly
    from a JSON blueprint.

    After registration:
        1. Schemas are saved.
        2. Schema registry is reloaded.
        3. Classifier is refreshed.
    """

    try:

        master_schemas = (
            blueprint_parser.parse_raw_dict(
                payload
            )
        )

        result = (
            schema_registry_service.save_blueprint(
                master_schemas
            )
        )

        # Reload dynamic schemas
        schema_registry.load_schemas()

        # Refresh classifier so newly registered
        # document types are immediately recognized
        document_classifier.refresh()

        return result

    except Exception as e:

        raise HTTPException(
            status_code=400,
            detail=str(e),
        )


@router.post("/company/register-blueprint-doc")
async def register_blueprint_doc(
    file: UploadFile = File(...),
):
    """
    Upload a company document blueprint.

    Supported:
        .docx
        .doc
        .json
    """

    try:

        content = await file.read()

        filename_lower = (
            file.filename.lower()
            if file.filename
            else ""
        )

        # ---------------------------------------------
        # DOCX / DOC
        # ---------------------------------------------

        if (
            filename_lower.endswith(".docx")
            or filename_lower.endswith(".doc")
        ):

            master_schemas = (
                blueprint_parser.parse_docx(
                    content
                )
            )

        # ---------------------------------------------
        # JSON
        # ---------------------------------------------

        elif filename_lower.endswith(".json"):

            raw_data = json.loads(
                content.decode("utf-8")
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
                    "Please upload a .docx, .doc, "
                    "or .json file."
                ),
            )

        # ---------------------------------------------
        # SAVE BLUEPRINT
        # ---------------------------------------------

        result = (
            schema_registry_service.save_blueprint(
                master_schemas
            )
        )

        # ---------------------------------------------
        # RELOAD REGISTRY
        # ---------------------------------------------

        schema_registry.load_schemas()

        # ---------------------------------------------
        # REFRESH CLASSIFIER
        # ---------------------------------------------

        document_classifier.refresh()

        return result

    except HTTPException:
        raise

    except Exception as e:

        raise HTTPException(
            status_code=400,
            detail=str(e),
        )


# =====================================================================
# 2. CONCURRENT PAGE PROCESSING
# =====================================================================


async def _process_single_page(
    page_number: int,
    image_path: str,
) -> Dict[str, Any]:
    """
    Process one page.

    Each page independently performs:

        image loading
             ↓
        quality check
             ↓
        classification

    This function is executed concurrently
    for all pages using asyncio.gather().
    """

    loop = asyncio.get_running_loop()

    # =================================================
    # LOAD IMAGE
    # =================================================

    image_bytes = await loop.run_in_executor(
        None,
        pdf_processor.image_to_bytes,
        image_path,
    )

    # =================================================
    # QUALITY CHECK
    # =================================================

    quality_result = await loop.run_in_executor(
        None,
        quality_checker.check,
        image_bytes,
    )

    # =================================================
    # BAD QUALITY
    # =================================================

    if (
        quality_result.get("quality")
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

    # =================================================
    # CLASSIFICATION
    # =================================================

    classification = await loop.run_in_executor(
        None,
        document_classifier.classify,
        image_bytes,
    )

    return {
        "page_number": page_number,
        "quality": quality_result,
        "classification": classification,
        "image_path": image_path,
    }


# =====================================================================
# 3. CONCURRENT DOCUMENT EXTRACTION + VALIDATION
# =====================================================================


async def _extract_and_validate_group(
    group: Dict[str, Any],
    page_results: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Process one logical document group.

    Example:

        Resume pages [1, 2, 3]

    are treated as ONE document.

    Extraction receives all pages together.
    """

    loop = asyncio.get_running_loop()

    document_type = group[
        "document_type"
    ]

    pages = group[
        "pages"
    ]

    # =================================================
    # UNKNOWN DOCUMENT
    # =================================================

    if document_type == "unknown":

        return {
            "document_type": "unknown",
            "pages": pages,
            "status": "UNSUPPORTED_DOCUMENT",
        }

    # =================================================
    # DYNAMIC SCHEMA LOOKUP
    # =================================================

    schema = schema_registry.get(
        document_type
    )

    if schema is None:

        return {
            "document_type": document_type,
            "pages": pages,
            "status": "SCHEMA_NOT_FOUND",
        }

    # =================================================
    # GET ALL PAGES BELONGING TO THIS DOCUMENT
    # =================================================

    group_page_results = (
        document_segmenter.get_group_pages(
            group,
            page_results,
        )
    )

    # =================================================
    # PREPARE ALL DOCUMENT IMAGES
    # =================================================

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

    # =================================================
    # DYNAMIC FIELDS
    # =================================================

    fields = [
        field.model_dump()
        for field in schema.fields
    ]

    # =================================================
    # MULTI-PAGE EXTRACTION
    # =================================================

    extracted_data = await loop.run_in_executor(
        None,
        document_extractor.extract,
        document_images,
        document_type,
        fields,
    )

    # =================================================
    # VALIDATION
    # =================================================

    validation = await loop.run_in_executor(
        None,
        field_validator.validate,
        extracted_data,
        fields,
    )

    # =================================================
    # CLASSIFICATION CONFIDENCE
    # =================================================

    classification_confidences = [
        page.get(
            "classification",
            {},
        ).get(
            "confidence",
            0.0,
        )
        for page in group_page_results
    ]

    if classification_confidences:

        average_confidence = (
            sum(
                classification_confidences
            )
            / len(
                classification_confidences
            )
        )

    else:

        average_confidence = 0.0

    # =================================================
    # DOCUMENT STATUS
    # =================================================

    if validation.get("valid"):

        document_status = "SUCCESS"

    else:

        document_status = "PARTIAL"

    # =================================================
    # FINAL DOCUMENT RESULT
    # =================================================

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


# =====================================================================
# 4. MAIN DOCUMENT PROCESSING ENDPOINT
# =====================================================================


@router.post("/documents/process")
async def process_document(
    file: UploadFile = File(...),
):
    """
    Concurrent document onboarding pipeline.

    Flow:

        Upload
          ↓
        Request ID
          ↓
        Save PDF
          ↓
        PDF → ALL page images
          ↓
        CONCURRENT page processing
          ├── Quality
          └── Classification
          ↓
        Group pages
          ↓
        CONCURRENT document processing
          ├── Multi-page extraction
          └── Validation
          ↓
        Final JSON
    """

    request_id = (
        f"REQ-{uuid.uuid4().hex[:12].upper()}"
    )

    try:

        # =================================================
        # 1. SAVE ORIGINAL DOCUMENT
        # =================================================

        file_path = await save_document(
            file
        )

        extension = Path(
            file_path
        ).suffix.lower()

        # =================================================
        # 2. PDF VALIDATION
        # =================================================

        if extension != ".pdf":

            raise HTTPException(
                status_code=400,
                detail=(
                    "For the current version, "
                    "please upload a PDF document."
                ),
            )

        # =================================================
        # 3. PDF → PAGE IMAGES
        # =================================================

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

        # =================================================
        # 4. CONCURRENT PAGE PROCESSING
        # =================================================

        page_tasks = [
            _process_single_page(
                page_number,
                image_path,
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

        # Keep pages in original order
        page_results = sorted(
            page_results,
            key=lambda x: x[
                "page_number"
            ],
        )

        # =================================================
        # 5. GROUP / SEGMENT PAGES
        # =================================================

        document_groups = (
            document_segmenter.group_pages(
                page_results
            )
        )

        # =================================================
        # 6. CONCURRENT DOCUMENT EXTRACTION
        # =================================================

        group_tasks = [
            _extract_and_validate_group(
                group,
                page_results,
            )
            for group in document_groups
        ]

        documents = await asyncio.gather(
            *group_tasks
        )

        # =================================================
        # 7. FINAL RESPONSE
        # =================================================

        return {
            "request_id": request_id,
            "status": "PROCESSED",
            "total_pages": len(
                page_images
            ),
            "documents": documents,
        }

    # =====================================================
    # HTTP EXCEPTIONS
    # =====================================================

    except HTTPException:
        raise

    # =====================================================
    # UNEXPECTED ERRORS
    # =====================================================

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )