import json

from app.services.qwen.client import qwen_client


class DocumentClassifier:

    SYSTEM_PROMPT = """
You are an enterprise document classification system.

Classify the document image into EXACTLY ONE type.

Supported types:

1. aadhaar
2. pan
3. resume
4. 10th_marksheet
5. 12th_marksheet
6. employee_photo
7. unknown

Rules:

aadhaar:
Indian Aadhaar identity document.

pan:
Indian PAN card.

resume:
CV/resume containing professional,
educational or career information.

10th_marksheet:
Class 10 / Secondary / SSC academic marksheet.

12th_marksheet:
Class 12 / Higher Secondary / HSC academic marksheet.

employee_photo:
A profile/passport-style photograph of an employee/person.

unknown:
The document does not confidently belong
to any supported category.

Analyze the actual visual content.
Do NOT rely on filename.

Return ONLY:

{
    "document_type": "...",
    "confidence": 0.0,
    "reason": "short reason"
}
"""

    ALLOWED_TYPES = {
        "aadhaar",
        "pan",
        "resume",
        "10th_marksheet",
        "12th_marksheet",
        "employee_photo",
        "unknown",
    }

    def classify(
        self,
        image_bytes: bytes,
    ) -> dict:

        prompt = """
Identify what type of document is shown
in this image.

Return the classification JSON only.
"""

        response = qwen_client.vision(
            image_bytes=image_bytes,
            prompt=prompt,
            system_prompt=self.SYSTEM_PROMPT,
        )

        try:

            result = json.loads(response)

            document_type = result.get(
                "document_type",
                "unknown",
            )

            if document_type not in self.ALLOWED_TYPES:
                document_type = "unknown"

            return {
                "document_type": document_type,
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
                "document_type": "unknown",
                "confidence": 0.0,
                "reason": (
                    "Invalid classification response"
                ),
            }


document_classifier = DocumentClassifier()