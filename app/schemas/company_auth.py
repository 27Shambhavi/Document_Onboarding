from pydantic import BaseModel, EmailStr


class CompanyLoginRequest(BaseModel):
    email: EmailStr
    password: str


class CompanyLoginResponse(BaseModel):
    access_token: str
    token_type: str
    company_id: str
    company_name: str
    status: str