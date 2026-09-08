from datetime import datetime, timedelta, timezone
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.admin_auth import (
    authenticate_admin,
    create_admin_access_token,
    verify_password,
)
from app.core.config import settings
from app.db.database import get_db
from app.db.models import Admin, Company, DocumentScan, InviteToken
from app.models.billing import storage_manager
from app.schemas.admin import (
    AdminLoginRequest,
    AdminLoginResponse,
)
from app.schemas.company_auth import GenerateTokenResponse

router = APIRouter(
    prefix="/admin",
    tags=["Admin Panel"],
)


# =========================================================
# 1. ADMIN LOGIN
# =========================================================

@router.post(
    "/login",
    response_model=AdminLoginResponse,
)
def admin_login(
    payload: AdminLoginRequest,
    db: Session = Depends(get_db),
):
    """
    Authenticate an admin using email and password
    and return an admin JWT.
    """
    admin = (
        db.query(Admin)
        .filter(Admin.email == payload.email)
        .first()
    )

    if not admin:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    if not admin.is_active:
        raise HTTPException(
            status_code=403,
            detail="Admin account is inactive",
        )

    if not verify_password(
        payload.password,
        admin.password_hash,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    token = create_admin_access_token(admin)

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": admin.role,
    }


# =========================================================
# 2. GENERATE ONE-TIME INVITE TOKEN FOR COMPANY
# =========================================================

@router.post(
    "/tokens/generate",
    response_model=GenerateTokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate One-Time Company Registration Token",
)
def generate_invite_token(
    admin: dict = Depends(authenticate_admin),
    db: Session = Depends(get_db),
):
    """
    Generates a unique, single-use registration passkey.
    Admin copies this token and provides it to the company.
    Requires no input payload.
    """
    unique_key = f"INVITE-{secrets.token_hex(16).upper()}"
    expiry_time = datetime.now(timezone.utc) + timedelta(hours=48)

    new_token = InviteToken(
        token=unique_key,
        is_used=False,
        expires_at=expiry_time,
        created_at=datetime.now(timezone.utc),
    )
    db.add(new_token)
    db.commit()
    db.refresh(new_token)

    return GenerateTokenResponse(
        status="success",
        token=new_token.token,
        expires_at=new_token.expires_at,
        message="One-time registration token generated successfully. Valid for 48 hours.",
    )


# =========================================================
# 3. GET ALL COMPANIES
# =========================================================

@router.get("/companies")
def get_companies(
    admin: dict = Depends(authenticate_admin),
    db: Session = Depends(get_db),
):
    """
    Return all registered companies.
    Admin authentication required.
    """
    companies = (
        db.query(Company)
        .order_by(Company.created_at.desc())
        .all()
    )

    return {
        "total": len(companies),
        "companies": [
            {
                "company_id": company.company_id,
                "company_name": company.company_name,
                "email": company.email,
                "status": company.status,
                "is_active": (company.status == "ACTIVE"),
                "created_at": company.created_at,
                "approved_at": company.approved_at,
                "approved_by": company.approved_by,
            }
            for company in companies
        ],
    }


# =========================================================
# 4. APPROVE COMPANY
# =========================================================

@router.post("/companies/{company_id}/approve")
def approve_company(
    company_id: str,
    admin: dict = Depends(authenticate_admin),
    db: Session = Depends(get_db),
):
    """
    Approve a pending company.
    """
    company = (
        db.query(Company)
        .filter(Company.company_id == company_id)
        .first()
    )

    if not company:
        raise HTTPException(
            status_code=404,
            detail="Company not found",
        )

    if company.status == "ACTIVE":
        return {
            "message": "Company is already approved",
            "company_id": company.company_id,
            "status": company.status,
            "is_active": True,
            "approved_at": company.approved_at,
            "approved_by": company.approved_by,
        }

    company.status = "ACTIVE"
    company.is_active = True
    company.approved_at = datetime.now(timezone.utc)
    company.approved_by = admin["admin_id"]

    db.commit()
    db.refresh(company)

    return {
        "message": "Company approved successfully",
        "company_id": company.company_id,
        "status": company.status,
        "is_active": True,
        "approved_at": company.approved_at,
        "approved_by": company.approved_by,
    }


# =========================================================
# 5. REJECT COMPANY
# =========================================================

@router.post("/companies/{company_id}/reject")
def reject_company(
    company_id: str,
    admin: dict = Depends(authenticate_admin),
    db: Session = Depends(get_db),
):
    """
    Reject a company application.
    """
    company = (
        db.query(Company)
        .filter(Company.company_id == company_id)
        .first()
    )

    if not company:
        raise HTTPException(
            status_code=404,
            detail="Company not found",
        )

    company.status = "REJECTED"
    company.is_active = False
    company.approved_at = None
    company.approved_by = None

    db.commit()
    db.refresh(company)

    return {
        "message": "Company rejected",
        "company_id": company.company_id,
        "status": company.status,
        "is_active": False,
    }


# =========================================================
# 6. SINGLE-USE SIGNATURE UNLOCK TOKEN GENERATION — Task 1
# =========================================================

@router.post(
    "/companies/{company_id}/generate-signature-token",
    summary="Admin: Generate a single-use signature add-on unlock token for a company",
)
def generate_signature_token(
    company_id: str,
    admin: dict = Depends(authenticate_admin),
    db: Session = Depends(get_db),
):
    """
    Generates a cryptographically secure, single-use, company-specific token
    (e.g., SIG-UNLOCK-<hex>) and saves it to the company's signature_unlock_token column.
    Once redeemed by the client, it will be burned immediately.
    Protected by admin authentication.
    """
    company = (
        db.query(Company)
        .filter(Company.company_id == company_id)
        .first()
    )

    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company '{company_id}' not found.",
        )

    token = f"SIG-UNLOCK-{secrets.token_hex(8).upper()}"
    company.signature_unlock_token = token
    db.commit()
    db.refresh(company)

    return {
        "status": "success",
        "company_id": company.company_id,
        "signature_unlock_token": token,
        "signature_unlocked": company.signature_unlocked,
        "message": "Single-use signature unlock token generated successfully.",
    }


# =========================================================
# 7. GLOBAL PRICING CONFIGURATION ENGINE — Task 2
# =========================================================

class AdminUpdatePricingRequest(BaseModel):
    price_per_page: float
    price_per_signature_check: float


@router.get(
    "/billing/pricing",
    summary="Admin: Get current global pricing rates",
)
def get_billing_pricing(
    admin: dict = Depends(authenticate_admin),
):
    """
    Returns current platform pricing rates from StorageManager.
    Protected by admin authentication.
    """
    pricing = storage_manager.get_pricing()
    return pricing.model_dump()


@router.put(
    "/billing/pricing",
    summary="Admin: Dynamically update per-page and signature verification pricing rates",
)
def update_billing_rates(
    payload: AdminUpdatePricingRequest,
    admin: dict = Depends(authenticate_admin),
):
    """
    Admin view: Dynamically update per-page and signature verification pricing rates.
    Protected by admin authentication.
    """
    if payload.price_per_page < 0 or payload.price_per_signature_check < 0:
        raise HTTPException(
            status_code=400,
            detail="Pricing rates cannot be negative",
        )

    updated = storage_manager.update_pricing(
        price_per_page=payload.price_per_page,
        price_per_signature=payload.price_per_signature_check,
    )
    return {
        "status": "updated",
        "pricing": updated.model_dump(),
    }


# =========================================================
# 8. COMPANY USAGE ANALYTICS (DRILL-DOWN) — Task 3
# =========================================================

@router.get(
    "/companies/{company_id}/usage",
    summary="Admin: Get aggregated scan and billing usage for a specific company",
)
def get_company_usage_metrics(
    company_id: str,
    admin: dict = Depends(authenticate_admin),
    db: Session = Depends(get_db),
):
    """
    Admin view: Aggregated usage analytics strictly for the requested company_id.
    Queries the DocumentScan table to compute total_scans, total_pages, and total_revenue_inr.
    Protected by admin authentication.
    """
    company = (
        db.query(Company)
        .filter(Company.company_id == company_id)
        .first()
    )
    if not company:
        raise HTTPException(
            status_code=404,
            detail=f"Company '{company_id}' not found.",
        )

    total_scans = (
        db.query(func.count(DocumentScan.id))
        .filter(DocumentScan.company_id == company_id)
        .scalar()
        or 0
    )

    total_pages = (
        db.query(func.coalesce(func.sum(DocumentScan.pages_count), 0))
        .filter(DocumentScan.company_id == company_id)
        .scalar()
        or 0
    )

    total_revenue_inr = round(
        float(
            db.query(func.coalesce(func.sum(DocumentScan.cost_inr), 0.0))
            .filter(DocumentScan.company_id == company_id)
            .scalar()
            or 0.0
        ),
        2,
    )

    recent_scans = (
        db.query(DocumentScan)
        .filter(DocumentScan.company_id == company_id)
        .order_by(DocumentScan.created_at.desc())
        .limit(10)
        .all()
    )

    return {
        "status": "success",
        "company_id": company.company_id,
        "company_name": company.company_name,
        "email": company.email,
        "company_status": company.status,
        "is_active": company.is_active,
        "signature_unlocked": company.signature_unlocked,
        "signature_unlock_token": company.signature_unlock_token,
        "total_scans": total_scans,
        "total_pages": total_pages,
        "total_revenue_inr": total_revenue_inr,
        "recent_scans": [
            {
                "id": s.id,
                "filename": s.filename,
                "pages_count": s.pages_count,
                "cost_inr": s.cost_inr,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in recent_scans
        ],
    }
