from datetime import datetime, timedelta, timezone
from typing import Any

from jose import jwt

from app.core.config import settings


# =============================================================
# CLIENT / COMPANY ACCESS TOKEN
# =============================================================

def create_access_token(
    company_id: str,
    expires_minutes: int = 60,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """
    Create JWT access token for an authenticated company.
    """

    now = datetime.now(timezone.utc)

    payload: dict[str, Any] = {
        "sub": company_id,
        "company_id": company_id,
        "token_type": "client",
        "iat": now,
        "exp": now + timedelta(
            minutes=expires_minutes
        ),
    }

    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


# =============================================================
# ADMIN ACCESS TOKEN
# =============================================================

def create_admin_access_token(
    admin_id: int,
    expires_minutes: int = 60,
) -> str:
    """
    Create JWT access token for an administrator.

    Admin tokens are intentionally different from
    company/client tokens.
    """

    now = datetime.now(timezone.utc)

    payload: dict[str, Any] = {
        "sub": str(admin_id),
        "admin_id": admin_id,
        "role": "admin",
        "token_type": "admin",
        "iat": now,
        "exp": now + timedelta(
            minutes=expires_minutes
        ),
    }

    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )