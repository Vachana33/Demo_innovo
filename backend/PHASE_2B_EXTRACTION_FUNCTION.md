# Phase 2B: Pure Structured Extraction Function

## Summary

This phase implements a pure extraction function that extracts structured facts from raw company text data. **NO content generation** - only factual extraction.

## Function Signature

**File:** `backend/app/extraction.py`  
**Function:** `extract_company_profile(website_text: str, transcript_text: str) -> Dict[str, Any]`

```python
def extract_company_profile(website_text: str, transcript_text: str) -> Dict[str, Any]:
    """
    Extract structured company profile from raw website and transcript text.
    
    This function performs PURE EXTRACTION - it only extracts factual information
    that exists in the input text. It does NOT generate prose, creative content,
    or funding-style text.
    
    Args:
        website_text: Raw text extracted from company website
        transcript_text: Raw text transcribed from audio recording
        
    Returns:
        Dictionary with structured company profile containing:
        - industry: Company's industry/sector (string or null)
        - products_or_services: List of products/services (list or null)
        - business_model: Business model description (string or null)
        - market: Target market/customers (string or null)
        - innovation_focus: Innovation focus areas (string or null)
        - company_size: Company size if inferable (string or null)
        - location: Company location if inferable (string or null)
        - known_gaps: List of missing important information (list)
        
    Raises:
        ValueError: If OpenAI API key is not configured
        Exception: If extraction fails
    """
```

## Example Input

### Short Example Input

```python
website_text = """
TechCorp GmbH entwickelt innovative KI-Lösungen für das Gesundheitswesen.
Wir bieten Software-as-a-Service (SaaS) Plattformen für Krankenhäuser und 
Arztpraxen. Unser Hauptprodukt ist eine KI-gestützte Diagnoseplattform, die 
Ärzten bei der Früherkennung von Krankheiten hilft. Wir haben unser Büro 
in Berlin und beschäftigen derzeit 45 Mitarbeiter. Unser Zielmarkt sind 
mittelständische Krankenhäuser in Deutschland und Österreich.
"""

transcript_text = """
Besprechung vom 15. Januar 2025:
Wir diskutieren unsere Innovationsschwerpunkte im Bereich Machine Learning 
und Deep Learning. Unser Fokus liegt auf der Entwicklung von 
prädiktiven Analysemodellen für medizinische Daten. Wir arbeiten mit 
verschiedenen Forschungseinrichtungen zusammen.
"""
```

## Example Output JSON

```json
{
  "industry": "Healthcare Technology",
  "products_or_services": [
    "KI-gestützte Diagnoseplattform",
    "SaaS-Plattformen für Krankenhäuser",
    "SaaS-Plattformen für Arztpraxen"
  ],
  "business_model": "Software-as-a-Service (SaaS)",
  "market": "Mittelständische Krankenhäuser in Deutschland und Österreich",
  "innovation_focus": "Machine Learning, Deep Learning, prädiktive Analysemodelle für medizinische Daten",
  "company_size": "45 Mitarbeiter",
  "location": "Berlin",
  "known_gaps": [
    "revenue",
    "founding_year",
    "funding_status",
    "key_competitors",
    "revenue_model_details"
  ]
}
```

### Example with Missing Information

```python
website_text = """
Unser Unternehmen entwickelt Software-Lösungen.
"""

transcript_text = ""
```

**Output:**
```json
{
  "industry": null,
  "products_or_services": ["Software-Lösungen"],
  "business_model": null,
  "market": null,
  "innovation_focus": null,
  "company_size": null,
  "location": null,
  "known_gaps": [
    "industry",
    "business_model",
    "market",
    "company_size",
    "location",
    "revenue",
    "founding_year",
    "funding_status"
  ]
}
```

## Function Location

**File:** `backend/app/extraction.py`

**Rationale:**
- Separate from `preprocessing.py` (which handles raw text extraction)
- Separate from `utils.py` (which handles general utilities)
- Follows the pattern of `jwt_utils.py` (domain-specific utilities)
- Clear separation of concerns: preprocessing extracts raw text, extraction extracts structured data

**Module Structure:**
```
backend/app/
├── preprocessing.py      # Raw text extraction (website crawling, audio transcription)
├── extraction.py         # Structured data extraction (NEW - Phase 2B)
├── utils.py              # General utilities (password hashing, etc.)
└── routers/
    └── documents.py      # Will use extraction.py in Phase 2C
```

## Key Design Decisions

### 1. Pure Extraction (No Generation)
- **Temperature: 0.0** - Deterministic output
- **Prompt emphasizes:** "Extract ONLY facts", "Do NOT generate"
- **No prose generation** - Only structured facts

### 2. Deterministic JSON Output
- **response_format: {"type": "json_object"}** - Forces JSON mode
- **Strict validation** - Ensures all required fields exist
- **Consistent structure** - Always returns same field names

### 3. Missing Information Handling
- **Uses `null`** for missing information (not "unknown" or empty strings)
- **`known_gaps` field** - Explicitly lists what information is missing
- **No assumptions** - Only extracts what's explicitly stated

### 4. Language Handling
- **English keys** - All JSON keys in English
- **German values allowed** - Extracted values can be in German if source is German
- **Consistent structure** - Language-agnostic JSON structure

### 5. Minimal Target Fields
- **8 fields total** - Kept minimal as requested
- **Focused on business facts** - Industry, products, market, etc.
- **Extensible** - Easy to add more fields later if needed

## Output Schema

```typescript
interface CompanyProfile {
  industry: string | null;
  products_or_services: string[] | null;
  business_model: string | null;
  market: string | null;
  innovation_focus: string | null;
  company_size: string | null;
  location: string | null;
  known_gaps: string[];  // Always a list (empty if nothing missing)
}
```

## Error Handling

The function:
- **Raises `ValueError`** if OpenAI API key is missing
- **Raises `Exception`** if extraction fails (logged but not suppressed)
- **Validates JSON structure** - Ensures all required fields exist
- **Logs errors** - All errors are logged with context

## Testing the Function

```python
from app.extraction import extract_company_profile

# Test with example input
website = "TechCorp develops AI solutions for healthcare..."
transcript = "We have 50 employees in Berlin..."

try:
    profile = extract_company_profile(website, transcript)
    print(json.dumps(profile, indent=2, ensure_ascii=False))
except Exception as e:
    print(f"Extraction failed: {e}")
```

## Integration Status

**Status:** ✅ Function created, **NOT yet integrated**

**Next Steps (Phase 2C):**
1. Integrate into `process_company_background()` in `companies.py`
2. Update extraction status tracking
3. Store extracted profile in `company.company_profile` field
4. Update LLM prompts to use structured profile when available

## Files Created

1. `backend/app/extraction.py` - Extraction function implementation

## Files NOT Modified (Integration pending)

- ✅ `backend/app/routers/companies.py` - Will integrate in Phase 2C
- ✅ `backend/app/routers/documents.py` - Will use structured profile in Phase 2C
- ✅ `backend/app/models.py` - Already has schema (Phase 2A)
