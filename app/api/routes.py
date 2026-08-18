import asyncio
import json
import uuid
from pathlib import Path
from typing import Any, Dict, List, Tuple

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
)

from app.core.auth import authenticate_client

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


# ================================================================
# 1. REGISTER COMPANY BLUEPRINT JSON
# ================================================================


@router.post("/company/register-blueprint-json")
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