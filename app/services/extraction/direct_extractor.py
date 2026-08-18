import json
from typing import Any, Dict
from app.services.qwen.qwen_client import qwen_client


class UnifiedSchemaExtractor:
    def process_page(self, image_bytes: bytes, company_schemas: Dict[str, Any]) -> Dict[str, Any]:
        """
        Single-Pass Unified Engine:
        1. Visual Quality Assessment
        2. Dynamic Semantic Schema Matching
        3. Schema-Bound Data Extraction
        """
        prompt = f"""
You are an enterprise document intelligence and automated onboarding system.
Analyze the provided document page image carefully.

COMPANY REQUIREMENT SCHEMAS:
{json.dumps(company_schemas, indent=2)}

TASK:
1. QUALITY CHECK:
   - Determine if the document page is legible and readable.
   - If unreadable, completely blurred, dark, or corrupt, set "quality": "BAD" and state the reason.
   - If legible, set "quality": "GOOD".

2. DYNAMIC SCHEMA MATCHING:
   - Match this document against the COMPANY REQUIREMENT SCHEMAS.
   - Match by document category/content (e.g., Any identity card matching Aadhaar fields -> match to "Aadhar", Experience letter/Internship Certificate matching experience fields -> match to "Previous Company Experience letter", etc.).
   - If it matches a schema type, set "document_type" to the exact schema key.
   - If it does NOT match any company schema type, set "document_type": "unknown".

3. FIELD EXTRACTION:
   - Extract only the fields defined under the matched schema.
   - If a field is not present or visible on the page, return null.
   - Do not hallucinate values.

Respond ONLY with valid JSON using this exact structure:
{{
  "quality": "GOOD" | "BAD",
  "quality_reason": "<optional explanation if BAD>",
  "document_type": "<matched_schema_key | 'unknown'>",
  "confidence_score": 0.98,
  "extracted_data": {{
    "<field_name>": "<extracted_value_or_null>"
  }}
}}
"""
        try:
            raw_response = qwen_client.vision_extract(image_bytes=image_bytes, prompt=prompt)
            clean_json = raw_response.replace("```json", "").replace("```", "").strip()
            return json.loads(clean_json)
        except Exception as e:
            return {
                "quality": "BAD",
                "quality_reason": f"Processing exception: {str(e)}",
                "document_type": "unknown",
                "confidence_score": 0.0,
                "extracted_data": {},
            }


unified_extractor = UnifiedSchemaExtractor()