# Innovo Agent Backend

FastAPI backend for the Innovo Agent application.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the server:
```bash
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`

## API Endpoints

### POST /auth/register
Create a new user account.

**Request Body:**
```json
{
  "email": "user@innovo-consulting.de",
  "password": "password123"
}
```

**Response:**
- 201: Account created successfully
- 409: Account already exists
- 400: Validation error (invalid email domain or password too short)

### POST /auth/login
Authenticate and log in.

**Request Body:**
```json
{
  "email": "user@innovo-consulting.de",
  "password": "password123"
}
```

**Response:**
- 200: Login successful
- 404: User not found
- 401: Incorrect password

## Database

Uses SQLite by default (stored in `innovo.db`). To use PostgreSQL, set the `DATABASE_URL` environment variable.

