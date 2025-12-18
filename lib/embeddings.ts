/**
 * Vector Embeddings Generation for AI-Driven Search
 * 
 * Supports multiple embedding providers:
 * - OpenRouter (cloud-based, multiple models)
 * - Local transformers (on-device)
 */

type EmbeddingProvider = 'ondevice' | 'openrouter';

/**
 * Generate embeddings for text content
 */
export async function generateEmbedding(
  text: string,
  provider: EmbeddingProvider = 'ondevice',
  model?: string
): Promise<number[] | null> {
  if (provider === 'openrouter') {
    return await generateEmbeddingWithOpenRouter(text, model);
  }
  return await generateEmbeddingOnDevice(text);
}

/**
 * Generate embeddings using OpenRouter API
 * Supports multiple embedding models via OpenRouter
 */
async function generateEmbeddingWithOpenRouter(
  text: string,
  model?: string
): Promise<number[] | null> {
  try {
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) {
      console.warn('OpenRouter API key not configured, falling back to on-device');
      return await generateEmbeddingOnDevice(text);
    }

    // Default to OpenAI text-embedding-3-small (good balance of quality and cost)
    // Other options: text-embedding-3-large, text-embedding-ada-002
    const selectedModel = model || 'openai/text-embedding-3-small';

    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'AI Dashboard',
      },
      body: JSON.stringify({
        model: selectedModel,
        input: text.substring(0, 8000), // Limit input length
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenRouter embeddings API error:', response.status, errorData);
      // Fallback to on-device
      return await generateEmbeddingOnDevice(text);
    }

    const data = await response.json();
    const embedding = data.data?.[0]?.embedding;
    
    if (!embedding || !Array.isArray(embedding)) {
      console.error('Invalid embedding response from OpenRouter');
      return await generateEmbeddingOnDevice(text);
    }

    return embedding;
  } catch (err: any) {
    console.error('OpenRouter embedding error:', err?.message || err);
    // Fallback to on-device
    return await generateEmbeddingOnDevice(text);
  }
}

/**
 * Generate embeddings using on-device transformer models
 * Uses @xenova/transformers with a lightweight embedding model
 */
async function generateEmbeddingOnDevice(text: string): Promise<number[] | null> {
  try {
    // Dynamic import so project still works if dependency isn't installed
    const mod = await import('@xenova/transformers');
    const pipeline = mod.pipeline || mod.default?.pipeline || mod;

    // Use a lightweight embedding model
    // Xenova provides optimized WASM models that work in Node.js
    const modelName = process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
    
    let embedder: any = null;
    
    try {
      // Try to load embedding model
      embedder = await pipeline('feature-extraction', modelName);
    } catch (e) {
      console.warn('Failed to load embedding model, trying fallback:', e);
      // Fallback to a smaller model
      try {
        embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      } catch (e2) {
        console.error('No embedding model available:', e2);
        return null;
      }
    }

    // Generate embedding
    const output = await embedder(text, {
      pooling: 'mean',
      normalize: true,
    });

    // Extract embedding vector
    let embedding: number[] = [];
    
    if (output && typeof output.data === 'function') {
      // Tensor format
      const data = output.data();
      embedding = Array.from(data);
    } else if (Array.isArray(output)) {
      embedding = output.flat();
    } else if (output && typeof output === 'object') {
      // Try to extract data from tensor-like object
      const data = (output as any).data || (output as any).tolist?.() || Object.values(output);
      embedding = Array.isArray(data) ? data.flat() : [];
    }

    // Normalize embedding to unit vector (for cosine similarity)
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      embedding = embedding.map(val => val / magnitude);
    }

    return embedding.length > 0 ? embedding : null;
  } catch (err: any) {
    console.error('On-device embedding error:', err?.message || err);
    return null;
  }
}

/**
 * Generate embedding text from file metadata
 * Combines summary, highlights, tags, and other metadata into a searchable text
 */
export function generateEmbeddingText(fileInfo: any): string {
  const parts: string[] = [];

  // Add summary if available
  if (fileInfo.summary) {
    parts.push(fileInfo.summary);
  }

  // Add highlights
  if (fileInfo.highlights && Array.isArray(fileInfo.highlights)) {
    parts.push(...fileInfo.highlights);
  }

  // Add tags
  if (fileInfo.tags && Array.isArray(fileInfo.tags)) {
    parts.push(...fileInfo.tags);
  }

  // Add objects (for images)
  if (fileInfo.objects && Array.isArray(fileInfo.objects)) {
    parts.push(...fileInfo.objects);
  }

  // Add caption (for images/videos)
  if (fileInfo.caption) {
    parts.push(fileInfo.caption);
  }

  // Add scene description
  if (fileInfo.scene) {
    parts.push(fileInfo.scene);
  }

  // Add CSV column names and stats
  if (fileInfo.type === 'csv' && fileInfo.columns) {
    parts.push(`Columns: ${fileInfo.columns.join(', ')}`);
  }

  if (fileInfo.type === 'csv' && fileInfo.stats) {
    parts.push(`Statistics: ${JSON.stringify(fileInfo.stats)}`);
  }

  // Add file type
  if (fileInfo.type) {
    parts.push(`File type: ${fileInfo.type}`);
  }

  // Combine all parts
  const embeddingText = parts
    .filter(Boolean)
    .join(' ')
    .substring(0, 8000); // Limit length

  return embeddingText || 'No content available';
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    console.warn('Vector length mismatch:', vec1.length, vec2.length);
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

