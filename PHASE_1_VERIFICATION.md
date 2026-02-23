# Phase 1 Verification & Troubleshooting

## Current Issue: DNS Resolution Failure

**Error**: `could not translate host name "db.refchdszowgyvhyhfbtl.supabase.co" to address`

This indicates a network/DNS connectivity issue preventing connection to Supabase.

## Diagnostic Steps

### 1. Verify Connection String

The DATABASE_URL in `.env` is:
```
postgresql://postgres:8CwtZXb3bUeIKTDl@db.refchdszowgyvhyhfbtl.supabase.co:5432/postgres
```

**Verify this matches your Supabase Dashboard:**
1. Go to Supabase Dashboard → Your Project
2. Settings → Database → Connection string
3. Select "URI" format
4. Compare the hostname and port

### 2. Network Connectivity Tests

Run these commands to diagnose:

```bash
# Test DNS resolution
nslookup db.refchdszowgyvhyhfbtl.supabase.co

# Test connectivity
ping db.refchdszowgyvhyhfbtl.supabase.co

# Test port connectivity
nc -zv db.refchdszowgyvhyhfbtl.supabase.co 5432
# or
telnet db.refchdszowgyvhyhfbtl.supabase.co 5432
```

### 3. Common Solutions

#### Solution A: Verify Hostname
- The hostname might be incorrect
- Check Supabase Dashboard → Settings → Database
- Copy the exact connection string from there

#### Solution B: Network/VPN
- If behind corporate firewall/VPN, ensure it allows connections to Supabase
- Try from a different network
- Check if VPN is required

#### Solution C: Use Connection Pooler (Recommended for Production)
Supabase provides connection poolers that might have better connectivity:

**Session Mode (for migrations):**
```
postgresql://postgres:[PASSWORD]@db.refchdszowgyvhyhfbtl.supabase.co:5432/postgres
```

**Transaction Mode (for server applications):**
```
postgresql://postgres:[PASSWORD]@db.refchdszowgyvhyhfbtl.supabase.co:6543/postgres
```

Check your Supabase Dashboard → Settings → Database → Connection Pooling for the correct pooler URL.

#### Solution D: Test Connection Manually

```bash
# Using psql (if installed)
psql "postgresql://postgres:8CwtZXb3bUeIKTDl@db.refchdszowgyvhyhfbtl.supabase.co:5432/postgres"

# Or using Python
cd backend
source venv/bin/activate
python3 << 'EOF'
import psycopg2
try:
    conn = psycopg2.connect(
        "postgresql://postgres:8CwtZXb3bUeIKTDl@db.refchdszowgyvhyhfbtl.supabase.co:5432/postgres"
    )
    print("✅ Connection successful!")
    conn.close()
except Exception as e:
    print(f"❌ Connection failed: {e}")
EOF
```

## Once Connection Works: Run Migration

After resolving the connection issue:

```bash
cd backend
source venv/bin/activate
alembic upgrade head
```

**Expected output:**
```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
INFO  [alembic.runtime.migration] Running upgrade 5118cacae937 -> add_files_table, add_files_table
```

## Verify Migration Success

After migration completes, verify the `files` table exists:

```bash
cd backend
source venv/bin/activate
python3 << 'EOF'
from app.database import engine
from sqlalchemy import inspect

inspector = inspect(engine)
tables = inspector.get_table_names()

if 'files' in tables:
    print("✅ files table exists!")
    columns = [col['name'] for col in inspector.get_columns('files')]
    print(f"Columns: {', '.join(columns)}")
    
    # Check for unique constraint on content_hash
    indexes = inspector.get_indexes('files')
    unique_indexes = [idx for idx in indexes if idx['unique']]
    print(f"Unique indexes: {[idx['name'] for idx in unique_indexes]}")
else:
    print("❌ files table not found")
EOF
```

**Expected columns:**
- `id` (UUID)
- `content_hash` (TEXT, UNIQUE)
- `file_type` (TEXT)
- `storage_path` (TEXT)
- `size_bytes` (INTEGER)
- `created_at` (TIMESTAMP)

## Phase 1 Verification Checklist

- [ ] Network connectivity to Supabase established
- [ ] DATABASE_URL correctly set in `.env`
- [ ] Migration runs successfully (`alembic upgrade head`)
- [ ] `files` table exists in database
- [ ] `files` table has correct schema (columns match)
- [ ] Unique constraint on `content_hash` exists
- [ ] Index on `content_hash` exists
- [ ] Supabase Storage bucket `files` created (private)
- [ ] Environment variables set (SUPABASE_URL, SUPABASE_KEY, SUPABASE_STORAGE_BUCKET)
- [ ] File upload endpoint returns `file_id`
- [ ] Deduplication works (same file returns same `file_id`)

## Next Steps After Migration

1. **Test file upload:**
   ```bash
   # Start backend
   cd backend
   source venv/bin/activate
   uvicorn main:app --reload
   ```

2. **Upload a test file via API:**
   ```bash
   curl -X POST http://localhost:8000/upload-audio \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -F "file=@test_audio.m4a"
   ```

3. **Verify deduplication:**
   - Upload the same file twice
   - Second upload should return `is_new: false`
   - Same `file_id` should be returned

## Getting Help

If connection issues persist:
1. Check Supabase status: https://status.supabase.com/
2. Verify project is active in Supabase Dashboard
3. Check Supabase project settings for any IP restrictions
4. Try connection from a different network/VPN
