import json

from app.services.qwen.client import qwen_client
from app.schemas.registry import schema_registry


class DocumentClassifier:

    def __init__(self):
        self.refresh()

    # =====================================================
    # REFRESH DOCUMENT TYPES FROM CENTRAL JSON
    # =====================================================

    def refresh(self):

        self.document_types = []
        self.document_parameters = {}

        for schema in schema_registry.schemas.values():

            document_type = schema.document_type

            self.document_types.append(
                document_type
            )

            self.document_parameters[
                document_type
            ] = [
                field.name
                for field in schema.fields
            ]

        # Remove duplicates
        self.document_types = list(
            dict.fromkeys(
                self.document_types
            )
        )

        # Canonical lookup
        self._lookup = {}

        for document_type in self.document_types:

            self._lookup[
                self._normalize(document_type)
            ] = document_type

    # =====================================================
    # NORMALIZE DOCUMENT TYPE
    # =====================================================

    @staticmethod
    def _normalize(
        value: str,
    ) -> str:

        value = (
            value
            .strip()
            .lower()
        )

        # Treat Aadhaar/Aadhar as same
        if value == "aadhaar":
            value = "aadhar"

        value = (
            value
            .replace("_", "")
            .replace("-", "")
            .replace(" ", "")
            .replace("/", "")
        )

        return value

    # =====================================================
    # BUILD DYNAMIC SYSTEM PROMPT
    # =====================================================

    def _build_system_prompt(self) -> str:

        supported_types = []

        for document_type in self.document_types:

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

        # IMPORTANT:
        # Do NOT use .format() here.
        # This avoids conflicts with JSON braces.

        return f"""
You are an enterprise document classification system.

Your task is to classify the document image into EXACTLY ONE
of the supported document types provided below.

SUPPORTED DOCUMENT TYPES:

{supported_json}

IMPORTANT RULES:

1. Analyze the actual visual content of the document.
2. Do NOT rely on the filename.
3. Choose exactly ONE document type from the supported list.
4. Do NOT invent a document type.
5. If the document clearly matches one supported type,
   select it.
6. If the document does not confidently match any supported
   type, return "unknown".
7. Use the parameter names as additional semantic clues
   when distinguishing similar document types.
8. The document_type must exactly match one of the
   supported document type names.
9. Return ONLY valid JSON.

Return exactly:

{{
    "document_type": "...",
    "confidence": 0.0,
    "reason": "short reason"
}}
"""

    # =====================================================
    # CLASSIFY
    # =====================================================

    def classify(
        self,
        image_bytes: bytes,
    ) -> dict:

        system_prompt = (
            self._build_system_prompt()
        )

        prompt = """
Identify the document type shown in this image.

First inspect the complete visual content.

Compare the document against the supported
document types and their parameters.

Return the classification JSON only.
"""

        response = qwen_client.vision(
            image_bytes=image_bytes,
            prompt=prompt,
            system_prompt=system_prompt,
        )

        try:

            result = json.loads(response)

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

            # =================================================
            # MAP MODEL OUTPUT TO CENTRAL JSON TYPE
            # =================================================

            normalized_type = (
                self._normalize(
                    str(predicted_type)
                )
            )

            canonical_type = (
                self._lookup.get(
                    normalized_type
                )
            )

            # =================================================
            # UNKNOWN / UNSUPPORTED
            # =================================================

            if canonical_type is None:

                return {
                    "document_type": "unknown",
                    "confidence": 0.0,
                    "reason": (
                        "Document type is not "
                        "supported by the central schema"
                    ),
                }

            # =================================================
            # SUCCESS
            # =================================================

            return {
                "document_type": canonical_type,
                "confidence": confidence,
                "reason": reason,
            }

        except json.JSONDecodeError:

            return {
                "document_type": "unknown",
                "confidence": 0.0,
                "reason": (
                    "Invalid classification response"
                ),
            }


document_classifier = DocumentClassifier()