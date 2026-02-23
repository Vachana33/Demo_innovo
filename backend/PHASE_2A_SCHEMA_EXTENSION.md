# Phase 2A: Schema Extension - Extract → Store → Reference

## Summary

This phase extends the Company model to support structured company profile extraction while maintaining full backward compatibility.

## Changes Made

### 1. Updated SQLAlchemy Company Model

**File:** `backend/app/models.py`  
**Lines:** 53-56

Added three new nullable fields to the `Company` model:

```python
# Structured company profile (Phase 2A: Extract → Store → Reference)
company_profile = Column(JSON, nullable=True)  # Structured extracted company information
extraction_status = Column(String, nullable=True)  # "pending", "extracted", "failed"
extracted_at = Column(DateTime(timezone=True), nullable=True)  # Timestamp when extraction completed
```

### 2. Alembic Migration

**File:** `backend/alembic/versions/0fb7cad86248_add_company_profile_extraction_fields.py`

Migration adds:
- `company_profile`: JSON column (TEXT for SQLite, JSON for PostgreSQL)
- `extraction_status`: String column for tracking extraction state
- `extracted_at`: DateTime column for extraction timestamp

All fields are **nullable** for backward compatibility.

**Migration handles:**
- SQLite compatibility (uses TEXT instead of JSON)
- PostgreSQL compatibility (uses native JSON)
- Safe column existence checks (prevents errors on re-run)
- Proper downgrade path

### 3. Existing Fields Unchanged

**Preserved fields:**
- `website_text` (String, nullable) - Raw crawled website content
- `transcript_text` (String, nullable) - Raw audio transcript
- All other existing Company fields remain unchanged

## Backward Compatibility Confirmation

### ✅ Existing Code Will Continue to Work

**1. Database Queries:**
- All existing queries that access `company.website_text`, `company.transcript_text`, `company.name`, etc. will work unchanged
- New fields are nullable, so existing rows will have `NULL` values (no data loss)

**2. API Schemas:**
- `CompanyResponse` uses `from_attributes = True`, so it will automatically include new fields when present
- `CompanyCreate` doesn't need updates (new fields are auto-generated, not user input)
- Existing API responses will continue to work (new fields will be `null` for existing companies)

**3. LLM Prompt Generation:**
- `documents.py` lines 854-855, 2075-2076: Still access `company.website_text` and `company.transcript_text` directly
- No changes needed - these fields remain unchanged
- New `company_profile` field is not yet used (Phase 2B will add extraction logic)

**4. Background Processing:**
- `companies.py` lines 100-126: Still stores raw text in `website_text` and `transcript_text`
- No changes needed - extraction logic will be added in Phase 2B

### ✅ Migration Safety

**Migration is safe to run:**
- All new columns are nullable (no NOT NULL constraints)
- No data migration required (existing rows get NULL values)
- Migration checks for existing columns before adding (safe to re-run)
- Proper downgrade path exists (can rollback if needed)

### ✅ No Breaking Changes

**Verified:**
- ✅ No existing code references `company_profile`, `extraction_status`, or `extracted_at`
- ✅ All existing Company fields remain unchanged
- ✅ All existing queries continue to work
- ✅ All existing API endpoints continue to work
- ✅ Pydantic schemas don't need updates (auto-include via `from_attributes`)

## Next Steps (Phase 2B)

Phase 2B will add:
1. Extraction function to create structured `company_profile` from raw text
2. Integration into background processing pipeline
3. Update LLM prompts to use structured profile when available

## Testing the Migration

To test the migration:

```bash
cd backend

# Check current migration status
python3 -m alembic current

# Run migration
python3 -m alembic upgrade head

# Verify new columns exist
python3 -c "from app.database import engine; from sqlalchemy import inspect; inspector = inspect(engine); print([c['name'] for c in inspector.get_columns('companies')])"

# Rollback if needed (for testing)
python3 -m alembic downgrade -1
```

## Files Modified

1. `backend/app/models.py` - Added 3 new fields to Company model
2. `backend/alembic/versions/0fb7cad86248_add_company_profile_extraction_fields.py` - New migration file

## Files NOT Modified (Backward Compatibility)

- ✅ `backend/app/routers/documents.py` - No changes (still uses raw text)
- ✅ `backend/app/routers/companies.py` - No changes (still stores raw text)
- ✅ `backend/app/schemas.py` - No changes (auto-includes new fields)
- ✅ `backend/app/preprocessing.py` - No changes (still extracts raw text)
