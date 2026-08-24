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
        max_concurrent_candidates=20,
        global_semaphore_limit=40,
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
  # NVIDIA CONFIGURATIONS (With Fallbacks)
  # =========================================================

  NVIDIA_API_KEYS: str = os.getenv(
      "NVIDIA_API_KEYS", os.getenv("NVIDIA_API_KEY", "")
  )
  NVIDIA_API_KEY: str = os.getenv(
      "NVIDIA_API_KEY", os.getenv("NVIDIA_API_KEYS", "")
  )
  NVIDIA_BASE_URL: str = os.getenv(
      "NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"
  )
  NVIDIA_MODEL: str = os.getenv("NVIDIA_MODEL", "qwen/qwen3.5-397b-a17b")

  # =========================================================
  # GUIDELINE REASONING CONFIGURATION
  # =========================================================

  GUIDELINE_MODEL: str = os.getenv("GUIDELINE_MODEL", "gpt-oss-120b")

  # =========================================================
  # JWT & ADMIN AUTHENTICATION
  # =========================================================

  JWT_SECRET_KEY: str = os.getenv(
      "JWT_SECRET_KEY", "supersecretjwtkeyforauthentication123"
  )
  JWT_ALGORITHM: str = "HS256"
  ADMIN_SECRET_KEY: str = os.getenv("ADMIN_SECRET_KEY", "adminsecretkey123")

  # =========================================================
  # DATABASE (POSTGRESQL / SQLITE FALLBACK)
  # =========================================================

  DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./document_app.db")

  # =========================================================
  # SYSTEM TIER
  # =========================================================

  active_tier: str = "FREE"
  limits: TierLimits = TIER_PRESETS["FREE"]

  # =========================================================
  # ENVIRONMENT CONFIG
  # =========================================================

  model_config = SettingsConfigDict(
      env_file=".env",
      env_file_encoding="utf-8",
      extra="ignore",
  )

  # =========================================================
  # INITIALIZATION
  # =========================================================

  def __init__(self, **values):
    super().__init__(**values)

    # Sync single key with plural key if only one was set
    if not self.NVIDIA_API_KEY and self.NVIDIA_API_KEYS:
      self.NVIDIA_API_KEY = self.NVIDIA_API_KEYS.split(",")[0].strip()
    elif not self.NVIDIA_API_KEYS and self.NVIDIA_API_KEY:
      self.NVIDIA_API_KEYS = self.NVIDIA_API_KEY

    tier_env = os.getenv("SYSTEM_TIER", "FREE").upper()
    self.active_tier = tier_env
    self.limits = TIER_PRESETS.get(tier_env, TIER_PRESETS["FREE"])

  # =========================================================
  # CHANGE SYSTEM TIER
  # =========================================================

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