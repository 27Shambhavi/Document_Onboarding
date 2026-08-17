import json

from app.services.qwen.client import qwen_client


class QualityChecker:

    SYSTEM_PROMPT = """
You are a document quality inspection system.

Your task is to determine whether a document image
is usable for downstream OCR, classification and extraction.

There are ONLY TWO possible quality values:

GOOD
BAD

GOOD means:
- Text is sufficiently readable
- Document is not severely blurred
- Important information is visible
- Image resolution is sufficient
- Document is not severely cropped
- Document can reasonably be processed

BAD means:
- Severe blur
- Very low resolution
- Important information is cut off
- Document is extremely dark/bright
- Text is unreadable
- Image is corrupted
- Document is mostly blank

Return ONLY valid JSON:

{
    "quality": "GOOD|BAD",
    "confidence": 0.0,
    "reason": "short reason"
}
"""

    def check(
        self,
        image_bytes: bytes,
    ) -> dict:

        prompt = """
Inspect this document image.

Determine whether its quality is GOOD or BAD.

Do not identify the document type yet.
Only evaluate document usability.
"""

        response = qwen_client.vision(
            image_bytes=image_bytes,
            prompt=prompt,
            system_prompt=self.SYSTEM_PROMPT,
        )

        try:

            result = json.loads(response)

            quality = result.get(
                "quality",
                "BAD",
            ).upper()

            if quality not in {
                "GOOD",
                "BAD",
            }:
                quality = "BAD"

            return {
                "quality": quality,
                "confidence": result.get(
                    "confidence",
                    0.0,
                ),
                "reason": result.get(
                    "reason",
                    "",
                ),
            }

        except json.JSONDecodeError:

            return {
                "quality": "BAD",
                "confidence": 0.0,
                "reason": (
                    "Invalid quality response"
                ),
            }


quality_checker = QualityChecker()