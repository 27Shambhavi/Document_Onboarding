import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    File,
    UploadFile,
    HTTPException,
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

from app.services.classification.document_classifier import (
    document_classifier,
)

from app.services.extraction.document_extractor import (
    document_extractor,
)

from app.services.validation.field_validator import (
    field_validator,
)

from app.services.segmentation.document_segmenter import (
    document_segmenter,
)

from app.schemas.registry import (
    schema_registry,
)


router = APIRouter(
    prefix="/documents",
    tags=["Documents"],
)


@router.post("/process")
async def process_document(
    file: UploadFile = File(...),
):
    """
    Main document-processing pipeline.

    Flow:

        Upload
          ↓
        Request ID
          ↓
        Save document
          ↓
        PDF → page images
          ↓
        Quality check
          ↓
        Document classification
          ↓
        Page segmentation
          ↓
        Dynamic schema
          ↓
        Multi-page extraction
          ↓
        Validation
          ↓
        Final JSON
    """

    # =========================================
    # REQUEST ID
    # =========================================

    request_id = (
        f"REQ-{uuid.uuid4().hex[:12].upper()}"
    )

    try:

        # =========================================
        # 1. SAVE ORIGINAL DOCUMENT
        # =========================================

        file_path = await save_document(
            file
        )

        extension = Path(
            file_path
        ).suffix.lower()

        # =========================================
        # 2. CURRENT VERSION ACCEPTS PDF
        # =========================================

        if extension != ".pdf":

            raise HTTPException(
                status_code=400,
                detail=(
                    "For the current version, "
                    "please upload a PDF document."
                ),
            )

        # =========================================
        # 3. PDF → PAGE IMAGES
        # =========================================

        page_images = (
            pdf_processor.pdf_to_images(
                file_path
            )
        )

        if not page_images:

            raise HTTPException(
                status_code=400,
                detail=(
                    "The uploaded PDF contains "
                    "no readable pages."
                ),
            )

        # =========================================
        # 4. PROCESS EACH PAGE
        # =========================================

        page_results = []

        for page_number, image_path in enumerate(
            page_images,
            start=1,
        ):

            print(
                f"Processing page {page_number}..."
            )

            # -------------------------------------
            # Load image
            # -------------------------------------

            image_bytes = (
                pdf_processor.image_to_bytes(
                    image_path
                )
            )

            # =====================================
            # 4A. QUALITY CHECK
            # =====================================

            quality_result = (
                quality_checker.check(
                    image_bytes
                )
            )

            # =====================================
            # 4B. BAD QUALITY PAGE
            # =====================================

            if (
                quality_result["quality"]
                == "BAD"
            ):

                page_results.append(
                    {
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
                )

                continue

            # =====================================
            # 4C. DOCUMENT CLASSIFICATION
            # =====================================

            classification = (
                document_classifier.classify(
                    image_bytes
                )
            )

            page_results.append(
                {
                    "page_number": page_number,
                    "quality": quality_result,
                    "classification": classification,
                    "image_path": image_path,
                }
            )

        # =========================================
        # 5. GROUP CONSECUTIVE PAGES
        # =========================================

        document_groups = (
            document_segmenter.group_pages(
                page_results
            )
        )

        # =========================================
        # 6. PROCESS EACH DOCUMENT GROUP
        # =========================================

        documents = []

        for group in document_groups:

            document_type = group[
                "document_type"
            ]

            pages = group[
                "pages"
            ]

            # =====================================
            # UNKNOWN DOCUMENT
            # =====================================

            if document_type == "unknown":

                documents.append(
                    {
                        "document_type": "unknown",
                        "pages": pages,
                        "status": (
                            "UNSUPPORTED_DOCUMENT"
                        ),
                    }
                )

                continue

            # =====================================
            # GET DYNAMIC DOCUMENT SCHEMA
            # =====================================

            schema = schema_registry.get(
                document_type
            )

            if schema is None:

                documents.append(
                    {
                        "document_type": document_type,
                        "pages": pages,
                        "status": "SCHEMA_NOT_FOUND",
                    }
                )

                continue

            # =====================================
            # GET ALL PAGE RESULTS
            # FOR THIS DOCUMENT
            # =====================================

            group_page_results = (
                document_segmenter.get_group_pages(
                    group,
                    page_results,
                )
            )

            # =====================================
            # PREPARE ALL IMAGES
            # =====================================

            document_images = []

            for page in group_page_results:

                image_bytes = (
                    pdf_processor.image_to_bytes(
                        page["image_path"]
                    )
                )

                document_images.append(
                    (
                        image_bytes,
                        "jpeg",
                    )
                )

            # =====================================
            # DYNAMIC FIELD DEFINITIONS
            # =====================================

            fields = [
                field.model_dump()
                for field in schema.fields
            ]

            # =====================================
            # MULTI-PAGE EXTRACTION
            # =====================================

            extracted_data = (
                document_extractor.extract(
                    images=document_images,
                    document_type=document_type,
                    fields=fields,
                )
            )

            # =====================================
            # VALIDATION
            # =====================================

            validation = (
                field_validator.validate(
                    extracted_data,
                    fields,
                )
            )

            # =====================================
            # CLASSIFICATION CONFIDENCE
            # =====================================

            classification_confidences = []

            quality_results = []

            for page in group_page_results:

                page_classification = page.get(
                    "classification",
                    {},
                )

                page_quality = page.get(
                    "quality",
                    {},
                )

                classification_confidences.append(
                    page_classification.get(
                        "confidence",
                        0.0,
                    )
                )

                quality_results.append(
                    page_quality
                )

            # -------------------------------------
            # Average classification confidence
            # -------------------------------------

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

            # -------------------------------------
            # Final document status
            # -------------------------------------

            if validation["valid"]:

                document_status = "SUCCESS"

            else:

                document_status = "PARTIAL"

            # =====================================
            # FINAL DOCUMENT RESULT
            # =====================================

            documents.append(
                {
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
            )

        # =========================================
        # 7. FINAL RESPONSE
        # =========================================

        return {
            "request_id": request_id,
            "status": "PROCESSED",
            "total_pages": len(
                page_images
            ),
            "documents": documents,
        }

    # =========================================
    # HTTP EXCEPTIONS
    # =========================================

    except HTTPException:
        raise

    # =========================================
    # UNEXPECTED ERRORS
    # =========================================

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )