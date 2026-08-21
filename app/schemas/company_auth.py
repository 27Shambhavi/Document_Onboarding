from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


# =============================================================
# 1. ADMIN TOKEN GENERATION SCHEMA
# =============================================================

class GenerateTokenResponse(BaseModel):
    status: str = Field(default="success")
    token: str = Field(..., description="Unique one-time registration passkey (e.g. INVITE-A1B2C3...)")
    expires_at: datetime = Field(..., description="Timestamp when this invite token will expire")
    message: str = Field(default="One-time registration token generated successfully.")


# =============================================================
# 2. COMPANY ONBOARDING SCHEMAS (FIRST-TIME VIA INVITE TOKEN)
# =============================================================

class CompanyOnboardRequest(BaseModel):
    invite_token: str = Field(
        ...,
        min_length=10,
        description="One-time secret token generated and provided by Admin",
        json_schema_extra={"example": "INVITE-3F8E9B2A1C4D5E6F"}
    )
    company_id: str = Field(
        ...,
        min_length=2,
        max_length=50,
        description="Unique identifier/slug for the company (e.g., TECHNOVA, FINCORP)",
        json_schema_extra={"example": "TECHNOVA"}
    )
    company_name: str = Field(
        ...,
        min_length=2,
        max_length=255,
        description="Official registered business/company name",
        json_schema_extra={"example": "Technova Solutions Pvt Ltd"}
    )
    email: EmailStr = Field(
        ...,
        description="Primary administrator email for this company account",
        json_schema_extra={"example": "admin@technova.com"}
    )
    password: str = Field(
        ...,
        min_length=6,
        max_length=128,
        description="Secure password chosen by the company",
        json_schema_extra={"example": "company@secure123"}
    )


class CompanyOnboardResponse(BaseModel):
    status: str = Field(default="success")
    message: str = Field(default="Company registered and activated successfully. Invite token burned.")
    company_id: str
    company_name: str
    email: str
    access_token: str
    token_type: str = Field(default="Bearer")


# =============================================================
# 3. REGULAR COMPANY LOGIN SCHEMAS (SUBSEQUENT SESSIONS)
# =============================================================

class CompanyLoginRequest(BaseModel):
    email: EmailStr
    password: str


class CompanyLoginResponse(BaseModel):
    access_token: str
    token_type: str
    company_id: str
    company_name: str
    status: str