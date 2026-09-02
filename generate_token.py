from datetime import datetime, timedelta, timezone

from jose import jwt

from app.core.config import settings


payload = {
    "sub": "TECHNOVAlimited",
    "company_id": "TECHNOVAlimited",
    "exp": datetime.now(timezone.utc) + timedelta(hours=24),
}

token = jwt.encode(
    payload,
    settings.JWT_SECRET_KEY,
    algorithm=settings.JWT_ALGORITHM,
)

print("\nJWT TOKEN:\n")
print(token)