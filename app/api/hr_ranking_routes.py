"""
AI Candidate Ranking & JD Match Routes
--------------------------------------
Endpoints:
- POST /hr/job-description/analyze          → Parses JD (text or file upload), extracts structured requirements, persists to DB.
- GET  /hr/job-descriptions                 → Lists all JDs saved for the authenticated company.
- GET  /hr/job-descriptions/{jd_id}         → Retrieves single JD detail.
- POST /hr/job-description/{jd_id}/rank-candidates → Compares all company candidate scans against JD requirements,
                                                      returns ranked candidates with Explainable AI proofs & KPIs.
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.auth import authenticate_client
from app.db.database import get_db
from app.db.models import DocumentScan, JobDescription
from app.services.guidelines.guideline_parser import extract_raw_text_from_file
from app.services.jd_matcher import jd_matcher

logger = logging.getLogger("hr_ranking_routes")

router = APIRouter(
    prefix="/hr",
    tags=["AI Candidate Ranking & JD Match"],
)


# =========================================================
# SCHEMAS
# =========================================================

class JDResponse(BaseModel):
    id: int
    company_id: str
    job_title: str
    raw_jd_text: str
    extracted_requirements: Dict[str, Any]
    created_at: str

    model_config = ConfigDict(from_attributes=True)


class RankCandidatesRequest(BaseModel):
    scan_ids: Optional[List[int]] = None


# =========================================================
# 1. ANALYZE & PERSIST JOB DESCRIPTION
# =========================================================

@router.post(
    "/job-description/analyze",
    summary="Analyze Job Description & Extract Requirements",
    status_code=status.HTTP_200_OK,
)
async def analyze_job_description(
    request: Request,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Accepts raw JD text or uploaded file (.pdf, .docx, .txt).
    Extracts structured requirements via LLM, persists the JD to PostgreSQL,
    and returns the structured requirement schema.
    """
    company_id = client.get("company_id") or client.get("sub") or ""
    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not determine company_id from authentication token.",
        )

    content_type = request.headers.get("content-type", "")
    raw_text = ""
    job_title_override = ""

    if "application/json" in content_type:
        try:
            body = await request.json()
            raw_text = body.get("raw_text", "").strip()
            job_title_override = body.get("job_title", "").strip()
        except Exception as e:
            logger.warning(f"Error reading JSON body: {e}")
            raw_text = ""
    else:
        # Multipart form-data or urlencoded form
        form = await request.form()
        uploaded_file = form.get("file")
        text_field = form.get("raw_text")
        title_field = form.get("job_title")

        if title_field and isinstance(title_field, str):
            job_title_override = title_field.strip()

        if uploaded_file and hasattr(uploaded_file, "read"):
            file_bytes = await uploaded_file.read()
            filename = getattr(uploaded_file, "filename", "document.txt")
            if file_bytes:
                raw_text = extract_raw_text_from_file(file_bytes, filename)

        if not raw_text and text_field and isinstance(text_field, str):
            raw_text = text_field.strip()

    if not raw_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job description text or valid document file (.pdf, .docx, .txt) is required.",
        )

    # 1. AI Requirement Extraction
    extracted_reqs = await jd_matcher.extract_jd_requirements(raw_text)

    # 2. Determine Title
    final_title = job_title_override or extracted_reqs.get("job_title") or "Technical Position"

    # 3. Persist to Database with Tenant Isolation
    jd_record = JobDescription(
        company_id=company_id,
        job_title=final_title,
        raw_jd_text=raw_text,
        extracted_requirements=extracted_reqs,
    )
    db.add(jd_record)
    db.commit()
    db.refresh(jd_record)

    return {
        "status": "success",
        "id": jd_record.id,
        "job_title": jd_record.job_title,
        "created_at": jd_record.created_at.isoformat() if jd_record.created_at else "",
        "raw_jd_text": jd_record.raw_jd_text,
        "extracted_requirements": jd_record.extracted_requirements,
    }


# =========================================================
# 2. LIST ALL JDs FOR AUTHENTICATED TENANT
# =========================================================

@router.get(
    "/job-descriptions",
    summary="List all Job Descriptions for authenticated company",
    status_code=status.HTTP_200_OK,
)
def list_company_job_descriptions(
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Returns all registered job descriptions for the authenticated tenant.
    """
    company_id = client.get("company_id") or client.get("sub") or ""
    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not determine company_id from token.",
        )

    jds = (
        db.query(JobDescription)
        .filter(JobDescription.company_id == company_id)
        .order_by(JobDescription.created_at.desc())
        .all()
    )

    results = []
    for jd in jds:
        results.append({
            "id": jd.id,
            "job_title": jd.job_title,
            "created_at": jd.created_at.isoformat() if jd.created_at else "",
            "extracted_requirements": jd.extracted_requirements,
        })

    return {
        "status": "success",
        "total": len(results),
        "job_descriptions": results,
    }


# =========================================================
# 3. GET SINGLE JD BY ID
# =========================================================

@router.get(
    "/job-descriptions/{jd_id}",
    summary="Get single Job Description details",
    status_code=status.HTTP_200_OK,
)
def get_job_description(
    jd_id: int,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    company_id = client.get("company_id") or client.get("sub") or ""
    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not determine company_id from token.",
        )

    jd = (
        db.query(JobDescription)
        .filter(JobDescription.id == jd_id, JobDescription.company_id == company_id)
        .first()
    )
    if not jd:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job Description with ID {jd_id} not found.",
        )

    return {
        "status": "success",
        "id": jd.id,
        "company_id": jd.company_id,
        "job_title": jd.job_title,
        "raw_jd_text": jd.raw_jd_text,
        "extracted_requirements": jd.extracted_requirements,
        "created_at": jd.created_at.isoformat() if jd.created_at else "",
    }


# =========================================================
# 4. RANK CANDIDATES AGAINST TARGET JD
# =========================================================

@router.post(
    "/job-description/{jd_id}/rank-candidates",
    summary="Rank candidates against Job Description with Explainable AI",
    status_code=status.HTTP_200_OK,
)
async def rank_candidates_against_jd(
    jd_id: int,
    payload: Optional[RankCandidatesRequest] = None,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Fetches candidate DocumentScan records for this company (optionally filtered by scan_ids),
    runs the Explainable AI matching engine against the specified Job Description requirements,
    and returns ranked candidates with evidence breakdowns and high-level KPIs.
    Gracefully falls back to a 0% match without crashing if a document is non-resume or corrupt.
    """
    company_id = client.get("company_id") or client.get("sub") or ""
    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not determine company_id from token.",
        )

    # 1. Verify JD belongs to tenant
    jd = (
        db.query(JobDescription)
        .filter(JobDescription.id == jd_id, JobDescription.company_id == company_id)
        .first()
    )
    if not jd:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job Description with ID {jd_id} not found.",
        )

    jd_requirements = jd.extracted_requirements or {}

    # 2. Fetch candidate DocumentScan records with strict tenant isolation and optional selective scan_ids
    query = db.query(DocumentScan).filter(DocumentScan.company_id == company_id)
    if payload and payload.scan_ids is not None:
        query = query.filter(DocumentScan.id.in_(payload.scan_ids))

    scans = query.order_by(DocumentScan.created_at.desc()).all()

    if not scans:
        return {
            "status": "success",
            "job_description": {
                "id": jd.id,
                "job_title": jd.job_title,
                "extracted_requirements": jd_requirements,
            },
            "kpis": {
                "total_candidates_analyzed": 0,
                "top_match_percentage": 0,
                "average_match_percentage": 0,
                "strong_matches_count": 0,
            },
            "ranked_candidates": [],
        }

    # 3. Concurrency-limited matching evaluation with graceful degradation
    semaphore = asyncio.Semaphore(5)

    async def _evaluate_scan(scan: DocumentScan):
        async with semaphore:
            try:
                candidate_ocr = scan.extracted_json or {}
                match_res = await jd_matcher.calculate_candidate_match(
                    jd_requirements=jd_requirements,
                    candidate_ocr_json=candidate_ocr,
                    candidate_id=scan.id,
                    filename=scan.filename,
                )
                # Add scan created_at for frontend timeline display
                match_res["uploaded_at"] = scan.created_at.isoformat() if scan.created_at else ""
                return match_res
            except Exception as e:
                logger.warning(
                    f"[RANK SCAN ERROR] Gracefully degrading scan ID {scan.id} ('{scan.filename}'): {e}"
                )
                return {
                    "candidate_id": str(scan.id),
                    "candidate_name": f"Document #{scan.id}",
                    "candidate_filename": scan.filename,
                    "candidate_email": "N/A",
                    "score": 0,
                    "rank": 0,
                    "match_status": "WEAK",
                    "score_breakdown": {
                        "skills": 0,
                        "experience": 0,
                        "education": 0,
                        "certifications": 0,
                    },
                    "matched_requirements": [],
                    "missing_requirements": [
                        {
                            "category": "All",
                            "requirement": "Resume Data",
                            "reason": "No relevant professional data found in document.",
                        }
                    ],
                    "recommendation": "Document does not appear to be a relevant resume. Zero match.",
                    "extracted_skills": [],
                    "uploaded_at": scan.created_at.isoformat() if scan.created_at else "",
                }

    tasks = [_evaluate_scan(s) for s in scans]
    evaluated_candidates = await asyncio.gather(*tasks)

    # 4. Sort candidates descending by match score
    evaluated_candidates.sort(key=lambda x: x.get("score", 0), reverse=True)

    # 5. Assign explicit ranks (#1, #2, ...)
    for idx, cand in enumerate(evaluated_candidates, start=1):
        cand["rank"] = idx

    # 6. Compute executive KPIs
    total_candidates = len(evaluated_candidates)
    top_match = evaluated_candidates[0]["score"] if total_candidates > 0 else 0
    avg_match = (
        round(sum(c["score"] for c in evaluated_candidates) / total_candidates, 1)
        if total_candidates > 0
        else 0
    )
    strong_count = sum(1 for c in evaluated_candidates if c["score"] >= 75)

    return {
        "status": "success",
        "job_description": {
            "id": jd.id,
            "job_title": jd.job_title,
            "extracted_requirements": jd_requirements,
        },
        "kpis": {
            "total_candidates_analyzed": total_candidates,
            "top_match_percentage": top_match,
            "average_match_percentage": avg_match,
            "strong_matches_count": strong_count,
        },
        "ranked_candidates": evaluated_candidates,
    }
