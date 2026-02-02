from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Table, UniqueConstraint, JSON, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import uuid

class User(Base):
    __tablename__ = "users"

    email = Column(String, primary_key=True, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # Password reset fields - stored as hashed token for security
    reset_token_hash = Column(String, nullable=True)  # Hashed reset token
    reset_token_expiry = Column(DateTime(timezone=True), nullable=True)  # Token expiration time

    # Relationships to user-owned resources
    funding_programs = relationship("FundingProgram", back_populates="user")
    companies = relationship("Company", back_populates="user")

class FundingProgram(Base):
    __tablename__ = "funding_programs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String, nullable=False)
    website = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    user_email = Column(String, ForeignKey("users.email"), nullable=False, index=True)

    # Template name for document template resolution (legacy)
    template_name = Column(String, nullable=True)  # e.g., "wtt_v1"

    # Phase 2.5: Template system fields
    template_source = Column(String, nullable=True, index=True)  # "system" | "user"
    template_ref = Column(String, nullable=True, index=True)  # System template name or user template UUID

    # Phase 4: Scraping fields
    description = Column(Text, nullable=True)  # Scraped description
    sections_json = Column(JSON, nullable=True)  # Scraped sections
    content_hash = Column(String, nullable=True)  # Hash of scraped content
    last_scraped_at = Column(DateTime(timezone=True), nullable=True)  # Last scrape timestamp

    # Phase 4: Guidelines text fields
    guidelines_text = Column(Text, nullable=True)  # Text content from guidelines files
    guidelines_text_file_id = Column(UUID(as_uuid=True), ForeignKey("files.id"), nullable=True)  # Reference to file

    # Relationship to user (owner)
    user = relationship("User", back_populates="funding_programs")

    # Many-to-many relationship with companies
    companies = relationship(
        "Company",
        secondary="funding_program_companies",
        back_populates="funding_programs"
    )

class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)
    website = Column(String, nullable=True)
    audio_path = Column(String, nullable=True)
    website_text = Column(String, nullable=True)  # Crawled website content
    transcript_text = Column(String, nullable=True)  # Audio transcript
    processing_status = Column(String, nullable=True, server_default="pending")  # "pending", "processing", "done", "failed"
    processing_error = Column(String, nullable=True)  # Error message if processing failed
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    user_email = Column(String, ForeignKey("users.email"), nullable=False, index=True)

    # Structured company profile (Phase 2A: Extract → Store → Reference)
    company_profile = Column(JSON, nullable=True)  # Structured extracted company information
    extraction_status = Column(String, nullable=True)  # "pending", "extracted", "failed"
    extracted_at = Column(DateTime(timezone=True), nullable=True)  # Timestamp when extraction completed

    # Relationship to user (owner)
    user = relationship("User", back_populates="companies")

    # Many-to-many relationship with funding programs
    funding_programs = relationship(
        "FundingProgram",
        secondary="funding_program_companies",
        back_populates="companies"
    )

# Join table for many-to-many relationship
funding_program_companies = Table(
    "funding_program_companies",
    Base.metadata,
    Column("funding_program_id", Integer, ForeignKey("funding_programs.id"), primary_key=True),
    Column("company_id", Integer, ForeignKey("companies.id"), primary_key=True),
    UniqueConstraint("funding_program_id", "company_id", name="uq_funding_program_company")
)

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    type = Column(String, nullable=False, index=True)  # "vorhabensbeschreibung", "vorkalkulation"
    content_json = Column(JSON, nullable=False)  # Stores sections array as JSON
    chat_history = Column(JSON, nullable=True)  # Stores chat messages as JSON array
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Phase 2.6: Headings confirmation flag
    # Use Integer for SQLite compatibility (0 = False, 1 = True), works with PostgreSQL too
    headings_confirmed = Column(Integer, nullable=False, server_default="0")

    # Funding program association (nullable for legacy documents)
    funding_program_id = Column(Integer, ForeignKey("funding_programs.id"), nullable=True, index=True)

    # UNIQUE constraint: one document per (company, funding_program, type)
    __table_args__ = (
        UniqueConstraint('company_id', 'funding_program_id', 'type', name='uq_document_company_program_type'),
    )

    # Relationships
    company = relationship("Company", backref="documents")
    funding_program = relationship("FundingProgram", backref="documents")

class File(Base):
    __tablename__ = "files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    content_hash = Column(Text, unique=True, nullable=False, index=True)
    file_type = Column(Text, nullable=True)  # e.g., "audio", "pdf", "docx"
    storage_path = Column(Text, nullable=False)  # Path in Supabase Storage
    size_bytes = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# Phase 2: Raw Processing Cache Tables

class AudioTranscriptCache(Base):
    """
    Cache for audio transcription results.
    Keyed by file content_hash to ensure same audio file is transcribed only once.
    """
    __tablename__ = "audio_transcript_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    file_content_hash = Column(Text, unique=True, nullable=False, index=True)  # References File.content_hash
    transcript_text = Column(Text, nullable=False)  # Cached transcript from Whisper
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    processed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)  # When transcription ran
class WebsiteTextCache(Base):
    """
    Cache for website crawling results.
    Keyed by normalized URL hash to ensure same website is crawled only once.
    """
    __tablename__ = "website_text_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    url_hash = Column(Text, unique=True, nullable=False, index=True)  # SHA256 hash of normalized URL
    normalized_url = Column(Text, nullable=False)  # Normalized URL for reference
    website_text = Column(Text, nullable=False)  # Cached crawled text
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    processed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)  # When crawl ran
class DocumentTextCache(Base):
    """
    Cache for PDF/DOCX document text extraction results.
    Keyed by file content_hash to ensure same document is extracted only once.
    """
    __tablename__ = "document_text_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    file_content_hash = Column(Text, unique=True, nullable=False, index=True)  # References File.content_hash
    extracted_text = Column(Text, nullable=False)  # Cached extracted text
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    processed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)  # When extraction ran

# Phase 2.5: User Template Model
class UserTemplate(Base):
    """
    User-defined document templates stored in database.
    """
    __tablename__ = "user_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    template_structure = Column(JSON, nullable=False)  # Contains "sections" key
    user_email = Column(String, ForeignKey("users.email"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationship to user
    user = relationship("User", backref="user_templates")

# Phase 4: Funding Program Document Model
class FundingProgramDocument(Base):
    """
    Documents uploaded for funding programs (PDFs, text files, etc.).
    Links funding programs to files with category organization.
    """
    __tablename__ = "funding_program_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    funding_program_id = Column(Integer, ForeignKey("funding_programs.id"), nullable=False, index=True)
    file_id = Column(UUID(as_uuid=True), ForeignKey("files.id"), nullable=False, index=True)
    category = Column(String, nullable=False)  # e.g., "guidelines", "examples", "forms"
    original_filename = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    uploaded_by = Column(String, ForeignKey("users.email"), nullable=False)

    # Composite index for efficient category filtering
    __table_args__ = (
        {"sqlite_autoincrement": True},
    )

    # Relationships
    funding_program = relationship("FundingProgram", backref="funding_program_documents")
    file = relationship("File", backref="funding_program_documents")
    uploader = relationship("User", backref="uploaded_documents")
