"""
Migration script to add password reset fields to the users table.
Run this once to update existing database schema.
"""
from sqlalchemy import text
from app.database import engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate_user_table():
    """
    Add password reset columns to users table if they don't exist.
    SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS directly,
    so we check first and add if missing.
    """
    with engine.begin() as conn:  # Use begin() for transaction management
        try:
            # Check if columns exist by querying table info
            result = conn.execute(text("PRAGMA table_info(users)"))
            columns = [row[1] for row in result]

            # Add reset_token_hash if missing
            if 'reset_token_hash' not in columns:
                logger.info("Adding reset_token_hash column...")
                conn.execute(text("ALTER TABLE users ADD COLUMN reset_token_hash TEXT"))
                logger.info("Added reset_token_hash column")
            else:
                logger.info("reset_token_hash column already exists")

            # Add reset_token_expiry if missing
            if 'reset_token_expiry' not in columns:
                logger.info("Adding reset_token_expiry column...")
                conn.execute(text("ALTER TABLE users ADD COLUMN reset_token_expiry DATETIME"))
                logger.info("Added reset_token_expiry column")
            else:
                logger.info("reset_token_expiry column already exists")

            logger.info("Migration completed successfully!")

        except Exception as e:
            logger.error(f"Migration failed: {str(e)}")
            raise

if __name__ == "__main__":
    migrate_user_table()


