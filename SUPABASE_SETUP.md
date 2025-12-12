# Supabase Database Setup

## Quick Fix: Create the Files Table

Your Supabase database is missing the `files` table. Follow these steps to create it:

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase project dashboard
2. Click on **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Run This SQL

Copy and paste this SQL into the editor and click **Run**:

```sql
-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the files table
CREATE TABLE IF NOT EXISTS public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  path TEXT,
  info JSONB,
  embedding vector(1536), -- Vector embeddings for semantic search (1536 for OpenAI, adjust for other models)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reprocessed_at TIMESTAMPTZ
);

-- Create an index on filename for faster lookups
CREATE INDEX IF NOT EXISTS idx_files_filename ON public.files(filename);

-- Create an index on created_at for faster sorting
CREATE INDEX IF NOT EXISTS idx_files_created_at ON public.files(created_at DESC);

-- Create HNSW index for vector similarity search (pgvector)
-- This enables fast approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_files_embedding ON public.files 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Enable Row Level Security (optional, but recommended)
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow all operations (adjust based on your security needs)
-- For development, you can use this permissive policy:
CREATE POLICY "Allow all operations for service role" 
ON public.files 
FOR ALL 
USING (true) 
WITH CHECK (true);
```

**Note on embedding dimensions:**
- OpenAI `text-embedding-3-small`: 1536 dimensions
- OpenAI `text-embedding-3-large`: 3072 dimensions  
- OpenAI `text-embedding-ada-002`: 1536 dimensions
- Local models (e.g., `Xenova/all-MiniLM-L6-v2`): 384 dimensions

If using a different embedding model, adjust the `vector(1536)` dimension accordingly.

### Step 3: Verify the Table

After running the SQL, verify the table was created:

1. Go to **Table Editor** in Supabase
2. You should see the `files` table listed
3. It should have columns: `id`, `filename`, `path`, `info`, `created_at`, `reprocessed_at`

### Step 4: Test Your App

1. Refresh your app
2. Upload a file
3. Check the browser console - you should see: "File inserted to DB: [filename] ID: [id]"
4. Refresh the page - your files should persist!

## Alternative: Use Supabase Dashboard

If you prefer using the UI:

1. Go to **Table Editor** in Supabase
2. Click **New Table**
3. Name it: `files`
4. Add these columns:
   - `id` (type: uuid, primary key, default: gen_random_uuid())
   - `filename` (type: text, required)
   - `path` (type: text, optional)
   - `info` (type: jsonb, optional)
   - `created_at` (type: timestamptz, default: now())
   - `reprocessed_at` (type: timestamptz, optional)
5. Click **Save**

## Troubleshooting

### "Permission denied" error

If you get permission errors, you may need to:
1. Check your `SUPABASE_SERVICE_KEY` is correct (not the anon key)
2. Ensure RLS policies allow inserts (or temporarily disable RLS for testing)

### Table still not found after creation

1. Wait a few seconds - Supabase schema cache may need to refresh
2. Check you're using the correct database/schema
3. Verify the table name is exactly `files` (lowercase)

### Files upload but don't appear after refresh

1. Check browser console for errors
2. Visit `/api/health` to see diagnostic info
3. Verify the `info` column accepts JSONB data

## What This Table Does

- **id**: Unique identifier for each file record
- **filename**: The uploaded file name
- **path**: File path in storage (usually same as filename)
- **info**: JSONB field storing all file metadata (type, summary, highlights, etc.)
- **embedding**: Vector embedding for AI-powered semantic search (pgvector)
- **created_at**: When the file was uploaded
- **reprocessed_at**: When the file was last reprocessed (if applicable)

## Vector Search Features

After setting up the embeddings column, your app will automatically:

1. **Generate embeddings** when files are uploaded or reprocessed
2. **Enable semantic search** - search files by meaning, not just keywords
3. **Power recommendations** - find related files using vector similarity
4. **Fast similarity search** - HNSW index enables millisecond search times

### How Vector Search Works

- When you upload a file, the system extracts text/metadata and generates a vector embedding
- Embeddings are stored in the `embedding` column using pgvector
- When you search, your query is converted to an embedding and compared using cosine similarity
- Results are ranked by semantic similarity, not just keyword matching

### Testing Vector Search

1. Upload several files with related content (e.g., budget documents, product images)
2. Use the search bar on the dashboard
3. Try semantic queries like "financial analysis" or "product photos"
4. Results will show similarity scores (higher = more relevant)

After creating this table, your uploaded files will be saved to the database and will persist after page refreshes!






