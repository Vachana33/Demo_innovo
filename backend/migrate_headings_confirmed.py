"""
Migration script to add headings_confirmed field to the documents table.
Run this once to update existing database schema.
"""
from sqlalchemy import text
from app.database import engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate_documents_table():
    """
    Add headings_confirmed column to documents table if it doesn't exist.
    SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS directly,
    so we check first and add if missing.
    """
    with engine.begin() as conn:  # Use begin() for transaction management
        try:
            # Check database type
            from urllib.parse import urlparse
            import os
            database_url = os.getenv("DATABASE_URL", "sqlite:///./innovo.db")
            parsed_url = urlparse(database_url)
            is_sqlite = parsed_url.scheme == "sqlite" or "sqlite" in database_url.lower()
            is_postgres = parsed_url.scheme in ("postgres", "postgresql") or parsed_url.scheme.startswith("postgresql")
            
            if is_sqlite:
                # SQLite: Check if column exists by querying table info
                result = conn.execute(text("PRAGMA table_info(documents)"))
                columns = [row[1] for row in result]
                
                if 'headings_confirmed' not in columns:
                    logger.info("Adding headings_confirmed column (SQLite INTEGER)...")
                    conn.execute(text("ALTER TABLE documents ADD COLUMN headings_confirmed INTEGER NOT NULL DEFAULT 0"))
                    logger.info("Added headings_confirmed column")
                else:
                    logger.info("headings_confirmed column already exists")
                    
            elif is_postgres:
                # PostgreSQL: Check if column exists
                result = conn.execute(text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'documents' AND column_name = 'headings_confirmed'
                """))
                exists = result.fetchone() is not None
                
                if not exists:
                    # Use INTEGER for cross-database compatibility (matches model definition)
                    logger.info("Adding headings_confirmed column (PostgreSQL INTEGER)...")
                    conn.execute(text("ALTER TABLE documents ADD COLUMN headings_confirmed INTEGER NOT NULL DEFAULT 0"))
                    logger.info("Added headings_confirmed column")
                else:
                    logger.info("headings_confirmed column already exists")
            else:
                logger.warning(f"Unknown database type, attempting generic migration")
                # Try generic approach
                try:
                    conn.execute(text("ALTER TABLE documents ADD COLUMN headings_confirmed INTEGER NOT NULL DEFAULT 0"))
                    logger.info("Added headings_confirmed column (generic)")
                except Exception as e:
                    logger.error(f"Failed to add column: {str(e)}")
                    raise
            
            logger.info("Migration completed successfully!")
            
        except Exception as e:
            logger.error(f"Migration failed: {str(e)}")
            raise

if __name__ == "__main__":
    migrate_documents_table()
