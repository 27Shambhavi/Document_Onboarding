import json
import re
from typing import Any


from app.services.qwen.client import qwen_client


class DocumentExtractor:
    """
    Company-schema-driven document extractor.

    The extractor does NOT decide what fields to extract.

    The company blueprint already decided that.

    Example:

        ABC blueprint
            ↓
        PAN
            ↓
        pan_name
        pan_dob
        pan_number
        pan_father_name

    Qwen is instructed to return ONLY those fields.
    """

    # =========================================================
    # SYSTEM PROMPT
    # =========================================================

    SYSTEM_PROMPT = """
You are an enterprise document data extraction system.

You receive one or more images belonging to the SAME logical
document.

Your job is to extract ONLY the fields explicitly provided
in the requested field list.

STRICT RULES:

1. Treat all supplied images as one document.
2. Read ALL supplied pages before extracting.
3. Combine information across all supplied pages.
4. Extract ONLY requested fields.
5. NEVER invent information.
6. NEVER guess missing information.
7. If a requested field is not visible anywhere, return null.
8. Do not add extra fields.
9. Do not rename fields.
10. Do not create "document_type", "display_name", or "fields"
    unless they are explicitly present in the requested field list.
11. Preserve values accurately.
12. Return ONLY valid JSON.
13. The JSON keys MUST exactly match the requested field names.
14. Do not return markdown.
15. Do not return explanations.
"""


    # =========================================================
    # FIELD NAME HELPER
    # =========================================================

    @staticmethod
    def _get_field_name(
        field: Any,
    ) -> str:
        """
        Supports:

            FieldDefinition
            dict

        This keeps the extractor compatible with the
        dynamic company schema registry.
        """

        if isinstance(
            field,
            dict,
        ):

            name = field.get(
                "name"
            )

            if not name:
                raise ValueError(
                    "Field definition is missing 'name'."
                )

            return str(name)

        name = getattr(
            field,
            "name",
            None,
        )

        if not name:
            raise ValueError(
                "Field definition does not contain a name."
            )

        return str(name)


    # =========================================================
    # FIELD TYPE HELPER
    # =========================================================

    @staticmethod
    def _get_field_type(
        field: Any,
    ) -> str:

        if isinstance(
            field,
            dict,
        ):

            return str(
                field.get(
                    "type",
                    "string",
                )
            )

        return str(
            getattr(
                field,
                "type",
                "string",
            )
        )


    # =========================================================
    # CLEAN QWEN RESPONSE
    # =========================================================

    @staticmethod
    def _clean_json_response(
        response: Any,
    ) -> dict | None:
        """
        Handles responses such as:

            {...}

        or:

            ```json
            {...}
            ```

        without allowing the model's wrapper structure
        to leak into the application.
        """

        if response is None:
            return None

        if isinstance(
            response,
            dict,
        ):
            return response

        response = str(
            response
        ).strip()

        # -----------------------------------------------------
        # Remove markdown code fences
        # -----------------------------------------------------

        response = re.sub(
            r"^```(?:json)?\s*",
            "",
            response,
            flags=re.IGNORECASE,
        )

        response = re.sub(
            r"\s*```$",
            "",
            response,
        )

        response = response.strip()

        # -----------------------------------------------------
        # Direct JSON
        # -----------------------------------------------------

        try:

            parsed = json.loads(
                response
            )

            if isinstance(
                parsed,
                dict,
            ):

                return parsed

        except json.JSONDecodeError:
            pass

        # -----------------------------------------------------
        # Try extracting the first JSON object
        # -----------------------------------------------------

        start = response.find(
            "{"
        )

        end = response.rfind(
            "}"
        )

        if (
            start != -1
            and end != -1
            and end > start
        ):

            candidate = response[
                start:end + 1
            ]

            try:

                parsed = json.loads(
                    candidate
                )

                if isinstance(
                    parsed,
                    dict,
                ):

                    return parsed

            except json.JSONDecodeError:
                pass

        return None


    # =========================================================
    # FLATTEN POSSIBLE OLD MODEL RESPONSE
    # =========================================================

    @staticmethod
    def _unwrap_model_response(
        data: dict,
        field_names: list[str],
    ) -> dict:
        """
        Protects against an older Qwen response format.

        Old response:

            {
                "document_type": "pan",
                "display_name": "...",
                "fields": {
                    "pan_name": "...",
                    ...
                }
            }

        New desired response:

            {
                "pan_name": "...",
                ...
            }

        This method extracts the actual requested fields
        without allowing metadata to enter the result.
        """

        # -----------------------------------------------------
        # First: requested fields directly at root
        # -----------------------------------------------------

        direct_match = {}

        for field_name in field_names:

            if field_name in data:

                direct_match[
                    field_name
                ] = data.get(
                    field_name
                )

        if direct_match:

            return direct_match

        # -----------------------------------------------------
        # Second: old "fields" wrapper
        # -----------------------------------------------------

        nested_fields = data.get(
            "fields"
        )

        if isinstance(
            nested_fields,
            dict,
        ):

            nested_match = {}

            for field_name in field_names:

                nested_match[
                    field_name
                ] = nested_fields.get(
                    field_name
                )

            return nested_match

        # -----------------------------------------------------
        # Third: sometimes model may return another nested
        # object containing fields
        # -----------------------------------------------------

        for value in data.values():

            if isinstance(
                value,
                dict,
            ):

                nested_match = {}

                for field_name in field_names:

                    if field_name in value:

                        nested_match[
                            field_name
                        ] = value.get(
                            field_name
                        )

                if nested_match:

                    return nested_match

        # -----------------------------------------------------
        # Nothing matched
        # -----------------------------------------------------

        return {}


    # =========================================================
    # NORMALIZE EXTRACTION RESULT
    # =========================================================

    @classmethod
    def _normalize_extraction_result(
        cls,
        data: dict | None,
        fields: list[Any],
    ) -> dict:

        field_names = [
            cls._get_field_name(
                field
            )
            for field in fields
        ]

        # -----------------------------------------------------
        # No valid model response
        # -----------------------------------------------------

        if not data:

            return {
                field_name: None
                for field_name in field_names
            }

        # -----------------------------------------------------
        # Extract only requested fields
        # -----------------------------------------------------

        extracted = (
            cls._unwrap_model_response(
                data,
                field_names,
            )
        )

        # -----------------------------------------------------
        # Guarantee every requested field exists
        # -----------------------------------------------------

        final_data = {}

        for field_name in field_names:

            final_data[
                field_name
            ] = extracted.get(
                field_name,
                None,
            )

        return final_data


    # =========================================================
    # BUILD EXTRACTION PROMPT
    # =========================================================

    def _build_prompt(
        self,
        document_type: str,
        images: list[tuple[bytes, str]],
        fields: list[Any],
    ) -> str:

        requested_fields = []

        for field in fields:

            requested_fields.append(
                {
                    "name": self._get_field_name(
                        field
                    ),
                    "type": self._get_field_type(
                        field
                    ),
                }
            )

        return f"""
DOCUMENT TYPE:

{document_type}


NUMBER OF PAGES:

{len(images)}


REQUESTED FIELDS:

{json.dumps(
    requested_fields,
    indent=2,
    ensure_ascii=False,
)}


EXTRACTION INSTRUCTIONS:

Read every supplied page carefully.

These pages belong to ONE logical document.

Extract only the requested fields.

For every requested field:

- If the value is clearly visible, extract it.
- If the value is not visible, return null.
- Do not guess.
- Do not infer unsupported information.
- Do not add fields.
- Do not rename fields.


VERY IMPORTANT:

The requested field names are the JSON keys.

Do NOT return:

    document_type

Do NOT return:

    display_name

Do NOT return:

    fields

unless one of those names is explicitly present in the
requested field list.


RETURN EXACTLY THIS JSON SHAPE:

{{
    "{self._get_field_name(fields[0]) if fields else 'field_name'}": null
}}

If multiple fields exist, return all of them.

Example:

{{
    "pan_name": "John Doe",
    "pan_dob": "01/01/1990",
    "pan_number": "ABCDE1234F",
    "pan_father_name": "Father Name"
}}

If information is unavailable:

{{
    "pan_name": "John Doe",
    "pan_dob": null,
    "pan_number": "ABCDE1234F",
    "pan_father_name": null
}}

Return ONLY JSON.
"""


    # =========================================================
    # EXTRACT
    # =========================================================

    def extract(
        self,
        images: list[tuple[bytes, str]],
        document_type: str,
        fields: list[Any],
    ) -> dict:
        """
        Extract company-configured fields from a logical
        document.

        IMPORTANT:

        The caller provides the company-specific schema fields.

        Therefore this function does NOT need company_id.
        The company-specific filtering already happened in
        schema_registry.
        """

        # -----------------------------------------------------
        # Validate
        # -----------------------------------------------------

        if not images:

            return {
                self._get_field_name(
                    field
                ): None
                for field in fields
            }

        if not fields:

            return {}

        # -----------------------------------------------------
        # Build prompt
        # -----------------------------------------------------

        prompt = self._build_prompt(
            document_type=document_type,
            images=images,
            fields=fields,
        )

        # -----------------------------------------------------
        # QWEN VISION
        # -----------------------------------------------------

        response = (
            qwen_client.vision_multiple(
                images=images,
                prompt=prompt,
                system_prompt=self.SYSTEM_PROMPT,
            )
        )

        # -----------------------------------------------------
        # Parse response
        # -----------------------------------------------------

        parsed = (
            self._clean_json_response(
                response
            )
        )

        # -----------------------------------------------------
        # Normalize
        # -----------------------------------------------------

        return (
            self._normalize_extraction_result(
                data=parsed,
                fields=fields,
            )
        )


# =============================================================
# SINGLETON
# =============================================================

document_extractor = (
    DocumentExtractor()
)