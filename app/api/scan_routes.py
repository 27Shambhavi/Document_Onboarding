"""
Scan History Routes — Task 1
-----------------------------
GET  /company/scans           → paginated list of all document scans for the authed company
GET  /company/scans/{scan_id} → full extracted_json payload for a single scan (drill-down)
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import authenticate_client
from app.db.database import get_db
from app.db.models import DocumentScan

router = APIRouter(
    prefix="/company",
    tags=["Scan History"],
)


# =========================================================
# RESPONSE SCHEMAS
# =========================================================

class ScanSummary(BaseModel):
    """Lightweight scan row for the history list — excludes the heavy extracted_json."""
    id: int
    company_id: str
    filename: str
    pages_count: int
    cost_inr: float
    created_at: str

    class Config:
        from_attributes = True


class ScanDetail(BaseModel):
    """Full scan record including the raw extracted_json payload."""
    id: int
    company_id: str
    filename: str
    pages_count: int
    extracted_json: Optional[Any]
    cost_inr: float
    created_at: str

    class Config:
        from_attributes = True


# =========================================================
# 1. LIST ALL SCANS FOR THE AUTHENTICATED COMPANY
# =========================================================

@router.get(
    "/scans",
    summary="Retrieve Scan History — All document scans for authenticated company",
    status_code=status.HTTP_200_OK,
)
def get_company_scans(
    limit: int = Query(50, ge=1, le=200, description="Max number of scans to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Returns all document scans for the authenticated company, ordered by
    most-recent first. Excludes the heavy extracted_json for list performance.
    Enforces strict tenant isolation: a company can NEVER view another company's scans.
    """
    company_id = (
        client.get("company_id")
        or client.get("sub")
        or ""
    )

    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not determine company_id from token.",
        )

    # 1. Strict tenant count
    total = (
        db.query(func.count(DocumentScan.id))
        .filter(DocumentScan.company_id == company_id)
        .scalar()
        or 0
    )

    # 2. Strict tenant paginated scan items
    scans = (
        db.query(DocumentScan)
        .filter(DocumentScan.company_id == company_id)
        .order_by(DocumentScan.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    # 3. Strict tenant aggregate KPIs (tenant-wide sum, not just paginated slice)
    total_pages = (
        db.query(func.coalesce(func.sum(DocumentScan.pages_count), 0))
        .filter(DocumentScan.company_id == company_id)
        .scalar()
        or 0
    )
    total_cost = round(
        float(
            db.query(func.coalesce(func.sum(DocumentScan.cost_inr), 0.0))
            .filter(DocumentScan.company_id == company_id)
            .scalar()
            or 0.0
        ),
        2,
    )
    scans_list = []
    for s in scans:
        extracted = s.extracted_json or {}
        has_g = bool(
            extracted.get("guideline")
            or extracted.get("verified_candidates", [{}])[0].get("guideline")
            or extracted.get("grouped_guidelines")
            or extracted.get("rules_by_document")
        )
        scans_list.append({
            "id": s.id,
            "company_id": s.company_id,
            "filename": s.filename,
            "pages_count": s.pages_count,
            "cost_inr": s.cost_inr,
            "has_guidelines": has_g,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })

    return {
        "status": "success",
        "company_id": company_id,
        "total_scans": total,
        "total_pages_scanned": total_pages,
        "total_cost_inr": total_cost,
        "scans": scans_list,
    }


# =========================================================
# 2. SINGLE SCAN DETAIL (WITH FULL extracted_json)
# =========================================================

@router.get(
    "/scans/{scan_id}",
    summary="Get Full Scan Payload — Returns the complete extracted OCR JSON for a scan",
    status_code=status.HTTP_200_OK,
)
def get_scan_detail(
    scan_id: int,
    client: dict = Depends(authenticate_client),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Returns the full DocumentScan record including the extracted_json payload.
    A company can only access their own scans.
    """
    company_id = (
        client.get("company_id")
        or client.get("sub")
        or ""
    )

    scan = (
        db.query(DocumentScan)
        .filter(
            DocumentScan.id == scan_id,
            DocumentScan.company_id == company_id,
        )
        .first()
    )

    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scan #{scan_id} not found or access denied.",
        )

    extracted = scan.extracted_json or {}
    guidelines_data = (
        extracted.get("guideline")
        or extracted.get("verified_candidates", [{}])[0].get("guideline")
        or extracted.get("results", [{}])[0].get("guideline")
        or []
    )
    grouped_data = (
        extracted.get("grouped_guidelines")
        or extracted.get("verified_candidates", [{}])[0].get("grouped_guidelines")
        or {}
    )
    rules_by_doc = (
        extracted.get("rules_by_document")
        or extracted.get("verified_candidates", [{}])[0].get("rules_by_document")
        or {}
    )

    return {
        "id": scan.id,
        "company_id": scan.company_id,
        "filename": scan.filename,
        "pages_count": scan.pages_count,
        "extracted_json": scan.extracted_json,
        "guideline": guidelines_data,
        "grouped_guidelines": grouped_data,
        "rules_by_document": rules_by_doc,
        "has_guidelines": bool(guidelines_data or grouped_data or rules_by_doc),
        "cost_inr": scan.cost_inr,
        "created_at": scan.created_at.isoformat() if scan.created_at else None,
    }
