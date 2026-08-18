from datetime import datetime, timedelta, timezone
from typing import Any

from jose import jwt

from app.core.config import settings


def create_access_token(
    company_id: str,
    expires_minutes: int = 60,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """
    Create a JWT access token for an authenticated company.

    The company_id is stored inside the JWT so that every
    subsequent request can identify which company is making
    the request.
    """

    now = datetime.now(timezone.utc)

    payload: dict[str, Any] = {
        "sub": company_id,
        "company_id": company_id,
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