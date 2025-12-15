from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import UserCreate, UserLogin, AuthResponse
from app.utils import hash_password, verify_password

router = APIRouter()

@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """
    Create a new user account.
    """
    # Check if user already exists (case-insensitive)
    existing_user = db.query(User).filter(User.email == user_data.email.lower()).first()
    print("the existing user is", existing_user)
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Account already exists. Please log in."
        )
    
    # Hash password
    password_hash = hash_password(user_data.password)
    print("the password hash is", password_hash)
    # Create new user
    new_user = User(
        email=user_data.email.lower(),
        password_hash=password_hash
    )
    print("the new user is", new_user)
    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return AuthResponse(
            success=True,
            message="Account created successfully"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create account"
        )

@router.post("/login", response_model=AuthResponse)
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    """
    Authenticate user and log in.
    """
    # Find user by email (case-insensitive)
    user = db.query(User).filter(User.email == user_data.email.lower()).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found. Please create an account."
        )
    
    # Verify password
    if not verify_password(user_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password."
        )
    
    return AuthResponse(
        success=True,
        message="Login successful"
    )

