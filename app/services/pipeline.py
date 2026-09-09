import asyncio
import json
import logging
import re
from typing import Any, Dict, Optional

import pymupdf

from app.services.qwen.client import qwen_client


logger = logging.getLogger("pipeline")


def _assess_quality_fallback(page: pymupdf.Page, text: str) -> Dict[str, str]:
    is_readable = len(text.strip()) > 20
    doc_quality = "Good" if (is_readable and page.rect.width >= 400) else "Bad"

    return {
        "doc_quality": "Good" if is_readable else "Bad",
        "doc_quality_issues": (
            "document seems fine"
            if doc_quality == "Good"
            else "blur or low resolution"
        ),
    }


def _extract_json_safely(raw_text: str) -> Dict[str, Any]:
    if not raw_text or not raw_text.strip():
        return {}

    cleaned = re.sub(
        r"^```(?:json)?",
        "",
        raw_text.strip(),
        flags=re.IGNORECASE,
    )

    cleaned = re.sub(
        r"```$",
        "",
        cleaned.strip(),
    ).strip()

    try:
        return json.loads(cleaned)
    except Exception:
        pass

    match = re.search(
        r"\{[\s\S]*\}",
        raw_text,
    )

    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            pass

    return {}


def _generate_contract_id(label: str, page_num: int) -> str:
    lbl = (label or "").lower()

    if "resume" in lbl or "cv" in lbl:
        prefix = "RES"
    elif "aadhaar" in lbl or "aadhar" in lbl or "uidai" in lbl:
        prefix = "ADH"
    elif "pan" in lbl or "permanent account" in lbl:
        prefix = "PAN"
    elif (
        "mark" in lbl
        or "10th" in lbl
        or "12th" in lbl
        or "degree" in lbl
    ):
        prefix = "MKS"
    elif (
        "experience" in lbl
        or "internship" in lbl
        or "relieving" in lbl
    ):
        prefix = "EXP"
    elif "photo" in lbl or "photograph" in lbl:
        prefix = "PHT"
    elif "payslip" in lbl or "salary" in lbl:
        prefix = "PAY"
    elif "cibil" in lbl or "consent" in lbl:
        prefix = "CBL"
    elif "form" in lbl or "declaration" in lbl:
        prefix = "FRM"
    else:
        prefix = "DOC"

    return f"DOC-{prefix}-{page_num:02d}"


async def _process_single_page(
    page_num: int,
    page_pixmap_bytes: bytes,
    blueprint: Dict[str, Any],
    source_url: Optional[str] = None,
    signature_unlocked: bool = False,
) -> Dict[str, Any]:

    blueprint_str = (
        json.dumps(blueprint, indent=2, ensure_ascii=False)
        if blueprint
        else "{}"
    )

    if signature_unlocked:
        signature_task_instruction = """4. SIGNATURE AND STAMP DETECTION (PREMIUM UNLOCKED):
    - Inspect if this document page contains genuine physical ink signatures, cursive pen handwriting in applicant/authority signature lines, or official circular/rubber office ink stamps.
    - If genuine manual ink or an official stamp is present, extract "is_signed": true, "signatory_type": "APPLICANT" | "AUTHORITY" | "BOTH", and "signer_name".
    - If no signature or stamp is present, set "is_signed": false, "signatory_type": "NONE", "signer_name": null."""
        signature_fields_schema = """
        "is_signed": true,
        "signatory_type": "APPLICANT | AUTHORITY | BOTH",
        "signer_name": "<name_or_null>","""
    else:
        signature_task_instruction = """4. SIGNATURE AND STAMP GATEKEEPING (STRICTLY LOCKED):
    - SIGNATURE AND STAMP DETECTION IS STRICTLY DISABLED: Do NOT inspect, detect, extract, or verify physical ink signatures, handwriting, or official office stamps.
    - Do NOT flag missing signatures or missing stamps as quality defects (doc_quality_issues must NOT be "missing_stamp").
    - Always output "is_signed": false, "signatory_type": "NONE", "signer_name": null."""
        signature_fields_schema = """
        "is_signed": false,
        "signatory_type": "NONE",
        "signer_name": null,"""

    prompt = f"""
    Analyze this candidate document page meticulously.

    COMPANY BLUEPRINT:
    {blueprint_str}

    TASK:
    1. Identify Document Type (e.g., Aadhaar Card, PAN Card, Resume, 10th Mark sheet, 12th Mark sheet, Bank Statement, Experience Letter, Employee Photo, Cibil Form, Application Form).
    2. Extract all requested fields in the blueprint grouped strictly into a nested JSON structure under the identified Document Type.
       Example required format: {{"Aadhaar Card": {{"Full Name": "...", "DOB": "..."}}}} or {{"PAN Card": {{"PAN Number": "..."}}}}
    3. Evaluate document quality.
    {signature_task_instruction}

    Return STRICT JSON ONLY in this exact structure:
    {{
      "label": "<Exact Document Type Name, e.g. Aadhaar Card, PAN Card, Bank Statement>",
      "ocr_data": {{{signature_fields_schema}
        "<field_key>": "<extracted_value>",
        "doc_quality": "Good | Bad",
        "doc_quality_issues": "clear | blur | perfect"
      }},
      "nested_data": {{
        "<Exact Document Type Name>": {{
          "<field_key>": "<extracted_value>"
        }}
      }}
    }}
    """

    try:
        raw_output = await qwen_client.vision_async(
            image_bytes=page_pixmap_bytes,
            prompt=prompt,
        )

        parsed = _extract_json_safely(raw_output)

        if parsed and isinstance(parsed, dict):
            label = parsed.get(
                "label",
                f"Document_Page_{page_num}",
            )

            # Check if nested_data provides primary document name
            nested_dict = parsed.get("nested_data", {})
            if isinstance(nested_dict, dict) and len(nested_dict) > 0 and label.startswith("Document_Page_"):
                label = list(nested_dict.keys())[0]

            clean_id = _generate_contract_id(
                label,
                page_num,
            )

            ocr_data = parsed.get("ocr_data", {})
            if not isinstance(ocr_data, dict):
                ocr_data = {}

            if not signature_unlocked:
                # Strictly enforce lock at extraction data level
                ocr_data["is_signed"] = False
                ocr_data["signatory_type"] = "NONE"
                ocr_data["signer_name"] = None
                if ocr_data.get("doc_quality_issues") == "missing_stamp":
                    ocr_data["doc_quality_issues"] = "clear"

            # Clean business fields for nested document map
            clean_business_fields = {
                k: v for k, v in ocr_data.items()
                if not k.startswith("_") and k not in {
                    "doc_quality", "doc_quality_issues", "is_signed", "signatory_type", "signer_name"
                }
            }

            clean_nested_data = nested_dict if (isinstance(nested_dict, dict) and len(nested_dict) > 0) else {label: clean_business_fields}

            return {
                "id": clean_id,
                "url": source_url,
                "label": label,
                "ocr_data": ocr_data,
                "nested_data": clean_nested_data,
            }

    except Exception as exc:
        logger.error(
            f"Error on Page {page_num}: {exc}"
        )

    label = f"Document_Page_{page_num}"

    fallback_ocr = {
        "doc_quality": "Good",
        "doc_quality_issues": "document seems fine",
    }
    if not signature_unlocked:
        fallback_ocr["is_signed"] = False
        fallback_ocr["signatory_type"] = "NONE"
        fallback_ocr["signer_name"] = None

    return {
        "id": _generate_contract_id(
            label,
            page_num,
        ),
        "url": source_url,
        "label": label,
        "ocr_data": fallback_ocr,
        "nested_data": {label: fallback_ocr},
    }


async def run_pipeline(
    file_bytes: bytes,
    filename: str,
    blueprint: Dict[str, Any] = None,
    source_url: Optional[str] = None,
    signature_unlocked: bool = False,
) -> Dict[str, Any]:

    doc = pymupdf.open(
        stream=file_bytes,
        filetype="pdf",
    )

    total_pages = len(doc)

    print(
        f"\n[PIPELINE] Ingesting {filename} "
        f"({total_pages} pages, signature_unlocked={signature_unlocked}) in full parallel stream...",
        flush=True,
    )

    # Pre-render pages to release PDF lock
    page_render_tasks = []

    for idx in range(total_pages):
        pix = doc[idx].get_pixmap(
            dpi=110,
        )

        page_render_tasks.append(
            (
                idx + 1,
                pix.tobytes("jpeg"),
            )
        )

    doc.close()

    # Parallel asynchronous dispatch
    tasks = [
        _process_single_page(
            p_num,
            img_bytes,
            blueprint,
            source_url,
            signature_unlocked=signature_unlocked,
        )
        for p_num, img_bytes in page_render_tasks
    ]

    extracted_docs = await asyncio.gather(
        *tasks
    )

    return {
        "status": "SUCCESS",
        "filename": filename,
        "total_pages": total_pages,
        "documents": extracted_docs,
    }