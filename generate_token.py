from datetime import datetime, timedelta, timezone

from jose import jwt

from app.core.config import settings


payload = {
    "sub": "ABC",
    "company_id": "ABC",
    "exp": datetime.now(timezone.utc) + timedelta(hours=1),
}

token = jwt.encode(
    payload,
    settings.JWT_SECRET_KEY,
    algorithm=settings.JWT_ALGORITHM,
)

print("\nJWT TOKEN:\n")
print(token)