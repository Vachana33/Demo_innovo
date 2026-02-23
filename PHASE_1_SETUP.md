# Phase 1 Setup Guide

## 📋 Confirmed Setup

**Phase 1 is completed** with the following confirmed configuration:

- **Database**: Supabase PostgreSQL (via `DATABASE_URL`)
- **Storage**: Supabase Storage (private bucket `files`)
- **Backend Auth**: Uses `service_role` key (bypasses RLS, no storage policies needed)
- **File Deduplication**: Hash-based using `content_hash` (SHA256) in `files` table
- **All uploads**: Handled server-side through backend only

## ✅ Completed Steps

### 1. Database URL Configuration
- ✅ Added `DATABASE_URL` to `backend/.env` file
- Connection string: `postgresql://postgres:8CwtZXb3bUeIKTDl@db.refchdszowgyvhyhfbtl.supabase.co:5432/postgres`

### 2. Dependencies
- ✅ Installed `psycopg2-binary` for PostgreSQL connectivity
- ✅ `supabase==2.3.4` already in requirements.txt

### 3. Migration Status
⚠️ **Note**: Migration will run automatically once database connection is established. The migration file is ready at:
- `backend/alembic/versions/add_files_table.py`

## 📋 Remaining Steps

### Step 1: Run Database Migration

Once your network can reach the Supabase database, run:

```bash
cd backend
source venv/bin/activate
export DATABASE_URL="postgresql://postgres:8CwtZXb3bUeIKTDl@db.refchdszowgyvhyhfbtl.supabase.co:5432/postgres"
alembic upgrade head
```

Or if using the .env file (with python-dotenv):
```bash
cd backend
source venv/bin/activate
alembic upgrade head
```

This will create the `files` table with:
- `id` (UUID primary key)
- `content_hash` (TEXT, UNIQUE, indexed)
- `file_type` (TEXT)
- `storage_path` (TEXT)
- `size_bytes` (INTEGER)
- `created_at` (TIMESTAMP)

### Step 2: Create Supabase Storage Bucket

#### Option A: Using Supabase Dashboard (Recommended)

1. **Log in to Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Navigate to Storage**
   - Click on "Storage" in the left sidebar
   - Or go directly to: `https://supabase.com/dashboard/project/[your-project-id]/storage/buckets`

3. **Create New Bucket**
   - Click the "New bucket" button
   - **Bucket name**: `files` (must match `SUPABASE_STORAGE_BUCKET` env var)
   - **Public bucket**: ❌ **Leave unchecked** (bucket is PRIVATE)
   - **File size limit**: Set appropriate limit (e.g., 50MB for audio files)
   - **Allowed MIME types**: Leave empty for all types, or specify: `audio/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document`
   - Click "Create bucket"

4. **No Storage Policies Required**
   - Since the backend uses `service_role` key, it bypasses RLS (Row Level Security)
   - No storage policies need to be created
   - All file operations are handled server-side through the backend

#### Option B: Using Supabase CLI

```bash
# Install Supabase CLI (if not installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref refchdszowgyvhyhfbtl

# Create bucket (PRIVATE - no --public flag)
supabase storage create-bucket files
```

#### Option C: Using SQL (via Supabase SQL Editor)

1. Go to SQL Editor in Supabase Dashboard
2. Run this SQL:

```sql
-- Create the storage bucket (PRIVATE - public = false)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'files',
  'files',
  false,  -- PRIVATE bucket
  52428800,  -- 50MB limit
  ARRAY['audio/*', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

-- No storage policies needed: backend uses service_role key which bypasses RLS
```

### Step 3: Set Supabase Environment Variables

Add these to your `backend/.env` file:

```bash
# Supabase Configuration
SUPABASE_URL=https://refchdszowgyvhyhfbtl.supabase.co
SUPABASE_KEY=your_service_role_key_here
SUPABASE_STORAGE_BUCKET=files
```

**To find your Supabase keys:**
1. Go to Supabase Dashboard → Your Project
2. Click "Settings" (gear icon) → "API"
3. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (secret) → `SUPABASE_KEY` ⚠️ **Use service_role key for backend**

**Important Notes:**
- **Always use `service_role` key for backend operations** (not anon key)
- Service role key bypasses RLS policies, giving full access to storage
- Keep this key secure - never expose it to frontend/client-side code
- All file operations are handled server-side through the backend

### Step 4: Test File Upload and Deduplication

#### Test via API (using curl or Postman)

1. **Start the backend server:**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```

2. **Get authentication token:**
```bash
# Login first
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com", "password": "yourpassword"}'
# Save the access_token from response
```

3. **Upload an audio file (first time):**
```bash
curl -X POST http://localhost:8000/upload-audio \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "file=@/path/to/audio.m4a"
```

**Expected response:**
```json
{
  "file_id": "550e8400-e29b-41d4-a716-446655440000",
  "audio_path": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "audio.m4a",
  "is_new": true
}
```

4. **Upload the SAME file again (should reuse):**
```bash
curl -X POST http://localhost:8000/upload-audio \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "file=@/path/to/audio.m4a"
```

**Expected response (deduplication working):**
```json
{
  "file_id": "550e8400-e29b-41d4-a716-446655440000",
  "audio_path": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "audio.m4a",
  "is_new": false
}
```

**Verification:**
- `is_new: false` indicates the file was reused (deduplication worked)
- Same `file_id` means the same file record was returned
- Check Supabase Storage: Only ONE file should exist (not duplicated)
- Check database: Only ONE record in `files` table with that `content_hash`

#### Test via Frontend

1. Start both frontend and backend
2. Log in to the application
3. Create a new company and upload an audio file
4. Create another company and upload the SAME audio file
5. Verify:
   - Both companies reference the same `file_id`
   - Only one file exists in Supabase Storage
   - Only one record in the `files` table

## 🔍 Troubleshooting

### Database Connection Issues

**Error**: `could not translate host name`
- **Solution**: Verify network connectivity to Supabase
- Check if the hostname is correct
- Try pinging: `ping db.refchdszowgyvhyhfbtl.supabase.co`
- Verify firewall/VPN settings

**Error**: `password authentication failed`
- **Solution**: Verify the password in the connection string
- Check Supabase Dashboard → Settings → Database → Connection string

### Storage Upload Issues

**Error**: `Bucket not found`
- **Solution**: Ensure bucket name matches `SUPABASE_STORAGE_BUCKET` env var
- Verify bucket exists in Supabase Dashboard

**Error**: `Permission denied`
- **Solution**: Ensure `SUPABASE_KEY` is set to the `service_role` key (not anon key)
- Verify the service_role key is correct in Settings → API → service_role (secret)

### Migration Issues

**Error**: `Table 'files' already exists`
- **Solution**: This is fine - the migration checks for existing tables
- To reset: Drop the table manually or use `alembic downgrade -1` then `alembic upgrade head`

## ✅ Verification Checklist

- [ ] Database migration completed (`files` table exists)
- [ ] Supabase Storage bucket `files` created
- [ ] Environment variables set (SUPABASE_URL, SUPABASE_KEY, SUPABASE_STORAGE_BUCKET)
- [ ] File upload works (returns file_id)
- [ ] Deduplication works (uploading same file twice returns same file_id with is_new=false)
- [ ] Files stored in Supabase Storage (check dashboard)
- [ ] File records in database (check `files` table)

## 📝 Notes

- The `audio_path` field in `Company` model now stores `file_id` (UUID string) instead of file paths
- Backward compatibility: Legacy file paths are still supported in processing logic
- All file operations go through the `file_storage.py` utility module
- Hash-based deduplication prevents duplicate storage and processing
- **Storage bucket is PRIVATE**: All access is through backend using service_role key
- **No RLS policies needed**: Service role key bypasses Row Level Security
- **Backend-only uploads**: Frontend never directly accesses Supabase Storage
