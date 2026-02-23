# Phase 2C: Integration of Extraction into Preprocessing

## Summary

This phase integrates the `extract_company_profile()` function into the existing `process_company_background()` flow. Extraction runs automatically after website/audio processing completes, stores structured profiles, and handles errors gracefully.

## Exact Code Changes

### 1. Imports Added

**File:** `backend/app/routers/companies.py`  
**Lines:** 1-15

```python
# Added imports:
from app.extraction import extract_company_profile
from datetime import datetime, timezone
```

### 2. Extraction Integration

**File:** `backend/app/routers/companies.py`  
**Function:** `process_company_background()`  
**Lines:** 145-180

**Added after line 143 (after preprocessing completes):**

```python
# Phase 2C: Extract structured company profile
# Only run extraction if we have text data and haven't extracted yet
has_text_data = (company.website_text and company.website_text.strip()) or (company.transcript_text and company.transcript_text.strip())
already_extracted = company.extraction_status == "extracted"

if has_text_data and not already_extracted:
    try:
        logger.info(f"Starting structured profile extraction for company_id={company_id}")
        
        # Update extraction status to processing
        company.extraction_status = "pending"
        db.commit()
        
        # Extract structured profile from raw text
        website_text = company.website_text or ""
        transcript_text = company.transcript_text or ""
        
        company_profile = extract_company_profile(website_text, transcript_text)
        
        # Store extracted profile
        company.company_profile = company_profile
        company.extraction_status = "extracted"
        company.extracted_at = datetime.now(timezone.utc)
        db.commit()
        
        logger.info(f"Structured profile extraction completed for company_id={company_id}")
        
    except Exception as e:
        # Extraction failed - mark as failed but don't fail the entire preprocessing
        error_msg = f"Profile extraction failed: {str(e)}"
        logger.error(f"Profile extraction failed for company_id={company_id}: {error_msg}")
        
        try:
            company.extraction_status = "failed"
            # Don't set extracted_at if extraction failed
            db.commit()
        except Exception as commit_error:
            logger.error(f"Failed to update extraction error status for company_id={company_id}: {str(commit_error)}")
elif already_extracted:
    logger.info(f"Skipping extraction for company_id={company_id} - already extracted")
elif not has_text_data:
    logger.info(f"Skipping extraction for company_id={company_id} - no text data available")
```

## Integration Flow

```
1. Company created → Background task starts
2. Website crawling (if provided)
   └─> Stores in company.website_text
3. Audio transcription (if provided)
   └─> Stores in company.transcript_text
4. Preprocessing status = "done"
5. [NEW] Check if extraction needed:
   - Has text data? (website_text OR transcript_text)
   - Not already extracted? (extraction_status != "extracted")
6. [NEW] If conditions met:
   - Set extraction_status = "pending"
   - Call extract_company_profile()
   - Store in company.company_profile
   - Set extraction_status = "extracted"
   - Set extracted_at = now()
7. [NEW] If extraction fails:
   - Set extraction_status = "failed"
   - Log error
   - Continue (don't fail preprocessing)
```

## Error Handling Strategy

### 1. Extraction Failure Handling

**Strategy:** Extraction failures do NOT fail the entire preprocessing flow.

**Implementation:**
- Extraction wrapped in try-except block
- If extraction fails:
  - `extraction_status = "failed"`
  - Error logged with context
  - Preprocessing continues (status remains "done")
  - `extracted_at` is NOT set (remains null)

**Rationale:**
- Preprocessing (website/audio) is independent of extraction
- Document generation can still work with raw text
- Extraction can be retried later if needed

### 2. Database Commit Safety

**Strategy:** Separate commits for extraction status updates.

**Implementation:**
- Extraction status updated before extraction attempt
- Profile stored in separate commit after successful extraction
- Error status update wrapped in try-except (prevents cascade failures)

**Rationale:**
- Prevents partial state if extraction fails mid-process
- Allows retry mechanism (can check `extraction_status`)

### 3. Re-extraction Prevention

**Strategy:** Only extract once per company.

**Implementation:**
- Check `extraction_status == "extracted"` before running
- Skip extraction if already extracted
- Log skip reason for debugging

**Rationale:**
- Avoids unnecessary API calls
- Prevents overwriting existing profiles
- Idempotent operation

### 4. Missing Data Handling

**Strategy:** Skip extraction if no text data available.

**Implementation:**
- Check for non-empty `website_text` OR `transcript_text`
- Skip extraction if both are empty/null
- Log skip reason

**Rationale:**
- Extraction requires input data
- Avoids API calls with empty input
- Clear logging for debugging

## Confirmation: Document Flows Unaffected

### ✅ Existing Document Generation Flow

**File:** `backend/app/routers/documents.py`  
**Function:** `generate_content()`  
**Lines:** 852-855

**Current code (unchanged):**
```python
# Prepare company data
company_name = company.name or "Unknown Company"
website_text = company.website_text or ""  # Still uses raw text
transcript_text = company.transcript_text or ""  # Still uses raw text
```

**Status:** ✅ **No changes** - Still uses raw text directly

### ✅ Existing Chat Editing Flow

**File:** `backend/app/routers/documents.py`  
**Function:** `chat_with_document()`  
**Lines:** 2074-2076

**Current code (unchanged):**
```python
# Prepare company data
company_name = company.name or "Unknown Company"
website_text = company.website_text or ""  # Still uses raw text
transcript_text = company.transcript_text or ""  # Still uses raw text
```

**Status:** ✅ **No changes** - Still uses raw text directly

### ✅ Processing Status Check

**File:** `backend/app/routers/documents.py`  
**Function:** `generate_content()`  
**Line:** 813

**Current code (unchanged):**
```python
if company.processing_status != "done":
    raise HTTPException(...)
```

**Status:** ✅ **No changes** - Still checks `processing_status` (not `extraction_status`)

### ✅ Question Answering Flow

**File:** `backend/app/routers/documents.py`  
**Function:** `_extract_context_for_question()`  
**Line:** 1965

**Current code (unchanged):**
```python
website_text=company.website_text or "",  # Still uses raw text
```

**Status:** ✅ **No changes** - Still uses raw text directly

## Verification Checklist

- ✅ Extraction runs only after website/audio processing completes
- ✅ Extraction runs ONCE per company (checks `extraction_status`)
- ✅ Stores `company_profile`, `extraction_status`, `extracted_at`
- ✅ If extraction fails, marks status = "failed" and continues safely
- ✅ Does NOT change any document generation logic
- ✅ Does NOT change any chat editing logic
- ✅ Does NOT change any question answering logic
- ✅ Preprocessing status check unchanged
- ✅ All existing code paths continue to work

## Testing the Integration

### Test Case 1: Successful Extraction

```python
# Create company with website and audio
# Wait for preprocessing to complete
# Verify:
# - company.processing_status == "done"
# - company.extraction_status == "extracted"
# - company.company_profile is not None
# - company.extracted_at is not None
```

### Test Case 2: Extraction Failure

```python
# Create company with website
# Mock extract_company_profile() to raise exception
# Verify:
# - company.processing_status == "done" (preprocessing succeeded)
# - company.extraction_status == "failed"
# - company.company_profile is None
# - company.extracted_at is None
# - Document generation still works (uses raw text)
```

### Test Case 3: Re-extraction Prevention

```python
# Create company and let extraction complete
# Manually trigger process_company_background() again
# Verify:
# - Extraction is skipped (already_extracted check)
# - No duplicate API calls
# - Profile unchanged
```

### Test Case 4: Missing Data

```python
# Create company without website or audio
# Verify:
# - company.processing_status == "done"
# - Extraction skipped (no text data)
# - company.extraction_status is None
```

## Files Modified

1. `backend/app/routers/companies.py` - Added extraction integration

## Files NOT Modified (Document Flows Unchanged)

- ✅ `backend/app/routers/documents.py` - No changes (still uses raw text)
- ✅ `backend/app/schemas.py` - No changes
- ✅ `backend/app/models.py` - Already has schema (Phase 2A)
- ✅ `backend/app/extraction.py` - Already implemented (Phase 2B)

## Next Steps (Phase 2D - Future)

Phase 2D will update LLM prompts to use structured profile when available:
1. Check if `company_profile` exists
2. If exists, use structured data instead of raw text
3. Fallback to raw text if profile missing
4. Update both initial generation and chat editing prompts
