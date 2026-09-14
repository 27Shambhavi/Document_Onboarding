import asyncio
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid
from sqlalchemy.orm import Session
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
)

from app.core.auth import authenticate_client
from app.db.database import get_db
from app.db.models import Company
from app.models.billing import storage_manager
from app.schemas.registry import schema_registry
from app.services.analytics.usage_service import usage_service
from app.services.ingestion.blueprint_parser import blueprint_parser
from app.services.ingestion.document_loader import save_document
from app.services.ingestion.pdf_processor import pdf_processor
from app.services.qwen.client import qwen_client
from app.services.resilience.rate_limiter import rate_limiter
from app.services.schema_registry import schema_registry_service

router = APIRouter(tags=["Document Onboarding & Intelligence"])


# ================================================================
# 1. REGISTER COMPANY BLUEPRINTS
# ================================================================


@router.post("/company/register-blueprint-json")
async def register_blueprint_json(
    payload: dict,
    client: dict = Depends(authenticate_client),
):
  company_id = client.get("company_id")
  if not company_id:
    raise HTTPException(
        status_code=401, detail="Authenticated client has no company_id"
    )

  try:
    master_schemas = blueprint_parser.parse_raw_dict(payload)
    result = schema_registry_service.save_blueprint(
        master_schemas=master_schemas, company_id=company_id
    )
    schema_registry.reload_company(company_id)
    return {**result, "company_id": company_id}
  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=400, detail=str(e))


@router.post("/company/register-blueprint-doc")
async def register_blueprint_doc(
    file: UploadFile = File(...),
    client: dict = Depends(authenticate_client),
):
  company_id = client.get("company_id")
  if not company_id:
    raise HTTPException(
        status_code=401, detail="Authenticated client has no company_id"
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
        raise HTTPException(status_code=400, detail="Invalid JSON blueprint.")
      master_schemas = blueprint_parser.parse_raw_dict(raw_data)
    else:
      raise HTTPException(
          status_code=400,
          detail="Unsupported format. Please upload .docx, .doc, or .json.",
      )

    result = schema_registry_service.save_blueprint(
        master_schemas=master_schemas, company_id=company_id
    )
    schema_registry.reload_company(company_id)
    return {**result, "company_id": company_id}
  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=400, detail=str(e))


# ================================================================
# 2. ROBUST SINGLE-PASS INFERENCE (WITH SIGNATURE DETECTION)
# ================================================================


def _execute_page_inference(
    image_bytes: bytes,
    company_schemas: Dict[str, Any],
    enable_signature_detection: bool = False,
) -> Dict[str, Any]:
  signature_instructions = ""
  signature_json_schema = ""

  if enable_signature_detection:
    signature_instructions = """
4. SIGNATURE AND STAMP DETECTION:
   - Check if this page contains genuine physical ink signatures, cursive pen handwriting in applicant/authority signature lines, or official circular/rubber office ink stamps.
   - STRICT EXCLUSIONS:
     * Standalone portrait photos of people are NEVER signatures (is_signed: false).
     * QR codes, barcodes, and decorative lines are NEVER signatures (is_signed: false).
     * Machine-printed text (e.g. "(Ankita Kumari)", "Manager HR") is NOT a signature unless physical pen strokes or an ink stamp are present.
   - If genuine manual ink or an official stamp is present:
     * Set "is_signed": true
     * Set "signatory_type": "APPLICANT" (if candidate/member signature), "AUTHORITY" (if Secretary, Controller, Principal, HR Manager), or "BOTH"
     * Set "signer_name": extracted name (e.g., "SAMAD", "Smt. Shail Yadav", "Naseem Khan", "Rajeev Sharma") or null
     * Set "signature_location": e.g. "bottom-right", "bottom-center", "below-photo"
     * Set "signature_confidence": float between 0.80 and 1.0
   - If NO signature or stamp is present:
     * Set "is_signed": false, "signatory_type": "NONE", "signer_name": null, "signature_location": "none", "signature_confidence": 0.0
"""
    signature_json_schema = """
  "signature_verification": {
    "is_signed": false,
    "signatory_type": "NONE",
    "signer_name": null,
    "signature_location": "none",
    "signature_confidence": 0.0
  },"""
  else:
    signature_instructions = """
4. SIGNATURE AND STAMP GATEKEEPING (STRICTLY LOCKED):
   - SIGNATURE AND STAMP DETECTION IS STRICTLY DISABLED: Do NOT inspect, detect, extract, or verify physical ink signatures, handwriting, or official office stamps.
   - Always return:
     "is_signed": false, "signatory_type": "NONE", "signer_name": null, "signature_location": "none", "signature_confidence": 0.0
"""
    signature_json_schema = """
  "signature_verification": {
    "is_signed": false,
    "signatory_type": "NONE",
    "signer_name": null,
    "signature_location": "none",
    "signature_confidence": 0.0
  },"""

  prompt = f"""
You are an enterprise document intelligence and verification engine.
Inspect the attached document page image carefully and evaluate it against the Company Schemas.

COMPANY SCHEMAS:
{json.dumps(company_schemas, indent=2)}

INSTRUCTIONS:
1. QUALITY CHECK:
   - Check if this page is clear and legible.
   - If severely blurred, cutoff, or corrupt, set "quality": "BAD" and provide "quality_reason".
   - If legible, set "quality": "GOOD".

2. DYNAMIC CATEGORY MATCH:
   - Match this document against the keys in COMPANY SCHEMAS based on layout, text, and visual markers.
   - If it matches a defined schema, set "document_type" to the exact schema key name.
   - If it does not match any company schema, set "document_type": "unknown".

3. FIELD EXTRACTION (NESTED BY DOCUMENT TYPE):
   - If matched, extract all requested fields grouped strictly in a nested JSON structure under the Document Type.
     Example required format: {{"Aadhaar Card": {{"Full Name": "...", "DOB": "..."}}}} or {{"PAN Card": {{"PAN Number": "..."}}}}
   - If a field is not present on the document, return null. Do not hallucinate values.
   - If document_type is "unknown", return "extracted_data": {{}}.
{signature_instructions}

Respond ONLY with valid JSON in this exact nested structure:
{{
  "quality": "GOOD",
  "quality_reason": null,
  "document_type": "<matched_schema_key_or_unknown>",
  "confidence": 0.95,{signature_json_schema}
  "extracted_data": {{
    "<matched_schema_key>": {{
      "<field_name>": "<extracted_value_or_null>"
    }}
  }}
}}
"""
  try:
    raw_output = qwen_client.vision(
        image_bytes=image_bytes,
        prompt=prompt,
        system_prompt=(
            "You are a strict enterprise document intelligence engine. Return"
            " valid JSON only."
        ),
    )
    clean_text = (
        raw_output.replace("```json", "")
        .replace("```", "")
        .replace("```", "")
        .strip()
    )
    parsed = json.loads(clean_text)

    # Normalize signature result structure
    if enable_signature_detection:
      sig = parsed.get("signature_verification", {})
      if not isinstance(sig, dict):
        parsed["signature_verification"] = {
            "is_signed": False,
            "signatory_type": "NONE",
            "signer_name": None,
            "signature_location": "none",
            "signature_confidence": 0.0,
        }
      else:
        is_sig_val = sig.get("is_signed", False)
        if isinstance(is_sig_val, str):
          sig["is_signed"] = is_sig_val.strip().lower() in [
              "true",
              "yes",
              "1",
          ]
        parsed["signature_verification"] = sig

    return parsed
  except Exception as e:
    err_dict = {
        "quality": "BAD",
        "quality_reason": f"Inference error: {str(e)}",
        "document_type": "unknown",
        "confidence": 0.0,
        "extracted_data": {},
    }
    if enable_signature_detection:
      err_dict["signature_verification"] = {
          "is_signed": False,
          "signatory_type": "NONE",
          "signer_name": None,
          "signature_location": "none",
          "signature_confidence": 0.0,
      }
    return err_dict


async def _process_single_page(
    page_number: int,
    image_path: str,
    company_schemas: Dict[str, Any],
    enable_signature_detection: bool = False,
) -> Dict[str, Any]:
  loop = asyncio.get_running_loop()
  image_bytes = await loop.run_in_executor(
      None, pdf_processor.image_to_bytes, image_path
  )

  result = await rate_limiter.execute_with_resilience(
      _execute_page_inference,
      image_bytes,
      company_schemas,
      enable_signature_detection,
  )
  result["page_number"] = page_number
  return result


def _stitch_contiguous_pages(
    page_results: List[Dict[str, Any]],
    enable_signature_detection: bool = False,
) -> List[Dict[str, Any]]:
  merged_documents = []
  current_doc = None

  for page in page_results:
    doc_type = page.get("document_type", "unknown")
    quality = page.get("quality", "GOOD")
    sig_info = page.get("signature_verification", None)

    if quality == "BAD":
      doc_entry = {
          "document_type": doc_type,
          "pages": [page["page_number"]],
          "status": "QUALITY_FAILED",
          "quality_reason": page.get(
              "quality_reason", "Low document legibility"
          ),
          "extracted_data": {},
      }
      if enable_signature_detection:
        doc_entry["signature_verification"] = sig_info
      merged_documents.append(doc_entry)
      continue

    if (
        current_doc
        and current_doc["document_type"] == doc_type
        and doc_type != "unknown"
    ):
      current_doc["pages"].append(page["page_number"])
      for k, v in page.get("extracted_data", {}).items():
        if v is not None:
          if isinstance(v, dict) and isinstance(current_doc["extracted_data"].get(k), dict):
            current_doc["extracted_data"][k].update(v)
          else:
            current_doc["extracted_data"][k] = v

      if (
          enable_signature_detection
          and sig_info
          and sig_info.get("is_signed", False)
      ):
        current_doc["signature_verification"] = sig_info
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
      if enable_signature_detection:
        current_doc["signature_verification"] = sig_info

  if current_doc:
    merged_documents.append(current_doc)

  return merged_documents


# ================================================================
# 3. PROCESS CANDIDATE PDF ENDPOINT
# ================================================================


@router.post("/documents/process")
async def process_document(
    file: UploadFile = File(...),
    enable_signature_detection: bool = Query(
        False,
        description=(
            "Premium Feature: Set to true to inspect documents for signatures."
        ),
    ),
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
):
  request_id = f"REQ-{uuid.uuid4().hex[:12].upper()}"
  company_id = client.get("company_id")

  if not company_id:
    raise HTTPException(
        status_code=401, detail="Authenticated client does not have company_id"
    )

  # 1. Check Feature Entitlement (DB-backed Company record)
  company_rec = db.query(Company).filter(Company.company_id == company_id).first()
  is_unlocked = bool(company_rec.signature_unlocked) if company_rec else False
  if enable_signature_detection and not is_unlocked:
    raise HTTPException(
        status_code=403,
        detail=(
            "Signature & Stamp Verification is a locked premium feature. Please"
            " unlock it via your Billing settings with a single-use token."
        ),
    )

  # 2. Load schemas
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
    schema = schema_registry.get(document_type=doc_type, company_id=company_id)
    if schema:
      company_schemas[doc_type] = [
          field.model_dump() for field in schema.fields
      ]

  try:
    filename = file.filename.lower() if file.filename else ""
    if not filename.endswith(".pdf"):
      raise HTTPException(
          status_code=400, detail="Only PDF candidate documents are supported."
      )

    file_path = await save_document(file)
    loop = asyncio.get_running_loop()
    page_images = await loop.run_in_executor(
        None, pdf_processor.pdf_to_images, file_path
    )

    if not page_images:
      raise HTTPException(
          status_code=400, detail="The uploaded PDF contains no readable pages."
      )

    # 3. Concurrent Single-Pass Worker Tasks
    tasks = [
        _process_single_page(
            idx, img_path, company_schemas, enable_signature_detection
        )
        for idx, img_path in enumerate(page_images, start=1)
    ]
    raw_results = await asyncio.gather(*tasks)
    raw_results = sorted(raw_results, key=lambda x: x["page_number"])

    # 4. Filter verified signatures and log detection in console
    detected_signature_pages = []
    if enable_signature_detection:
      for r in raw_results:
        sig = r.get("signature_verification", {})
        if sig and sig.get("is_signed") is True:
          detected_signature_pages.append({
              "page_number": r["page_number"],
              "signatory": sig.get("signer_name"),
              "type": sig.get("signatory_type"),
          })

    actual_signatures_count = len(detected_signature_pages)
    print(
        f"[INFO] Processed {len(page_images)} pages for company {company_id}."
        f" Signatures detected: {actual_signatures_count}"
    )

    # 5. Stitch contiguous pages
    documents = _stitch_contiguous_pages(
        raw_results, enable_signature_detection
    )

    # 6. Usage Metering
    total_pages = len(page_images)
    usage_service.log_transaction(
        company_id=company_id,
        request_id=request_id,
        total_pages=total_pages,
        signatures_scanned=actual_signatures_count,
    )

    return {
        "request_id": request_id,
        "company_id": company_id,
        "status": "PROCESSED",
        "total_pages": total_pages,
        "signature_detection_applied": enable_signature_detection,
        "total_signatures_detected": actual_signatures_count,
        "detected_signature_details": (
            detected_signature_pages if enable_signature_detection else []
        ),
        "configured_document_types": company_document_types,
        "documents": documents,
    }

  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))
