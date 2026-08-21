import io
import json
import os
import re
from typing import List
from fastapi import HTTPException
from openai import OpenAI
from pypdf import PdfReader
import docx

from app.core.config import settings


def extract_raw_text_from_file(file_bytes: bytes, filename: str) -> str:
    """Extracts raw text content from PDF, DOCX, or TXT file formats."""
    filename_lower = filename.lower()
    text_content = []

    try:
        if filename_lower.endswith(".pdf"):
            reader = PdfReader(io.BytesIO(file_bytes))
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text_content.append(extracted)
            return "\n".join(text_content)

        elif filename_lower.endswith(".docx"):
            doc = docx.Document(io.BytesIO(file_bytes))
            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    text_content.append(paragraph.text.strip())
            return "\n".join(text_content)

        else:
            return file_bytes.decode("utf-8", errors="ignore")

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to read policy document '{filename}': {str(e)}"
        )


async def generate_structured_guidelines(raw_text: str) -> List[str]:
    """
    Transforms unstructured compliance text into explicit verification guidelines.
    Falls back to regex rule extraction if the remote LLM endpoint is unreachable.
    """
    if not raw_text or len(raw_text.strip()) < 20:
        raise HTTPException(
            status_code=400,
            detail="Policy document does not contain sufficient text."
        )

    # Resolve Base URL (Supports OpenRouter and NVIDIA)
    base_url = (
        os.getenv("OPENROUTER_BASE_URL")
        or getattr(settings, "OPENROUTER_BASE_URL", None)
        or os.getenv("NVIDIA_BASE_URL")
        or getattr(settings, "NVIDIA_BASE_URL", "https://openrouter.ai/api/v1")
    )
    if not base_url.endswith("/v1") and not base_url.endswith("/v1/"):
        base_url = f"{base_url.rstrip('/')}/v1"

    # Safely resolve API Key across string, list, or env configurations
    raw_key = (
        os.getenv("OPENROUTER_API_KEY")
        or getattr(settings, "OPENROUTER_API_KEY", None)
        or os.getenv("NVIDIA_API_KEYS")
        or os.getenv("NVIDIA_API_KEY")
        or getattr(settings, "NVIDIA_API_KEYS", None)
        or getattr(settings, "NVIDIA_API_KEY", "")
    )

    if isinstance(raw_key, list):
        api_key = raw_key[0].strip() if len(raw_key) > 0 else ""
    elif isinstance(raw_key, str):
        api_key = raw_key.split(",")[0].strip()
    else:
        api_key = ""

    model_name = (
        os.getenv("GUIDELINE_MODEL")
        or getattr(settings, "GUIDELINE_MODEL", None)
        or os.getenv("NVIDIA_MODEL")
        or getattr(settings, "NVIDIA_MODEL", "gpt-oss-120b")
    )

    prompt = f"""
You are an expert compliance rule extractor.
Analyze the following company document onboarding policy and extract all distinct verification rules.

FORMAT REQUIREMENTS:
1. Every guideline must be a single string clearly identifying the target document.
   Example: "Resume must contain Candidate Name, Email, and Mobile Number."
2. Output STRICTLY a valid JSON array of strings. No conversational prose.

POLICY TEXT:
\"\"\"
{raw_text[:10000]}
\"\"\"

Respond ONLY with the JSON array:
["Rule 1...", "Rule 2..."]
"""

    try:
        client = OpenAI(
            base_url=base_url,
            api_key=api_key or "DUMMY_KEY",
            default_headers={
                "HTTP-Referer": "http://localhost:8000",
                "X-Title": "Document Onboarding System"
            }
        )
        response = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
        )
        raw_content = response.choices[0].message.content or "[]"
        clean_json = raw_content.replace("```json", "").replace("```", "").strip()
        parsed_rules = json.loads(clean_json)

        if isinstance(parsed_rules, list) and len(parsed_rules) > 0:
            return [str(rule).strip() for rule in parsed_rules if str(rule).strip()]

    except Exception as e:
        print(f"[WARN] LLM Guideline Extraction endpoint error: {e}. Using deterministic text parser fallback.")

    # Resilient Fallback: Extract line-by-line rules directly from document text
    extracted_lines = []
    for line in raw_text.splitlines():
        line_clean = line.strip(" -*•0123456789.)").strip()
        if len(line_clean) > 25 and any(
            doc_keyword in line_clean.lower()
            for doc_keyword in ["must", "should", "require", "contain", "resume", "pan", "aadhaar", "marksheet", "certificate", "bank"]
        ):
            extracted_lines.append(line_clean)

    if extracted_lines:
        return extracted_lines[:15]

    # Standard baseline fallback
    return [
        "Resume must contain Candidate Name, Email ID, and Mobile Number.",
        "PAN Card must contain Name, Date of Birth, and valid PAN Number.",
        "Aadhaar Card must contain Name, Date of Birth, and Address.",
        "Candidate Name on PAN Card must match the name provided on Resume."
    ]