import json
from typing import Any

from app.services.qwen.client import qwen_client
from app.schemas.registry import schema_registry


class DocumentClassifier:
    """
    Company-aware document classifier.

    IMPORTANT:

    The classifier NEVER uses global schemas when a company_id
    is provided.

    Example:

        ABC blueprint:
            pan
            aadhaar
            resume

        Candidate uploads:
            PAN              -> pan
            Aadhaar          -> aadhaar
            Resume           -> resume
            Bank Statement   -> unknown
            Marksheet        -> unknown

    This ensures that unsupported documents are NOT forced
    into the nearest supported document type.
    """

    # =========================================================
    # INITIALIZATION
    # =========================================================

    def __init__(self):

        self.document_types: list[str] = []

        self.document_parameters: dict[
            str,
            list[str]
        ] = {}

        self._lookup: dict[
            str,
            str
        ] = {}

    # =========================================================
    # REFRESH COMPANY SCHEMA
    # =========================================================

    def refresh(
        self,
        company_id: str,
    ) -> None:
        """
        Load ONLY the schemas configured for the company.

        No global fallback.
        """

        self.document_types = []
        self.document_parameters = {}
        self._lookup = {}

        if not company_id:
            return

        # -----------------------------------------------------
        # Get company schemas
        # -----------------------------------------------------

        schemas = (
            schema_registry.company_schemas.get(
                company_id
            )
        )

        # -----------------------------------------------------
        # Load from disk if not already cached
        # -----------------------------------------------------

        if schemas is None:

            schemas = (
                schema_registry.load_company_schemas(
                    company_id
                )
            )

        # -----------------------------------------------------
        # Build supported document list
        # -----------------------------------------------------

        for schema in schemas.values():

            document_type = (
                schema.document_type
            )

            if not document_type:
                continue

            self.document_types.append(
                document_type
            )

            self.document_parameters[
                document_type
            ] = [
                field.name
                for field in schema.fields
            ]

        # -----------------------------------------------------
        # Remove duplicates
        # -----------------------------------------------------

        self.document_types = list(
            dict.fromkeys(
                self.document_types
            )
        )

        # -----------------------------------------------------
        # Build normalized lookup
        # -----------------------------------------------------

        for document_type in (
            self.document_types
        ):

            normalized = (
                self._normalize(
                    document_type
                )
            )

            self._lookup[
                normalized
            ] = document_type

    # =========================================================
    # NORMALIZE DOCUMENT TYPE
    # =========================================================

    @staticmethod
    def _normalize(
        value: str,
    ) -> str:
        """
        Normalize document type names for comparison.

        Examples:

            Aadhaar
            Aadhar
            aadhaar
            aadhar

        all resolve to:

            aadhaar
        """

        if not value:
            return ""

        value = (
            str(value)
            .strip()
            .lower()
        )

        # -----------------------------------------------------
        # Aadhaar / Aadhar
        # -----------------------------------------------------

        if value in {
            "aadhaar",
            "aadhar",
        }:
            return "aadhaar"

        # -----------------------------------------------------
        # General normalization
        # -----------------------------------------------------

        return (
            value
            .replace("_", "")
            .replace("-", "")
            .replace(" ", "")
            .replace("/", "")
        )

    # =========================================================
    # BUILD SYSTEM PROMPT
    # =========================================================

    def _build_system_prompt(
        self,
        company_id: str,
    ) -> str:
        """
        Build a strict company-specific classification prompt.
        """

        supported_types = []

        for document_type in (
            self.document_types
        ):

            parameters = (
                self.document_parameters.get(
                    document_type,
                    [],
                )
            )

            supported_types.append(
                {
                    "document_type": document_type,
                    "parameters": parameters,
                }
            )

        supported_json = json.dumps(
            supported_types,
            indent=2,
            ensure_ascii=False,
        )

        return f"""
You are a STRICT enterprise document classification system.

Authenticated company:
{company_id}

Your task is to classify ONE document page.

You may ONLY return a document type that is explicitly
configured for this company.

============================================================
COMPANY CONFIGURED DOCUMENT TYPES
============================================================

{supported_json}

============================================================
IMPORTANT CLASSIFICATION RULES
============================================================

1. Inspect the COMPLETE visual content of the image.

2. Analyze the actual document layout, title, structure,
   headings, logos, labels, and visual characteristics.

3. NEVER classify based only on:
   - a person's name
   - a date
   - a number
   - a bank name
   - a generic logo
   - one matching keyword

4. DO NOT use the filename.

5. DO NOT assume that every uploaded document belongs to
   one of the supported document types.

6. If the document is not clearly one of the configured
   document types, return "unknown".

7. If the document is ambiguous, return "unknown".

8. NEVER invent a document type.

9. The returned document_type must be EXACTLY one of the
   company-supported document types OR "unknown".

10. Use the configured field names only as additional clues.
    Field names alone are NOT sufficient evidence.

============================================================
DOCUMENT-SPECIFIC GUIDANCE
============================================================

PAN:

A PAN document should contain strong evidence such as:
- PAN / Permanent Account Number context
- PAN number
- Income Tax / Government PAN card structure
- PAN card visual layout

Do NOT classify a bank document as PAN simply because
it contains account numbers or a person's name.

AADHAAR:

An Aadhaar document should contain strong evidence such as:
- Aadhaar / Aadhaar number context
- UIDAI-related visual structure
- Aadhaar card layout
- government identity-card structure

Do NOT classify another identity document as Aadhaar
based only on name, date of birth, or address.

RESUME:

A resume should contain strong evidence such as:
- professional profile
- career summary/objective
- education
- employment/work experience
- skills
- projects
- professional candidate information

A marksheet, certificate, bank document, government
identity document, or application form is NOT a resume.

============================================================
UNKNOWN RULE
============================================================

When there is insufficient evidence:

RETURN:

"unknown"

Do NOT force the image into the closest supported type.

============================================================
CONFIDENCE
============================================================

Confidence must represent actual visual evidence.

Use approximately:

0.90 - 1.00
Very strong visual match.

0.75 - 0.89
Strong match.

0.50 - 0.74
Ambiguous / weak match.
Prefer "unknown".

0.00 - 0.49
Not a reliable match.
Return "unknown".

============================================================
OUTPUT
============================================================

Return ONLY valid JSON.

Exactly:

{{
    "document_type": "...",
    "confidence": 0.0,
    "reason": "short evidence-based reason"
}}
"""

    # =========================================================
    # CLASSIFY
    # =========================================================

    def classify(
        self,
        image_bytes: bytes,
        company_id: str,
    ) -> dict:
        """
        Classify one document page using ONLY the
        authenticated company's blueprint.
        """

        # -----------------------------------------------------
        # Validate company
        # -----------------------------------------------------

        if not company_id:

            return {
                "document_type": "unknown",
                "confidence": 0.0,
                "reason": (
                    "Company identity is required "
                    "for document classification"
                ),
            }

        # -----------------------------------------------------
        # Validate image
        # -----------------------------------------------------

        if not image_bytes:

            return {
                "document_type": "unknown",
                "confidence": 0.0,
                "reason": (
                    "Document image is empty"
                ),
            }

        # -----------------------------------------------------
        # Load company blueprint
        # -----------------------------------------------------

        self.refresh(
            company_id
        )

        # -----------------------------------------------------
        # No company blueprint
        # -----------------------------------------------------

        if not self.document_types:

            return {
                "document_type": "unknown",
                "confidence": 0.0,
                "reason": (
                    "No document types configured "
                    "for this company"
                ),
            }

        # -----------------------------------------------------
        # Build system prompt
        # -----------------------------------------------------

        system_prompt = (
            self._build_system_prompt(
                company_id
            )
        )

        prompt = """
Inspect this document page carefully.

First determine what type of document it actually is.

Then compare it ONLY against the document types configured
for the authenticated company.

If it is not clearly one of those document types,
return "unknown".

Do not force a classification.

Return ONLY the requested JSON.
"""

        # -----------------------------------------------------
        # QWEN VISION
        # -----------------------------------------------------

        try:

            response = qwen_client.vision(
                image_bytes=image_bytes,
                prompt=prompt,
                system_prompt=system_prompt,
            )

        except Exception as e:

            return {
                "document_type": "unknown",
                "confidence": 0.0,
                "reason": (
                    f"Vision classification failed: {e}"
                ),
            }

        # -----------------------------------------------------
        # Parse response
        # -----------------------------------------------------

        try:

            result = self._parse_json_response(
                response
            )

        except Exception:

            return {
                "document_type": "unknown",
                "confidence": 0.0,
                "reason": (
                    "Invalid classification response"
                ),
            }

        # -----------------------------------------------------
        # Extract values
        # -----------------------------------------------------

        predicted_type = result.get(
            "document_type",
            "unknown",
        )

        confidence = result.get(
            "confidence",
            0.0,
        )

        reason = result.get(
            "reason",
            "",
        )

        # -----------------------------------------------------
        # Normalize confidence
        # -----------------------------------------------------

        try:

            confidence = float(
                confidence
            )

        except (
            TypeError,
            ValueError,
        ):

            confidence = 0.0

        confidence = max(
            0.0,
            min(
                1.0,
                confidence,
            ),
        )

        # -----------------------------------------------------
        # Explicit UNKNOWN
        # -----------------------------------------------------

        normalized_type = (
            self._normalize(
                str(predicted_type)
            )
        )

        if normalized_type in {
            "",
            "unknown",
            "none",
            "null",
        }:

            return {
                "document_type": "unknown",
                "confidence": 0.0,
                "reason": (
                    str(reason)
                    or "Document does not confidently "
                       "match a configured document type"
                ),
            }

        # -----------------------------------------------------
        # Match ONLY company-supported types
        # -----------------------------------------------------

        canonical_type = (
            self._lookup.get(
                normalized_type
            )
        )

        if canonical_type is None:

            return {
                "document_type": "unknown",
                "confidence": 0.0,
                "reason": (
                    "Document type is not configured "
                    "for this company"
                ),
            }

        # -----------------------------------------------------
        # Confidence threshold
        #
        # IMPORTANT:
        # Prevent weak model classifications from being
        # accepted as valid company documents.
        # -----------------------------------------------------

        MIN_CONFIDENCE = 0.75

        if confidence < MIN_CONFIDENCE:

            return {
                "document_type": "unknown",
                "confidence": round(
                    confidence,
                    4,
                ),
                "reason": (
                    "Classification confidence is below "
                    f"the required threshold ({MIN_CONFIDENCE})"
                ),
            }

        # -----------------------------------------------------
        # Final result
        # -----------------------------------------------------

        return {
            "document_type": canonical_type,
            "confidence": round(
                confidence,
                4,
            ),
            "reason": str(reason),
        }

    # =========================================================
    # SAFE JSON PARSER
    # =========================================================

    @staticmethod
    def _parse_json_response(
        response: Any,
    ) -> dict:
        """
        Safely parse Qwen JSON output.

        Handles:
        - normal JSON
        - ```json ... ```
        - surrounding whitespace
        """

        if isinstance(
            response,
            dict,
        ):
            return response

        if not isinstance(
            response,
            str,
        ):
            raise ValueError(
                "Model response is not JSON text"
            )

        text = response.strip()

        # -----------------------------------------------------
        # Remove markdown fences
        # -----------------------------------------------------

        if text.startswith(
            "```"
        ):

            text = (
                text
                .replace(
                    "```json",
                    "",
                    1,
                )
                .replace(
                    "```",
                    "",
                )
                .strip()
            )

        # -----------------------------------------------------
        # Direct JSON
        # -----------------------------------------------------

        try:

            data = json.loads(
                text
            )

            if isinstance(
                data,
                dict,
            ):
                return data

        except json.JSONDecodeError:
            pass

        # -----------------------------------------------------
        # Attempt to extract JSON object
        # -----------------------------------------------------

        start = text.find("{")
        end = text.rfind("}")

        if start == -1 or end == -1:

            raise ValueError(
                "No JSON object found"
            )

        data = json.loads(
            text[
                start:end + 1
            ]
        )

        if not isinstance(
            data,
            dict,
        ):

            raise ValueError(
                "Classification JSON must be an object"
            )

        return data


document_classifier = DocumentClassifier()