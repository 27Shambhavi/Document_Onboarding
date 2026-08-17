import json
from typing import Any

from app.services.qwen.client import qwen_client


class DocumentExtractor:

    SYSTEM_PROMPT = """
You are an enterprise document extraction system.

You will receive one or more images belonging to the SAME document.

Your task is to extract the requested parameters from ALL provided pages.

Rules:

1. Treat all provided images as ONE document.
2. Read ALL pages before extracting.
3. Combine information across all pages.
4. Extract ONLY information that is actually visible.
5. Never invent information.
6. Never guess missing information.
7. If a requested parameter is not available anywhere,
   return null for that parameter.
8. Follow the requested parameter list exactly.
9. Preserve document values accurately.
10. Return ONLY valid JSON.
11. Do not add extra fields.
12. Do not rename the requested fields.
"""

    def _get_field_name(self, field: Any) -> str:
        """
        Supports both:
        - FieldDefinition objects
        - dictionaries

        This keeps the extractor compatible with the
        dynamic schema registry.
        """

        if isinstance(field, dict):
            return str(field["name"])

        return str(field.name)

    def extract(
        self,
        images: list[tuple[bytes, str]],
        document_type: str,
        fields: list[Any],
    ) -> dict:

        # -------------------------------------------------
        # GET PARAMETER NAMES FROM CENTRAL SCHEMA
        # -------------------------------------------------

        field_names = [
            self._get_field_name(field)
            for field in fields
        ]

        # -------------------------------------------------
        # EXTRACTION PROMPT
        # -------------------------------------------------

        prompt = f"""
Document Type:
{document_type}

Number of pages:
{len(images)}

These pages belong to the SAME document.

Read and understand ALL pages before producing
the final answer.

The following parameters MUST be considered:

{json.dumps(
    field_names,
    indent=2,
    ensure_ascii=False,
)}

Extraction requirements:

- Extract the value for every requested parameter.
- If a parameter is present, return the value exactly
  as supported by the document.
- If a parameter is not present anywhere in the pages,
  return null.
- Do not infer or calculate values unless the document
  explicitly provides them.
- Do not add parameters that are not in the requested list.
- Keep the exact parameter names provided above.

Return ONLY this JSON structure:

{{
    "parameter_name": "value"
}}

Example:

{{
    "resume_name": "John Doe",
    "resume_email": "john@example.com",
    "resume_mobile_no": "+91 9876543210"
}}

If a parameter is unavailable:

{{
    "resume_name": "John Doe",
    "resume_email": null,
    "resume_mobile_no": null
}}
"""

        # -------------------------------------------------
        # SEND ALL DOCUMENT PAGES TO QWEN TOGETHER
        # -------------------------------------------------

        response = qwen_client.vision_multiple(
            images=images,
            prompt=prompt,
            system_prompt=self.SYSTEM_PROMPT,
        )

        # -------------------------------------------------
        # PARSE JSON RESPONSE
        # -------------------------------------------------

        try:

            data = json.loads(response)

            # ---------------------------------------------
            # KEEP ONLY REQUESTED PARAMETERS
            # ---------------------------------------------

            if isinstance(data, dict):

                cleaned_data = {}

                for field_name in field_names:

                    cleaned_data[field_name] = data.get(
                        field_name,
                        None,
                    )

                return cleaned_data

            return {
                "raw_response": response
            }

        except json.JSONDecodeError:

            return {
                "raw_response": response
            }


document_extractor = DocumentExtractor()