"""
Chatbot RAG Query & Dynamic Suggestions Route
---------------------------------------------
POST /chatbot/query       → Natural language RAG search grounded strictly in company documents
GET  /chatbot/suggestions → Dynamic suggested prompts derived from company's latest uploaded files
"""

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.core.auth import authenticate_client
from app.db.database import get_db
from app.services.qwen.client import qwen_client

logger = logging.getLogger("chatbot_routes")

router = APIRouter(
    prefix="/chatbot",
    tags=["RAG Chatbot"],
)

STOPWORDS = {
    "a", "about", "all", "an", "and", "any", "are", "as", "at", "be", "by",
    "can", "candidate", "candidates", "data", "details", "did", "do", "does",
    "document", "documents", "extracted", "file", "files", "find", "for", "from",
    "get", "give", "has", "have", "how", "i", "in", "info", "information", "is",
    "it", "me", "my", "of", "on", "or", "our", "page", "pages", "please",
    "record", "records", "search", "show", "tell", "the", "there", "this", "to",
    "uploaded", "what", "when", "where", "which", "who", "will", "with", "you"
}


# =========================================================
# SCHEMAS
# =========================================================

class ChatQueryRequest(BaseModel):
    question: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Natural language question about candidate documents or extracted data.",
        examples=["What is the year of examination for example.pdf?", "Show extracted fields for candidate."]
    )


class SourceReference(BaseModel):
    table: str
    id: int
    file_name: Optional[str] = None
    document_name: Optional[str] = None
    document_type: Optional[str] = None


class ChatQueryResponse(BaseModel):
    answer: str
    sources: List[SourceReference]
    records_found: int


class SuggestionsResponse(BaseModel):
    company_id: str
    latest_file: Optional[str] = None
    suggestions: List[str]


# =========================================================
# HELPER: SEARCH TERM EXTRACTION
# =========================================================

def _extract_search_terms(query: str) -> List[str]:
    """Tokenize query and strip generic stopwords to find candidate names, file terms, doc types."""
    tokens = re.findall(r"[A-Za-z0-9_\-\.]+", query.lower())
    terms = [t for t in tokens if len(t) > 1 and t not in STOPWORDS]
    return terms


def _decode_unicode_escapes(text_val: str) -> str:
    """Decode any literal \\uXXXX or \\UXXXXXXXX escape sequences into actual Unicode characters."""
    if not text_val or "\\u" not in text_val:
        return text_val
    try:
        return re.sub(
            r"\\u([0-9a-fA-F]{4})",
            lambda m: chr(int(m.group(1), 16)),
            text_val
        )
    except Exception:
        return text_val


# =========================================================
# HELPER: RETRIEVAL FROM POSTGRESQL (SMART UNPACKING & RANKING)
# =========================================================

def _retrieve_company_records(db: Session, company_id: str, question: str) -> List[Dict[str, Any]]:
    """
    Search extracted_documents and document_scans in PostgreSQL.
    Guaranteed tenant isolation: ONLY queries rows matching company_id.
    Unpacks bundle scans into granular page records and ranks direct term matches first.
    """
    terms = _extract_search_terms(question)
    direct_matches: List[Dict[str, Any]] = []
    fallback_records: List[Dict[str, Any]] = []
    seen_keys = set()

    insp = inspect(db.bind)

    # 1. Search & unpack document_scans table (Primary storage for Stage 1 OCR pipeline)
    try:
        if insp.has_table("document_scans"):
            scan_rows = db.execute(
                text("""
                    SELECT id, company_id, filename, pages_count, extracted_json, cost_inr, created_at
                    FROM document_scans
                    WHERE company_id = :cid
                    ORDER BY created_at DESC
                    LIMIT 10
                """),
                {"cid": company_id}
            ).mappings().all()

            for s in scan_rows:
                fname = s.get("filename") or "document.pdf"
                scan_id = s["id"]
                raw_json = s.get("extracted_json") or {}
                files = raw_json.get("files", [])

                if isinstance(files, list) and files:
                    for f in files:
                        label = f.get("label") or f.get("id") or "Document"
                        ocr = f.get("ocr_data") or {}
                        page_key = f"scan-{scan_id}-{f.get('id', label)}"

                        # Check if this page or its parent file matches any query term
                        page_text = f"{fname} {label} {json.dumps(ocr, default=str, ensure_ascii=False)}".lower()
                        is_match = any(t in page_text for t in terms) if terms else True

                        item = {
                            "source_table": "document_scans",
                            "id": scan_id,
                            "file_name": fname,
                            "document_name": label,
                            "document_type": label,
                            "extracted_data": ocr,
                            "raw_json": f,
                            "created_at": str(s.get("created_at")),
                        }

                        if page_key not in seen_keys:
                            seen_keys.add(page_key)
                            if is_match and terms:
                                direct_matches.append(item)
                            else:
                                fallback_records.append(item)
                else:
                    # Flat scan record
                    flat_text = f"{fname} {json.dumps(raw_json, default=str, ensure_ascii=False)}".lower()
                    is_match = any(t in flat_text for t in terms) if terms else True
                    key = f"scan-flat-{scan_id}"
                    if key not in seen_keys:
                        seen_keys.add(key)
                        item = {
                            "source_table": "document_scans",
                            "id": scan_id,
                            "file_name": fname,
                            "document_name": fname,
                            "document_type": "ScanBundle",
                            "extracted_data": raw_json,
                            "raw_json": raw_json,
                            "created_at": str(s.get("created_at")),
                        }
                        if is_match and terms:
                            direct_matches.append(item)
                        else:
                            fallback_records.append(item)
    except Exception as exc:
        logger.warning(f"[chatbot] Error querying document_scans: {exc}")

    # 2. Search extracted_documents table
    try:
        if insp.has_table("extracted_documents"):
            doc_rows = db.execute(
                text("""
                    SELECT id, submission_id, company_id, document_id, document_name,
                       document_type, extracted_data, raw_json, file_name, created_at
                    FROM extracted_documents
                    WHERE company_id = :cid
                    ORDER BY created_at DESC
                    LIMIT 20
                """),
                {"cid": company_id}
            ).mappings().all()

            for d in doc_rows:
                fname = d.get("file_name") or "document.pdf"
                dname = d.get("document_name") or ""
                dtype = d.get("document_type") or ""
                data = d.get("extracted_data") or {}
                raw_j = d.get("raw_json") or {}

                doc_text = f"{fname} {dname} {dtype} {json.dumps(data, default=str, ensure_ascii=False)} {json.dumps(raw_j, default=str, ensure_ascii=False)}".lower()
                is_match = any(t in doc_text for t in terms) if terms else True

                key = f"ext-doc-{d['id']}"
                if key not in seen_keys:
                    seen_keys.add(key)
                    item = {
                        "source_table": "extracted_documents",
                        "id": d["id"],
                        "file_name": fname,
                        "document_name": dname,
                        "document_type": dtype,
                        "extracted_data": data,
                        "raw_json": raw_j,
                        "created_at": str(d.get("created_at")),
                    }
                    if is_match and terms:
                        direct_matches.append(item)
                    else:
                        fallback_records.append(item)
    except Exception as exc:
        logger.warning(f"[chatbot] Error querying extracted_documents: {exc}")

    # 3. Combine: Prioritize DIRECT MATCHES!
    # If direct matches exist, use them first. Only add fallback if needed to reach up to 10 records.
    if direct_matches:
        combined = direct_matches[:12]
        if len(combined) < 5:
            combined.extend(fallback_records[: 5 - len(combined)])
        return combined

    return fallback_records[:10]


# =========================================================
# HELPER: LLM ANSWER SYNTHESIS
# =========================================================

async def _synthesize_rag_answer(question: str, context_records: List[Dict[str, Any]]) -> str:
    """Pass retrieved context records and question to the LLM for grounded answer generation."""
    if not context_records:
        return (
            "I could not find any document or candidate records matching your query in your "
            "company's workspace. Please make sure documents have been uploaded and processed."
        )

    clean_records = []
    for r in context_records[:10]:
        clean_records.append({
            "record_id": r["id"],
            "file_name": r.get("file_name"),
            "document_name": r.get("document_name"),
            "document_type": r.get("document_type"),
            "extracted_data": r.get("extracted_data"),
        })

    # ensure_ascii=False preserves Devanagari/Hindi and UTF-8 characters cleanly
    records_json = json.dumps(clean_records, indent=2, default=str, ensure_ascii=False)

    system_prompt = (
        "You are an enterprise document intelligence and compliance assistant for DocVerify.\n"
        "You answer questions regarding candidate documents and extracted data based ONLY on the "
        "provided RETRIEVED RECORDS below.\n\n"
        "STRICT COMPLIANCE INSTRUCTIONS:\n"
        "1. Base your answer STRICTLY on the data provided in the RETRIEVED RECORDS.\n"
        "2. SEMANTIC / SYNONYM FIELD MATCHING: Field names in extracted data can vary in formatting "
        "(e.g., 'examination_year' vs 'year of examination' vs 'exam_year'; 'candidate_name' vs 'full_name' vs 'name'; "
        "'date_of_birth' vs 'dob'; 'aadhaar_number' vs 'aadhar_number'; 'total_marks' vs 'marks'). "
        "Always check all corresponding fields and sub-objects within the matching document.\n"
        "3. UNICODE & MULTILINGUAL TEXT: Always output Devanagari, Hindi, regional script names, and addresses "
        "directly as real readable UTF-8 characters (e.g. 'जसबीर सिंह'). NEVER output raw unicode escape codes like '\\u091c'.\n"
        "4. If a specific detail is not present in any record, state clearly: "
        "'That information is not available in the uploaded document records.'\n"
        "5. Do NOT invent, extrapolate, or hallucinate any numbers, names, or values.\n"
        "6. Always mention which source file and document page/type you found the data in "
        "(e.g., 'In example.pdf (10th Marksheet)...').\n"
        "7. Keep your response clear, concise, and professional."
    )

    user_prompt = f"""RETRIEVED RECORDS:
{records_json}

USER QUESTION:
{question}

Provide an accurate, grounded answer based ONLY on the records above:"""

    # 1. Check for Anthropic API if key is available in environment
    anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
    if anthropic_api_key:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": anthropic_api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": "claude-3-5-haiku-20241022",
                        "max_tokens": 512,
                        "system": system_prompt,
                        "messages": [{"role": "user", "content": user_prompt}],
                        "temperature": 0.0,
                    },
                )
                if res.status_code == 200:
                    data = res.json()
                    content_blocks = data.get("content", [])
                    if content_blocks:
                        raw_text = content_blocks[0].get("text", "")
                        return _decode_unicode_escapes(raw_text)
        except Exception as exc:
            logger.warning(f"[chatbot] Anthropic API attempt failed: {exc}, falling back to Qwen client.")

    # 2. Fallback to existing OpenAI-compatible / Qwen LLM
    try:
        response = await qwen_client.chat_async(
            prompt=user_prompt,
            system_prompt=system_prompt,
        )
        if response and response.strip():
            return _decode_unicode_escapes(response.strip())
    except Exception as exc:
        logger.error(f"[chatbot] Qwen client call failed: {exc}")

    return "I located your records, but the LLM reasoning service is currently unavailable. Please try again shortly."


# =========================================================
# ENDPOINTS
# =========================================================

@router.get(
    "/suggestions",
    response_model=SuggestionsResponse,
    summary="Get Dynamic Contextual Suggestions for Chatbot",
    status_code=status.HTTP_200_OK,
)
def get_dynamic_suggestions(
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> SuggestionsResponse:
    """
    Returns dynamically generated prompt suggestions based on the most recently
    uploaded candidate documents for the authenticated company.
    """
    company_id = client.get("company_id") or client.get("sub") or ""
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    insp = inspect(db.bind)
    latest_filenames: List[str] = []

    # 1. Check document_scans
    try:
        if insp.has_table("document_scans"):
            rows = db.execute(
                text("SELECT filename FROM document_scans WHERE company_id = :cid ORDER BY created_at DESC LIMIT 3"),
                {"cid": company_id}
            ).scalars().all()
            latest_filenames.extend([r for r in rows if r])
    except Exception as exc:
        logger.warning(f"[chatbot] suggestions scan check error: {exc}")

    # 2. Check extracted_documents
    try:
        if insp.has_table("extracted_documents"):
            doc_rows = db.execute(
                text("SELECT DISTINCT file_name FROM extracted_documents WHERE company_id = :cid AND file_name IS NOT NULL ORDER BY file_name LIMIT 3"),
                {"cid": company_id}
            ).scalars().all()
            for df in doc_rows:
                if df and df not in latest_filenames:
                    latest_filenames.append(df)
    except Exception as exc:
        logger.warning(f"[chatbot] suggestions doc check error: {exc}")

    # Build dynamic suggestions
    suggestions = []
    latest_file = latest_filenames[0] if latest_filenames else None

    if latest_file:
        file_base = latest_file.replace(".pdf", "").replace(".zip", "")
        suggestions.append(f"What documents were detected in {latest_file}?")
        suggestions.append(f"What is the year of examination for {file_base}?")
        suggestions.append(f"Show extracted candidate details for {file_base}")
    else:
        suggestions.append("What candidate documents are in the system?")
        suggestions.append("How do I upload and verify candidate documents?")
        suggestions.append("Check active guideline policies")

    return SuggestionsResponse(
        company_id=company_id,
        latest_file=latest_file,
        suggestions=suggestions[:3],
    )


@router.post(
    "/query",
    response_model=ChatQueryResponse,
    summary="Query Extracted Candidate Data via RAG Chatbot",
    status_code=status.HTTP_200_OK,
)
async def query_candidate_data(
    payload: ChatQueryRequest,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> ChatQueryResponse:
    """
    RAG Chatbot Query Endpoint:
    1. Authenticates the client and extracts company_id.
    2. Enforces strict tenant isolation: searches extracted candidate data belonging ONLY to this company.
    3. Unpacks and retrieves matching database records.
    4. Passes records as context to the LLM to generate a grounded, natural-language response.
    5. Returns answer along with source document references for traceability.
    """
    company_id = client.get("company_id") or client.get("sub") or ""

    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not determine authorized company_id from token.",
        )

    clean_question = payload.question.strip()
    if not clean_question:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question cannot be empty.",
        )

    # 1. Retrieve company-isolated records (direct matches prioritized)
    records = _retrieve_company_records(db=db, company_id=company_id, question=clean_question)

    # 2. Synthesize grounded answer
    raw_answer = await _synthesize_rag_answer(question=clean_question, context_records=records)
    answer = _decode_unicode_escapes(raw_answer)

    # 3. Format traceable source references
    sources = [
        SourceReference(
            table=r["source_table"],
            id=r["id"],
            file_name=r.get("file_name"),
            document_name=r.get("document_name"),
            document_type=r.get("document_type"),
        )
        for r in records[:5]
    ]

    return ChatQueryResponse(
        answer=answer,
        sources=sources,
        records_found=len(records),
    )
