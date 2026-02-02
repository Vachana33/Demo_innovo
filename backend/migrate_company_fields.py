"""
Migration script to add new fields to the companies table.
Run this once to update existing database schema.
"""
from sqlalchemy import text
from app.database import engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate_company_table():
    """
    Add new columns to companies table if they don't exist.
    SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS directly,
    so we check first and add if missing.
    """
    with engine.begin() as conn:  # Use begin() for transaction management
        try:
            # Check if columns exist by querying table info
            result = conn.execute(text("PRAGMA table_info(companies)"))
            columns = [row[1] for row in result]

            # Add website_text if missing
            if 'website_text' not in columns:
                logger.info("Adding website_text column...")
                conn.execute(text("ALTER TABLE companies ADD COLUMN website_text TEXT"))
                logger.info("Added website_text column")
            else:
                logger.info("website_text column already exists")

            # Add transcript_text if missing
            if 'transcript_text' not in columns:
                logger.info("Adding transcript_text column...")
                conn.execute(text("ALTER TABLE companies ADD COLUMN transcript_text TEXT"))
                logger.info("Added transcript_text column")
            else:
                logger.info("transcript_text column already exists")

            # Add processing_status if missing
            if 'processing_status' not in columns:
                logger.info("Adding processing_status column...")
                # SQLite doesn't support NOT NULL with DEFAULT in ALTER TABLE
                # So we add it as nullable with default, then update existing rows
                conn.execute(text("ALTER TABLE companies ADD COLUMN processing_status TEXT DEFAULT 'pending'"))
                # Update existing rows to have 'pending' status
                conn.execute(text("UPDATE companies SET processing_status = 'pending' WHERE processing_status IS NULL"))
                logger.info("Added processing_status column")
            else:
                logger.info("processing_status column already exists")

            # Add processing_error if missing
            if 'processing_error' not in columns:
                logger.info("Adding processing_error column...")
                conn.execute(text("ALTER TABLE companies ADD COLUMN processing_error TEXT"))
                logger.info("Added processing_error column")
            else:
                logger.info("processing_error column already exists")

            logger.info("Migration completed successfully!")

        except Exception as e:
            logger.error(f"Migration failed: {str(e)}")
            raise

if __name__ == "__main__":
    migrate_company_table()

