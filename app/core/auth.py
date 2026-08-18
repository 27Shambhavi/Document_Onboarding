from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import settings


security = HTTPBearer()


def authenticate_client(
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
) -> dict[str, Any]:
    """
    Authenticate a company using a JWT.

    Expected request:

        Authorization: Bearer <JWT>

    The JWT will contain company identity, for example:

        {
            "sub": "company_001",
            "company_id": "company_001"
        }

    Returns:
        Decoded authenticated company information.
    """

    # =========================================================
    # 1. SERVER JWT CONFIGURATION
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
    # 3. DECODE + VERIFY JWT
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
    # 4. GET COMPANY ID
    # =========================================================

    company_id = payload.get(
        "company_id"
    )

    # Fallback to standard JWT subject
    if not company_id:
        company_id = payload.get(
            "sub"
        )

    # =========================================================
    # 5. COMPANY ID IS REQUIRED
    # =========================================================

    if not company_id:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "JWT does not contain "
                "company identity"
            ),
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    # =========================================================
    # 6. RETURN AUTHENTICATED COMPANY
    # =========================================================

    return {
        "authenticated": True,
        "company_id": company_id,
        "claims": payload,
    }