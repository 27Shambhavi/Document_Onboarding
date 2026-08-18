import os
from dotenv import load_dotenv
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()


class TierLimits(BaseModel):
    max_concurrent_candidates: int
    global_semaphore_limit: int
    max_requests_per_minute: int
    retry_attempts: int


TIER_PRESETS = {
    "FREE": TierLimits(
        max_concurrent_candidates=2,
        global_semaphore_limit=4,
        max_requests_per_minute=35,
        retry_attempts=5,
    ),
    "PAID": TierLimits(
        max_concurrent_candidates=20,
        global_semaphore_limit=40,
        max_requests_per_minute=1200,
        retry_attempts=5,
    ),
}


class Settings(BaseSettings):
    NVIDIA_API_KEY: str = ""
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    NVIDIA_MODEL: str = "qwen/qwen3.5-397b-a17b"

    active_tier: str = "FREE"
    limits: TierLimits = TIER_PRESETS["FREE"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def __init__(self, **values):
        super().__init__(**values)
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


settings = Settings()