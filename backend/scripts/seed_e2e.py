"""
Seed an E2E login user into the database.

Reads E2E_TEST_EMAIL and E2E_TEST_PASSWORD from environment.
Uses the app's User model and password hashing (bcrypt).
Idempotent: if user exists, does nothing.

Run from backend directory:
  python scripts/seed_e2e.py
Or from repo root:
  PYTHONPATH=backend python backend/scripts/seed_e2e.py
"""
import os
import sys
from pathlib import Path

# Ensure backend/app is importable when run as script
_backend = Path(__file__).resolve().parent.parent
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))

from app.database import SessionLocal
from app.models import User
from app.utils import hash_password


def main() -> None:
    email = os.environ.get("E2E_TEST_EMAIL")
    password = os.environ.get("E2E_TEST_PASSWORD")

    if not email or not email.strip():
        raise SystemExit("Error: E2E_TEST_EMAIL is required. Set it in the environment (e.g. .env.e2e).")
    if not password or not password.strip():
        raise SystemExit("Error: E2E_TEST_PASSWORD is required. Set it in the environment (e.g. .env.e2e).")

    email = email.strip()
    password = password.strip()

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            print("E2E user already exists")
            return

        password_hash = hash_password(password)
        user = User(email=email, password_hash=password_hash)
        db.add(user)
        db.commit()
        print("Seeded E2E user")
    finally:
        db.close()


if __name__ == "__main__":
    main()
