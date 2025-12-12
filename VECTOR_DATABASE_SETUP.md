# Vector Database Setup Guide

This guide explains how to set up vector embeddings for AI-driven search and recommendations.

## Overview

Your application now supports **vector-based semantic search** using:
- **pgvector** extension in Supabase (for cloud storage)
- **On-device embeddings** using transformers (for local storage)

## What Are Vector Embeddings?

Vector embeddings convert text into numerical vectors that capture semantic meaning. Files with similar content will have similar vectors, enabling:
- **Semantic search**: Find files by meaning, not just keywords
- **Smart recommendations**: Discover related content automatically
- **Cross-modal matching**: Connect documents to related images/videos

## Setup Instructions

### Option 1: Supabase with pgvector (Recommended)

1. **Enable pgvector extension** in your Supabase project:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

2. **Add embedding column** to your `files` table:
   ```sql
   ALTER TABLE public.files 
   ADD COLUMN IF NOT EXISTS embedding vector(1536);
   ```

3. **Create vector index** for fast similarity search:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_files_embedding ON public.files 
   USING hnsw (embedding vector_cosine_ops)
   WITH (m = 16, ef_construction = 64);
   ```

4. **Verify setup**:
   - Go to Supabase Table Editor
   - Check that `files` table has `embedding` column
   - Column type should be `vector(1536)` or your model's dimension

### Option 2: Local Storage (No Database Required)

If you're not using Supabase, embeddings are generated on-the-fly during search. This works but is slower for large file collections.

## Embedding Models

### Cloud Models (via OpenRouter)

Default: `openai/text-embedding-3-small` (1536 dimensions)

Other options:
- `openai/text-embedding-3-large` (3072 dimensions) - Higher quality, more expensive
- `openai/text-embedding-ada-002` (1536 dimensions) - Older but cheaper

**To use a different model:**
1. Go to Settings page
2. Select OpenRouter provider
3. Choose your embedding model
4. Embeddings will use this model for new uploads

### On-Device Models

Default: `Xenova/all-MiniLM-L6-v2` (384 dimensions)

**To use a different model:**
Set environment variable:
```bash
EMBEDDING_MODEL=Xenova/your-model-name
```

## How It Works

### 1. File Upload Flow

```
Upload File → Process Content → Generate Embedding Text → 
Create Vector Embedding → Store in Database → Ready for Search
```

### 2. Search Flow

```
User Query → Generate Query Embedding → Compare with File Embeddings → 
Rank by Similarity → Return Top Results
```

### 3. Recommendation Flow

```
Select File → Get File Embedding → Find Similar Embeddings → 
Return Related Files
```

## Configuration

### Environment Variables

```bash
# Optional: Custom embedding model for on-device
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2

# Required for cloud embeddings (OpenRouter)
OPENROUTER_API_KEY=sk-or-v1-...

# Supabase (for storing embeddings)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_key
```

## API Endpoints

### Search API

```
GET /api/search?q=your+query&limit=10&provider=ondevice
```

**Parameters:**
- `q`: Search query (required)
- `limit`: Max results (default: 10)
- `provider`: `ondevice` or `openrouter` (default: ondevice)
- `model`: Model name (optional, uses default if not specified)

**Response:**
```json
{
  "query": "your query",
  "results": [
    {
      "filename": "file.pdf",
      "info": { ... },
      "similarity": 0.85
    }
  ],
  "count": 5,
  "provider": "ondevice",
  "vectorSearch": true
}
```

### Recommendations API

```
GET /api/recommend?file=filename.pdf&vector=true&provider=ondevice
```

**Parameters:**
- `file`: Target filename (required)
- `vector`: Use vector search (default: true)
- `provider`: Embedding provider
- `model`: Model name (optional)

## Troubleshooting

### Embeddings Not Generated

1. **Check console logs** for embedding generation errors
2. **Verify model availability**:
   - On-device: Check if `@xenova/transformers` is installed
   - Cloud: Verify `OPENROUTER_API_KEY` is set
3. **Check file content**: Files with no extractable text won't generate embeddings

### Search Returns No Results

1. **Verify embeddings exist**: Check database for `embedding` column values
2. **Check similarity threshold**: Results below 0.1 similarity are filtered out
3. **Try different queries**: Some queries may not match any files

### Slow Search Performance

1. **Use Supabase with pgvector**: Much faster than in-memory search
2. **Create HNSW index**: Enables fast approximate nearest neighbor search
3. **Limit result count**: Use `limit` parameter to reduce computation

### Dimension Mismatch Errors

If you see dimension errors:
1. **Check your embedding model's dimension**:
   - OpenAI models: 1536 or 3072
   - Local models: Usually 384 or 768
2. **Update database column**:
   ```sql
   ALTER TABLE public.files 
   ALTER COLUMN embedding TYPE vector(YOUR_DIMENSION);
   ```

## Best Practices

1. **Use Supabase for production**: pgvector provides fast, scalable search
2. **Choose appropriate model**: Balance quality vs. cost/speed
3. **Regenerate embeddings**: If you change models, reprocess files
4. **Monitor embedding generation**: Large files may take time
5. **Test search queries**: Verify semantic search works as expected

## Demo Tips

When demonstrating vector search:

1. **Upload diverse content**: Mix documents, images, CSVs
2. **Use semantic queries**: "budget analysis" instead of "budget.pdf"
3. **Show similarity scores**: Explain how percentages indicate relevance
4. **Compare with keyword search**: Highlight semantic understanding
5. **Cross-modal examples**: Search "product" and find related images

## Next Steps

- ✅ Vector embeddings generated automatically
- ✅ Semantic search API ready
- ✅ Recommendations use vector similarity
- ✅ Search UI integrated in dashboard

Your application now has enterprise-grade AI-powered search capabilities!
