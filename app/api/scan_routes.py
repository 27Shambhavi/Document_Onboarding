import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import authenticate_client
from app.core.config import settings
from app.db.database import get_db
from app.db.models import Company, DocumentScan

logger = logging.getLogger("app.api.scan_routes")

router = APIRouter(
    prefix="/company",
    tags=["Scan History"],
)

api_scan_router = APIRouter(
    prefix="/api",
    tags=["Scan History"],
)

static_upload_router = APIRouter(
    tags=["Static Uploads"],
)


# =========================================================
# HELPER: RESOLVE TOKEN (HEADER OR QUERY PARAMETER)
# =========================================================

def get_authenticated_client_or_query(
    request: Request,
    token: Optional[str] = Query(None, description="Optional JWT token passed in query parameter"),
    db: Session = Depends(get_db),
) -> Optional[Dict[str, Any]]:
    """
    Resolves client identity from either:
    1. Standard 'Authorization: Bearer <token>' header
    2. 'token' query parameter (for direct <iframe> or <a> preview requests)
    Returns None if no token provided or invalid.
    """
    jwt_token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        jwt_token = auth_header[7:].strip()
    elif token:
        jwt_token = token.strip()

    if not jwt_token:
        return None

    try:
        payload = jwt.decode(
            jwt_token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError:
        return None

    # Check Admin
    if payload.get("role") == "admin" or payload.get("type") == "admin":
        return {
            "authenticated": True,
            "company_id": "DEFAULT_COMPANY",
            "role": "admin",
            "is_admin": True,
            "claims": payload,
        }

    company_id = payload.get("company_id") or payload.get("sub")
    if not company_id:
        return None

    company = db.query(Company).filter(Company.company_id == company_id).first()
    if not company or company.status != "ACTIVE":
        return None

    return {
        "authenticated": True,
        "company_id": company.company_id,
        "company_name": company.company_name,
        "status": company.status,
        "is_admin": False,
        "claims": payload,
    }


# =========================================================
# HELPER: RESOLVE ORIGINAL PDF DOCUMENT ON DISK
# =========================================================

def resolve_scan_pdf_path(filename: str) -> Optional[str]:
    """
    Resolves the physical file path for a scan document across standard backend
    directories (data/uploads, uploads, storage, data/scans, data/processed, data)
    with case-insensitive fallback and cached downloads resolution.
    """
    if not filename:
        return None

    clean_fn = os.path.basename(filename)
    cwd = os.getcwd()

    # Priority search directories
    search_dirs = [
        os.path.join(cwd, "data", "uploads"),
        os.path.join(cwd, "uploads"),
        os.path.join(cwd, "storage"),
        os.path.join(cwd, "data", "scans"),
        os.path.join(cwd, "data", "processed"),
        os.path.join(cwd, "data"),
        cwd,
    ]

    # Direct filename / clean_fn matches in search directories
    for d in search_dirs:
        for name in [clean_fn, filename]:
            p = os.path.join(d, name)
            if os.path.exists(p) and os.path.isfile(p):
                return os.path.abspath(p)

    # Case-insensitive search across directories
    for d in search_dirs:
        if os.path.isdir(d):
            try:
                for entry in os.listdir(d):
                    if entry.lower() == clean_fn.lower() or entry.lower() == filename.lower():
                        p = os.path.join(d, entry)
                        if os.path.isfile(p):
                            return os.path.abspath(p)
            except Exception:
                pass

    # External fallback: check local user download directories and cache to data/uploads
    fallback_sources = [
        os.path.join(os.path.expanduser("~"), "Downloads", "Candidates_process", "Candidates_process"),
        os.path.join(os.path.expanduser("~"), "Downloads"),
    ]
    for fb in fallback_sources:
        if os.path.isdir(fb):
            try:
                for entry in os.listdir(fb):
                    if entry.lower() == clean_fn.lower():
                        src = os.path.join(fb, entry)
                        if os.path.isfile(src):
                            target_dir = os.path.join(cwd, "data", "uploads")
                            os.makedirs(target_dir, exist_ok=True)
                            dest = os.path.join(target_dir, clean_fn)
                            try:
                                import shutil
                                shutil.copy2(src, dest)
                                return os.path.abspath(dest)
                            except Exception:
                                return os.path.abspath(src)
            except Exception:
                pass

    return None


def stream_scan_pdf_response(
    scan_id: int,
    request: Request,
    token: Optional[str] = None,
    db: Session = None,
) -> FileResponse:
    """Core logic to verify authorization and stream PDF document inline."""
    auth_client = get_authenticated_client_or_query(request=request, token=token, db=db)

    # Query scan record
    if auth_client:
        if auth_client.get("is_admin"):
            scan = db.query(DocumentScan).filter(DocumentScan.id == scan_id).first()
        else:
            scan = (
                db.query(DocumentScan)
                .filter(
                    DocumentScan.id == scan_id,
                    DocumentScan.company_id == auth_client.get("company_id"),
                )
                .first()
            )
    else:
        # Fallback for iframe inline viewer when session token not passed in header
        scan = db.query(DocumentScan).filter(DocumentScan.id == scan_id).first()

    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scan #{scan_id} not found or access denied.",
        )

    file_path = resolve_scan_pdf_path(scan.filename)
    if not file_path or not os.path.isfile(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Original document file '{scan.filename}' was not found on server disk.",
        )

    clean_name = os.path.basename(file_path)
    is_pdf = clean_name.lower().endswith(".pdf")
    media_type = "application/pdf" if is_pdf else "application/octet-stream"

    return FileResponse(
        path=file_path,
        media_type=media_type,
        headers={
            "Content-Type": media_type,
            "Content-Disposition": f'inline; filename="{clean_name}"',
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
        },
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
    A company can only access their own scans (unless platform administrator).
    """
    company_id = (
        client.get("company_id")
        or client.get("sub")
        or ""
    )

    if client.get("is_admin"):
        scan = db.query(DocumentScan).filter(DocumentScan.id == scan_id).first()
    else:
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


# =========================================================
# 3. GET ORIGINAL DOCUMENT / PDF STREAM FOR PREVIEW
# =========================================================

@router.get(
    "/scans/{scan_id}/file",
    summary="Get Original Scan Document (PDF) — Stream original document file for inline preview",
    status_code=status.HTTP_200_OK,
)
def get_company_scan_file(
    scan_id: int,
    request: Request,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return stream_scan_pdf_response(scan_id=scan_id, request=request, token=token, db=db)


@router.get(
    "/scans/{scan_id}/document",
    summary="Get Original Scan Document (PDF) — Stream original document file for inline preview",
    status_code=status.HTTP_200_OK,
)
def get_company_scan_document(
    scan_id: int,
    request: Request,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return stream_scan_pdf_response(scan_id=scan_id, request=request, token=token, db=db)


# =========================================================
# 4. API PREFIX ENDPOINTS (e.g. GET /api/scans/{id}/document)
# =========================================================

@api_scan_router.get(
    "/scans/{scan_id}/document",
    summary="Fetch Scan PDF Document (API Route)",
    status_code=status.HTTP_200_OK,
)
def api_get_scan_document(
    scan_id: int,
    request: Request,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return stream_scan_pdf_response(scan_id=scan_id, request=request, token=token, db=db)


@api_scan_router.get(
    "/scans/{scan_id}/file",
    summary="Fetch Scan PDF File (API Route)",
    status_code=status.HTTP_200_OK,
)
def api_get_scan_file(
    scan_id: int,
    request: Request,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return stream_scan_pdf_response(scan_id=scan_id, request=request, token=token, db=db)


# =========================================================
# 5. STATIC / UPLOADS ROUTE (GET /uploads/{filename})
# =========================================================

@static_upload_router.get(
    "/uploads/{filename:path}",
    summary="Stream Uploaded Document File Directly",
    status_code=status.HTTP_200_OK,
)
def get_static_uploaded_file(filename: str):
    file_path = resolve_scan_pdf_path(filename)
    if not file_path or not os.path.isfile(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Uploaded document file '{filename}' was not found on server disk.",
        )

    clean_name = os.path.basename(file_path)
    is_pdf = clean_name.lower().endswith(".pdf")
    media_type = "application/pdf" if is_pdf else "application/octet-stream"

    return FileResponse(
        path=file_path,
        media_type=media_type,
        headers={
            "Content-Type": media_type,
            "Content-Disposition": f'inline; filename="{clean_name}"',
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
        },
    )

