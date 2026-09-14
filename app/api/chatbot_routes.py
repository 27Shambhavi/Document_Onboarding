"""
Chatbot RAG Query & Dynamic Suggestions Route
---------------------------------------------
POST /chatbot/query       → Natural language RAG search grounded strictly in company documents
GET  /chatbot/suggestions → Dynamic suggested prompts derived from company's latest uploaded files
"""

import asyncio
import json
import logging
import os
import re
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.core.auth import authenticate_client
from app.db.database import get_db
from app.db.models import CandidateMatch, ChatMessage, ChatSession, DocumentScan, JobDescription
from app.services.jd_matcher import jd_matcher
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
        max_length=20000,
        description="Natural language question about candidate documents or job descriptions.",
        examples=["What is the year of examination for example.pdf?", "Show extracted fields for candidate."]
    )
    session_id: Optional[str] = Field(
        None,
        description="Optional session ID for conversation continuity and history tracking.",
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
    session_id: str


class ChatMessageItem(BaseModel):
    id: int
    session_id: str
    sender: str
    message_text: str
    sources: Optional[List[Any]] = None
    records_found: int = 0
    created_at: str


class ChatSessionSummary(BaseModel):
    session_id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int
    latest_message: Optional[str] = None


class ChatSessionDetail(BaseModel):
    session_id: str
    title: str
    created_at: str
    updated_at: str
    messages: List[ChatMessageItem]


class SuggestionsResponse(BaseModel):
    company_id: str
    latest_file: Optional[str] = None
    suggestions: List[str]


# =========================================================
# HELPER: SEARCH TERM EXTRACTION & QUERY CLASSIFICATION
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


def _is_candidate_role_query(question: str, company_id: str, db: Session) -> bool:
    """
    Determines if the user query is asking about candidates, job roles, match scores,
    fit, competencies, weaknesses, or rankings rather than raw identity/document fields.
    """
    q_lower = question.lower()

    # 1. Check substrings directly to catch typos (e.g. "cadidates", "devloper") and compounds
    trigger_substrings = [
        "candidate", "cadidate", "candidat", "applicant", "resume", "cv",
        "developer", "engineer", "programmer", "role", "position", "job", "profile",
        "match", "score", "rank", "ranking", "shortlist", "gap", "weakness",
        "python", "java", "react", "fastapi", "sql", "backend", "frontend", "fullstack",
        "hire", "hiring", "interview", "competenc", "fit", "suitab"
    ]
    if any(ts in q_lower for ts in trigger_substrings):
        return True

    # 2. Hindi / Hinglish phrasing like "kitne candidate", "role ke liye", "se related", "kisko hire", "score kya hai"
    if ("kitne" in q_lower or "kitna" in q_lower or "kaun" in q_lower or "kaunse" in q_lower) or \
       ("se related" in q_lower) or ("ke liye" in q_lower):
        return True

    # 3. Check if query matches any existing Job Description title for this company
    try:
        jd_titles = db.execute(
            text("SELECT job_title FROM job_descriptions WHERE company_id = :cid"),
            {"cid": company_id}
        ).scalars().all()
        for title in jd_titles:
            title_words = [w.lower() for w in re.findall(r"[a-z0-9]+", title.lower()) if len(w) > 2]
            if title_words and any(w in q_lower for w in title_words):
                return True
    except Exception as e:
        logger.warning(f"[chatbot] Error checking job_descriptions titles: {e}")

    return False


# =========================================================
# HELPER: CANDIDATE MATCHES RETRIEVAL (PRIMARY ROLE TABLE)
# =========================================================

def _infer_role_title_from_query(question: str) -> str:
    """Infers job role title from natural language query or question."""
    q_lower = question.lower()
    if "python" in q_lower:
        return "Python Developer"
    elif "react" in q_lower or "frontend" in q_lower:
        return "Frontend Developer"
    elif "java" in q_lower:
        return "Java Developer"
    elif "full stack" in q_lower or "fullstack" in q_lower:
        return "Full Stack Developer"
    elif "data scientist" in q_lower or "data science" in q_lower or "ml" in q_lower:
        return "Data Scientist"
    elif "backend" in q_lower:
        return "Backend Developer"
    elif "engineer" in q_lower:
        return "Software Engineer"
    elif "developer" in q_lower:
        return "Software Developer"
    return "Python Developer"


async def _auto_evaluate_and_persist_candidate_matches(
    db: Session,
    company_id: str,
    terms: List[str],
    question: str = "",
) -> List[Dict[str, Any]]:
    """
    If candidate_matches table is empty for this company, dynamically evaluate
    available document_scans against the best matching JobDescription in parallel and persist them.
    If no JobDescription exists yet for this company, auto-generates one for the requested role.
    """
    try:
        from app.services.jd_matcher import jd_matcher

        # 1. Find or create Job Description for this company
        jds = db.query(JobDescription).filter(JobDescription.company_id == company_id).all()
        target_jd = None

        if jds:
            for term in terms:
                for jd in jds:
                    if term.lower() in jd.job_title.lower():
                        target_jd = jd
                        break
                if target_jd:
                    break
            if not target_jd:
                # Check if question mentions a specific role that doesn't exist yet
                inferred_role = _infer_role_title_from_query(question)
                for jd in jds:
                    if inferred_role.lower() in jd.job_title.lower():
                        target_jd = jd
                        break
                if not target_jd:
                    target_jd = jds[0]

        if not target_jd:
            # Auto-create Job Description for this company
            role_title = _infer_role_title_from_query(question)
            skills = (
                ["Python", "FastAPI/Django", "PostgreSQL/SQL", "REST APIs", "Git", "Problem Solving"]
                if "python" in role_title.lower()
                else ["Core Programming", "Database Management", "API Design", "Version Control", "Problem Solving"]
            )
            reqs = {
                "job_title": role_title,
                "skills": skills,
                "experience_years": "1-3 years",
                "education": ["Bachelor's Degree in Computer Science, IT or related technical discipline"],
                "certifications": [],
                "key_responsibilities": [
                    f"Design, build, and maintain high quality services for {role_title} role.",
                    "Collaborate with engineering teams on database integrations and APIs.",
                    "Write robust, testable, and clean code.",
                ],
            }
            target_jd = JobDescription(
                company_id=company_id,
                job_title=role_title,
                raw_jd_text=f"Enterprise hiring requirement for {role_title} with skills in {', '.join(skills)}.",
                extracted_requirements=reqs,
                created_at=datetime.now(timezone.utc),
            )
            db.add(target_jd)
            db.commit()
            db.refresh(target_jd)

        # 2. Retrieve available scans for this company
        scans = (
            db.query(DocumentScan)
            .filter(DocumentScan.company_id == company_id)
            .order_by(DocumentScan.created_at.desc())
            .limit(10)
            .all()
        )
        if not scans:
            return []

        jd_requirements = target_jd.extracted_requirements or {}

        async def _eval_one(s: DocumentScan) -> Optional[CandidateMatch]:
            try:
                candidate_ocr = s.extracted_json or {}
                match_res = await jd_matcher.calculate_candidate_match(
                    jd_requirements=jd_requirements,
                    candidate_ocr_json=candidate_ocr,
                    candidate_id=s.id,
                    filename=s.filename,
                )
                missing = match_res.get("missing_requirements", [])
                gaps_parts = [
                    f"{m.get('requirement', '')}: {m.get('reason', '')}"
                    for m in missing
                    if isinstance(m, dict) and m.get("requirement")
                ]
                gaps_text = "; ".join(gaps_parts) if gaps_parts else match_res.get("recommendation", "")

                cand_name = match_res.get("candidate_name") or "Anonymous Candidate"
                return CandidateMatch(
                    company_id=company_id,
                    job_description_id=target_jd.id,
                    candidate_name=cand_name,
                    document_filename=s.filename,
                    match_score=int(match_res.get("score", 0)),
                    match_category=match_res.get("match_status", "WEAK"),
                    matched_competencies=match_res.get("matched_requirements", []),
                    gaps_count=len(missing),
                    gaps_summary=gaps_text,
                    created_at=datetime.now(timezone.utc),
                )
            except Exception as e:
                logger.warning(f"[chatbot] Auto-evaluate scan {s.id} failed: {e}")
                return None

        tasks = [_eval_one(s) for s in scans]
        evaluated = await asyncio.gather(*tasks)
        created_matches = [m for m in evaluated if m is not None]

        if created_matches:
            db.add_all(created_matches)
            db.commit()
            for m in created_matches:
                db.refresh(m)

            return [
                {
                    "id": m.id,
                    "candidate_name": m.candidate_name,
                    "document_filename": m.document_filename,
                    "match_score": m.match_score,
                    "match_category": m.match_category,
                    "matched_competencies": m.matched_competencies,
                    "gaps_count": m.gaps_count,
                    "gaps_summary": m.gaps_summary,
                    "job_title": target_jd.job_title,
                    "job_description_id": target_jd.id,
                    "created_at": m.created_at,
                }
                for m in sorted(created_matches, key=lambda x: x.match_score, reverse=True)
            ]
    except Exception as exc:
        logger.error(f"[chatbot] Failed in auto-evaluation fallback: {exc}", exc_info=True)
        db.rollback()

    return []


async def _retrieve_candidate_matches(db: Session, company_id: str, question: str) -> List[Dict[str, Any]]:
    """
    Retrieves candidate evaluation data strictly from candidate_matches JOIN job_descriptions
    enforcing tenant isolation (company_id).
    """
    terms = _extract_search_terms(question)
    insp = inspect(db.bind)
    if not insp.has_table("candidate_matches") or not insp.has_table("job_descriptions"):
        return []

    base_sql = """
        SELECT 
            cm.id,
            cm.candidate_name,
            cm.document_filename,
            cm.match_score,
            cm.match_category,
            cm.matched_competencies,
            cm.gaps_count,
            cm.gaps_summary,
            jd.job_title,
            jd.id AS job_description_id,
            cm.created_at
        FROM candidate_matches cm
        JOIN job_descriptions jd ON cm.job_description_id = jd.id
        WHERE cm.company_id = :cid
    """

    filtered_sql = base_sql + """
          AND (
              jd.job_title ILIKE :term
              OR cm.candidate_name ILIKE :term
              OR cm.gaps_summary ILIKE :term
              OR cm.matched_competencies::text ILIKE :term
              OR cm.match_category ILIKE :term
          )
        ORDER BY cm.match_score DESC
        LIMIT 20
    """

    direct_rows = []
    for term in terms:
        if len(term) > 2:
            try:
                rows = db.execute(
                    text(filtered_sql),
                    {"cid": company_id, "term": f"%{term}%"}
                ).mappings().all()
                for r in rows:
                    if r["id"] not in [x["id"] for x in direct_rows]:
                        direct_rows.append(r)
            except Exception as e:
                logger.warning(f"[chatbot] Error querying candidate_matches with term '{term}': {e}")

    # If no term match or general query, get all candidate matches for the tenant
    if not direct_rows:
        try:
            all_rows = db.execute(
                text(base_sql + " ORDER BY cm.match_score DESC LIMIT 20"),
                {"cid": company_id}
            ).mappings().all()
            direct_rows = list(all_rows)
        except Exception as e:
            logger.warning(f"[chatbot] Error querying all candidate_matches: {e}")

    # Auto-evaluation fallback if empty
    if not direct_rows:
        direct_rows = await _auto_evaluate_and_persist_candidate_matches(
            db=db, company_id=company_id, terms=terms, question=question
        )

    formatted_records = []
    for r in direct_rows:
        fname = r.get("document_filename") or "resume.pdf"
        cand_name = r.get("candidate_name") or "Candidate"
        j_title = r.get("job_title") or "Technical Position"
        score = r.get("match_score", 0)
        category = r.get("match_category") or "WEAK"
        competencies = r.get("matched_competencies") or []
        gaps_summary = r.get("gaps_summary") or ""
        gaps_count = r.get("gaps_count", 0)

        extracted_data = {
            "candidate_name": cand_name,
            "job_title": j_title,
            "match_score": f"{score}%",
            "match_category": category,
            "matched_competencies": competencies,
            "gaps_count": gaps_count,
            "gaps_summary": gaps_summary,
            "document_filename": fname,
        }

        formatted_records.append({
            "source_table": "candidate_matches",
            "id": r["id"],
            "file_name": fname,
            "document_name": f"{cand_name} ({j_title} Match: {score}%)",
            "document_type": "CandidateMatchEvaluation",
            "extracted_data": extracted_data,
            "raw_json": extracted_data,
            "created_at": str(r.get("created_at")),
        })

    return formatted_records



# =========================================================
# HELPER: RETRIEVAL FROM POSTGRESQL (SMART UNPACKING & ROUTING)
# =========================================================

async def _retrieve_company_records(db: Session, company_id: str, question: str) -> List[Dict[str, Any]]:
    """
    Search PostgreSQL document scans and extracted documents strictly scoped to company_id.
    """
    terms = _extract_search_terms(question)
    direct_matches: List[Dict[str, Any]] = []
    fallback_records: List[Dict[str, Any]] = []
    seen_keys = set()

    insp = inspect(db.bind)

    # Search & unpack document_scans table
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

    # Search extracted_documents table
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
            "company's workspace. Please make sure documents or job descriptions have been uploaded and processed."
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

    records_json = json.dumps(clean_records, indent=2, default=str, ensure_ascii=False)

    system_prompt = (
        "You are an enterprise document intelligence and AI compliance assistant for DocVerify.\n"
        "You answer questions regarding candidate profiles, job descriptions, match rankings, and extracted document data based ONLY on the "
        "provided RETRIEVED RECORDS below.\n\n"
        "STRICT COMPLIANCE & ANSWERING GUIDELINES:\n"
        "1. Base your answer STRICTLY on the data provided in the RETRIEVED RECORDS.\n"
        "2. CANDIDATE & ROLE MATCH QUERIES (when records are from candidate_matches / CandidateMatchEvaluation):\n"
        "   - Explicitly state the total number of matching candidates found for the requested job role.\n"
        "   - List each candidate with: Candidate Name, Job Title, Match Score (e.g. 85%), Match Category (STRONG, MODERATE, WEAK), and key matched competencies / skills.\n"
        "   - Mention identified gaps or missing requirements if relevant to the query.\n"
        "   - If the user asks in Hindi or Hinglish (e.g., 'Python Developer se related kitne candidates hain?'), answer accurately and politely in matching Hindi/Hinglish or English with the exact count and breakdown.\n"
        "3. DOCUMENT DATA QUERIES (for questions about specific ID or academic document fields):\n"
        "   - Check all corresponding fields and sub-objects within the matching document.\n"
        "   - Always mention the source file and document page/type (e.g., 'In example.pdf (10th Marksheet)...').\n"
        "4. UNICODE & MULTILINGUAL TEXT: Always output Devanagari, Hindi, regional script names, and addresses "
        "directly as real readable UTF-8 characters (e.g. 'जसबीर सिंह'). NEVER output raw unicode escape codes like '\\u091c'.\n"
        "5. If a specific detail or role is genuinely not in the records, state clearly: "
        "'There are no candidate or document records matching that role in your workspace.'\n"
        "6. Do NOT invent, extrapolate, or hallucinate any numbers, names, or values.\n"
        "7. Keep your response clear, structured, and professional."
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

    # 2. Fallback to existing OpenAI-compatible / Qwen LLM with strict 4.0s timeout
    try:
        response = await asyncio.wait_for(
            qwen_client.chat_async(
                prompt=user_prompt,
                system_prompt=system_prompt,
            ),
            timeout=4.0,
        )
        if response and response.strip():
            return _decode_unicode_escapes(response.strip())
    except Exception as exc:
        logger.warning(f"[chatbot] Qwen client call bypassed or timed out ({exc}), falling back to deterministic synthesis.")

    # 3. Grounded Deterministic Fallback Synthesis directly from context records
    cand_records = [r for r in context_records if r.get("source_table") == "candidate_matches"]
    if cand_records:
        role_name = cand_records[0].get("extracted_data", {}).get("job_title", "Requested Role")
        lines = [
            f"Here is the candidate match evaluation list for the **{role_name}** role ({len(cand_records)} candidate(s) evaluated):\n"
        ]
        for i, c in enumerate(cand_records, 1):
            data = c.get("extracted_data", {})
            name = data.get("candidate_name") or "Candidate"
            fname = data.get("document_filename") or c.get("file_name") or "document.pdf"
            score = data.get("match_score", "0%")
            status_val = data.get("match_category", "WEAK")
            skills_val = data.get("matched_competencies", [])
            skills_str = ", ".join([s.get("requirement", str(s)) if isinstance(s, dict) else str(s) for s in skills_val[:4]]) if skills_val else "Core candidate profile"
            gaps = data.get("gaps_summary") or "No critical gaps noted"

            lines.append(f"**{i}. {name}** (`{fname}`)")
            lines.append(f"- **Match Score**: {score} ({status_val})")
            lines.append(f"- **Matched Competencies**: {skills_str}")
            lines.append(f"- **Identified Gaps / Notes**: {gaps}\n")
        return "\n".join(lines)

    doc_lines = ["Based on the retrieved document records in your workspace:\n"]
    for r in context_records[:5]:
        fname = r.get("file_name") or "Document"
        dname = r.get("document_name") or "Details"
        data = r.get("extracted_data") or {}
        doc_lines.append(f"- **{fname} ({dname})**: {json.dumps(data, default=str, ensure_ascii=False)[:180]}")
    return "\n".join(doc_lines)


# =========================================================
# INTENT CLASSIFIER & JD-MATCHING ENGINE FOR CHATBOT
# =========================================================

GREETING_TOKENS = {
    "hi", "hello", "hey", "hola", "namaste", "namaskar", "greetings",
    "good morning", "good afternoon", "good evening", "how are you",
    "what can you do", "who are you", "help", "thank you", "thanks",
    "ok", "okay", "bye", "goodbye", "cool", "great", "start", "menu"
}

def _is_greeting_or_smalltalk(question: str) -> bool:
    """Fast check for greetings, introductions, and casual small talk."""
    q = question.lower().strip()
    # Strip common trailing punctuation
    q_clean = re.sub(r"[?!.,]+$", "", q).strip()
    if q_clean in GREETING_TOKENS:
        return True
    if re.match(r"^(hi|hello|hey|hola|namaste|greetings|good\s+(morning|afternoon|evening))\b", q_clean):
        if len(q_clean.split()) <= 4:
            return True
    return False


async def _classify_query_intent(question: str, company_id: str, db: Session) -> str:
    """
    Classifies the user's message into one of four strictly isolated intents:
    1. "GREETING_CONVERSATIONAL": Plain greetings ("hi", "hello", "thanks", "who are you").
       -> Immediate friendly greeting with zero DB queries and zero LLM scoring.
    2. "NEW_JD_MATCH": Explicit job description text or direct request to score against a new JD.
       -> Requires explicit JD markers or long structured requirement text. Short messages CANNOT trigger this.
    3. "STORED_JD_QUERY": Explicit request to view/retrieve existing rankings for a role or JD ID.
       -> Requires explicit ranking keywords or matching known company JD title with ranking intent.
    4. "DOCUMENT_LOOKUP" (Default): Candidate document data, Aadhaar, PAN, marksheets, certificates,
       addresses, or file OCR queries.
    """
    q_lower = question.lower().strip()

    # Rule 1: Greeting / Smalltalk (Intent D)
    if _is_greeting_or_smalltalk(question):
        return "GREETING_CONVERSATIONAL"

    # Rule 2: Explicit New JD markers (Intent B)
    new_jd_markers = [
        "rank candidates for this jd", "rank candidates for the following jd",
        "match candidates against this jd", "evaluate candidates for this jd",
        "match candidates for this job description", "rank candidates for this job description",
        "here is a job description", "here is the jd", "job description:",
        "key responsibilities:", "requirements:", "skills required:",
        "experience required:", "hiring for:"
    ]
    has_new_jd_marker = any(marker in q_lower for marker in new_jd_markers)

    # Structural check for pasted raw JD text (MUST be > 100 chars and contain multiple requirement sections)
    has_jd_structure = False
    if len(question) > 100:
        jd_structure_count = sum(
            1 for kw in ["skills", "experience", "responsibility", "responsibilities", "qualification", "qualifications", "developer", "engineer", "position", "proficien"]
            if kw in q_lower
        )
        if jd_structure_count >= 3:
            has_jd_structure = True

    # Check for document lookup keywords
    doc_field_keywords = [
        "aadhaar", "aadhar", "pan card", "pan number", "passport", "voter id", "voter card",
        "driving license", "license number", "marksheet", "10th", "12th", "degree certificate",
        "date of birth", "dob", "father", "mother", "pincode", "pin code", "address",
        "extracted fields", "extracted data", "examination", "passing year", "roll number",
        "enrollment", "scanned document", "ocr text", "what is the year of examination"
    ]
    is_doc_field = any(dk in q_lower for dk in doc_field_keywords)

    if (has_new_jd_marker or has_jd_structure) and not (is_doc_field and len(question) < 120):
        return "NEW_JD_MATCH"

    if is_doc_field:
        return "DOCUMENT_LOOKUP"

    # Rule 3: Explicit Stored JD / Ranking Retrieval (Intent C)
    ranking_phrases = [
        "rankings for", "ranking for", "ranked candidates for", "match score for", "match scores for",
        "top match for", "best match for", "show jd ranking", "show rankings for", "show ranking for",
        "candidates for role", "candidates for python", "candidates for react", "candidates for java",
        "candidates for frontend", "candidates for backend", "candidates for full stack",
        "se related kitne candidates", "role ke liye kitne candidates", "kisko hire"
    ]
    is_ranking_query = any(rp in q_lower for rp in ranking_phrases)

    # Check for explicit JD ID reference (e.g. "JD 2", "job description #3")
    has_jd_id_ref = bool(re.search(r"\b(?:jd|job\s*description)\s*#?\s*\d+\b", q_lower))

    if is_ranking_query or has_jd_id_ref:
        return "STORED_JD_QUERY"

    # Check if query matches any stored Job Description title in DB with explicit role enquiry
    try:
        jd_titles = db.execute(
            text("SELECT job_title FROM job_descriptions WHERE company_id = :cid"),
            {"cid": company_id}
        ).scalars().all()
        for title in jd_titles:
            title_words = [w.lower() for w in re.findall(r"[a-z0-9]+", title.lower()) if len(w) > 2]
            if title_words and any(w in q_lower for w in title_words):
                if any(k in q_lower for k in ["score", "rank", "match", "shortlist", "fit", "who", "list"]):
                    return "STORED_JD_QUERY"
    except Exception as e:
        logger.warning(f"[chatbot] Error checking JD titles in classifier: {e}")

    # Safe default: Any other question is strictly a document lookup query
    return "DOCUMENT_LOOKUP"



async def _handle_new_jd_match(
    db: Session,
    company_id: str,
    question: str,
) -> tuple[str, List[SourceReference], int]:
    """
    Handles when a user provides a new JD in chat:
    1. Extracts structured requirements via jd_matcher.extract_jd_requirements.
    2. Duplicate check: checks for existing JD with same title / similar text for this company_id.
       - If exists: updates existing JD record and refreshes rankings.
       - If not: creates a new JobDescription record.
    3. Fetches all candidate DocumentScan records for company_id.
    4. Evaluates & ranks candidates via jd_matcher.rank_and_persist_candidates.
    5. Returns formatted summary with KPIs, ranked candidates, strengths, weaknesses, and source citations.
    """
    # Clean JD text (strip any leading prompt phrases)
    clean_text = re.sub(
        r"^(rank\s+candidates\s+for\s+(?:this\s+)?jd:?|match\s+candidates\s+against\s+(?:this\s+)?jd:?|here\s+is\s+a\s+job\s+description:?|evaluate\s+candidates\s+for:?)\s*",
        "",
        question,
        flags=re.IGNORECASE,
    ).strip()
    if not clean_text or len(clean_text) < 10:
        clean_text = question

    # 1. AI Requirement Extraction
    extracted_reqs = await jd_matcher.extract_jd_requirements(clean_text)
    job_title = extracted_reqs.get("job_title") or "Technical Position"

    # 2. Duplicate JD Handling (Strictly scoped to company_id)
    existing_jds = (
        db.query(JobDescription)
        .filter(JobDescription.company_id == company_id)
        .all()
    )
    target_jd = None
    is_updated = False

    for j in existing_jds:
        # Check exact title match or exact text match
        if (
            j.job_title.strip().lower() == job_title.strip().lower()
            or j.raw_jd_text.strip() == clean_text.strip()
        ):
            target_jd = j
            is_updated = True
            break

    if target_jd:
        # Update existing JD
        target_jd.raw_jd_text = clean_text
        target_jd.extracted_requirements = extracted_reqs
        db.commit()
        db.refresh(target_jd)
    else:
        # Create new JD
        target_jd = JobDescription(
            company_id=company_id,
            job_title=job_title,
            raw_jd_text=clean_text,
            extracted_requirements=extracted_reqs,
        )
        db.add(target_jd)
        db.commit()
        db.refresh(target_jd)

    # 3. Retrieve all candidate scans for this company
    scans = (
        db.query(DocumentScan)
        .filter(DocumentScan.company_id == company_id)
        .order_by(DocumentScan.created_at.desc())
        .all()
    )

    if not scans:
        status_line = (
            f"Updated existing Job Description for **{job_title}** (ID #{target_jd.id})"
            if is_updated
            else f"Saved new Job Description for **{job_title}** (ID #{target_jd.id})"
        )
        skills_str = ", ".join(extracted_reqs.get("skills", [])) or "Technical skills"
        exp_str = extracted_reqs.get("experience_years") or "Not specified"
        answer = (
            f"### 📋 {status_line}\n\n"
            f"**Extracted Requirements:**\n"
            f"- **Required Skills:** {skills_str}\n"
            f"- **Experience:** {exp_str}\n\n"
            f"⚠️ **No candidate resume/document scans are currently uploaded** in your company's workspace (`{company_id}`). "
            f"Please upload candidate documents/resumes first to evaluate candidate fit."
        )
        return answer, [], 0

    # 4. Rank candidates and persist results
    evaluated_candidates, kpis = await jd_matcher.rank_and_persist_candidates(
        db=db,
        company_id=company_id,
        jd=target_jd,
        scans=scans,
    )

    # 5. Build structured response
    status_tag = "Updated & Refreshed" if is_updated else "Analyzed & Ranked"
    skills_list = extracted_reqs.get("skills", [])
    skills_str = ", ".join(skills_list[:6]) if skills_list else "General technical skills"
    exp_str = extracted_reqs.get("experience_years") or "Not specified"
    edu_list = extracted_reqs.get("education", [])
    edu_str = ", ".join(edu_list[:2]) if edu_list else "Technical degree"

    lines = [
        f"### 🎯 Job Description {status_tag}: **{job_title}** (JD #{target_jd.id})\n",
        f"**Key Requirements Identified:**",
        f"- **Skills**: {skills_str}",
        f"- **Experience**: {exp_str}",
        f"- **Education**: {edu_str}\n",
        f"**📊 Executive Ranking Summary ({kpis['total_candidates_analyzed']} Candidates Analyzed):**",
        f"- **Top Match Score**: {kpis['top_match_percentage']}%",
        f"- **Average Match Score**: {kpis['average_match_percentage']}%",
        f"- **Strong Matches (≥75%)**: {kpis['strong_matches_count']}\n",
        "---",
        "### 🏆 Ranked Candidate Suitability:\n"
    ]

    sources: List[SourceReference] = []

    for cand in evaluated_candidates:
        rank = cand.get("rank", 1)
        name = cand.get("candidate_name") or "Anonymous Candidate"
        fname = cand.get("candidate_filename") or "resume.pdf"
        score = cand.get("score", 0)
        status_val = cand.get("match_status", "WEAK")
        recom = cand.get("recommendation") or ""

        # Matched competencies (strengths)
        matched = cand.get("matched_requirements", [])
        matched_str_parts = []
        for m in matched:
            if isinstance(m, dict):
                req = m.get("requirement", "")
                ev = m.get("evidence", "")
                if req and ev:
                    matched_str_parts.append(f"{req} ({ev})")
                elif req:
                    matched_str_parts.append(req)
        strengths = ", ".join(matched_str_parts[:3]) if matched_str_parts else "Basic profile match"

        # Missing requirements (gaps)
        missing = cand.get("missing_requirements", [])
        missing_str_parts = []
        for m in missing:
            if isinstance(m, dict):
                req = m.get("requirement", "")
                reason = m.get("reason", "")
                if req and reason:
                    missing_str_parts.append(f"{req} ({reason})")
                elif req:
                    missing_str_parts.append(req)
        gaps = ", ".join(missing_str_parts[:3]) if missing_str_parts else "None detected"

        lines.append(f"**#{rank}. {name}** (`{fname}`)")
        lines.append(f"- **Match Score**: **{score}%** (`{status_val}`)")
        lines.append(f"- **Strengths**: {strengths}")
        lines.append(f"- **Weaknesses / Gaps**: {gaps}")
        if recom:
            lines.append(f"- **Verdict**: {recom}")
        lines.append("")

        cand_id = cand.get("candidate_id")
        try:
            scan_int_id = int(cand_id) if cand_id and str(cand_id).isdigit() else target_jd.id
        except Exception:
            scan_int_id = target_jd.id

        sources.append(
            SourceReference(
                table="candidate_matches",
                id=scan_int_id,
                file_name=fname,
                document_name=f"{name} ({job_title} Match: {score}%)",
                document_type="CandidateMatchEvaluation",
            )
        )

    lines.append("---")
    lines.append(f"💡 *This JD and candidate rankings are saved in your company workspace. You can re-query anytime by asking 'Show rankings for {job_title}' or 'List scores for JD #{target_jd.id}' without re-uploading.*")

    return "\n".join(lines), sources[:5], len(evaluated_candidates)


async def _handle_stored_jd_query(
    db: Session,
    company_id: str,
    question: str,
) -> tuple[str, List[SourceReference], int]:
    """
    Handles queries requesting stored JD rankings / scores:
    1. Finds matching JobDescription by ID or title for company_id.
    2. Retrieves pre-computed candidate matches from candidate_matches table.
    3. If matches not yet generated, evaluates and persists them.
    4. Returns ranked breakdown with source references.
    """
    q_lower = question.lower()

    # 1. Check for explicit JD ID in question
    id_match = re.search(r"\b(?:jd|job\s*description)\s*#?\s*(\d+)\b", q_lower)
    target_jd = None

    if id_match:
        jd_id = int(id_match.group(1))
        target_jd = (
            db.query(JobDescription)
            .filter(JobDescription.id == jd_id, JobDescription.company_id == company_id)
            .first()
        )

    # 2. Match by title if not found by ID
    if not target_jd:
        jds = (
            db.query(JobDescription)
            .filter(JobDescription.company_id == company_id)
            .order_by(JobDescription.created_at.desc())
            .all()
        )
        if jds:
            for j in jds:
                title_words = [w.lower() for w in re.findall(r"[a-z0-9]+", j.job_title.lower()) if len(w) > 2]
                if title_words and any(w in q_lower for w in title_words):
                    target_jd = j
                    break
            if not target_jd:
                # Default to the most recent JD for this company
                target_jd = jds[0]

    if not target_jd:
        return (
            "No saved Job Descriptions found in your company's workspace. "
            "You can paste a Job Description here in the chat (e.g., 'Rank candidates for: Requirements: Python 3+ years...') "
            "to automatically save it and score all candidates.",
            [],
            0,
        )

    # 3. Retrieve cached candidate matches
    matches = (
        db.query(CandidateMatch)
        .filter(
            CandidateMatch.company_id == company_id,
            CandidateMatch.job_description_id == target_jd.id,
        )
        .order_by(CandidateMatch.match_score.desc())
        .all()
    )

    # If no matches exist for this JD, run evaluation and persist
    if not matches:
        scans = (
            db.query(DocumentScan)
            .filter(DocumentScan.company_id == company_id)
            .order_by(DocumentScan.created_at.desc())
            .all()
        )
        if scans:
            await jd_matcher.rank_and_persist_candidates(
                db=db,
                company_id=company_id,
                jd=target_jd,
                scans=scans,
            )
            matches = (
                db.query(CandidateMatch)
                .filter(
                    CandidateMatch.company_id == company_id,
                    CandidateMatch.job_description_id == target_jd.id,
                )
                .order_by(CandidateMatch.match_score.desc())
                .all()
            )

    if not matches:
        return (
            f"Found Job Description **{target_jd.job_title}** (ID #{target_jd.id}), but no candidate scans are available in your company's workspace to rank.",
            [],
            0,
        )

    # 4. Format stored rankings
    reqs = target_jd.extracted_requirements or {}
    skills_list = reqs.get("skills", [])
    skills_str = ", ".join(skills_list[:6]) if skills_list else "General technical skills"

    lines = [
        f"### 📋 Stored Candidate Rankings for **{target_jd.job_title}** (JD #{target_jd.id})\n",
        f"**Target Requirements:** {skills_str}\n",
        f"**Total Candidates Ranked:** {len(matches)}\n",
        "---",
    ]

    sources: List[SourceReference] = []

    for idx, m in enumerate(matches, start=1):
        name = m.candidate_name or "Anonymous Candidate"
        fname = m.document_filename or "resume.pdf"
        score = m.match_score
        status_val = m.match_category or "WEAK"
        gaps = m.gaps_summary or "No critical gaps recorded"

        comps = m.matched_competencies or []
        comp_parts = []
        for c in comps:
            if isinstance(c, dict):
                req = c.get("requirement") or ""
                ev = c.get("evidence") or ""
                if req and ev:
                    comp_parts.append(f"{req} ({ev})")
                elif req:
                    comp_parts.append(req)
            else:
                comp_parts.append(str(c))
        strengths = ", ".join(comp_parts[:3]) if comp_parts else "Core candidate profile"

        lines.append(f"**#{idx}. {name}** (`{fname}`)")
        lines.append(f"- **Match Score**: **{score}%** (`{status_val}`)")
        lines.append(f"- **Strengths**: {strengths}")
        lines.append(f"- **Gaps / Notes**: {gaps}")
        lines.append("")

        sources.append(
            SourceReference(
                table="candidate_matches",
                id=m.id,
                file_name=fname,
                document_name=f"{name} ({target_jd.job_title} Match: {score}%)",
                document_type="CandidateMatchEvaluation",
            )
        )

    return "\n".join(lines), sources[:5], len(matches)




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
    2. Enforces strict tenant isolation: searches candidate matches or extracted candidate data belonging ONLY to this company.
    3. Detects query intent:
       a. DOCUMENT_LOOKUP (Default / Intent A): grounded document lookup against document_scans & extracted_documents.
       b. NEW_JD_MATCH (Intent B): parses inline/pasted JD, scores company candidates, stores JD & candidate matches.
       c. STORED_JD_QUERY (Intent C): retrieves pre-computed ranking for a stored JD by title/ID without recomputing from scratch.
    4. Persists chat session and messages for full conversation continuity.
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

    # 1. Intent Detection
    intent = await _classify_query_intent(question=clean_question, company_id=company_id, db=db)
    logger.info(f"[chatbot] Query classified as intent '{intent}' for company '{company_id}'")

    if intent == "GREETING_CONVERSATIONAL":
        answer = (
            "Hello! I am your AI Document & Recruitment Assistant for DocVerify.\n\n"
            "Here is what I can help you with:\n"
            "• 📄 **Candidate Document Lookup**: Ask about extracted candidate document data (e.g. *'What is the Aadhaar number of Devendra?'* or *'Show 10th marksheet details'*).\n"
            "• 🎯 **Job Description Matching & Ranking**: Paste a job description (e.g. *'Rank candidates for this JD: ...'*) to automatically score and rank all company candidates.\n"
            "• 📋 **Stored Rankings**: Ask for existing rankings (e.g. *'Show rankings for Python Developer'*).\n\n"
            "How can I assist you today?"
        )
        sources = []
        records_count = 0
    elif intent == "NEW_JD_MATCH":
        answer, sources, records_count = await _handle_new_jd_match(
            db=db, company_id=company_id, question=clean_question
        )
    elif intent == "STORED_JD_QUERY":
        answer, sources, records_count = await _handle_stored_jd_query(
            db=db, company_id=company_id, question=clean_question
        )
    else:
        # Default: DOCUMENT_LOOKUP (Intent A - unchanged existing flow)
        records = await _retrieve_company_records(db=db, company_id=company_id, question=clean_question)
        raw_answer = await _synthesize_rag_answer(question=clean_question, context_records=records)
        answer = _decode_unicode_escapes(raw_answer)
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
        records_count = len(records)

    # 2. Manage Session and Persist Messages to PostgreSQL
    sess_id = payload.session_id.strip() if payload.session_id else None
    session = None
    if sess_id:
        session = db.query(ChatSession).filter(
            ChatSession.session_id == sess_id,
            ChatSession.company_id == company_id,
        ).first()

    if not session:
        sess_id = sess_id or f"sess_{secrets.token_hex(8)}"
        title_text = clean_question[:45] + ("..." if len(clean_question) > 45 else "")
        session = ChatSession(
            session_id=sess_id,
            company_id=company_id,
            title=title_text,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(session)
        db.flush()
    else:
        session.updated_at = datetime.now(timezone.utc)

    # Persist user message
    user_msg = ChatMessage(
        session_id=session.session_id,
        sender="user",
        message_text=clean_question,
        sources=None,
        records_found=0,
        created_at=datetime.now(timezone.utc),
    )
    db.add(user_msg)

    # Persist assistant response
    serialized_sources = [s.model_dump() for s in sources]
    bot_msg = ChatMessage(
        session_id=session.session_id,
        sender="assistant",
        message_text=answer,
        sources=serialized_sources,
        records_found=records_count,
        created_at=datetime.now(timezone.utc),
    )
    db.add(bot_msg)

    try:
        db.commit()
    except Exception as exc:
        logger.error(f"[chatbot] Failed to commit chat history: {exc}")
        db.rollback()

    return ChatQueryResponse(
        answer=answer,
        sources=sources,
        records_found=records_count,
        session_id=session.session_id,
    )



@router.get(
    "/sessions",
    response_model=List[ChatSessionSummary],
    summary="List Company Chat Sessions",
    status_code=status.HTTP_200_OK,
)
def list_chat_sessions(
    limit: int = 50,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> List[ChatSessionSummary]:
    company_id = client.get("company_id") or client.get("sub") or ""
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        sessions = (
            db.query(ChatSession)
            .filter(ChatSession.company_id == company_id)
            .order_by(ChatSession.updated_at.desc())
            .limit(limit)
            .all()
        )
    except Exception as exc:
        logger.error(f"[chatbot] Database error listing chat sessions for '{company_id}': {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while fetching chat sessions: {str(exc)}",
        )

    results = []
    for s in sessions:
        latest = s.messages[-1].message_text if s.messages else None
        results.append(
            ChatSessionSummary(
                session_id=s.session_id,
                title=s.title,
                created_at=s.created_at.isoformat(),
                updated_at=s.updated_at.isoformat(),
                message_count=len(s.messages),
                latest_message=latest,
            )
        )
    return results


@router.get(
    "/sessions/{session_id}",
    response_model=ChatSessionDetail,
    summary="Get Chat Session Message History",
    status_code=status.HTTP_200_OK,
)
def get_session_history(
    session_id: str,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> ChatSessionDetail:
    company_id = client.get("company_id") or client.get("sub") or ""
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        session = (
            db.query(ChatSession)
            .filter(
                ChatSession.session_id == session_id,
                ChatSession.company_id == company_id,
            )
            .first()
        )
    except Exception as exc:
        logger.error(f"[chatbot] Database error retrieving chat session '{session_id}': {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while retrieving chat session: {str(exc)}",
        )

    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    items = [
        ChatMessageItem(
            id=m.id,
            session_id=m.session_id,
            sender=m.sender,
            message_text=m.message_text,
            sources=m.sources,
            records_found=m.records_found,
            created_at=m.created_at.isoformat(),
        )
        for m in session.messages
    ]

    return ChatSessionDetail(
        session_id=session.session_id,
        title=session.title,
        created_at=session.created_at.isoformat(),
        updated_at=session.updated_at.isoformat(),
        messages=items,
    )


@router.delete(
    "/sessions/{session_id}",
    summary="Delete a Chat Session",
    status_code=status.HTTP_200_OK,
)
def delete_chat_session(
    session_id: str,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
):
    company_id = client.get("company_id") or client.get("sub") or ""
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        session = (
            db.query(ChatSession)
            .filter(
                ChatSession.session_id == session_id,
                ChatSession.company_id == company_id,
            )
            .first()
        )
    except Exception as exc:
        logger.error(f"[chatbot] Database error looking up session '{session_id}' for deletion: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while looking up session: {str(exc)}",
        )

    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    try:
        db.delete(session)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error(f"[chatbot] Database error deleting session '{session_id}': {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while deleting session: {str(exc)}",
        )

    return {"status": "deleted", "session_id": session_id}


@router.delete(
    "/history",
    summary="Clear All Chat History for Company",
    status_code=status.HTTP_200_OK,
)
def clear_all_chat_history(
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
):
    company_id = client.get("company_id") or client.get("sub") or ""
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        deleted_count = (
            db.query(ChatSession)
            .filter(ChatSession.company_id == company_id)
            .delete(synchronize_session=False)
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error(f"[chatbot] Database error clearing chat history for '{company_id}': {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while clearing chat history: {str(exc)}",
        )

    return {"status": "cleared", "deleted_sessions": deleted_count}

