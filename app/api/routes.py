import asyncio
import json
import uuid
from pathlib import Path
from typing import Any, Dict, List, Tuple

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.schemas.registry import schema_registry
from app.services.classification.document_classifier import document_classifier
from app.services.extraction.document_extractor import document_extractor
from app.services.ingestion.blueprint_parser import blueprint_parser
from app.services.ingestion.document_loader import save_document
from app.services.ingestion.pdf_processor import pdf_processor
from app.services.quality.quality_checker import quality_checker
from app.services.schema_registry import schema_registry_service
from app.services.segmentation.document_segmenter import document_segmenter
from app.services.validation.field_validator import field_validator

router = APIRouter(tags=["Document Onboarding & Intelligence"])


# =====================================================================
# 1. COMPANY BLUEPRINT REGISTRATION ENDPOINTS
# =====================================================================


@router.post("/company/register-blueprint-json")
async def register_blueprint_json(payload: dict):
  """Registers document requirements directly from a JSON blueprint."""
  try:
    master_schemas = blueprint_parser.parse_raw_dict(payload)
    result = schema_registry_service.save_blueprint(master_schemas)
    # Reload in-memory schema registry so new types are recognized immediately
    schema_registry.load_schemas()
    return result
  except Exception as e:
    raise HTTPException(status_code=400, detail=str(e))


@router.post("/company/register-blueprint-doc")
async def register_blueprint_doc(file: UploadFile = File(...)):
  """Uploads .docx requirement file, extracts document structure, and generates schemas."""
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
          detail="Unsupported file format. Please upload a .docx, .doc, or .json file.",
      )

    result = schema_registry_service.save_blueprint(master_schemas)
    # Reload in-memory schema registry
    schema_registry.load_schemas()
    return result
  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=400, detail=str(e))


# =====================================================================
# 2. HELPER FUNCTIONS FOR CONCURRENT PROCESSING
# =====================================================================


async def _process_single_page(page_number: int, image_path: str) -> Dict:
  """Async worker: Performs quality check and classification concurrently for a single page."""
  loop = asyncio.get_running_loop()

  # Load image bytes in thread pool
  image_bytes = await loop.run_in_executor(
      None, pdf_processor.image_to_bytes, image_path
  )

  # Run quality check
  quality_result = await loop.run_in_executor(
      None, quality_checker.check, image_bytes
  )

  if quality_result.get("quality") == "BAD":
    return {
        "page_number": page_number,
        "quality": quality_result,
        "classification": {
            "document_type": "unknown",
            "confidence": 0.0,
            "reason": "Quality check failed",
        },
        "image_path": image_path,
    }

  # Run classification
  classification = await loop.run_in_executor(
      None, document_classifier.classify, image_bytes
  )

  return {
      "page_number": page_number,
      "quality": quality_result,
      "classification": classification,
      "image_path": image_path,
  }


async def _extract_and_validate_group(
    group: Dict, page_results: List[Dict]
) -> Dict:
  """Async worker: Extracts and validates a grouped multi-page document."""
  loop = asyncio.get_running_loop()
  document_type = group["document_type"]
  pages = group["pages"]

  if document_type == "unknown":
    return {
        "document_type": "unknown",
        "pages": pages,
        "status": "UNSUPPORTED_DOCUMENT",
    }

  # Dynamic schema lookup
  schema = schema_registry.get(document_type)
  if schema is None:
    return {
        "document_type": document_type,
        "pages": pages,
        "status": "SCHEMA_NOT_FOUND",
    }

  # Prepare image bytes for all pages in this group
  group_page_results = document_segmenter.get_group_pages(group, page_results)
  document_images: List[Tuple[bytes, str]] = []

  for page in group_page_results:
    image_bytes = await loop.run_in_executor(
        None, pdf_processor.image_to_bytes, page["image_path"]
    )
    document_images.append((image_bytes, "jpeg"))

  fields = [field.model_dump() for field in schema.fields]

  # Run extraction via Qwen VLM
  extracted_data = await loop.run_in_executor(
      None,
      document_extractor.extract,
      document_images,
      document_type,
      fields,
  )

  # Validate against registered schema
  validation = await loop.run_in_executor(
      None, field_validator.validate, extracted_data, fields
  )

  # Compute average classification confidence
  classification_confidences = [
      p.get("classification", {}).get("confidence", 0.0)
      for p in group_page_results
  ]
  avg_confidence = (
      sum(classification_confidences) / len(classification_confidences)
      if classification_confidences
      else 0.0
  )

  return {
      "document_type": document_type,
      "pages": pages,
      "status": "SUCCESS" if validation.get("valid") else "PARTIAL",
      "classification": {"confidence": round(avg_confidence, 4)},
      "validation": validation,
      "extracted_data": extracted_data,
  }


# =====================================================================
# 3. MAIN DOCUMENT PROCESSING ENDPOINT (CONCURRENT PIPELINE)
# =====================================================================


@router.post("/documents/process")
async def process_document(file: UploadFile = File(...)):
  """Concurrent Document Processing Pipeline: Ingestion -> Parallel Quality/Classification -> Grouping -> Parallel Extraction -> Validation."""
  request_id = f"REQ-{uuid.uuid4().hex[:12].upper()}"

  try:
    # 1. Save Document
    file_path = await save_document(file)
    extension = Path(file_path).suffix.lower()

    if extension != ".pdf":
      raise HTTPException(
          status_code=400,
          detail="For the current version, please upload a PDF document.",
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

    # 3. Parallel Page-Level Quality & Classification (asyncio.gather)
    page_tasks = [
        _process_single_page(idx, img_path)
        for idx, img_path in enumerate(page_images, start=1)
    ]
    page_results = await asyncio.gather(*page_tasks)

    # Sort results by page number
    page_results = sorted(page_results, key=lambda x: x["page_number"])

    # 4. Logical Page Grouping / Segmentation
    document_groups = document_segmenter.group_pages(page_results)

    # 5. Parallel Document Group Extraction & Dynamic Validation
    group_tasks = [
        _extract_and_validate_group(group, page_results)
        for group in document_groups
    ]
    documents = await asyncio.gather(*group_tasks)

    # 6. Final Structured Response
    return {
        "request_id": request_id,
        "status": "PROCESSED",
        "total_pages": len(page_images),
        "documents": documents,
    }

  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))