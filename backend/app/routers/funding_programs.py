from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import FundingProgram, User
from app.schemas import FundingProgramCreate, FundingProgramResponse
from app.dependencies import get_current_user
from typing import List

router = APIRouter()

@router.post("/funding-programs", response_model=FundingProgramResponse, status_code=status.HTTP_201_CREATED)
def create_funding_program(
    program_data: FundingProgramCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new funding program.
    """
    if not program_data.title or not program_data.title.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Title is required"
        )
    
    # Create new funding program
    new_program = FundingProgram(
        title=program_data.title.strip(),
        website=program_data.website.strip() if program_data.website else None
    )
    
    try:
        db.add(new_program)
        db.commit()
        db.refresh(new_program)
        return new_program
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create funding program"
        )

@router.get("/funding-programs", response_model=List[FundingProgramResponse])
def get_funding_programs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all funding programs.
    """
    programs = db.query(FundingProgram).order_by(FundingProgram.created_at.desc()).all()
    return programs

@router.put("/funding-programs/{funding_program_id}", response_model=FundingProgramResponse)
def update_funding_program(
    funding_program_id: int,
    program_data: FundingProgramCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update an existing funding program.
    """
    funding_program = db.query(FundingProgram).filter(FundingProgram.id == funding_program_id).first()
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
    funding_program.title = program_data.title.strip()
    funding_program.website = program_data.website.strip() if program_data.website else None
    
    try:
        db.commit()
        db.refresh(funding_program)
        return funding_program
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update funding program"
        )

@router.delete("/funding-programs/{funding_program_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_funding_program(
    funding_program_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a funding program.
    """
    funding_program = db.query(FundingProgram).filter(FundingProgram.id == funding_program_id).first()
    if not funding_program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Funding program not found"
        )
    
    try:
        db.delete(funding_program)
        db.commit()
        return None
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete funding program"
        )

