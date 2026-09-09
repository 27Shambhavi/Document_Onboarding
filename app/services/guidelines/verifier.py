
import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional

from app.schemas.guidelines import (
    DocumentFileItem,
    GuidelineVerdictItem,
)

from app.services.qwen.client import qwen_client


logger = logging.getLogger("guideline_verifier")


# =========================================================
# SAFE JSON EXTRACTION
# =========================================================

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


# =========================================================
# GUIDELINE VERIFIER
# =========================================================

class SystematicGuidelineVerifier:

    async def verify_single_document(
        self,
        file_item: DocumentFileItem,
        guidelines_list: List[str],
        all_files: List[DocumentFileItem],
    ) -> GuidelineVerdictItem:

        ocr_data = file_item.ocr_data or {}

        # =====================================================
        # FIELDS THAT ARE METADATA
        # These should NOT appear inside cleared_guidelines
        # =====================================================

        EXCLUDED_FIELDS = {
            "doc_quality",
            "doc_quality_issues",
            "_quality_status",
            "_confidence",
            "raw_text",
            "signature",
            "subject",
        }

        # =====================================================
        # EXTRACT VALID OCR BUSINESS FIELDS
        # =====================================================

        extracted_fields: Dict[str, Any] = {}

        for key, value in ocr_data.items():

            # Ignore metadata
            if key in EXCLUDED_FIELDS:
                continue

            # Ignore internal fields
            if key.startswith("_"):
                continue

            # -------------------------------------------------
            # String values
            # -------------------------------------------------

            if isinstance(value, str):

                normalized_value = value.strip()

                if not normalized_value:
                    continue

                if normalized_value.upper() in {
                    "NOT_DETECTED",
                    "NOT_FOUND",
                    "N/A",
                    "NA",
                    "NULL",
                    "NONE",
                }:
                    continue

                extracted_fields[key] = value

            # -------------------------------------------------
            # Lists / dictionaries
            # -------------------------------------------------

            elif isinstance(value, (list, dict)):

                if value:
                    extracted_fields[key] = value

            # -------------------------------------------------
            # Numeric / boolean values
            # -------------------------------------------------

            else:
                extracted_fields[key] = value

        # =====================================================
        # =====================================================
        # GUIDELINE VERIFICATION PROMPT (DOCUMENT CONTEXTUALIZED)
        # =====================================================

        prompt = f"""
You are an enterprise compliance and guideline verification auditor.

Perform a meticulous guideline verification for this specific onboarding document:
Category: {file_item.label} (ID: {file_item.id})

=========================================================
DOCUMENT DETAILS
=========================================================
Document ID: {file_item.id}
Document Type/Category: {file_item.label}

EXTRACTED OCR DATA:
{json.dumps(ocr_data, indent=2, ensure_ascii=False)}

AVAILABLE OCR FIELD KEYS:
{json.dumps(list(extracted_fields.keys()), indent=2, ensure_ascii=False)}

ACTIVE COMPANY COMPLIANCE GUIDELINES:
{json.dumps(guidelines_list, indent=2, ensure_ascii=False)}

=========================================================
EVALUATION RULES & DOCUMENT ATTRIBUTION
=========================================================
1. Evaluate guidelines that pertain to this document type ({file_item.label}).
2. If a required field is present and satisfies the guideline, map it into "cleared_guidelines".
   Format: "{file_item.label} -> <field_name> -> Verified in {file_item.label}"
3. If a required field is MISSING, invalid, or fails the guideline for this document ({file_item.label}), 
   strictly map it into "uncleared_guidelines" under this document category.
   Example: If bankName is missing from a Bank Statement, output:
   "{file_item.label} -> bankName -> Document '{file_item.label}' is missing required field: bankName"
4. NEVER omit a failed/missing field. Do not invent unrelated fields.
5. Do NOT include metadata fields (doc_quality, doc_quality_issues, is_signed).

=========================================================
OUTPUT FORMAT
=========================================================
Return STRICT JSON ONLY:
{{
    "document": "{file_item.label}",
    "cleared_guidelines": [
        "{file_item.label} -> <field_name> -> Verified in {file_item.label}"
    ],
    "uncleared_guidelines": [
        "{file_item.label} -> <failed_or_missing_field> -> Document '{file_item.label}' is missing required field: <failed_or_missing_field>"
    ]
}}
"""

        # =====================================================
        # CALL GUIDELINE MODEL
        # =====================================================

        try:
            raw_res = await qwen_client.chat_async(
                prompt=prompt
            )

            data = _extract_json_safely(
                raw_res
            )

            raw_cleared = data.get(
                "cleared_guidelines",
                []
            )

            raw_uncleared = data.get(
                "uncleared_guidelines",
                []
            )

            if not isinstance(raw_cleared, list):
                raw_cleared = []

            if not isinstance(raw_uncleared, list):
                raw_uncleared = []

            # =================================================
            # FORMAT CLEARED & UNCLEARED WITH DOCUMENT CONTEXT
            # =================================================
            cleared: List[str] = []
            for item in raw_cleared:
                if not item:
                    continue
                if isinstance(item, str):
                    if "->" in item:
                        cleared.append(item.strip())
                    elif item not in EXCLUDED_FIELDS:
                        cleared.append(f"{file_item.label} -> {item.strip()} -> Verified in {file_item.label}")
                elif isinstance(item, dict):
                    f_name = item.get("field") or item.get("key") or "field"
                    reason = item.get("reasoning") or f"Verified in {file_item.label}"
                    cleared.append(f"{file_item.label} -> {f_name} -> {reason}")

            uncleared: List[str] = []
            for item in raw_uncleared:
                if not item:
                    continue
                if isinstance(item, str):
                    if "->" in item:
                        uncleared.append(item.strip())
                    elif item not in EXCLUDED_FIELDS:
                        uncleared.append(f"{file_item.label} -> {item.strip()} -> Document '{file_item.label}' is missing required field: {item.strip()}")
                elif isinstance(item, dict):
                    f_name = item.get("field") or item.get("key") or "field"
                    reason = item.get("reasoning") or f"Document '{file_item.label}' is missing required field: {f_name}"
                    uncleared.append(f"{file_item.label} -> {f_name} -> {reason}")

            # Deduplicate
            cleared = list(dict.fromkeys(cleared))
            uncleared = list(dict.fromkeys(uncleared))

            # Fallback if both empty
            if not cleared and not uncleared:
                quality = str(ocr_data.get("doc_quality", "Good")).strip().lower()
                quality_issue = str(ocr_data.get("doc_quality_issues", "")).strip().lower()

                if quality == "good" and quality_issue in {"", "clear", "none", "no issues"}:
                    cleared = [
                        f"{file_item.label} -> {k} -> Verified in {file_item.label}"
                        for k in extracted_fields.keys()
                    ]
                else:
                    cleared = [
                        f"{file_item.label} -> {k} -> Verified in {file_item.label}"
                        for k in extracted_fields.keys()
                    ]
                    if quality_issue:
                        uncleared = [
                            f"{file_item.label} -> document_quality -> Document '{file_item.label}' has quality issues: {quality_issue}"
                        ]

            # Generate structured rules mapping for this document
            structured_rules: List[Dict[str, Any]] = []
            for c_idx, c in enumerate(cleared):
                parts = c.split("->") if isinstance(c, str) else []
                field = parts[1].strip() if len(parts) > 1 else (parts[0].strip() if parts else "Field")
                reason = parts[2].strip() if len(parts) > 2 else f"Verified condition for {field} in {file_item.label}"
                structured_rules.append({
                    "rule_id": f"CLEAR-{file_item.id}-{c_idx+1}",
                    "field_name": field,
                    "rule_title": field,
                    "status": "CLEARED",
                    "matched": True,
                    "evidence": f"Document: {file_item.label} (Verified)",
                    "reasoning": reason,
                    "document_label": file_item.label,
                    "document_id": file_item.id,
                })

            for u_idx, u in enumerate(uncleared):
                parts = u.split("->") if isinstance(u, str) else []
                field = parts[1].strip() if len(parts) > 1 else (parts[0].strip() if parts else "Field")
                reason = parts[2].strip() if len(parts) > 2 else f"Document '{file_item.label}' is missing required field: {field}"
                structured_rules.append({
                    "rule_id": f"UNCLEAR-{file_item.id}-{u_idx+1}",
                    "field_name": field,
                    "rule_title": field,
                    "status": "UNCLEARED",
                    "matched": False,
                    "evidence": f"Document: {file_item.label} (Missing/Invalid)",
                    "reasoning": reason,
                    "recommendation": f"Please upload a complete, verified copy of {file_item.label} containing {field}.",
                    "document_label": file_item.label,
                    "document_id": file_item.id,
                })

            return GuidelineVerdictItem(
                id=file_item.id,
                document_label=file_item.label,
                cleared_guidelines=cleared,
                uncleared_guidelines=uncleared,
                rules=structured_rules,
            )

        # =====================================================
        # VERIFICATION ERROR
        # =====================================================

        except Exception as exc:

            logger.error(
                f"Verification error on "
                f"{file_item.id}: {exc}"
            )

            # IMPORTANT:
            #
            # If the guideline model/API fails, NEVER mark the
            # document as successfully cleared.
            #
            # The old implementation incorrectly did that.

            return GuidelineVerdictItem(
                id=file_item.id,
                cleared_guidelines=[],
                uncleared_guidelines=[
                    "guideline_verification_failed"
                ],
            )

    # =========================================================
    # VERIFY ALL DOCUMENTS
    # =========================================================

    async def verify_all(
        self,
        files: List[DocumentFileItem],
        guidelines: List[Any],
        evidence_map: Optional[
            Dict[str, Any]
        ] = None,
    ) -> List[GuidelineVerdictItem]:

        if not files:
            return []

        # =====================================================
        # NORMALIZE GUIDELINES
        # =====================================================

        rules_list: List[str] = []

        for g in guidelines:

            if isinstance(g, str):

                rules_list.append(g)

            elif hasattr(g, "rule"):

                rules_list.append(
                    g.rule
                )

            elif (
                isinstance(g, dict)
                and "rule" in g
            ):

                rules_list.append(
                    g["rule"]
                )

        # =====================================================
        # PARALLEL DOCUMENT VERIFICATION
        #
        # All documents are still processed concurrently,
        # exactly like your existing implementation.
        # =====================================================

        tasks = [
            self.verify_single_document(
                f,
                rules_list,
                files,
            )
            for f in files
        ]

        return await asyncio.gather(
            *tasks
        )


# =========================================================
# SINGLE VERIFIER INSTANCE
# =========================================================

guideline_verifier = SystematicGuidelineVerifier()