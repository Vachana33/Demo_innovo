from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import FundingProgram, Company
from app.schemas import CompanyCreate, CompanyResponse
from typing import List

router = APIRouter()

@router.post(
    "/funding-programs/{funding_program_id}/companies",
    response_model=CompanyResponse,
    status_code=status.HTTP_201_CREATED
)
def create_company_in_program(
    funding_program_id: int,
    company_data: CompanyCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new company and automatically link it to the given funding program.
    """
    # Verify funding program exists
    funding_program = db.query(FundingProgram).filter(FundingProgram.id == funding_program_id).first()
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
    
    # Create new company
    new_company = Company(
        name=company_data.name.strip(),
        website=company_data.website.strip() if company_data.website else None,
        audio_path=company_data.audio_path.strip() if company_data.audio_path else None
    )
    
    try:
        db.add(new_company)
        db.flush()  # Flush to get the company ID
        
        # Link company to funding program
        funding_program.companies.append(new_company)
        
        db.commit()
        db.refresh(new_company)
        return new_company
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
    db: Session = Depends(get_db)
):
    """
    Get all companies linked to a specific funding program.
    """
    # Verify funding program exists
    funding_program = db.query(FundingProgram).filter(FundingProgram.id == funding_program_id).first()
    if not funding_program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Funding program not found"
        )
    
    # Return companies linked to this funding program
    return funding_program.companies

@router.get("/companies", response_model=List[CompanyResponse])
def get_all_companies(db: Session = Depends(get_db)):
    """
    Get all companies across all funding programs.
    Used for importing existing companies.
    """
    companies = db.query(Company).order_by(Company.created_at.desc()).all()
    return companies

@router.get("/companies/{company_id}", response_model=CompanyResponse)
def get_company(company_id: int, db: Session = Depends(get_db)):
    """
    Get a single company by ID.
    """
    company = db.query(Company).filter(Company.id == company_id).first()
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
    db: Session = Depends(get_db)
):
    """
    Import an existing company into a funding program.
    Only creates an entry in the join table, does not create a new company.
    """
    # Verify funding program exists
    funding_program = db.query(FundingProgram).filter(FundingProgram.id == funding_program_id).first()
    if not funding_program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Funding program not found"
        )
    
    # Verify company exists
    company = db.query(Company).filter(Company.id == company_id).first()
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
    db: Session = Depends(get_db)
):
    """
    Update an existing company.
    """
    company = db.query(Company).filter(Company.id == company_id).first()
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
    db: Session = Depends(get_db)
):
    """
    Delete a company.
    This removes the company from the database entirely.
    """
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    try:
        db.delete(company)
        db.commit()
        return None
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete company"
        )

