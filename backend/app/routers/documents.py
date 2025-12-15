from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Document, Company
from app.schemas import DocumentResponse, DocumentUpdate, DocumentContent
from typing import List

router = APIRouter()

@router.get(
    "/documents/{company_id}/vorhabensbeschreibung",
    response_model=DocumentResponse
)
def get_document(
    company_id: int,
    db: Session = Depends(get_db)
):
    """
    Get a document for a company by type.
    Currently only supports "vorhabensbeschreibung".
    """
    # Verify company exists
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    # Get or create document
    document = db.query(Document).filter(
        Document.company_id == company_id,
        Document.type == "vorhabensbeschreibung"
    ).first()
    
    if not document:
        # Create empty document if it doesn't exist
        document = Document(
            company_id=company_id,
            type="vorhabensbeschreibung",
            content_json={"sections": []}
        )
        db.add(document)
        db.commit()
        db.refresh(document)
    
    return document

@router.put(
    "/documents/{document_id}",
    response_model=DocumentResponse
)
def update_document(
    document_id: int,
    document_data: DocumentUpdate,
    db: Session = Depends(get_db)
):
    """
    Update a document's content.
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    # Update content
    document.content_json = document_data.content_json
    
    try:
        db.commit()
        db.refresh(document)
        return document
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update document: {str(e)}"
        )

