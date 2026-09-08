import os
from dotenv import load_dotenv
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()

# =============================================================
# TIER LIMITS
# =============================================================

class TierLimits(BaseModel):
    max_concurrent_candidates: int
    global_semaphore_limit: int
    max_requests_per_minute: int
    retry_attempts: int

# =============================================================
# TIER PRESETS
# =============================================================

TIER_PRESETS = {
    "FREE": TierLimits(
        max_concurrent_candidates=10,
        global_semaphore_limit=20,
        max_requests_per_minute=350,
        retry_attempts=5,
    ),
    "PAID": TierLimits(
        max_concurrent_candidates=20,
        global_semaphore_limit=40,
        max_requests_per_minute=1200,
        retry_attempts=5,
    ),
}

# =============================================================
# APPLICATION SETTINGS
# =============================================================

class Settings(BaseSettings):

    # =========================================================
    # OPENAI COMPATIBLE CONFIGURATIONS (For vLLM Tunnel)
    # =========================================================
    
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "EMPTY")
    OPENAI_BASE_URL: str = os.getenv(
        "OPENAI_BASE_URL", "https://messaging-critical-consolidated-reservations.trycloudflare.com/v1"
    )
    
    NVIDIA_VISION_MODEL: str = os.getenv("NVIDIA_VISION_MODEL", "Qwen/Qwen2.5-VL-7B-Instruct")
    GUIDELINE_MODEL: str = os.getenv("GUIDELINE_MODEL", "Qwen/Qwen2.5-VL-7B-Instruct")

    # =========================================================
    # JWT & ADMIN AUTHENTICATION
    # =========================================================

    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "supersecretjwtkeyforauthentication123")
    JWT_ALGORITHM: str = "HS256"
    ADMIN_SECRET_KEY: str = os.getenv("ADMIN_SECRET_KEY", "adminsecretkey123")

    # =========================================================
    # DATABASE (POSTGRESQL - STRICT REQUIREMENT)
    # =========================================================

    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    # =========================================================
    # SYSTEM TIER
    # =========================================================

    active_tier: str = "FREE"
    limits: TierLimits = TIER_PRESETS["FREE"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def __init__(self, **values):
        super().__init__(**values)
        if not self.DATABASE_URL or not self.DATABASE_URL.startswith("postgresql"):
            raise RuntimeError(
                "CRITICAL: DATABASE_URL is missing or not configured for PostgreSQL! "
                "Silent SQLite fallback has been completely disabled."
            )
        tier_env = os.getenv("SYSTEM_TIER", "FREE").upper()
        self.active_tier = tier_env
        self.limits = TIER_PRESETS.get(tier_env, TIER_PRESETS["FREE"])

    def set_tier(self, tier_name: str) -> bool:
        tier_upper = tier_name.upper()
        if tier_upper in TIER_PRESETS:
            self.active_tier = tier_upper
            self.limits = TIER_PRESETS[tier_upper]
            return True
        return False

# =============================================================
# GLOBAL SETTINGS INSTANCE
# =============================================================
settings = Settings()