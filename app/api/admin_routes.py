from datetime import datetime, timedelta, timezone
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.admin_auth import (
    authenticate_admin,
    create_admin_access_token,
    verify_password,
)
from app.db.database import get_db
from app.db.models import Admin, Company, InviteToken
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