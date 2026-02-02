from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import FundingProgram, User, FundingProgramDocument, File as FileModel
from app.schemas import FundingProgramCreate, FundingProgramResponse, FundingProgramDocumentResponse, FundingProgramDocumentListResponse
from app.dependencies import get_current_user
from app.funding_program_scraper import scrape_funding_program
from app.file_storage import get_or_create_file
from app.document_extraction import extract_document_text
from app.processing_cache import get_cached_document_text
from app.funding_program_documents import detect_category_from_filename, validate_category, get_file_type_from_filename, is_text_file
from typing import List, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def _auto_scrape_program(program: FundingProgram, db: Session) -> None:
    """
    Automatically scrape funding program data if website is provided.
    Runs in background - errors are logged but don't fail the request.
    """
    if not program.website:
        return

    try:
        logger.info(f"[AUTO-SCRAPE] Starting automatic scrape for funding_program_id={program.id}, url={program.website}")
        scraped_data = scrape_funding_program(program.website)

        if scraped_data:
            program.description = scraped_data.get("description")
            program.sections_json = scraped_data.get("sections", [])
            program.content_hash = scraped_data.get("content_hash")
            program.last_scraped_at = datetime.utcnow()

            # Optionally update title if program_name was scraped and title is generic
            if scraped_data.get("program_name") and scraped_data["program_name"] != program.title:
                if not program.title or program.title.lower() in ["funding program", "new funding program"]:
                    program.title = scraped_data["program_name"]

            db.commit()
            logger.info(f"[AUTO-SCRAPE] Automatic scraping completed for funding_program_id={program.id}, sections={len(scraped_data.get('sections', []))}")
        else:
            logger.warning(f"[AUTO-SCRAPE] Scraping returned no data for funding_program_id={program.id}")
    except Exception as e:
        logger.error(f"[AUTO-SCRAPE] Error in automatic scraping for funding_program_id={program.id}: {str(e)}")
        # Don't fail the request - just log the error
        db.rollback()

router = APIRouter()

@router.post("/funding-programs", response_model=FundingProgramResponse, status_code=status.HTTP_201_CREATED)
def create_funding_program(
    program_data: FundingProgramCreate,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user)  # noqa: B008
):
    """
    Create a new funding program.
    """
    if not program_data.title or not program_data.title.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Title is required"
        )

    # Create new funding program (owned by current user)
    # Handle empty website string - convert to None
    website_value = program_data.website.strip() if program_data.website else None
    if website_value == "":
        website_value = None

    new_program = FundingProgram(
        title=program_data.title.strip(),
        website=website_value,
        template_source=program_data.template_source if program_data.template_source else None,
        template_ref=program_data.template_ref if program_data.template_ref else None,
        template_name=program_data.template_name if program_data.template_name else None,  # Legacy
        user_email=current_user.email
    )

    try:
        db.add(new_program)
        db.commit()
        db.refresh(new_program)

        # Automatically scrape if website is provided
        if new_program.website:
            _auto_scrape_program(new_program, db)
            db.refresh(new_program)  # Refresh to get scraped data

        return new_program
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating funding program: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create funding program: {str(e)}"
        ) from e

@router.get("/funding-programs", response_model=List[FundingProgramResponse])
def get_funding_programs(
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user)  # noqa: B008
):
    """
    Get all funding programs owned by the current user.
    """
    programs = db.query(FundingProgram).filter(
        FundingProgram.user_email == current_user.email
    ).order_by(FundingProgram.created_at.desc()).all()
    return programs

@router.put("/funding-programs/{funding_program_id}", response_model=FundingProgramResponse)
def update_funding_program(
    funding_program_id: int,
    program_data: FundingProgramCreate,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user)  # noqa: B008
):
    """
    Update an existing funding program.
    """
    funding_program = db.query(FundingProgram).filter(
        FundingProgram.id == funding_program_id,
        FundingProgram.user_email == current_user.email
    ).first()
    if not funding_program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Funding program not found"
        )

    if not program_data.title or not program_data.title.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Title is required"
        )

    # Update funding program
    old_website = funding_program.website
    funding_program.title = program_data.title.strip()
    # Handle empty website string - convert to None
    website_value = program_data.website.strip() if program_data.website else None
    if website_value == "":
        website_value = None
    funding_program.website = website_value
    funding_program.template_source = program_data.template_source if program_data.template_source else None
    funding_program.template_ref = program_data.template_ref if program_data.template_ref else None
    funding_program.template_name = program_data.template_name if program_data.template_name else None  # Legacy

    try:
        db.commit()
        db.refresh(funding_program)

        # Automatically scrape if website was added or changed
        if funding_program.website and (not old_website or old_website != funding_program.website):
            _auto_scrape_program(funding_program, db)
            db.refresh(funding_program)  # Refresh to get scraped data

        return funding_program
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update funding program"
        ) from None

@router.delete("/funding-programs/{funding_program_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_funding_program(
    funding_program_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user)  # noqa: B008
):
    """
    Delete a funding program.
    """
    funding_program = db.query(FundingProgram).filter(
        FundingProgram.id == funding_program_id,
        FundingProgram.user_email == current_user.email
    ).first()
    if not funding_program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Funding program not found"
        )

    try:
        db.delete(funding_program)
        db.commit()
        return None
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete funding program"
        ) from None


@router.post("/funding-programs/{funding_program_id}/scrape", response_model=FundingProgramResponse)
def scrape_funding_program_data(
    funding_program_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user)  # noqa: B008
):
    """
    Scrape funding program data from the program's website.
    Updates the funding program with scraped data (description, sections, PDF links).
    """
    funding_program = db.query(FundingProgram).filter(
        FundingProgram.id == funding_program_id,
        FundingProgram.user_email == current_user.email
    ).first()
    if not funding_program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Funding program not found"
        )

    if not funding_program.website:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Funding program has no website URL to scrape"
        )

    try:
        logger.info(f"[SCRAPING] Starting scrape for funding_program_id={funding_program_id}, url={funding_program.website}")

        # Scrape the website
        scraped_data = scrape_funding_program(funding_program.website)

        if not scraped_data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to scrape funding program data from website"
            )

        # Update funding program with scraped data
        funding_program.description = scraped_data.get("description")
        funding_program.sections_json = scraped_data.get("sections", [])
        funding_program.content_hash = scraped_data.get("content_hash")
        funding_program.last_scraped_at = datetime.utcnow()

        # Optionally update title if program_name was scraped and different
        if scraped_data.get("program_name") and scraped_data["program_name"] != funding_program.title:
            # Only update if title is generic or empty
            if not funding_program.title or funding_program.title.lower() in ["funding program", "new funding program"]:
                funding_program.title = scraped_data["program_name"]

        db.commit()
        db.refresh(funding_program)

        logger.info(f"[SCRAPING] Scraping completed for funding_program_id={funding_program_id}, sections={len(scraped_data.get('sections', []))}")
        return funding_program

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"[SCRAPING] Error scraping funding_program_id={funding_program_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to scrape funding program: {str(e)}"
        ) from e


@router.post("/funding-programs/{funding_program_id}/refresh", response_model=FundingProgramResponse)
def refresh_funding_program_data(
    funding_program_id: int,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user)  # noqa: B008
):
    """
    Refresh funding program data by re-scraping the website.
    Only re-scrapes if the website content has changed (based on content hash).
    Returns the funding program with updated data if changed, or existing data if unchanged.
    """
    funding_program = db.query(FundingProgram).filter(
        FundingProgram.id == funding_program_id,
        FundingProgram.user_email == current_user.email
    ).first()
    if not funding_program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Funding program not found"
        )

    if not funding_program.website:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Funding program has no website URL to scrape"
        )

    try:
        logger.info(f"[REFRESH] Starting refresh for funding_program_id={funding_program_id}, url={funding_program.website}")

        # Scrape the website
        scraped_data = scrape_funding_program(funding_program.website)

        if not scraped_data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to scrape funding program data from website"
            )

        new_content_hash = scraped_data.get("content_hash")
        old_content_hash = funding_program.content_hash

        # Check if content has changed
        if new_content_hash == old_content_hash:
            logger.info(f"[REFRESH] Content unchanged for funding_program_id={funding_program_id}, hash={new_content_hash}")
            return funding_program  # No changes, return existing data

        # Content has changed, update the funding program
        logger.info(f"[REFRESH] Content changed for funding_program_id={funding_program_id}, updating data")
        funding_program.description = scraped_data.get("description")
        funding_program.sections_json = scraped_data.get("sections", [])
        funding_program.content_hash = new_content_hash
        funding_program.last_scraped_at = datetime.utcnow()

        # Optionally update title if program_name was scraped and different
        if scraped_data.get("program_name") and scraped_data["program_name"] != funding_program.title:
            if not funding_program.title or funding_program.title.lower() in ["funding program", "new funding program"]:
                funding_program.title = scraped_data["program_name"]

        db.commit()
        db.refresh(funding_program)

        logger.info(f"[REFRESH] Refresh completed for funding_program_id={funding_program_id}, sections={len(scraped_data.get('sections', []))}")
        return funding_program

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"[REFRESH] Error refreshing funding_program_id={funding_program_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to refresh funding program: {str(e)}"
        ) from e

# Phase 4: Funding Program Document Ingestion Endpoints

@router.post("/funding-programs/{funding_program_id}/documents/upload", response_model=List[FundingProgramDocumentResponse])
async def upload_funding_program_documents(
    funding_program_id: int,
    files: List[UploadFile] = File(...),
    category: Optional[str] = None,  # Optional category override
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user)  # noqa: B008
):
    """
    Upload multiple documents (PDFs, text files) for a funding program.

    - PDFs: Extracted and stored in DocumentTextCache
    - Text files: Stored in FundingProgram.guidelines_text
    - Auto-organizes by folder structure if category not provided
    - Returns list of uploaded documents with their IDs
    """
    # Verify funding program exists and user owns it
    funding_program = db.query(FundingProgram).filter(
        FundingProgram.id == funding_program_id,
        FundingProgram.user_email == current_user.email
    ).first()

    if not funding_program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Funding program not found"
        )

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided"
        )

    uploaded_documents = []

    try:
        for file in files:
            # Read file content
            content = await file.read()

            # Determine file type
            file_type = get_file_type_from_filename(file.filename or "unknown")

            # Validate file type
            if file_type not in ["pdf", "docx", "txt"]:
                logger.warning(f"Skipping unsupported file type: {file_type} for {file.filename}")
                continue

            # Get or create file record (hash-based deduplication)
            file_record, is_new = get_or_create_file(
                db=db,
                file_bytes=content,
                file_type=file_type,
                filename=file.filename
            )

            # Determine category
            detected_category = category if category and validate_category(category) else detect_category_from_filename(file.filename or "")
            if not validate_category(detected_category):
                detected_category = "general_guidelines"  # Fallback

            # Handle text files specially
            if is_text_file(file.filename or ""):
                # Store text content in FundingProgram.guidelines_text
                text_content = content.decode('utf-8', errors='ignore')
                funding_program.guidelines_text = text_content
                funding_program.guidelines_text_file_id = file_record.id
                logger.info(f"Stored text file content in guidelines_text for funding_program_id={funding_program_id}")

            # Extract text for PDFs/DOCX (uses existing caching)
            # The extraction triggers caching - result not needed here
            if file_type in ["pdf", "docx"]:
                _ = extract_document_text(
                    file_bytes=content,
                    file_content_hash=file_record.content_hash,
                    file_type=file_type,
                    db=db
                )

            # Create FundingProgramDocument record
            program_document = FundingProgramDocument(
                funding_program_id=funding_program_id,
                file_id=file_record.id,
                category=detected_category,
                original_filename=file.filename or "unknown",
                uploaded_by=current_user.email
            )

            db.add(program_document)
            uploaded_documents.append(program_document)

            logger.info(f"Uploaded document: {file.filename} (category: {detected_category}, file_type: {file_type})")

        db.commit()

        # Refresh documents to get IDs
        for doc in uploaded_documents:
            db.refresh(doc)

        # Build response
        response_docs = []
        for doc in uploaded_documents:
            file_record = db.query(FileModel).filter(FileModel.id == doc.file_id).first()
            has_text = False
            if file_record:
                if file_record.file_type in ["pdf", "docx"]:
                    cached_text = get_cached_document_text(db, file_record.content_hash)
                    has_text = cached_text is not None
                elif file_record.file_type == "txt":
                    has_text = True

            response_docs.append(FundingProgramDocumentResponse(
                id=str(doc.id),
                funding_program_id=doc.funding_program_id,
                file_id=str(doc.file_id),
                category=doc.category,
                original_filename=doc.original_filename,
                display_name=doc.display_name,
                uploaded_at=doc.uploaded_at,
                file_type=file_record.file_type if file_record else "unknown",
                file_size=file_record.size_bytes if file_record else 0,
                has_extracted_text=has_text
            ))

        return response_docs

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error uploading documents for funding_program_id={funding_program_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload documents: {str(e)}"
        ) from e


@router.get("/funding-programs/{funding_program_id}/documents", response_model=FundingProgramDocumentListResponse)
def get_funding_program_documents(
    funding_program_id: int,
    category: Optional[str] = None,  # Filter by category
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user)  # noqa: B008
):
    """
    Get all documents for a funding program, optionally filtered by category.
    Returns document metadata including extracted text preview.
    """
    # Verify funding program exists and user owns it
    funding_program = db.query(FundingProgram).filter(
        FundingProgram.id == funding_program_id,
        FundingProgram.user_email == current_user.email
    ).first()

    if not funding_program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Funding program not found"
        )

    # Build query
    query = db.query(FundingProgramDocument).filter(
        FundingProgramDocument.funding_program_id == funding_program_id
    )

    # Filter by category if provided
    if category and validate_category(category):
        query = query.filter(FundingProgramDocument.category == category)

    documents = query.all()

    # Build response
    response_docs = []
    category_counts = {}

    for doc in documents:
        file_record = db.query(FileModel).filter(FileModel.id == doc.file_id).first()
        has_text = False
        if file_record:
            if file_record.file_type in ["pdf", "docx"]:
                cached_text = get_cached_document_text(db, file_record.content_hash)
                has_text = cached_text is not None
            elif file_record.file_type == "txt":
                has_text = True

        response_docs.append(FundingProgramDocumentResponse(
            id=str(doc.id),
            funding_program_id=doc.funding_program_id,
            file_id=str(doc.file_id),
            category=doc.category,
            original_filename=doc.original_filename,
            display_name=doc.display_name,
            uploaded_at=doc.uploaded_at,
            file_type=file_record.file_type if file_record else "unknown",
            file_size=file_record.size_bytes if file_record else 0,
            has_extracted_text=has_text
        ))

        # Count by category
        category_counts[doc.category] = category_counts.get(doc.category, 0) + 1

    return FundingProgramDocumentListResponse(
        documents=response_docs,
        categories=category_counts
    )


@router.get("/funding-programs/{funding_program_id}/documents/{document_id}/text")
def get_document_text(
    funding_program_id: int,
    document_id: str,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user)  # noqa: B008
):
    """
    Get extracted text for a specific document.
    Uses DocumentTextCache for efficient retrieval.
    """
    # Verify funding program exists and user owns it
    funding_program = db.query(FundingProgram).filter(
        FundingProgram.id == funding_program_id,
        FundingProgram.user_email == current_user.email
    ).first()

    if not funding_program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Funding program not found"
        )

    # Get document
    document = db.query(FundingProgramDocument).filter(
        FundingProgramDocument.id == document_id,
        FundingProgramDocument.funding_program_id == funding_program_id
    ).first()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    # Get file record
    file_record = db.query(FileModel).filter(FileModel.id == document.file_id).first()

    if not file_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File record not found"
        )

    # Get text based on file type
    if file_record.file_type == "txt":
        # For text files, return from guidelines_text if available
        if funding_program.guidelines_text:
            return {"text": funding_program.guidelines_text, "source": "guidelines_text"}
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Text content not found"
            )
    elif file_record.file_type in ["pdf", "docx"]:
        # For PDFs/DOCX, get from cache
        extracted_text = get_cached_document_text(db, file_record.content_hash)
        if extracted_text:
            return {"text": extracted_text, "source": "document_text_cache"}
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Extracted text not found. Document may not have been processed yet."
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type {file_record.file_type} does not support text extraction"
        )


@router.delete("/funding-programs/{funding_program_id}/documents/{document_id}")
def delete_funding_program_document(
    funding_program_id: int,
    document_id: str,
    db: Session = Depends(get_db),  # noqa: B008
    current_user: User = Depends(get_current_user)  # noqa: B008
):
    """
    Delete a funding program document.
    Note: File record and storage remain (may be used by other documents).
    """
    # Verify funding program exists and user owns it
    funding_program = db.query(FundingProgram).filter(
        FundingProgram.id == funding_program_id,
        FundingProgram.user_email == current_user.email
    ).first()

    if not funding_program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Funding program not found"
        )

    # Get document
    document = db.query(FundingProgramDocument).filter(
        FundingProgramDocument.id == document_id,
        FundingProgramDocument.funding_program_id == funding_program_id
    ).first()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    # If this is the text file referenced in guidelines_text_file_id, clear it
    if funding_program.guidelines_text_file_id == document.file_id:
        funding_program.guidelines_text = None
        funding_program.guidelines_text_file_id = None

    # Delete document record
    db.delete(document)
    db.commit()

    logger.info(f"Deleted funding program document: {document_id}")

    return {"message": "Document deleted successfully"}
