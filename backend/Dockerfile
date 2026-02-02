# Use Python 3.10 slim image for smaller size
# Upgraded from 3.9 to 3.10 because python-multipart>=0.0.22 requires Python >=3.10
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Copy requirements file first for better Docker layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend application code
COPY . .

# Copy frontend static files if they exist (for serving frontend from backend)
# Frontend should be built and copied to backend/static before Docker build
# If static directory doesn't exist, backend will run in API-only mode
# To build: 1) Build frontend: cd frontend && npm run build
#           2) Copy dist: cp -r frontend/dist backend/static
#           3) Build Docker: docker build -t innovo-backend ./backend

# Expose port 8000 (default, can be overridden with PORT env var)
EXPOSE 8000

# Run uvicorn server
# PORT environment variable will be set by Render (defaults to 8000 if not set)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]






