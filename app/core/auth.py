from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.db.models import Company


security = HTTPBearer()


def authenticate_client(
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
    db: Session = Depends(get_db),
) -> dict[str, Any]:

    # =========================================================
    # 1. JWT CONFIGURATION
    # =========================================================

    if not settings.JWT_SECRET_KEY:

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT_SECRET_KEY is not configured",
        )

    # =========================================================
    # 2. GET TOKEN
    # =========================================================

    token = credentials.credentials

    # =========================================================
    # 3. DECODE + VERIFY COMPANY JWT
    # =========================================================

    try:

        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[
                settings.JWT_ALGORITHM
            ],
        )

    except JWTError:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired JWT token",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    # =========================================================
    # 4. GET COMPANY ID FROM JWT
    # =========================================================

    company_id = payload.get(
        "company_id"
    )

    if not company_id:

        company_id = payload.get(
            "sub"
        )

    # =========================================================
    # 5. COMPANY ID REQUIRED
    # =========================================================

    if not company_id:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="JWT does not contain company identity",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    # =========================================================
    # 6. FIND COMPANY IN DATABASE
    # =========================================================

    company = (
        db.query(Company)
        .filter(
            Company.company_id == company_id
        )
        .first()
    )

    # =========================================================
    # 7. COMPANY MUST EXIST
    # =========================================================

    if not company:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Company is not registered",
        )

    # =========================================================
    # 8. ADMIN APPROVAL CHECK
    # =========================================================
    #
    # Database status values:
    #
    # PENDING
    # ACTIVE
    # REJECTED
    #
    # Only ACTIVE companies can use the system.
    # =========================================================

    if company.status != "ACTIVE":

        if company.status == "PENDING":

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Company approval is pending. "
                    "Please wait for administrator approval."
                ),
            )

        if company.status == "REJECTED":

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Company access has been rejected "
                    "by the administrator."
                ),
            )

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Company is not active. "
                f"Current status: {company.status}"
            ),
        )

    # =========================================================
    # 9. AUTHENTICATION SUCCESS
    # =========================================================

    return {
        "authenticated": True,
        "company_id": company.company_id,
        "company_name": company.company_name,
        "status": company.status,
        "claims": payload,
    }