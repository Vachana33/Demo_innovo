# Demo_innovo

**AI-powered funding document generation platform** for Innovo Consulting. The system produces structured grant proposals (Vorhabensbeschreibung) by combining funding-program rules, cleaned company data, and an optional writing-style profile, with section-level generation and a suggest/approve workflow.

---

## 1. Project Overview

### What the system does

- **Companies**: Create companies, attach website URL and/or meeting audio. Background preprocessing crawls the website, transcribes audio (Whisper), cleans text, and optionally extracts a structured company profile (JSON) via LLM. All heavy work is cached by input hash so the same file or URL is never processed twice.
- **Funding programs**: Define programs and attach guideline documents (PDF/DOCX). Guidelines are extracted (with cache), then an LLM extracts structured rules (eligibility, limits, required sections, etc.). One summary per program is stored and reused for generation.
- **Alte Vorhabensbeschreibung**: Upload historical PDFs; the system extracts text (cached by file hash), builds a combined hash of inputs, and generates a single **style profile** (structure, tone, rules, storytelling). The profile is reused for all document generation; raw PDFs are not sent to the document generator.
- **Templates**: System templates (e.g. `wtt_v1`) and user-defined templates define section structure (headings + optional milestone tables). Documents are created from a template so headings are fixed before generation.
- **Document pipeline**: A document is tied to (company, funding program, type). User confirms headings, then triggers **batch section generation** (empty sections filled in one or more LLM calls). Later, **section-level editing** is done via chat: user requests changes (e.g. “1.3 add content”), backend returns suggested content; user **approves** (saved, section title unchanged) or **rejects** (discarded).

### Core architecture idea

- **Loose linking**: Companies and funding programs are many-to-many. A document is a single (company, funding_program, type) so the same company can have different proposals for different programs.
- **Structured inputs, not raw blobs**: Guidelines → rules JSON; company raw text → cleaned text + optional company_profile JSON; historical PDFs → style profile JSON. Generation prompts consume these structured inputs for controllable, auditable output.
- **Hash-based caching and deduplication**: File content is hashed (SHA256). Transcription and document extraction are keyed by `file_content_hash`; website text by normalized URL hash. Same input ⇒ same cache entry ⇒ no duplicate LLM or external API calls. Style and guidelines summaries use combined hashes of source content for invalidation.

### High-level workflow

```
[Companies]                    [Funding Programs]              [Alte Vorhabensbeschreibung]
     |                                  |                                    |
     v                                  v                                    v
Website / Audio  -->  Preprocess     Guidelines PDFs  -->  Extract rules   Historical PDFs  -->  Style profile
     |                (cached)              |                (cached)              |                (combined hash)
     v                                      v                                    v
company_profile (optional)           rules_json                          style_summary_json
website_clean_text, transcript_clean        |                                    |
     |                                      |                                    |
     +--------------------------------------+------------------------------------+
                                            |
                                            v
[Documents]
     |
     v
Template (system/user)  -->  Sections (headings only)
     |
     v
User confirms headings  -->  headings_confirmed = true
     |
     v
Generate content  -->  _generate_batch_content(rules, company, style)  -->  Sections filled
     |
     v
User edits via chat  -->  "1.3 add content"  -->  _generate_section_content  -->  Suggest
     |
     v
User Approve / Reject  -->  If approve: PATCH section content only (title unchanged)
```

---

## 2. System Architecture

### Frontend architecture

- **Stack**: React 19, TypeScript, Vite, React Router 7. State: React Context (e.g. Auth), local component state.
- **Modular pages**: One folder per main route (e.g. `LoginPage`, `DashboardPage`, `CompaniesPage`, `FundingProgramsPage`, `DocumentsPage`, `EditorPage`, `TemplatesPage`, `TemplateEditorPage`, `AlteVorhabensbeschreibungPage`, `ProjectPage`). Each typically has a `*.module.css` for scoped styles.
- **API layer**: Central `utils/api.ts` with `apiGet`, `apiPost`, `apiPut`, `apiDelete`, `apiUploadFile`, `apiUploadFiles`, `apiDownloadFile`. Base URL from `VITE_API_URL`; JWT in `Authorization` header; 401 clears token and can trigger logout.
- **Editor flow**: EditorPage loads document by `GET /documents/{company_id}/vorhabensbeschreibung?funding_program_id=...&template_id=...`. Mode is derived from state: no content ⇒ reviewHeadings / confirmedHeadings; has content ⇒ editingContent (chat + section editor). Confirm-headings and generate-content are separate API calls; chat uses suggest → approve/reject with refetch after confirm.

### Backend architecture

- **Framework**: FastAPI. Auth: JWT (python-jose, passlib); `get_current_user` dependency enforces ownership on companies, programs, documents.
- **Routers**: `auth`, `companies`, `funding_programs`, `documents`, `templates`, `alte_vorhabensbeschreibung`. Documents router holds the generation and chat/confirm logic; companies and funding_programs trigger background preprocessing and guideline summary generation.
- **Background tasks**: FastAPI `BackgroundTasks`. Used for company preprocessing (website + audio) and for triggering guideline summary regeneration when guideline files change. No separate queue; single-process.

### Database structure overview

- **Core**: `users` (email, password_hash); `companies` (name, website, audio_path, website_*_text, transcript_*_text, company_profile, processing_status, user_email); `funding_programs` (title, website, user_email); many-to-many `funding_program_companies`.
- **Documents**: `documents` (company_id, funding_program_id, type, content_json, headings_confirmed, template_id, template_name, chat_history, updated_at). Unique on (company_id, funding_program_id, type).
- **Files & storage**: `files` (id UUID, content_hash UNIQUE, storage_path, file_type, size_bytes). Blobs live in Supabase Storage; DB stores path and hash for deduplication and cache keys.
- **Caches**: `audio_transcript_cache` (file_content_hash UNIQUE, transcript_text); `website_text_cache` (url_hash UNIQUE, website_text); `document_text_cache` (file_content_hash UNIQUE, extracted_text). All keyed for deterministic reuse.
- **Program/company docs**: `funding_program_documents`, `company_documents` link programs/companies to `files` with category or metadata. `funding_program_guidelines_summary` stores rules_json and source_file_hash for invalidation. `alte_vorhabensbeschreibung_*` tables for uploaded PDFs and one `style_profile` (combined_hash, style_summary_json).
- **Templates**: `user_templates` (id UUID, name, template_structure JSON, user_email). System templates live in code (`app/templates/`).

### Storage layer (Supabase)

- **Role**: All binary blobs (uploaded audio, PDFs, DOCX) are stored in Supabase Storage, not on the app server. `app/file_storage.py` uses `SUPABASE_URL`, `SUPABASE_KEY`, and `SUPABASE_STORAGE_BUCKET`.
- **Flow**: Upload: compute SHA256 of bytes → `get_or_create_file`: if `content_hash` exists, return existing row; else upload to Supabase path `{file_type}/{hash[:2]}/{hash}.{ext}`, insert `files` row. Download: read `storage_path` from `files`, download from bucket via Supabase client.
- **Safety**: Access controlled by backend only (service role). Frontend never gets direct storage URLs for private data.

### LLM integration layer

- **OpenAI**: All LLM calls use `openai` (1.x) with `OPENAI_API_KEY`. No Langfuse or other tracer in the repo today; prompts and model names are in code (e.g. `gpt-4o-mini` for generation and section editing).
- **Two roles** (documents router):
  - **Initial generation**: `_generate_batch_content(client, batch_sections, company_name, company_profile, website_clean_text, transcript_clean, funding_program_rules, style_profile)`. Used only by `POST /documents/{id}/generate-content`. Fills empty sections; prompt built from rules, company context, and style.
  - **Section editing**: `_generate_section_content(client, section_id, section_title, current_content, instruction, company_name, company_profile, website_clean_text, transcript_clean, style_profile)`. Used only by `POST /documents/{id}/chat`. Returns new content for one section; chat returns it as suggestion; user approves or rejects; on approve, `POST /documents/{id}/chat/confirm` writes only that section’s content (title unchanged).

### Style extraction layer

- **Input**: List of extracted document texts (from Alte Vorhabensbeschreibung PDFs, via document extraction cache).
- **Process**: `style_extraction.generate_style_profile(doc_texts)` sends combined text (truncated) to one LLM call; returns JSON with e.g. structure_patterns, tone_characteristics, writing_style_rules, storytelling_flow.
- **Storage**: One row in `alte_vorhabensbeschreibung_style_profile`: `combined_hash` (from sorted list of source content hashes), `style_summary_json`. Document generation reads this single profile; no raw PDFs in the prompt.
- **Reproducibility**: Same set of source hashes ⇒ same combined_hash ⇒ same profile. When source set changes, new profile is generated and stored.

### Generation pipeline layer

- **Template resolution**: `template_resolver.get_template_for_document(document, db, user_email)` resolves system template by name or user template by UUID; returns `{ "sections": [ ... ] }`. Document creation (GET with template params) creates a doc with these sections (content empty until generation).
- **Batch generation**: Sections are batched (excluding milestone_table). For each batch, `_generate_batch_content` is called with funding_program_rules (from guidelines summary), company_profile + website_clean_text + transcript_clean, and style_profile. Result map (section_id → content) is merged into document and saved.
- **Section editing**: Chat parses user message for section references and instructions; for each target section, `_generate_section_content` is called; response is returned with `suggested_content` and `requires_confirmation=true`. Frontend shows preview; on approve, `/chat/confirm` updates only those sections’ content and preserves section types (e.g. milestone_table).

### Caching strategy

- **By content hash**: Audio transcript and document text caches are keyed by `file_content_hash` (SHA256 of file bytes). First processing stores result; subsequent use of same file returns cache.
- **By URL**: Website text cache is keyed by normalized URL hash (`processing_cache.hash_url(normalize_url(url))`).
- **By combined hash**: Guidelines summary and style profile use `compute_combined_hash(sorted(list_of_hashes))` so order of inputs doesn’t change the key. When guideline set or style-doc set changes, hash changes and summary/profile are regenerated.
- **No TTL**: Caches are permanent; invalidation is by hash change (e.g. new file, different set of files).

### Hashing and reproducibility design

- **File hash**: `file_storage.compute_file_hash(file_bytes)` = SHA256. Used for: Supabase path, `files.content_hash`, cache lookups (transcript, document text), and combined-hash inputs.
- **URL hash**: Normalized URL (scheme, lowercased host, no default port, etc.) then SHA256. Used for website cache.
- **Combined hash**: Sorted list of hashes joined with `"|"`, then SHA256. Used for style profile and guidelines summary so the same set of sources always yields the same key.
- **Reproducibility**: Same inputs ⇒ same hashes ⇒ same cache entries and same stored summaries/profiles. LLM outputs are not hashed; reproducibility is at the input and cache level. Model and prompt changes can be tracked in code (and optionally in a tracer like Langfuse if integrated later).

---

## 3. Document Generation Pipeline

### Inputs

1. **Funding guidelines**: Guideline documents (PDF/DOCX) attached to the funding program. Text is extracted (with document_text_cache); rules are extracted via LLM into `rules_json` (eligibility_rules, funding_limits, required_sections, forbidden_content, formal_requirements, evaluation_criteria, deadlines, important_notes). Stored in `funding_program_guidelines_summary` and keyed by combined source file hash.
2. **Company**: Cleaned website text and transcript; optional structured `company_profile` from extraction. All come from company preprocessing (and caches).
3. **Style profile**: Single `style_summary_json` from Alte Vorhabensbeschreibung, keyed by combined hash of historical document contents.

### Template and heading confirmation

- Document is created with a template (system or user). Template defines sections (id, title, type, optional content). User sees headings in the editor; “Confirm headings” sets `headings_confirmed = true` and unlocks “Generate content”.
- No structural change to sections after confirmation (backend validates that section titles and section set are unchanged on later updates when `headings_confirmed` is true).

### Section generation

- `POST /documents/{document_id}/generate-content` loads document, company, funding program, and style profile; fetches guidelines summary rules; batches sections (excluding milestone tables); calls `_generate_batch_content` per batch; merges results into `content_json.sections` and saves.
- Prompt order: rules (guidelines) → company context (profile + cleaned text) → style guide → task (generate only for listed section headings, German, formal style, no meta-commentary).

### Suggest → Approve/Reject workflow

- User sends a chat message (e.g. “1.3 add content”). Backend parses section and instruction, calls `_generate_section_content` for each target section, returns `suggested_content: { section_id: content }` and `requires_confirmation: true`.
- Frontend shows suggested content in the main area (preview) and adds an assistant message with Approve/Reject buttons.
- **Approve**: Frontend calls `POST /documents/{document_id}/chat/confirm` per section with `section_id` and `confirmed_content`. Backend updates only that section’s `content`; section title and type are preserved. First line of content that matches the section heading is stripped before save so the title is not duplicated. Frontend refetches document (with same query params) and updates state.
- **Reject**: Frontend clears preview and adds a chat message; no API call and no change to stored content.

### Metadata tracking

- Document stores `chat_history` (array of messages, including those with `suggestedContent` and `requiresConfirmation`). Confirmed edits are applied to `content_json` and the assistant reply is appended to history.
- No separate version table; `updated_at` and `content_json` represent current state. Traceability is via input hashes (cache keys, style/guidelines hashes) and code version; LLM request/response tracing can be added (e.g. Langfuse).

### Deterministic hash tracking

- Guidelines summary: `source_file_hash` (or equivalent) is the combined hash of guideline file content hashes; when it changes, summary is regenerated.
- Style profile: `combined_hash` is the combined hash of historical document content hashes; when the set of documents or their content changes, profile is regenerated.
- Caches: All keyed by content_hash or URL hash so the same input always hits the same cache entry.

---

## 4. Data Flow

### Company creation → preprocessing

1. User creates company (name, optional website, optional audio). Audio is uploaded first; backend returns `audio_path` (file_id). Company row is created with `processing_status = "pending"`.
2. Response returns; background task `process_company_background(company_id, website, audio_path)` runs.
3. Task sets `processing_status = "processing"`. If website: crawl (with website cache), clean text, store in `website_raw_text`, `website_clean_text`, `website_text`. If audio: download from Supabase by file_id, transcribe with cache by `file_content_hash`, store in `transcript_raw`, `transcript_clean`, `transcript_text`. Then optional company profile extraction → `company_profile`, `extraction_status`. Finally `processing_status = "done"` (or `"failed"` on error).

### Style documents upload → style profile generation

1. User uploads PDFs to Alte Vorhabensbeschreibung. Files go through `get_or_create_file` (hash, Supabase). Document text is extracted (with document_text_cache) and linked to the style module.
2. User triggers style profile generation. Backend collects all linked documents’ content hashes, gets extracted text from cache, computes `combined_hash`, checks if a profile with that hash exists.
3. If new: `generate_style_profile(doc_texts)` is called; result is stored in `alte_vorhabensbeschreibung_style_profile` with `combined_hash` and `style_summary_json`. If hash exists, existing profile is reused.

### Document creation → heading confirmation → generation

1. User creates document (company + funding program + optional template). GET `/documents/{company_id}/vorhabensbeschreibung?funding_program_id=...&template_id=...` creates or returns document with template sections (content empty for text sections).
2. User confirms headings → `POST /documents/{id}/confirm-headings` sets `headings_confirmed = true`.
3. User clicks Generate → `POST /documents/{id}/generate-content` runs batch generation with rules, company, style; sections are filled and saved.
4. User can then edit via chat: suggest → approve or reject; approve updates only section content and refetches document.

---

## 5. Installation

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env` (or set environment variables):

```env
JWT_SECRET_KEY=<required>
OPENAI_API_KEY=<optional but required for AI features>
DATABASE_URL=sqlite:///./innovo.db
SUPABASE_URL=<optional>
SUPABASE_KEY=<optional>
SUPABASE_STORAGE_BUCKET=files
FRONTEND_ORIGIN=http://localhost:5173
```

Run:

```bash
uvicorn main:app --reload --port 8000
```

Uvicorn must be run from the `backend` directory so that `main:app` resolves.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Default dev server: http://localhost:5173. Set `VITE_API_URL=http://localhost:8000` if the API is on another host.

### Database and migrations

- **SQLite (default)**: No extra setup; `DATABASE_URL` omitted or `sqlite:///./innovo.db`. Tables are created on startup for SQLite (development). For production, use PostgreSQL and migrations only.
- **PostgreSQL**: Set `DATABASE_URL=postgresql://...`. Run migrations:

```bash
cd backend
alembic upgrade head
```

Do not rely on automatic table creation in production; use Alembic only.

---

## 6. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET_KEY` | Yes | Secret for signing/verifying JWT tokens. |
| `OPENAI_API_KEY` | No* | OpenAI API key for generation, extraction, style profile, transcription (if used). *Required for all AI features. |
| `DATABASE_URL` | No | Default `sqlite:///./innovo.db`. Use PostgreSQL in production. |
| `SUPABASE_URL` | No* | Supabase project URL for storage. *Required if uploading/storing files in Supabase. |
| `SUPABASE_KEY` | No* | Supabase service role key (bypasses RLS). *Required with SUPABASE_URL. |
| `SUPABASE_STORAGE_BUCKET` | No | Bucket name; default `files`. |
| `FRONTEND_ORIGIN` | No | Allowed CORS origin (e.g. `https://app.example.com`). Defaults to localhost origins. |
| `UPLOAD_DIR` | No | Legacy/local upload directory if not using Supabase. |
| `DEBUG_ENV_LOG` | No | Set to `true` to log env presence (e.g. keys found). |

Langfuse is not in the current codebase; if you add it, you would set `LANGFUSE_*` as per their docs for tracing.

---

## 7. Testing Strategy

- **Deterministic logic**: Hash functions, cache key construction, URL normalization, and template resolution are deterministic and suitable for unit tests (e.g. same input ⇒ same hash/same cache key).
- **LLM behavior**: No in-repo LLM evaluation harness. Prompts and model names are in code; evaluation can be done externally or via an observability platform (e.g. Langfuse) if integrated.
- **Hash-based reproducibility**: Cache and summary/profile behavior can be tested by fixing inputs and asserting on cache hits and stored hashes.
- **Future**: Add unit tests for hashing, cache key building, and prompt-building helpers; integration tests for document creation and confirm flow with mocked LLM; optional Langfuse for regression and quality tracking.

---

## 8. Folder Structure

### Backend

```
backend/
├── app/
│   ├── routers/          # API routes: auth, companies, funding_programs, documents, templates, alte_vorhabensbeschreibung
│   ├── templates/        # System templates (e.g. wtt_v1)
│   ├── database.py       # Engine, SessionLocal, Base
│   ├── models.py         # SQLAlchemy models (User, Company, Document, File, caches, etc.)
│   ├── schemas.py        # Pydantic request/response models
│   ├── dependencies.py   # get_db, get_current_user
│   ├── jwt_utils.py      # JWT create/verify
│   ├── file_storage.py   # Hash, Supabase upload/download, get_or_create_file
│   ├── processing_cache.py # Cache get/store for transcript, website, document text; URL normalization and hashing
│   ├── preprocessing.py # Website crawl, audio transcription (with cache)
│   ├── document_extraction.py # PDF/DOCX text extraction (with cache)
│   ├── extraction.py    # Company profile extraction (LLM)
│   ├── text_cleaning.py # Website and transcript cleaning
│   ├── website_scraping.py # About-page scraping
│   ├── guidelines_processing.py # Guideline rules extraction, combined hash, summary storage
│   ├── style_extraction.py # Style profile generation, combined hash
│   ├── template_resolver.py # Resolve system/user template for a document
│   └── ...
├── alembic/              # Migrations
├── main.py               # FastAPI app, CORS, routes, static
└── requirements.txt
```

### Frontend

```
frontend/src/
├── pages/                # One folder per route: LoginPage, DashboardPage, CompaniesPage,
│                         # FundingProgramsPage, DocumentsPage, EditorPage, TemplatesPage,
│                         # TemplateEditorPage, AlteVorhabensbeschreibungPage, ProjectPage
├── components/           # ProtectedRoute, Layout, MilestoneTable
├── contexts/             # AuthContext
├── utils/                # api, authUtils, debugLog
├── App.tsx
└── main.tsx
```

---

## 9. Key Design Decisions

- **Loose linking (company ↔ funding program)**: Many-to-many allows one company to participate in multiple programs and one program to have many companies. Documents are created per (company, program, type), so each proposal is clearly scoped and can use the right program’s guidelines and template.
- **Style profile abstraction**: Instead of sending raw historical PDFs to the generator, we extract a single style profile (structure, tone, rules). This keeps prompts smaller, avoids leaking source text, and allows reuse and versioning by combined hash.
- **Section-level generation**: Headings are fixed by template and confirmation; generation fills content per section (or batch of sections). This keeps structure predictable and allows later section-level edit and suggest/approve without regenerating the whole document.
- **Approve/reject workflow**: The LLM can be wrong or off-brief. Showing a suggestion and letting the user approve or reject keeps the human in the loop and avoids silent overwrites. Only approved content is written; section title is never updated from the suggestion.
- **Hashing inputs**: Content-addressed caching (file hash, URL hash, combined hash) gives deterministic reuse, avoids duplicate work, and makes invalidation and reproducibility clear. Same inputs ⇒ same cached outputs and same summary/profile keys.

---

## 10. Future Improvements

- **Compliance validation**: Check generated sections against program rules (e.g. forbidden topics, required mentions) and surface violations.
- **Section-level regeneration**: Allow “regenerate section X only” with same or updated instructions and context.
- **Evaluation harness**: Golden datasets, prompt variants, and metrics (e.g. via Langfuse or similar) for quality and regression.
- **Multi-user collaboration**: Document-level locking or conflict handling when several users edit the same document.
- **Version diff**: Store or diff previous versions of `content_json` for audit and rollback.

---

## 11. Security Considerations

- **Authentication**: JWT with secret key; passwords hashed (passlib/bcrypt). Token in header; 401 on invalid/expired.
- **Document isolation**: All document, company, and program access is filtered by current user (e.g. company.user_email, program.user_email). Users only see and edit their own data.
- **Storage**: Supabase access is server-side only (service role). No direct storage URLs to the client for private files.
- **LLM data exposure**: Company and guideline text is sent to OpenAI for extraction and generation. No PII is stripped in code; assume prompts and responses are processed per OpenAI’s policy.

---

## 12. Reproducibility and Traceability

- **Input hashing**: All cache and summary/profile keys are derived from content hashes or normalized URLs. Same inputs ⇒ same keys and same cached/stored results.
- **Model and prompt version**: Model names and prompts live in code (e.g. `gpt-4o-mini`, prompts in `documents.py`, `guidelines_processing.py`, `style_extraction.py`). Version control provides traceability; no model version stored in DB.
- **Prompt versioning**: Changes to prompts require code changes; no separate prompt store. Optional: log prompt hashes or names in DB or in an observability tool.
- **Langfuse (optional)**: Not in the repo today. Integrating Langfuse (or similar) would allow tracing of LLM calls, prompt/completion storage, and evaluation for reproducibility and debugging.

---

## License

Internal use only for Innovo Consulting.
