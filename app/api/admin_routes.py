from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.admin_auth import (
    authenticate_admin,
    create_admin_access_token,
    verify_password,
)

from app.db.database import get_db
from app.db.models import Admin, Company

from app.schemas.admin import (
    AdminLoginRequest,
    AdminLoginResponse,
)


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
        .filter(
            Admin.email == payload.email
        )
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
# 2. GET ALL COMPANIES
# =========================================================

@router.get("/companies")
def get_companies(
    admin: dict = Depends(
        authenticate_admin
    ),
    db: Session = Depends(get_db),
):
    """
    Return all registered companies.

    Admin authentication required.

    Company activity is derived from status because the
    current PostgreSQL companies table does not contain
    an is_active column.
    """

    companies = (
        db.query(Company)
        .order_by(
            Company.created_at.desc()
        )
        .all()
    )

    return {
        "total": len(companies),
        "companies": [
            {
                "company_id": company.company_id,
                "company_name": company.company_name,
                "status": company.status,
                "is_active": (
                    company.status == "ACTIVE"
                ),
                "created_at": company.created_at,
                "approved_at": company.approved_at,
                "approved_by": company.approved_by,
            }
            for company in companies
        ],
    }


# =========================================================
# 3. APPROVE COMPANY
# =========================================================

@router.post(
    "/companies/{company_id}/approve"
)
def approve_company(
    company_id: str,
    admin: dict = Depends(
        authenticate_admin
    ),
    db: Session = Depends(get_db),
):
    """
    Approve a pending company.

    On approval:
        status = APPROVED
        approved_at = current UTC time
        approved_by = admin ID
    """

    company = (
        db.query(Company)
        .filter(
            Company.company_id == company_id
        )
        .first()
    )

    if not company:
        raise HTTPException(
            status_code=404,
            detail="Company not found",
        )

    # -----------------------------------------------------
    # Already approved
    # -----------------------------------------------------

    if company.status == "ACTIVE":
        return {
            "message": "Company is already approved",
            "company_id": company.company_id,
            "status": company.status,
            "is_active": True,
            "approved_at": company.approved_at,
            "approved_by": company.approved_by,
        }

    # -----------------------------------------------------
    # Approve
    # -----------------------------------------------------

    company.status = "ACTIVE"

    company.approved_at = datetime.now(
        timezone.utc
    )

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
# 4. REJECT COMPANY
# =========================================================

@router.post(
    "/companies/{company_id}/reject"
)
def reject_company(
    company_id: str,
    admin: dict = Depends(
        authenticate_admin
    ),
    db: Session = Depends(get_db),
):
    """
    Reject a company application.

    On rejection:
        status = REJECTED
        approved_at = NULL
        approved_by = NULL
    """

    company = (
        db.query(Company)
        .filter(
            Company.company_id == company_id
        )
        .first()
    )

    if not company:
        raise HTTPException(
            status_code=404,
            detail="Company not found",
        )

    # -----------------------------------------------------
    # Reject
    # -----------------------------------------------------

    company.status = "REJECTED"

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