
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
        # GUIDELINE VERIFICATION PROMPT
        # =====================================================

        prompt = f"""
You are an enterprise compliance auditor.

Perform a guideline verification for ONE specific onboarding
document.

=========================================================
DOCUMENT
=========================================================

Document ID:
{file_item.id}

Document Label:
{file_item.label}

OCR DATA:
{json.dumps(ocr_data, indent=2, ensure_ascii=False)}

=========================================================
AVAILABLE OCR FIELD KEYS
=========================================================

{json.dumps(list(extracted_fields.keys()), indent=2, ensure_ascii=False)}

=========================================================
ACTIVE COMPANY GUIDELINES
=========================================================

{json.dumps(guidelines_list, indent=2, ensure_ascii=False)}

=========================================================
EVALUATION RULES
=========================================================

1. Evaluate ONLY the guidelines that are applicable to this
   document.

2. If an OCR field/entity satisfies the applicable guideline,
   put its EXACT FIELD KEY inside "cleared_guidelines".

3. "cleared_guidelines" must contain FIELD KEYS ONLY.

4. Do NOT put explanations, sentences, descriptions or values
   inside "cleared_guidelines".

5. Do NOT invent field names.

6. Only use field names that actually exist in the OCR DATA.

7. Example:

OCR DATA:

{{
    "pan_name": "SAMAD",
    "pan_dob": "03/02/2004",
    "pan_number": "QFVPS0764H",
    "pan_father_name": "MOHD SAJID"
}}

Then the output should be:

{{
    "cleared_guidelines": [
        "pan_name",
        "pan_dob",
        "pan_number",
        "pan_father_name"
    ],
    "uncleared_guidelines": []
}}

8. If a required field is missing, invalid, or fails an
   applicable guideline, put the EXACT FIELD KEY inside
   "uncleared_guidelines".

9. Do NOT include metadata fields such as:

   - doc_quality
   - doc_quality_issues
   - _quality_status
   - _confidence

   in either list.

10. Do NOT return:

"All required document & onboarding guidelines successfully cleared."

11. If a document has no applicable guideline fields, return
    empty arrays.

12. Do not mark a field as cleared merely because a value exists.
    It must satisfy the applicable company guideline.

=========================================================
OUTPUT FORMAT
=========================================================

Return STRICT JSON ONLY.

{{
    "cleared_guidelines": [
        "field_key"
    ],
    "uncleared_guidelines": [
        "field_key"
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

            cleared = data.get(
                "cleared_guidelines",
                []
            )

            uncleared = data.get(
                "uncleared_guidelines",
                []
            )

            # =================================================
            # ENSURE LIST FORMAT
            # =================================================

            if not isinstance(cleared, list):
                cleared = []

            if not isinstance(uncleared, list):
                uncleared = []

            # =================================================
            # VALID OCR KEYS
            # =================================================

            valid_keys = set(
                extracted_fields.keys()
            )

            # =================================================
            # FILTER MODEL OUTPUT
            #
            # This prevents Qwen from inventing fields.
            # =================================================

            cleared = [
                key
                for key in cleared
                if isinstance(key, str)
                and key in valid_keys
                and key not in EXCLUDED_FIELDS
            ]

            uncleared = [
                key
                for key in uncleared
                if isinstance(key, str)
                and key in ocr_data
                and key not in EXCLUDED_FIELDS
            ]

            # =================================================
            # REMOVE DUPLICATES
            # =================================================

            cleared = list(
                dict.fromkeys(cleared)
            )

            uncleared = list(
                dict.fromkeys(uncleared)
            )

            # =================================================
            # FALLBACK
            #
            # If model returns nothing, do NOT generate the old
            # generic "All required..." message.
            # =================================================

            if not cleared and not uncleared:

                quality = str(
                    ocr_data.get(
                        "doc_quality",
                        "Good",
                    )
                ).strip().lower()

                quality_issue = str(
                    ocr_data.get(
                        "doc_quality_issues",
                        "",
                    )
                ).strip().lower()

                # ---------------------------------------------
                # Good document
                # ---------------------------------------------

                if (
                    quality == "good"
                    and quality_issue in {
                        "",
                        "clear",
                        "none",
                        "no issues",
                    }
                ):

                    cleared = list(
                        extracted_fields.keys()
                    )

                # ---------------------------------------------
                # Quality problem
                # ---------------------------------------------

                else:

                    cleared = list(
                        extracted_fields.keys()
                    )

                    if quality_issue:

                        # We intentionally do NOT put
                        # doc_quality_issues here because it is
                        # metadata rather than an OCR entity.
                        uncleared = [
                            "document_quality"
                        ]

            # =================================================
            # RETURN VERDICT
            # =================================================

            return GuidelineVerdictItem(
                id=file_item.id,
                cleared_guidelines=cleared,
                uncleared_guidelines=uncleared,
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