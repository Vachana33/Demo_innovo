from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Table, UniqueConstraint, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class User(Base):
    __tablename__ = "users"

    email = Column(String, primary_key=True, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # Password reset fields - stored as hashed token for security
    reset_token_hash = Column(String, nullable=True)  # Hashed reset token
    reset_token_expiry = Column(DateTime(timezone=True), nullable=True)  # Token expiration time

class FundingProgram(Base):
    __tablename__ = "funding_programs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String, nullable=False)
    website = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

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
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationship to company
    company = relationship("Company", backref="documents")

