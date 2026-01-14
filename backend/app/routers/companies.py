from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.models import FundingProgram, Company, Document, funding_program_companies, User
from app.schemas import CompanyCreate, CompanyResponse
from app.preprocessing import crawl_website, transcribe_audio
from app.dependencies import get_current_user
from typing import List
import logging
import os
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

router = APIRouter()

# UPLOAD_DIR configuration - environment-driven for production persistence
# Default: backend/uploads/audio (local dev)
# Production: Set UPLOAD_DIR environment variable (e.g., /var/data/uploads)
UPLOAD_DIR_ENV = os.getenv("UPLOAD_DIR")
if UPLOAD_DIR_ENV:
    # Production: use environment-provided base directory
    UPLOAD_DIR = Path(UPLOAD_DIR_ENV) / "audio"
else:
    # Local dev: default to backend/uploads/audio
    UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "audio"

# Create uploads directory if it doesn't exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

@router.post("/upload-audio")
async def upload_audio_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Upload an audio file and return the path where it's stored.
    """
    try:
        # Validate file type
        if not file.content_type or not file.content_type.startswith('audio/'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be an audio file"
            )
        
        # Generate unique filename
        file_extension = Path(file.filename).suffix if file.filename else '.mp3'
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = UPLOAD_DIR / unique_filename
        
        # Save file
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Store path relative to UPLOAD_DIR for portability (just filename)
        # This makes paths stable across different UPLOAD_DIR configurations
        stored_path = unique_filename
        logger.info(f"Audio file uploaded: {file_path} (stored as: {stored_path})")
        
        return {"audio_path": stored_path, "filename": file.filename}
    
    except Exception as e:
        logger.error(f"Error uploading audio file: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload audio file: {str(e)}"
        )

def process_company_background(company_id: int, website: str = None, audio_path: str = None):
    """
    Background task to process company data (website crawling and audio transcription).
    This runs asynchronously after the API response is returned.
    """
    from app.database import SessionLocal
    
    db = SessionLocal()
    try:
        # Log preprocessing start
        logger.info(f"Starting preprocessing for company_id={company_id}")
        
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            logger.error(f"Company not found for preprocessing: company_id={company_id}")
            return
        
        # Update status to processing
        company.processing_status = "processing"
        company.processing_error = None
        db.commit()
        
        # Process website
        if website:
            try:
                logger.info(f"Extracting website data for company_id={company_id} (url={website})")
                website_text = crawl_website(website)
                if website_text:
                    company.website_text = website_text
                    logger.info(f"Website data extraction completed for company_id={company_id} (extracted {len(website_text)} characters)")
                else:
                    logger.warning(f"Website data extraction returned no text for company_id={company_id}")
            except Exception as e:
                error_msg = f"Website crawl failed: {str(e)}"
                logger.error(f"Website data extraction failed for company_id={company_id}: {error_msg}")
                company.processing_error = error_msg
        
        # Process audio
        if audio_path:
            try:
                # Resolve audio path relative to UPLOAD_DIR
                # Stored paths are filenames relative to UPLOAD_DIR for portability
                if os.path.isabs(audio_path):
                    # Legacy: absolute path (backward compatibility)
                    resolved_audio_path = audio_path
                else:
                    # New: filename relative to UPLOAD_DIR
                    resolved_audio_path = str(UPLOAD_DIR / audio_path)
                
                logger.info(f"Transcribing audio for company_id={company_id} (audio_path={resolved_audio_path})")
                transcript_text = transcribe_audio(resolved_audio_path)
                if transcript_text:
                    company.transcript_text = transcript_text
                    logger.info(f"Audio transcription completed for company_id={company_id} (transcript length: {len(transcript_text)} characters)")
                else:
                    logger.warning(f"Audio transcription returned no text for company_id={company_id}")
            except Exception as e:
                error_msg = f"Audio transcription failed: {str(e)}"
                logger.error(f"Audio transcription failed for company_id={company_id}: {error_msg}")
                if company.processing_error:
                    company.processing_error += f"; {error_msg}"
                else:
                    company.processing_error = error_msg
        
        # Update status to done
        company.processing_status = "done"
        db.commit()
        logger.info(f"Finished preprocessing for company_id={company_id}")
    
    except Exception as e:
        logger.error(f"Preprocessing failed for company_id={company_id}: {str(e)}")
        try:
            company = db.query(Company).filter(Company.id == company_id).first()
            if company:
                company.processing_status = "failed"
                company.processing_error = f"Background processing error: {str(e)}"
                db.commit()
        except Exception as commit_error:
            logger.error(f"Failed to update error status for company_id={company_id}: {str(commit_error)}")
    finally:
        db.close()


@router.post(
    "/funding-programs/{funding_program_id}/companies",
    response_model=CompanyResponse,
    status_code=status.HTTP_201_CREATED
)
def create_company_in_program(
    funding_program_id: int,
    company_data: CompanyCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new company and automatically link it to the given funding program.
    Background processing (website crawling and audio transcription) is triggered
    after the response is returned.
    
    Note: For file uploads, use the /upload-audio endpoint first, then provide the audio_path.
    """
    # Verify funding program exists and belongs to current user
    funding_program = db.query(FundingProgram).filter(
        FundingProgram.id == funding_program_id,
        FundingProgram.user_email == current_user.email
    ).first()
    if not funding_program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Funding program not found"
        )
    
    if not company_data.name or not company_data.name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company name is required"
        )
    
    # Create new company with initial processing status (owned by current user)
    new_company = Company(
        name=company_data.name.strip(),
        website=company_data.website.strip() if company_data.website else None,
        audio_path=company_data.audio_path.strip() if company_data.audio_path else None,
        processing_status="pending",
        user_email=current_user.email
    )
    
    try:
        db.add(new_company)
        db.flush()  # Flush to get the company ID
        
        # Refresh funding_program to ensure we have latest state
        db.refresh(funding_program)
        
        # Link company to funding program
        # Check if link already exists to avoid UNIQUE constraint violation
        # Check both via relationship and direct query for safety
        company_already_linked = new_company in funding_program.companies
        
        if not company_already_linked:
            # Double-check with direct query
            existing_link = db.execute(
                select(funding_program_companies).where(
                    funding_program_companies.c.funding_program_id == funding_program_id,
                    funding_program_companies.c.company_id == new_company.id
                )
            ).first()
            
            if not existing_link:
                funding_program.companies.append(new_company)
        
        db.commit()
        db.refresh(new_company)
        
        # Schedule background processing
        if new_company.website or new_company.audio_path:
            background_tasks.add_task(
                process_company_background,
                company_id=new_company.id,
                website=new_company.website,
                audio_path=new_company.audio_path
            )
            logger.info(f"Company preprocessing task enqueued for company_id={new_company.id}")
        
        return new_company
    except IntegrityError as e:
        db.rollback()
        # Check if it's a UNIQUE constraint on the join table
        error_str = str(e.orig) if hasattr(e, 'orig') else str(e)
        if 'funding_program_companies' in error_str and 'UNIQUE' in error_str:
            # Company link already exists - this means the company was created in a previous transaction
            # or the link already exists. Query for the company by its identifying attributes
            # (not by ID, since the rollback undid the insertion)
            logger.warning(f"Company link already exists for funding_program_id={funding_program_id}, attempting to find existing company")
            # Query for the company by name and user_email (the identifying attributes)
            existing_company = db.query(Company).filter(
                Company.name == company_data.name.strip(),
                Company.user_email == current_user.email
            ).first()
            if existing_company:
                # Ensure it's linked to the funding program
                db.refresh(funding_program)
                if existing_company not in funding_program.companies:
                    funding_program.companies.append(existing_company)
                    db.commit()
                return existing_company
        # Re-raise if it's not the join table constraint or company not found
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create company: {str(e)}"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create company: {str(e)}"
        )

@router.get(
    "/funding-programs/{funding_program_id}/companies",
    response_model=List[CompanyResponse]
)
def get_companies_for_program(
    funding_program_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all companies linked to a specific funding program.
    """
    # Verify funding program exists and belongs to current user
    funding_program = db.query(FundingProgram).filter(
        FundingProgram.id == funding_program_id,
        FundingProgram.user_email == current_user.email
    ).first()
    if not funding_program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Funding program not found"
        )
    
    # Return companies linked to this funding program (filtered by user ownership)
    # Only return companies that belong to the current user
    return [c for c in funding_program.companies if c.user_email == current_user.email]

@router.get("/companies", response_model=List[CompanyResponse])
def get_all_companies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all companies owned by the current user across all funding programs.
    Used for importing existing companies.
    """
    companies = db.query(Company).filter(
        Company.user_email == current_user.email
    ).order_by(Company.created_at.desc()).all()
    return companies

@router.get("/companies/{company_id}", response_model=CompanyResponse)
def get_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get a single company by ID.
    """
    company = db.query(Company).filter(
        Company.id == company_id,
        Company.user_email == current_user.email
    ).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    return company

@router.post(
    "/funding-programs/{funding_program_id}/companies/{company_id}",
    response_model=CompanyResponse,
    status_code=status.HTTP_200_OK
)
def import_company_to_program(
    funding_program_id: int,
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Import an existing company into a funding program.
    Only creates an entry in the join table, does not create a new company.
    """
    # Verify funding program exists and belongs to current user
    funding_program = db.query(FundingProgram).filter(
        FundingProgram.id == funding_program_id,
        FundingProgram.user_email == current_user.email
    ).first()
    if not funding_program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Funding program not found"
        )
    
    # Verify company exists and belongs to current user
    company = db.query(Company).filter(
        Company.id == company_id,
        Company.user_email == current_user.email
    ).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    # Check if company is already linked to this funding program
    if company in funding_program.companies:
        # Company already linked, return it
        return company
    
    try:
        # Link existing company to funding program
        funding_program.companies.append(company)
        db.commit()
        db.refresh(company)
        return company
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to import company: {str(e)}"
        )

@router.put("/companies/{company_id}", response_model=CompanyResponse)
def update_company(
    company_id: int,
    company_data: CompanyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update an existing company.
    """
    company = db.query(Company).filter(
        Company.id == company_id,
        Company.user_email == current_user.email
    ).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    if not company_data.name or not company_data.name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company name is required"
        )
    
    # Update company
    company.name = company_data.name.strip()
    company.website = company_data.website.strip() if company_data.website else None
    company.audio_path = company_data.audio_path.strip() if company_data.audio_path else None
    
    try:
        db.commit()
        db.refresh(company)
        return company
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update company"
        )

@router.delete("/companies/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a company.
    This removes the company from the database entirely.
    """
    company = db.query(Company).filter(
        Company.id == company_id,
        Company.user_email == current_user.email
    ).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    try:
        # Delete all related documents first
        db.query(Document).filter(Document.company_id == company_id).delete()
        
        # Delete all join table entries (funding_program_companies)
        db.execute(
            delete(funding_program_companies).where(
                funding_program_companies.c.company_id == company_id
            )
        )
        
        # Delete the company itself
        db.delete(company)
        db.commit()
        return None
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete company"
        )

