from dotenv import load_dotenv
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"

# Conditionally load .env file if it exists (dev only)
if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH)

# Optional debug logging (only if DEBUG_ENV_LOG=true)
if os.getenv("DEBUG_ENV_LOG", "").lower() == "true":
    print("ENV FILE USED:", ENV_PATH if ENV_PATH.exists() else "None (using system env)")
    print("OPENAI KEY FOUND:", bool(os.getenv("OPENAI_API_KEY")))
    print("JWT SECRET KEY FOUND:", bool(os.getenv("JWT_SECRET_KEY")))

# Environment validation - fail early with clear errors
import logging
logger = logging.getLogger(__name__)

# JWT_SECRET_KEY is required (no fallback for security)
if not os.getenv("JWT_SECRET_KEY"):
    raise RuntimeError("JWT_SECRET_KEY is required. Set it via environment variables.")

# OPENAI_API_KEY is optional but recommended (warn only)
if not os.getenv("OPENAI_API_KEY"):
    logger.warning("OPENAI_API_KEY is not set. OpenAI features may not work.")

# DATABASE_URL is optional (SQLite fallback handled in database.py)
# Production (Render): DATABASE_URL must be set to PostgreSQL connection string
# Local development: Falls back to SQLite if DATABASE_URL is not set
# No validation needed here - database.py already handles SQLite fallback

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.database import engine, Base
from app.routers import auth, funding_programs, companies, documents

# Create database tables
# Note: In production (PostgreSQL on Render), use Alembic migrations instead
# This create_all() is kept for local development convenience
# For production: run "alembic upgrade head" after setting DATABASE_URL
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Innovo Agent API", version="1.0.0")

# CORS configuration - environment-driven
# Production: Set FRONTEND_ORIGIN environment variable to your frontend URL (e.g., https://demo-innovo-frontend.onrender.com)
# Development: If FRONTEND_ORIGIN is not set, falls back to localhost origins for local development
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN")
if FRONTEND_ORIGIN:
    # Production: use single origin from environment variable
    cors_origins = [FRONTEND_ORIGIN]
else:
    # Development: default localhost origins for local development
    cors_origins = [
        "http://localhost:3000",
        "http://localhost:5173",  # Vite default port
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]

# Optional debug logging
if os.getenv("DEBUG_ENV_LOG", "").lower() == "true":
    print("CORS ALLOWED ORIGINS:", cors_origins)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers to ensure CORS headers are always present
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Ensure CORS headers are present on HTTP exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Ensure CORS headers are present on validation errors"""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()},
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Ensure CORS headers are present on all exceptions"""
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

# Include routers
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(funding_programs.router, tags=["funding-programs"])
app.include_router(companies.router, tags=["companies"])
app.include_router(documents.router, tags=["documents"])

@app.get("/")
def root():
    return {"message": "Innovo Agent API"}

@app.get("/health")
def health():
    return {"status": "ok"}

