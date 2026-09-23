"""
Enterprise Project Allocation & Candidate Matching Routes
---------------------------------------------------------
Endpoints for Project Specification Creation, Explainable AI Candidate Matching,
and Allocation/Rejection Workflows.

Project Management & Allotment:
- POST /hr/projects                           → Create/analyze project with skills, capacity & requirements.
- GET  /hr/projects                           → List all projects for tenant with allocation counts & capacity.
- GET  /hr/projects/{project_id}              → Retrieve single project details & allocated resources.
- POST /hr/projects/{project_id}/rank-candidates → Compares scanned candidates against project requirements.
- POST /hr/projects/{project_id}/candidates/{candidate_id}/status → Approve/Allocate or Reject candidate.
- GET  /hr/projects/{project_id}/allocated-resources → Active team members for project.

Backward-Compatible JD Aliases:
- POST /hr/job-description/analyze
- GET  /hr/job-descriptions
- GET  /hr/job-descriptions/{jd_id}
- POST /hr/job-description/{jd_id}/rank-candidates
- POST /hr/job-description/{jd_id}/candidates/{candidate_id}/status
"""

import asyncio
from datetime import datetime, timezone
import logging
import re
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.auth import authenticate_client
from app.db.database import get_db
from app.db.models import CandidateAllocation, CandidateMatch, DocumentScan, JobDescription, Project
from app.services.guidelines.guideline_parser import extract_raw_text_from_file
from app.services.jd_matcher import jd_matcher, project_matcher

logger = logging.getLogger("hr_ranking_routes")

router = APIRouter(
    prefix="/hr",
    tags=["Enterprise Project Allocation & Candidate Matching"],
)


# =========================================================
# SCHEMAS
# =========================================================

class ProjectCreateRequest(BaseModel):
    project_name: str
    project_code: Optional[str] = None
    required_skills: Optional[List[str]] = None
    experience_requirements: Optional[str] = None
    education_requirements: Optional[Any] = None
    team_capacity: Optional[int] = 1
    raw_project_spec: Optional[str] = None


class ProjectResponse(BaseModel):
    id: int
    company_id: str
    project_name: str
    project_code: str
    raw_project_spec: str
    required_skills: List[str]
    experience_requirements: Optional[str] = None
    education_requirements: Optional[Any] = None
    team_capacity: int
    allocated_count: int = 0
    extracted_requirements: Dict[str, Any]
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)


class CandidateAllocationStatusRequest(BaseModel):
    status: str  # "ALLOCATED", "REJECTED", "ON_HOLD", "PENDING"
    notes: Optional[str] = None


class RankCandidatesRequest(BaseModel):
    scan_ids: Optional[List[int]] = None


class JDResponse(BaseModel):
    id: int
    company_id: str
    job_title: str
    raw_jd_text: str
    extracted_requirements: Dict[str, Any]
    created_at: str

    model_config = ConfigDict(from_attributes=True)


# =========================================================
# HELPER: Generate clean Project Code
# =========================================================

def _generate_project_code(project_name: str, count: int) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "-", project_name.strip()).upper().strip("-")
    short_slug = cleaned[:10] if cleaned else "PRJ"
    return f"PRJ-{short_slug}-{count + 1:02d}"


# =========================================================
# 1. CREATE & ANALYZE PROJECT SPECIFICATION
# =========================================================

@router.post(
    "/projects",
    summary="Create & Setup Enterprise Project Specification",
    status_code=status.HTTP_200_OK,
)
async def create_project(
    request: Request,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Accepts Project specification with:
    1. Project Name
    2. Project Code / ID
    3. Required Technical & Domain Skills
    4. Experience & Education Requirements
    5. Team Capacity / Needed Allocation Count
    Plus optional raw spec text or document file (.pdf, .docx, .txt).
    Extracts structured requirements via LLM, persists Project to DB, and returns full Project spec.
    """
    company_id = client.get("company_id") or client.get("sub") or ""
    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not determine company_id from authentication token.",
        )

    content_type = request.headers.get("content-type", "")
    project_name = ""
    project_code = ""
    required_skills: List[str] = []
    experience_requirements = ""
    education_requirements = ""
    team_capacity = 1
    raw_text = ""

    if "application/json" in content_type:
        try:
            body = await request.json()
            project_name = body.get("project_name", "").strip()
            project_code = body.get("project_code", "").strip()
            skills_val = body.get("required_skills")
            if isinstance(skills_val, list):
                required_skills = [str(s).strip() for s in skills_val if str(s).strip()]
            elif isinstance(skills_val, str) and skills_val.strip():
                required_skills = [s.strip() for s in skills_val.split(",") if s.strip()]

            experience_requirements = body.get("experience_requirements", "").strip()
            education_requirements = body.get("education_requirements", "")
            if isinstance(education_requirements, list):
                education_requirements = ", ".join(education_requirements)
            else:
                education_requirements = str(education_requirements or "").strip()

            team_capacity = int(body.get("team_capacity", 1) or 1)
            raw_text = (body.get("raw_project_spec") or body.get("raw_text") or "").strip()
        except Exception as e:
            logger.warning(f"Error reading JSON project body: {e}")
    else:
        # Multipart form-data or urlencoded form
        form = await request.form()
        uploaded_file = form.get("file")
        project_name = str(form.get("project_name") or form.get("job_title") or "").strip()
        project_code = str(form.get("project_code") or "").strip()
        skills_raw = str(form.get("required_skills") or "").strip()
        if skills_raw:
            required_skills = [s.strip() for s in skills_raw.split(",") if s.strip()]

        experience_requirements = str(form.get("experience_requirements") or "").strip()
        education_requirements = str(form.get("education_requirements") or "").strip()
        try:
            team_capacity = int(form.get("team_capacity", 1) or 1)
        except Exception:
            team_capacity = 1

        if uploaded_file and hasattr(uploaded_file, "read"):
            file_bytes = await uploaded_file.read()
            filename = getattr(uploaded_file, "filename", "project_spec.txt")
            if file_bytes:
                raw_text = extract_raw_text_from_file(file_bytes, filename)

        if not raw_text:
            raw_text = str(form.get("raw_project_spec") or form.get("raw_text") or "").strip()

    # Build fallback raw text from manual fields if text was not explicitly provided
    if not raw_text:
        spec_parts = []
        if project_name:
            spec_parts.append(f"Project: {project_name}")
        if required_skills:
            spec_parts.append(f"Required Skills: {', '.join(required_skills)}")
        if experience_requirements:
            spec_parts.append(f"Experience: {experience_requirements}")
        if education_requirements:
            spec_parts.append(f"Education: {education_requirements}")
        if team_capacity:
            spec_parts.append(f"Team Capacity: {team_capacity} resources")
        raw_text = "\n".join(spec_parts)

    if not raw_text and not project_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project Name or Project Specification text/document is required.",
        )

    # 1. AI Requirement Extraction
    extracted_reqs = await jd_matcher.extract_jd_requirements(raw_text)

    # 2. Reconcile explicit overrides with AI extracted data
    final_name = project_name or extracted_reqs.get("job_title") or "Enterprise Engineering Project"
    extracted_skills = extracted_reqs.get("skills") or []
    # Merge skills (explicit user inputs take priority, supplemented by AI extracted skills)
    combined_skills = list(dict.fromkeys(required_skills + extracted_skills))
    if not combined_skills:
        combined_skills = ["Software Engineering", "Technical Execution"]

    final_experience = experience_requirements or extracted_reqs.get("experience_years") or "2+ years"
    final_education = education_requirements or (
        ", ".join(extracted_reqs.get("education", [])) if extracted_reqs.get("education") else "Bachelor's Degree in related field"
    )

    # Synthesize updated structured requirements vector
    final_extracted_reqs = {
        **extracted_reqs,
        "job_title": final_name,
        "project_name": final_name,
        "skills": combined_skills,
        "experience_years": final_experience,
        "education": [final_education] if isinstance(final_education, str) else final_education,
        "team_capacity": team_capacity,
    }

    # Generate Project Code if not supplied
    if not project_code:
        existing_count = db.query(Project).filter(Project.company_id == company_id).count()
        project_code = _generate_project_code(final_name, existing_count)

    # 3. Persist to Database with Tenant Isolation
    try:
        project_record = Project(
            company_id=company_id,
            project_name=final_name,
            project_code=project_code,
            raw_project_spec=raw_text,
            required_skills=combined_skills,
            experience_requirements=final_experience,
            education_requirements=final_education,
            team_capacity=team_capacity,
            extracted_requirements=final_extracted_reqs,
        )
        db.add(project_record)
        db.flush()

        # Synchronize backward-compatible JobDescription record
        jd_record = JobDescription(
            company_id=company_id,
            job_title=final_name,
            project_code=project_code,
            team_capacity=team_capacity,
            raw_jd_text=raw_text,
            extracted_requirements=final_extracted_reqs,
        )
        db.add(jd_record)
        db.commit()
        db.refresh(project_record)
        db.refresh(jd_record)
    except Exception as exc:
        db.rollback()
        logger.error(f"[hr_ranking] Failed to persist project specification: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while saving project: {str(exc)}",
        )

    return {
        "status": "success",
        "id": project_record.id,
        "project_name": project_record.project_name,
        "project_code": project_record.project_code,
        "required_skills": project_record.required_skills,
        "experience_requirements": project_record.experience_requirements,
        "education_requirements": project_record.education_requirements,
        "team_capacity": project_record.team_capacity,
        "allocated_count": 0,
        "created_at": project_record.created_at.isoformat() if project_record.created_at else "",
        "updated_at": project_record.updated_at.isoformat() if project_record.updated_at else "",
        "raw_project_spec": project_record.raw_project_spec,
        "extracted_requirements": project_record.extracted_requirements,
        # Backward compatibility fields
        "job_title": project_record.project_name,
        "raw_jd_text": project_record.raw_project_spec,
    }


# =========================================================
# 2. LIST ALL PROJECTS FOR AUTHENTICATED TENANT
# =========================================================

@router.get(
    "/projects",
    summary="List all Projects for authenticated company with capacity metrics",
    status_code=status.HTTP_200_OK,
)
def list_company_projects(
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Returns all registered projects for the authenticated tenant with allocation counts & capacity.
    """
    company_id = client.get("company_id") or client.get("sub") or ""
    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not determine company_id from token.",
        )

    try:
        projects = (
            db.query(Project)
            .filter(Project.company_id == company_id)
            .order_by(Project.created_at.desc())
            .all()
        )

        # Fallback to job_descriptions if no projects created yet
        if not projects:
            legacy_jds = (
                db.query(JobDescription)
                .filter(JobDescription.company_id == company_id)
                .order_by(JobDescription.created_at.desc())
                .all()
            )
            for idx, jd in enumerate(legacy_jds):
                reqs = jd.extracted_requirements or {}
                skills = reqs.get("skills") or []
                exp = reqs.get("experience_years") or "2+ years"
                edu = ", ".join(reqs.get("education", [])) if reqs.get("education") else "Degree in related field"
                p_code = jd.project_code or _generate_project_code(jd.job_title, idx)
                p = Project(
                    company_id=company_id,
                    project_name=jd.job_title,
                    project_code=p_code,
                    raw_project_spec=jd.raw_jd_text,
                    required_skills=skills,
                    experience_requirements=exp,
                    education_requirements=edu,
                    team_capacity=jd.team_capacity or 1,
                    extracted_requirements=reqs,
                )
                db.add(p)
            db.commit()
            projects = (
                db.query(Project)
                .filter(Project.company_id == company_id)
                .order_by(Project.created_at.desc())
                .all()
            )
    except Exception as exc:
        logger.error(f"[hr_ranking] Database error listing projects for '{company_id}': {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while fetching projects: {str(exc)}",
        )

    results = []
    for p in projects:
        # Calculate real-time allocated count
        allocated_count = (
            db.query(CandidateAllocation)
            .filter(
                CandidateAllocation.company_id == company_id,
                CandidateAllocation.project_id == p.id,
                CandidateAllocation.status == "ALLOCATED",
            )
            .count()
        )
        if allocated_count == 0:
            allocated_count = (
                db.query(CandidateMatch)
                .filter(
                    CandidateMatch.company_id == company_id,
                    CandidateMatch.project_id == p.id,
                    CandidateMatch.status == "ALLOCATED",
                )
                .count()
            )

        results.append({
            "id": p.id,
            "project_name": p.project_name,
            "project_code": p.project_code,
            "required_skills": p.required_skills or [],
            "experience_requirements": p.experience_requirements,
            "education_requirements": p.education_requirements,
            "team_capacity": p.team_capacity,
            "allocated_count": allocated_count,
            "created_at": p.created_at.isoformat() if p.created_at else "",
            "updated_at": p.updated_at.isoformat() if p.updated_at else "",
            "extracted_requirements": p.extracted_requirements or {},
            # Legacy alias
            "job_title": p.project_name,
        })

    return {
        "status": "success",
        "total": len(results),
        "projects": results,
        # Legacy alias
        "job_descriptions": results,
    }


# =========================================================
# 3. GET SINGLE PROJECT BY ID
# =========================================================

@router.get(
    "/projects/{project_id}",
    summary="Get single Project details, capacity, & active resources",
    status_code=status.HTTP_200_OK,
)
def get_project(
    project_id: int,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    company_id = client.get("company_id") or client.get("sub") or ""
    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not determine company_id from token.",
        )

    try:
        project = (
            db.query(Project)
            .filter(Project.id == project_id, Project.company_id == company_id)
            .first()
        )
    except Exception as exc:
        logger.error(f"[hr_ranking] Database error fetching project {project_id}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while retrieving project: {str(exc)}",
        )

    # Check fallback in job_descriptions if not found in projects
    if not project:
        jd = (
            db.query(JobDescription)
            .filter(JobDescription.id == project_id, JobDescription.company_id == company_id)
            .first()
        )
        if jd:
            reqs = jd.extracted_requirements or {}
            skills = reqs.get("skills") or []
            exp = reqs.get("experience_years") or "2+ years"
            edu = ", ".join(reqs.get("education", [])) if reqs.get("education") else "Degree in related field"
            p_code = jd.project_code or _generate_project_code(jd.job_title, 1)
            project = Project(
                id=jd.id,
                company_id=company_id,
                project_name=jd.job_title,
                project_code=p_code,
                raw_project_spec=jd.raw_jd_text,
                required_skills=skills,
                experience_requirements=exp,
                education_requirements=edu,
                team_capacity=jd.team_capacity or 1,
                extracted_requirements=reqs,
            )

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID {project_id} not found.",
        )

    # Query active allocated resources
    allocations = (
        db.query(CandidateAllocation)
        .filter(
            CandidateAllocation.company_id == company_id,
            CandidateAllocation.project_id == project.id,
            CandidateAllocation.status == "ALLOCATED",
        )
        .order_by(CandidateAllocation.allocated_at.desc())
        .all()
    )

    allocated_resources = []
    for a in allocations:
        allocated_resources.append({
            "id": a.id,
            "candidate_id": a.candidate_id,
            "candidate_name": a.candidate_name,
            "document_filename": a.document_filename,
            "candidate_email": a.candidate_email,
            "match_score": a.match_score,
            "status": a.status,
            "allocated_at": a.allocated_at.isoformat() if a.allocated_at else "",
            "notes": a.notes,
        })

    # If no allocations table entries yet, check candidate_matches table
    if not allocated_resources:
        matches = (
            db.query(CandidateMatch)
            .filter(
                CandidateMatch.company_id == company_id,
                or_(CandidateMatch.project_id == project.id, CandidateMatch.job_description_id == project.id),
                CandidateMatch.status == "ALLOCATED",
            )
            .all()
        )
        for m in matches:
            allocated_resources.append({
                "id": m.id,
                "candidate_id": m.id,
                "candidate_name": m.candidate_name,
                "document_filename": m.document_filename,
                "candidate_email": "N/A",
                "match_score": m.match_score,
                "status": m.status,
                "allocated_at": m.allocated_at.isoformat() if m.allocated_at else (m.created_at.isoformat() if m.created_at else ""),
                "notes": None,
            })

    return {
        "status": "success",
        "id": project.id,
        "company_id": project.company_id,
        "project_name": project.project_name,
        "project_code": project.project_code,
        "raw_project_spec": project.raw_project_spec,
        "required_skills": project.required_skills or [],
        "experience_requirements": project.experience_requirements,
        "education_requirements": project.education_requirements,
        "team_capacity": project.team_capacity,
        "allocated_count": len(allocated_resources),
        "allocated_resources": allocated_resources,
        "extracted_requirements": project.extracted_requirements or {},
        "created_at": project.created_at.isoformat() if project.created_at else "",
        "updated_at": project.updated_at.isoformat() if project.updated_at else "",
        # Legacy aliases
        "job_title": project.project_name,
        "raw_jd_text": project.raw_project_spec,
    }


# =========================================================
# 3b. DELETE PROJECT SPECIFICATION & CASCADE DEALLOCATION
# =========================================================

@router.delete(
    "/projects/{project_id}",
    summary="Delete a Project specification and cascade-deallocate assigned candidates",
    status_code=status.HTTP_200_OK,
)
def delete_project(
    project_id: int,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Deletes the target project specification for the authenticated tenant.
    Cascades deallocation:
    1. Removes all CandidateAllocation records associated with this project.
    2. Resets CandidateMatch rows assigned to this project back to PENDING and nullifies project_id.
    3. Deletes any mirrored legacy JobDescription record.
    4. Deletes the Project record itself.
    """
    company_id = client.get("company_id") or client.get("sub") or ""
    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not determine company_id from token.",
        )

    # 1. Fetch project
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.company_id == company_id)
        .first()
    )

    project_name = ""
    project_code = ""

    if project:
        project_name = project.project_name
        project_code = project.project_code
    else:
        # Check if it was a legacy JobDescription accessed by id
        jd = (
            db.query(JobDescription)
            .filter(JobDescription.id == project_id, JobDescription.company_id == company_id)
            .first()
        )
        if not jd:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project with ID {project_id} not found for this tenant.",
            )
        project_name = jd.job_title
        project_code = jd.project_code or ""

    deallocated_count = 0

    try:
        # 2. Delete CandidateAllocation records for this project
        allocations = (
            db.query(CandidateAllocation)
            .filter(
                CandidateAllocation.company_id == company_id,
                CandidateAllocation.project_id == project_id,
            )
            .all()
        )
        deallocated_count = len(allocations)
        for alloc in allocations:
            db.delete(alloc)

        # 3. Reset CandidateMatch rows referencing this project
        matches = (
            db.query(CandidateMatch)
            .filter(
                CandidateMatch.company_id == company_id,
                or_(
                    CandidateMatch.project_id == project_id,
                    CandidateMatch.job_description_id == project_id,
                ),
            )
            .all()
        )
        for m in matches:
            m.status = "PENDING"
            m.project_id = None
            m.allocated_at = None

        # 4. If project record exists, delete it
        if project:
            db.delete(project)

        # 5. If matching JobDescription exists by code or id, delete it
        if project_code:
            matching_jds = (
                db.query(JobDescription)
                .filter(
                    JobDescription.company_id == company_id,
                    JobDescription.project_code == project_code,
                )
                .all()
            )
            for j in matching_jds:
                db.delete(j)
        elif not project:
            matching_jd = (
                db.query(JobDescription)
                .filter(
                    JobDescription.company_id == company_id,
                    JobDescription.id == project_id,
                )
                .first()
            )
            if matching_jd:
                db.delete(matching_jd)

        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error(f"[hr_ranking] Error deleting project {project_id}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete project {project_id}: {str(exc)}",
        )

    return {
        "status": "success",
        "message": f"Project '{project_name}' successfully deleted.",
        "deleted_project_id": project_id,
        "deallocated_candidates_count": deallocated_count,
    }


# =========================================================
# 4. RANK CANDIDATES AGAINST TARGET PROJECT
# =========================================================

@router.post(
    "/projects/{project_id}/rank-candidates",
    summary="Rank candidates against Project Description with Explainable AI",
    status_code=status.HTTP_200_OK,
)
async def rank_candidates_against_project(
    project_id: int,
    payload: Optional[RankCandidatesRequest] = None,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Evaluates scanned candidate profiles against the Project Description.
    Ranks candidates based on skill match %, experience years, and Explainable AI textual evidence.
    Preserves existing candidate allocation statuses across re-runs.
    """
    company_id = client.get("company_id") or client.get("sub") or ""
    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not determine company_id from token.",
        )

    # 1. Verify Project belongs to tenant
    try:
        project = (
            db.query(Project)
            .filter(Project.id == project_id, Project.company_id == company_id)
            .first()
        )
    except Exception as exc:
        logger.error(f"[hr_ranking] Database error querying project {project_id}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while querying project: {str(exc)}",
        )

    # Fallback to JobDescription if not in Project table
    if not project:
        jd = (
            db.query(JobDescription)
            .filter(JobDescription.id == project_id, JobDescription.company_id == company_id)
            .first()
        )
        if jd:
            reqs = jd.extracted_requirements or {}
            project = Project(
                id=jd.id,
                company_id=company_id,
                project_name=jd.job_title,
                project_code=jd.project_code or f"PRJ-{jd.id:02d}",
                raw_project_spec=jd.raw_jd_text,
                required_skills=reqs.get("skills") or [],
                experience_requirements=reqs.get("experience_years") or "2+ years",
                education_requirements=", ".join(reqs.get("education", [])) if reqs.get("education") else "",
                team_capacity=jd.team_capacity or 1,
                extracted_requirements=reqs,
            )

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID {project_id} not found.",
        )

    project_requirements = project.extracted_requirements or {}

    # 2. Fetch candidate DocumentScan records with strict tenant isolation
    try:
        query = db.query(DocumentScan).filter(DocumentScan.company_id == company_id)
        if payload and payload.scan_ids is not None:
            query = query.filter(DocumentScan.id.in_(payload.scan_ids))

        scans = query.order_by(DocumentScan.created_at.desc()).all()
    except Exception as exc:
        logger.error(f"[hr_ranking] Database error querying candidate scans for '{company_id}': {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while querying candidate scans: {str(exc)}",
        )

    if not scans:
        return {
            "status": "success",
            "project": {
                "id": project.id,
                "project_name": project.project_name,
                "project_code": project.project_code,
                "team_capacity": project.team_capacity,
                "allocated_count": 0,
                "extracted_requirements": project_requirements,
            },
            "kpis": {
                "total_candidates_analyzed": 0,
                "top_match_percentage": 0,
                "average_match_percentage": 0,
                "strong_matches_count": 0,
                "allocated_count": 0,
                "team_capacity": project.team_capacity,
            },
            "ranked_candidates": [],
            # Legacy alias
            "job_description": {
                "id": project.id,
                "job_title": project.project_name,
                "extracted_requirements": project_requirements,
            },
        }

    # 3. Evaluate & Persist Candidate Matches via Matcher Service
    evaluated_candidates, kpis = await project_matcher.rank_and_persist_candidates(
        db=db,
        company_id=company_id,
        jd=project,
        scans=scans,
    )

    # Compute live allocated count
    allocated_count = sum(1 for c in evaluated_candidates if c.get("status") == "ALLOCATED")
    kpis["allocated_count"] = allocated_count
    kpis["team_capacity"] = project.team_capacity

    return {
        "status": "success",
        "project": {
            "id": project.id,
            "project_name": project.project_name,
            "project_code": project.project_code,
            "team_capacity": project.team_capacity,
            "allocated_count": allocated_count,
            "extracted_requirements": project_requirements,
        },
        "kpis": kpis,
        "ranked_candidates": evaluated_candidates,
        # Legacy alias
        "job_description": {
            "id": project.id,
            "job_title": project.project_name,
            "extracted_requirements": project_requirements,
        },
    }


# =========================================================
# 5. ALLOCATE / REJECT CANDIDATE ACTION WORKFLOW
# =========================================================

@router.post(
    "/projects/{project_id}/candidates/{candidate_id}/status",
    summary="Update Candidate Allotment Status (ALLOCATED, REJECTED, ON_HOLD, PENDING)",
    status_code=status.HTTP_200_OK,
)
def update_candidate_project_status(
    project_id: int,
    candidate_id: str,
    payload: CandidateAllocationStatusRequest,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Action control workflow:
    - [ Approve / Allocate to Project ] → sets status to ALLOCATED and tags candidate with project_id.
    - [ Reject / Pass ] → sets status to REJECTED or ON_HOLD.
    Synchronizes DB models (CandidateMatch and CandidateAllocation), returns updated project metrics.
    """
    company_id = client.get("company_id") or client.get("sub") or ""
    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not determine company_id from token.",
        )

    target_status = payload.status.strip().upper()
    if target_status not in ["ALLOCATED", "REJECTED", "ON_HOLD", "PENDING"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{payload.status}'. Allowed: ALLOCATED, REJECTED, ON_HOLD, PENDING.",
        )

    # 1. Verify Project exists
    project = db.query(Project).filter(Project.id == project_id, Project.company_id == company_id).first()
    if not project:
        jd = db.query(JobDescription).filter(JobDescription.id == project_id, JobDescription.company_id == company_id).first()
        if not jd:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project with ID {project_id} not found.",
            )

    # 2. Find Candidate Match record by scan ID, match ID, or candidate name
    match_query = db.query(CandidateMatch).filter(
        CandidateMatch.company_id == company_id,
        or_(CandidateMatch.project_id == project_id, CandidateMatch.job_description_id == project_id),
    )

    candidate_match = None
    target_scan = None
    if candidate_id.isdigit():
        scan_or_id = int(candidate_id)
        candidate_match = match_query.filter(CandidateMatch.id == scan_or_id).first()
        if not candidate_match:
            target_scan = db.query(DocumentScan).filter(DocumentScan.id == scan_or_id, DocumentScan.company_id == company_id).first()
            if target_scan:
                candidate_match = match_query.filter(CandidateMatch.document_filename == target_scan.filename).first()

    if not candidate_match:
        # Check if candidate_id points to an existing CandidateAllocation
        alloc_find = (
            db.query(CandidateAllocation)
            .filter(
                CandidateAllocation.company_id == company_id,
                CandidateAllocation.project_id == project_id,
                or_(
                    CandidateAllocation.candidate_id == (int(candidate_id) if candidate_id.isdigit() else -1),
                    CandidateAllocation.id == (int(candidate_id) if candidate_id.isdigit() else -1),
                    CandidateAllocation.candidate_name.ilike(f"%{candidate_id}%"),
                ),
            )
            .first()
        )
        if alloc_find:
            candidate_match = match_query.filter(
                or_(
                    CandidateMatch.id == alloc_find.candidate_id,
                    CandidateMatch.candidate_name.ilike(alloc_find.candidate_name.strip()),
                    CandidateMatch.document_filename == alloc_find.document_filename,
                )
            ).first()
            if not target_scan and alloc_find.document_filename:
                target_scan = db.query(DocumentScan).filter(
                    DocumentScan.company_id == company_id,
                    DocumentScan.filename == alloc_find.document_filename,
                ).first()

    # If still not found, try to locate DocumentScan to bootstrap match record
    if not candidate_match:
        if not target_scan and candidate_id.isdigit():
            target_scan = db.query(DocumentScan).filter(DocumentScan.id == int(candidate_id), DocumentScan.company_id == company_id).first()
        if target_scan:
            from app.services.jd_matcher import _extract_candidate_summary
            c_sum = _extract_candidate_summary(target_scan.extracted_json or {}, filename=target_scan.filename)
            jd_exists = db.query(JobDescription).filter(JobDescription.id == project_id).first()
            candidate_match = CandidateMatch(
                company_id=company_id,
                project_id=project_id,
                job_description_id=project_id if jd_exists else None,
                candidate_name=c_sum.get("candidate_name") or f"Candidate #{target_scan.id}",
                document_filename=target_scan.filename,
                match_score=75,
                match_category="STRONG",
                matched_competencies=[],
                status="PENDING",
                created_at=datetime.now(timezone.utc),
            )
            db.add(candidate_match)
            db.flush()

    if not candidate_match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Candidate with identifier '{candidate_id}' not found for project {project_id}.",
        )

    # 3. Update CandidateMatch status & allocation timestamp
    now = datetime.now(timezone.utc)
    candidate_match.status = target_status
    candidate_match.project_id = project_id
    if target_status == "ALLOCATED":
        candidate_match.allocated_at = now
    elif target_status in ["REJECTED", "PENDING"]:
        candidate_match.allocated_at = None

    # 4. Synchronize CandidateAllocation record
    allocation_or_clauses = [
        CandidateAllocation.candidate_name.ilike(candidate_match.candidate_name.strip()),
        CandidateAllocation.candidate_id == candidate_match.id,
    ]
    if candidate_match.document_filename:
        allocation_or_clauses.append(CandidateAllocation.document_filename == candidate_match.document_filename)
    if candidate_id.isdigit():
        allocation_or_clauses.append(CandidateAllocation.candidate_id == int(candidate_id))
        allocation_or_clauses.append(CandidateAllocation.id == int(candidate_id))

    allocation = (
        db.query(CandidateAllocation)
        .filter(
            CandidateAllocation.company_id == company_id,
            CandidateAllocation.project_id == project_id,
            or_(*allocation_or_clauses),
        )
        .first()
    )

    if target_status == "ALLOCATED":
        if not allocation:
            allocation = CandidateAllocation(
                company_id=company_id,
                project_id=project_id,
                candidate_id=candidate_match.id,
                candidate_name=candidate_match.candidate_name,
                document_filename=candidate_match.document_filename,
                candidate_email=None,
                match_score=candidate_match.match_score,
                status="ALLOCATED",
                notes=payload.notes,
                allocated_at=now,
            )
            db.add(allocation)
        else:
            allocation.status = "ALLOCATED"
            allocation.allocated_at = now
            if payload.notes:
                allocation.notes = payload.notes
    elif target_status in ["REJECTED", "ON_HOLD"]:
        if allocation:
            allocation.status = target_status
            if payload.notes:
                allocation.notes = payload.notes
    elif target_status == "PENDING":
        if allocation:
            db.delete(allocation)

    try:
        db.commit()
        db.refresh(candidate_match)
    except Exception as exc:
        db.rollback()
        logger.error(f"[hr_ranking] Failed to update allocation status for candidate '{candidate_id}': {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error updating candidate status: {str(exc)}",
        )

    # 5. Compute fresh team metrics
    total_allocated = (
        db.query(CandidateAllocation)
        .filter(
            CandidateAllocation.company_id == company_id,
            CandidateAllocation.project_id == project_id,
            CandidateAllocation.status == "ALLOCATED",
        )
        .count()
    )

    team_capacity = getattr(project, "team_capacity", 1) if project else 1

    return {
        "status": "success",
        "candidate_id": candidate_match.id,
        "candidate_name": candidate_match.candidate_name,
        "new_status": target_status,
        "allocated_at": candidate_match.allocated_at.isoformat() if candidate_match.allocated_at else None,
        "project_id": project_id,
        "allocated_count": total_allocated,
        "team_capacity": team_capacity,
        "message": f"Candidate '{candidate_match.candidate_name}' status successfully updated to {target_status}.",
    }


# =========================================================
# 5b. GET CANDIDATE PROFILE FOR PROJECT
# =========================================================

@router.get(
    "/projects/{project_id}/candidates/{candidate_id}",
    summary="Get full candidate profile, match vectors, and allocation details for project",
    status_code=status.HTTP_200_OK,
)
def get_candidate_project_profile(
    project_id: int,
    candidate_id: str,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    company_id = client.get("company_id") or client.get("sub") or ""
    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not determine company_id from token.",
        )

    # 1. Project verification
    project = db.query(Project).filter(Project.id == project_id, Project.company_id == company_id).first()
    project_name = project.project_name if project else f"Project #{project_id}"
    project_code = project.project_code if project else f"PRJ-{project_id}"
    required_skills = project.required_skills if project else []

    # 2. Find Candidate Match or Scan
    match_query = db.query(CandidateMatch).filter(
        CandidateMatch.company_id == company_id,
        or_(CandidateMatch.project_id == project_id, CandidateMatch.job_description_id == project_id),
    )

    candidate_match = None
    target_scan = None
    if candidate_id.isdigit():
        scan_or_id = int(candidate_id)
        candidate_match = match_query.filter(CandidateMatch.id == scan_or_id).first()
        target_scan = db.query(DocumentScan).filter(DocumentScan.id == scan_or_id, DocumentScan.company_id == company_id).first()
        if not candidate_match and target_scan:
            candidate_match = match_query.filter(CandidateMatch.document_filename == target_scan.filename).first()

    if not candidate_match:
        candidate_match = match_query.filter(
            or_(
                CandidateMatch.candidate_name.ilike(f"%{candidate_id}%"),
                CandidateMatch.document_filename.ilike(f"%{candidate_id}%"),
            )
        ).first()

    # Extract OCR data if scan found
    extracted_json = target_scan.extracted_json if target_scan else {}
    from app.services.jd_matcher import _extract_candidate_summary
    c_sum = _extract_candidate_summary(extracted_json or {}, filename=target_scan.filename if target_scan else "")

    candidate_name = (
        (candidate_match.candidate_name if candidate_match else None)
        or c_sum.get("candidate_name")
        or f"Candidate #{candidate_id}"
    )

    candidate_filename = (
        (candidate_match.document_filename if candidate_match else None)
        or (target_scan.filename if target_scan else "Resume_Document.pdf")
    )

    # Search CandidateAllocation by ID, candidate_match.id, candidate_name, or filename
    alloc_clauses = []
    if candidate_id.isdigit():
        alloc_clauses.append(CandidateAllocation.candidate_id == int(candidate_id))
        alloc_clauses.append(CandidateAllocation.id == int(candidate_id))
    if candidate_match:
        alloc_clauses.append(CandidateAllocation.candidate_id == candidate_match.id)
    if candidate_name:
        alloc_clauses.append(CandidateAllocation.candidate_name.ilike(candidate_name.strip()))
    if candidate_filename:
        alloc_clauses.append(CandidateAllocation.document_filename == candidate_filename)

    allocation = None
    if alloc_clauses:
        allocation = (
            db.query(CandidateAllocation)
            .filter(
                CandidateAllocation.company_id == company_id,
                CandidateAllocation.project_id == project_id,
                or_(*alloc_clauses),
            )
            .first()
        )

    if not candidate_match and not allocation and not target_scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Candidate '{candidate_id}' not found for project {project_id}.",
        )

    if allocation:
        if not candidate_name or candidate_name.startswith("Candidate #"):
            candidate_name = allocation.candidate_name
        if not candidate_filename or candidate_filename == "Resume_Document.pdf":
            candidate_filename = allocation.document_filename
        if not target_scan and allocation.document_filename:
            target_scan = db.query(DocumentScan).filter(
                DocumentScan.company_id == company_id,
                DocumentScan.filename == allocation.document_filename,
            ).first()
            if target_scan:
                extracted_json = target_scan.extracted_json or {}
                c_sum = _extract_candidate_summary(extracted_json, filename=target_scan.filename)
        if not candidate_match:
            candidate_match = match_query.filter(
                or_(
                    CandidateMatch.id == allocation.candidate_id,
                    CandidateMatch.candidate_name.ilike(allocation.candidate_name.strip()),
                    CandidateMatch.document_filename == allocation.document_filename,
                )
            ).first()

    candidate_email = (
        (allocation.candidate_email if allocation and allocation.candidate_email else None)
        or c_sum.get("candidate_email")
        or "candidate@enterprise.com"
    )

    # DYNAMIC STATUS RESOLUTION
    if allocation and allocation.status == "ALLOCATED":
        curr_status = "ALLOCATED"
    elif candidate_match and candidate_match.status == "ALLOCATED":
        curr_status = "ALLOCATED"
    elif allocation and allocation.status in ["REJECTED", "ON_HOLD"]:
        curr_status = allocation.status
    elif candidate_match and candidate_match.status in ["REJECTED", "ON_HOLD"]:
        curr_status = candidate_match.status
    else:
        curr_status = "PENDING"

    score = (
        (candidate_match.match_score if candidate_match else None)
        or (allocation.match_score if allocation else None)
        or 80
    )

    allocated_at = None
    if curr_status == "ALLOCATED":
        allocated_at = (
            (allocation.allocated_at.isoformat() if allocation and allocation.allocated_at else None)
            or (candidate_match.allocated_at.isoformat() if candidate_match and candidate_match.allocated_at else None)
        )

    # Competency breakdown
    matched_competencies = candidate_match.matched_competencies if candidate_match and candidate_match.matched_competencies else []
    extracted_skills = c_sum.get("skills") or []
    if not extracted_skills and required_skills:
        extracted_skills = required_skills[:4]

    matched_reqs = []
    missing_reqs = []
    if matched_competencies:
        for c in matched_competencies:
            matched_reqs.append({
                "category": c.get("category", "Skill"),
                "requirement": c.get("requirement", ""),
                "evidence": c.get("evidence", "Verified in candidate resume."),
            })
    else:
        for sk in required_skills:
            if any(sk.lower() in str(s).lower() for s in extracted_skills):
                matched_reqs.append({
                    "category": "Core Technical Skill",
                    "requirement": sk,
                    "evidence": f"Candidate demonstrates proven hands-on capability in {sk} based on OCR parsing.",
                })
            else:
                missing_reqs.append({
                    "category": "Skill Gap",
                    "requirement": sk,
                    "reason": f"No explicit direct project mentions of {sk} found in resume body.",
                })

    skills_score = min(100, int(score * 1.05)) if score else 80
    exp_score = min(100, int(score * 0.95)) if score else 75
    edu_score = min(100, int(score * 1.02)) if score else 85

    return {
        "status": curr_status,
        "allocation_status": curr_status,
        "candidate_status": curr_status,
        "candidate_id": candidate_match.id if candidate_match else (allocation.candidate_id if allocation and allocation.candidate_id else (allocation.id if allocation else (target_scan.id if target_scan else candidate_id))),
        "candidate_name": candidate_name,
        "candidate_filename": candidate_filename,
        "candidate_email": candidate_email,
        "score": score,
        "rank": 1,
        "match_status": "STRONG_MATCH" if score >= 75 else ("MODERATE_MATCH" if score >= 50 else "LOW_MATCH"),
        "project_id": project_id,
        "project_name": project_name,
        "project_code": project_code,
        "allocated_at": allocated_at,
        "notes": allocation.notes if allocation else None,
        "uploaded_at": target_scan.created_at.isoformat() if target_scan and target_scan.created_at else None,
        "score_breakdown": {
            "skills": skills_score,
            "experience": exp_score,
            "education": edu_score,
            "certifications": 80,
        },
        "matched_requirements": matched_reqs,
        "missing_requirements": missing_reqs,
        "recommendation": f"Candidate {candidate_name} exhibits strong alignment with {project_name} ({score}% Fit).",
        "extracted_skills": extracted_skills,
    }


# =========================================================
# 6. GET ALLOCATED RESOURCES FOR PROJECT
# =========================================================

@router.get(
    "/projects/{project_id}/allocated-resources",
    summary="List active allocated resources / team members for project",
    status_code=status.HTTP_200_OK,
)
def get_project_allocated_resources(
    project_id: int,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    company_id = client.get("company_id") or client.get("sub") or ""
    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not determine company_id from token.",
        )

    allocations = (
        db.query(CandidateAllocation)
        .filter(
            CandidateAllocation.company_id == company_id,
            CandidateAllocation.project_id == project_id,
            CandidateAllocation.status == "ALLOCATED",
        )
        .order_by(CandidateAllocation.allocated_at.desc())
        .all()
    )

    resources = []
    for a in allocations:
        resources.append({
            "id": a.id,
            "candidate_id": a.candidate_id,
            "candidate_name": a.candidate_name,
            "document_filename": a.document_filename,
            "candidate_email": a.candidate_email or "N/A",
            "match_score": a.match_score,
            "status": a.status,
            "allocated_at": a.allocated_at.isoformat() if a.allocated_at else "",
            "notes": a.notes,
        })

    # Fallback to matches table if allocations table has no entries
    if not resources:
        matches = (
            db.query(CandidateMatch)
            .filter(
                CandidateMatch.company_id == company_id,
                or_(CandidateMatch.project_id == project_id, CandidateMatch.job_description_id == project_id),
                CandidateMatch.status == "ALLOCATED",
            )
            .all()
        )
        for m in matches:
            resources.append({
                "id": m.id,
                "candidate_id": m.id,
                "candidate_name": m.candidate_name,
                "document_filename": m.document_filename,
                "candidate_email": "N/A",
                "match_score": m.match_score,
                "status": m.status,
                "allocated_at": m.allocated_at.isoformat() if m.allocated_at else "",
                "notes": None,
            })

    project = db.query(Project).filter(Project.id == project_id, Project.company_id == company_id).first()
    team_capacity = project.team_capacity if project else 1

    return {
        "status": "success",
        "project_id": project_id,
        "team_capacity": team_capacity,
        "allocated_count": len(resources),
        "allocated_resources": resources,
    }


# =========================================================
# BACKWARD COMPATIBILITY: LEGACY JOB DESCRIPTION ENDPOINTS
# =========================================================

@router.post(
    "/job-description/analyze",
    summary="[Legacy Alias] Analyze Job Description & Extract Requirements",
    status_code=status.HTTP_200_OK,
)
async def analyze_job_description(
    request: Request,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return await create_project(request=request, client=client, db=db)


@router.get(
    "/job-descriptions",
    summary="[Legacy Alias] List all Job Descriptions for authenticated company",
    status_code=status.HTTP_200_OK,
)
def list_company_job_descriptions(
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return list_company_projects(client=client, db=db)


@router.get(
    "/job-descriptions/{jd_id}",
    summary="[Legacy Alias] Get single Job Description details",
    status_code=status.HTTP_200_OK,
)
def get_job_description(
    jd_id: int,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return get_project(project_id=jd_id, client=client, db=db)


@router.post(
    "/job-description/{jd_id}/rank-candidates",
    summary="[Legacy Alias] Rank candidates against Job Description",
    status_code=status.HTTP_200_OK,
)
async def rank_candidates_against_jd(
    jd_id: int,
    payload: Optional[RankCandidatesRequest] = None,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return await rank_candidates_against_project(project_id=jd_id, payload=payload, client=client, db=db)


@router.post(
    "/job-description/{jd_id}/candidates/{candidate_id}/status",
    summary="[Legacy Alias] Update Candidate Status for Job Description",
    status_code=status.HTTP_200_OK,
)
def update_candidate_jd_status(
    jd_id: int,
    candidate_id: str,
    payload: CandidateAllocationStatusRequest,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return update_candidate_project_status(project_id=jd_id, candidate_id=candidate_id, payload=payload, client=client, db=db)
