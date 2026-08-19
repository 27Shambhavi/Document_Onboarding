from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.db.models import Admin


admin_security = HTTPBearer()


# =========================================================
# PASSWORD VERIFICATION
# =========================================================

def verify_password(
    plain_password: str,
    password_hash: str,
) -> bool:

    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        password_hash.encode("utf-8"),
    )


# =========================================================
# CREATE ADMIN JWT
# =========================================================

def create_admin_access_token(
    admin: Admin,
    expires_minutes: int = 60,
) -> str:

    now = datetime.now(timezone.utc)

    payload: dict[str, Any] = {
        "sub": str(admin.id),
        "admin_id": admin.id,
        "email": admin.email,
        "role": admin.role,
        "type": "admin",
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


# =========================================================
# AUTHENTICATE ADMIN
# =========================================================

def authenticate_admin(
    credentials: HTTPAuthorizationCredentials = Depends(
        admin_security
    ),
    db: Session = Depends(get_db),
) -> dict[str, Any]:

    token = credentials.credentials

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
            detail="Invalid or expired admin token",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    # -----------------------------------------------------
    # Ensure this is an ADMIN token
    # -----------------------------------------------------

    if payload.get("type") != "admin":

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    admin_id = payload.get("admin_id")

    if not admin_id:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin token",
        )

    # -----------------------------------------------------
    # Check admin still exists and is active
    # -----------------------------------------------------

    admin = (
        db.query(Admin)
        .filter(Admin.id == int(admin_id))
        .first()
    )

    if not admin:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin account not found",
        )

    if not admin.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin account is inactive",
        )

    if admin.role != "admin":

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )

    return {
        "authenticated": True,
        "admin_id": admin.id,
        "email": admin.email,
        "role": admin.role,
    }