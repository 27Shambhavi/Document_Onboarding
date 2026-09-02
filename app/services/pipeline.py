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
) -> Dict[str, Any]:

    blueprint_str = (
        json.dumps(blueprint, indent=2)
        if blueprint
        else "{}"
    )

    prompt = f"""
    Analyze this candidate document page meticulously.

    COMPANY BLUEPRINT:
    {blueprint_str}

    TASK:
    1. Identify Document Type (e.g., Resume, Aadhar, Pan, 10th Mark sheet, 12th Mark sheet, Experience Letter, Employee Photo, Cibil Form, Application Form).
    2. Extract all requested fields in the blueprint for that category.
    3. Evaluate document quality.

    Return STRICT JSON ONLY:
    {{
      "label": "<Matched Category Name>",
      "ocr_data": {{
        "<field_key>": "<extracted_value>",
        "doc_quality": "Good | Bad",
        "doc_quality_issues": "clear | blur | missing_stamp | perfect"
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

            clean_id = _generate_contract_id(
                label,
                page_num,
            )

            return {
                "id": clean_id,
                "url": source_url,
                "label": label,
                "ocr_data": parsed.get(
                    "ocr_data",
                    {},
                ),
            }

    except Exception as exc:
        logger.error(
            f"Error on Page {page_num}: {exc}"
        )

    label = f"Document_Page_{page_num}"

    return {
        "id": _generate_contract_id(
            label,
            page_num,
        ),
        "url": source_url,
        "label": label,
        "ocr_data": {
            "doc_quality": "Good",
            "doc_quality_issues": "document seems fine",
        },
    }


async def run_pipeline(
    file_bytes: bytes,
    filename: str,
    blueprint: Dict[str, Any] = None,
    source_url: Optional[str] = None,
) -> Dict[str, Any]:

    doc = pymupdf.open(
        stream=file_bytes,
        filetype="pdf",
    )

    total_pages = len(doc)

    print(
        f"\n[PIPELINE] Ingesting {filename} "
        f"({total_pages} pages) in full parallel stream...",
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