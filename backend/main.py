from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import auth, funding_programs, companies, documents

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Innovo Agent API", version="1.0.0")

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",  # Vite default port
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

