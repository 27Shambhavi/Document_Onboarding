import bcrypt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.jwt import create_access_token
from app.db.database import get_db
from app.db.models import Company
from app.schemas.company_auth import (
    CompanyLoginRequest,
    CompanyLoginResponse,
)


router = APIRouter(
    prefix="/company",
    tags=["Company Authentication"],
)


@router.post(
    "/login",
    response_model=CompanyLoginResponse,
)
def company_login(
    payload: CompanyLoginRequest,
    db: Session = Depends(get_db),
):
    """
    Authenticate a company and issue a client JWT.

    Only ACTIVE companies can receive a client token.
    """

    # 1. Find company
    company = (
        db.query(Company)
        .filter(
            Company.email == payload.email
        )
        .first()
    )

    if not company:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    # 2. Check company approval status
    if company.status == "PENDING":
        raise HTTPException(
            status_code=403,
            detail=(
                "Company approval is pending. "
                "Please wait for administrator approval."
            ),
        )

    if company.status == "REJECTED":
        raise HTTPException(
            status_code=403,
            detail=(
                "Company access has been rejected "
                "by the administrator."
            ),
        )

    if company.status != "ACTIVE":
        raise HTTPException(
            status_code=403,
            detail="Company is not active.",
        )

    # 3. Check password configuration
    if not company.password_hash:
        raise HTTPException(
            status_code=500,
            detail="Company password is not configured.",
        )

    # 4. Verify password
    try:
        password_valid = bcrypt.checkpw(
            payload.password.encode("utf-8"),
            company.password_hash.encode("utf-8"),
        )
    except ValueError:
        raise HTTPException(
            status_code=500,
            detail="Invalid company password configuration.",
        )

    if not password_valid:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    # 5. Create client JWT
    token = create_access_token(
        company_id=company.company_id,
        extra_claims={
            "email": company.email,
            "company_name": company.company_name,
        },
    )

    # 6. Return client token
    return {
        "access_token": token,
        "token_type": "bearer",
        "company_id": company.company_id,
        "company_name": company.company_name,
        "status": company.status,
    }