from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime

class UserCreate(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email_domain(cls, v: str) -> str:
        v_lower = v.lower()
        if not (v_lower.endswith("@innovo-consulting.de") or v_lower.endswith("@gmail.com")):
            raise ValueError("Email must end with @innovo-consulting.de or @gmail.com")
        return v_lower

    @field_validator("password")
    @classmethod
    def validate_password_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

class UserLogin(BaseModel):
    email: str
    password: str

class AuthResponse(BaseModel):
    success: bool
    message: str

# Funding Program Schemas
class FundingProgramCreate(BaseModel):
    title: str
    website: Optional[str] = None

class FundingProgramResponse(BaseModel):
    id: int
    title: str
    website: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Company Schemas
class CompanyCreate(BaseModel):
    name: str
    website: Optional[str] = None
    audio_path: Optional[str] = None

class CompanyResponse(BaseModel):
    id: int
    name: str
    website: Optional[str] = None
    audio_path: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Document Schemas
class DocumentSection(BaseModel):
    id: str
    title: str
    content: str

class DocumentContent(BaseModel):
    sections: list[DocumentSection]

class DocumentResponse(BaseModel):
    id: int
    company_id: int
    type: str
    content_json: dict
    updated_at: datetime

    class Config:
        from_attributes = True

class DocumentUpdate(BaseModel):
    content_json: dict

