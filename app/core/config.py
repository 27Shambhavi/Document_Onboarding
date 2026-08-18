from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):

    # =========================================================
    # NVIDIA API KEYS
    # =========================================================

    NVIDIA_API_KEYS: str

    NVIDIA_BASE_URL: str = (
        "https://integrate.api.nvidia.com/v1"
    )

    NVIDIA_MODEL: str = (
        "qwen/qwen3.5-397b-a17b"
    )

    # =========================================================
    # JWT
    # =========================================================

    JWT_SECRET_KEY: str

    JWT_ALGORITHM: str = "HS256"

    # =========================================================
    # ENV CONFIG
    # =========================================================

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


# =============================================================
# GLOBAL SETTINGS INSTANCE
# =============================================================

settings = Settings()