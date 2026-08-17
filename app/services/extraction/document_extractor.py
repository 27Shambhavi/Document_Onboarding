import json

from app.services.qwen.client import qwen_client


class DocumentExtractor:

    SYSTEM_PROMPT = """
You are an enterprise document extraction system.

You will receive one or more images belonging to
the SAME document.

Extract information across ALL provided pages.

Rules:

1. Treat all provided images as one document.
2. Combine information from all pages.
3. Extract ONLY information actually visible.
4. Never invent information.
5. Never guess missing values.
6. If a field is not available anywhere, return null.
7. Follow the requested schema.
8. Preserve document values accurately.
9. Return ONLY valid JSON.
"""

    def extract(
        self,
        images: list[tuple[bytes, str]],
        document_type: str,
        fields: list[dict],
    ) -> dict:

        field_names = [
            field["name"]
            for field in fields
        ]

        prompt = f"""
Document Type:
{document_type}

You are receiving {len(images)} page(s)
belonging to this SAME document.

Required fields:

{json.dumps(
    field_names,
    indent=2
)}

Read ALL pages before extracting.

Return JSON:

{{
    "field_name": "value"
}}

If a field cannot be found on any page,
return null.

Do not invent information.
"""

        response = qwen_client.vision_multiple(
            images=images,
            prompt=prompt,
            system_prompt=self.SYSTEM_PROMPT,
        )

        try:

            return json.loads(response)

        except json.JSONDecodeError:

            return {
                "raw_response": response
            }


document_extractor = DocumentExtractor()