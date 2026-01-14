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
        # Explicitly allow donotreply@aiio.de
        if v_lower == "donotreply@aiio.de":
            return v_lower
        # Allow emails ending with @innovo-consulting.de or @aiio.de
        if not (v_lower.endswith("@innovo-consulting.de") or v_lower.endswith("@aiio.de")):
            raise ValueError("Email must end with @innovo-consulting.de or @aiio.de")
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

class TokenResponse(BaseModel):
    """Response model for login endpoint - includes JWT token"""
    access_token: str
    token_type: str = "bearer"
    success: bool
    message: str

class PasswordResetRequest(BaseModel):
    """Request model for password reset initiation"""
    email: str

class PasswordReset(BaseModel):
    """Request model for password reset completion"""
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

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
    website_text: Optional[str] = None
    transcript_text: Optional[str] = None
    processing_status: str = "pending"
    processing_error: Optional[str] = None
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
    chat_history: Optional[list[dict]] = None  # Chat messages history
    updated_at: datetime

    class Config:
        from_attributes = True

class DocumentUpdate(BaseModel):
    content_json: dict

# Chat Schemas
class ChatRequest(BaseModel):
    message: str
    last_edited_sections: Optional[list[str]] = None  # Optional context for clarification suggestions
    conversation_history: Optional[list[dict]] = None  # Optional conversation history for context

class ChatResponse(BaseModel):
    message: str
    updated_sections: Optional[list[str]] = None  # List of section IDs that were updated
    is_question: Optional[bool] = False  # True if this is a question answer (not an edit)
    suggested_content: Optional[dict[str, str]] = None  # Map of section_id -> suggested_content for preview
    requires_confirmation: Optional[bool] = False  # True if user needs to confirm before saving

class ChatConfirmationRequest(BaseModel):
    section_id: str
    confirmed_content: str  # The content user approved

