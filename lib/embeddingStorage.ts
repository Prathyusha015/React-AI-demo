/**
 * Helper functions for generating and storing embeddings
 */

import { generateEmbedding, generateEmbeddingText } from './embeddings';
import { supabaseServer } from './supabaseServer';

type EmbeddingProvider = 'ondevice' | 'openrouter';

/**
 * Generate and store embedding for a file
 * Returns the embedding vector or null if generation failed
 */
export async function generateAndStoreEmbedding(
  fileInfo: any,
  provider: EmbeddingProvider = 'ondevice',
  model?: string
): Promise<number[] | null> {
  try {
    // Generate embedding text from file metadata
    const embeddingText = generateEmbeddingText(fileInfo);
    
    if (!embeddingText || embeddingText === 'No content available') {
      console.warn('No embedding text available for file');
      return null;
    }

    // Generate embedding vector
    const embedding = await generateEmbedding(embeddingText, provider, model);
    
    if (!embedding || embedding.length === 0) {
      console.warn('Failed to generate embedding');
      return null;
    }

    return embedding;
  } catch (err: any) {
    console.error('Error generating embedding:', err?.message || err);
    return null;
  }
}

/**
 * Store embedding in Supabase database
 * Updates the files table with the embedding vector
 */
export async function storeEmbeddingInDB(
  filename: string,
  embedding: number[]
): Promise<boolean> {
  try {
    const supabase = supabaseServer();
    if (!supabase) {
      console.warn('Supabase not configured, cannot store embedding');
      return false;
    }

    // Update the file record with embedding
    const { error } = await supabase
      .from('files')
      .update({ embedding })
      .eq('filename', filename);

    if (error) {
      console.error('Error storing embedding in DB:', error);
      return false;
    }

    return true;
  } catch (err: any) {
    console.error('Exception storing embedding:', err?.message || err);
    return false;
  }
}

/**
 * Complete workflow: generate and store embedding for a file
 */
export async function processAndStoreEmbedding(
  fileInfo: any,
  filename: string,
  provider: EmbeddingProvider = 'ondevice',
  model?: string
): Promise<boolean> {
  try {
    const embedding = await generateAndStoreEmbedding(fileInfo, provider, model);
    
    if (!embedding) {
      return false;
    }

    return await storeEmbeddingInDB(filename, embedding);
  } catch (err: any) {
    console.error('Error in processAndStoreEmbedding:', err?.message || err);
    return false;
  }
}

