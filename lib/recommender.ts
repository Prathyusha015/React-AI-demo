// AI-powered recommendation system with semantic similarity and cross-modal matching
import { generateEmbeddingText, cosineSimilarity } from './embeddings';
import { generateEmbedding } from './embeddings';

type EmbeddingProvider = 'ondevice' | 'openrouter';

/**
 * AI-powered recommendation system with vector similarity support
 * Uses vector embeddings when available, falls back to heuristic matching
 */
export async function recommendFiles(
  files: Array<{ filename: string; info: any; embedding?: number[] }>, 
  target?: { filename?: string; info?: any; embedding?: number[] },
  useVectorSearch: boolean = true,
  provider: EmbeddingProvider = 'ondevice',
  model?: string
): Promise<Array<{ filename: string; info: any }>> {
  if (!files || !files.length) return [];

  // Filter out the target file itself
  const otherFiles = files.filter(f => f.filename !== target?.filename);
  if (otherFiles.length === 0) return [];

  // If target provided and vector search enabled, try vector similarity first
  if (target?.info && useVectorSearch) {
    try {
      // Try vector-based recommendations if embeddings are available
      const targetEmbedding = target.embedding;
      
      if (targetEmbedding && targetEmbedding.length > 0) {
        // Calculate vector similarity for all files with embeddings
        const vectorScored = otherFiles
          .map(f => {
            if (!f.embedding || f.embedding.length === 0) return null;
            
            const similarity = cosineSimilarity(targetEmbedding, f.embedding);
            return {
              file: f,
              similarity,
              vectorBased: true
            };
          })
          .filter((item): item is { file: any; similarity: number; vectorBased: boolean } => 
            item !== null && item.similarity > 0.1
          )
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5);

        // If we have good vector-based results, return them
        if (vectorScored.length > 0) {
          return vectorScored.map(item => ({
            filename: item.file.filename,
            info: item.file.info
          }));
        }
      }

      // If target doesn't have embedding, try to generate one
      if (!targetEmbedding) {
        const embeddingText = generateEmbeddingText(target.info);
        if (embeddingText && embeddingText !== 'No content available') {
          const generatedEmbedding = await generateEmbedding(embeddingText, provider, model);
          
          if (generatedEmbedding && generatedEmbedding.length > 0) {
            // Calculate similarity with generated embedding
            const vectorScored = await Promise.all(
              otherFiles.map(async (f) => {
                let fileEmbedding = f.embedding;
                
                // Generate embedding for file if not available
                if (!fileEmbedding) {
                  const fileEmbeddingText = generateEmbeddingText(f.info);
                  if (fileEmbeddingText && fileEmbeddingText !== 'No content available') {
                    fileEmbedding = await generateEmbedding(fileEmbeddingText, provider, model);
                  }
                }
                
                if (!fileEmbedding || fileEmbedding.length === 0) return null;
                
                const similarity = cosineSimilarity(generatedEmbedding, fileEmbedding);
                return {
                  file: f,
                  similarity,
                  vectorBased: true
                };
              })
            );

            const validResults = vectorScored
              .filter((item): item is { file: any; similarity: number; vectorBased: boolean } => 
                item !== null && item.similarity > 0.1
              )
              .sort((a, b) => b.similarity - a.similarity)
              .slice(0, 5);

            if (validResults.length > 0) {
              return validResults.map(item => ({
                filename: item.file.filename,
                info: item.file.info
              }));
            }
          }
        }
      }
    } catch (err) {
      console.warn('Vector-based recommendation failed, falling back to heuristic:', err);
      // Fall through to heuristic matching
    }
  }

  // Fallback to heuristic-based recommendations
  if (target?.info) {
    const scores = otherFiles.map(f => {
      let score = 0;
      const targetInfo = target.info;
      const fileInfo = f.info;
      
      try {
        // 1. Type matching (same type = higher relevance)
        if (fileInfo.type && fileInfo.type === targetInfo.type) {
          score += 3;
        }
        
        // 2. Cross-modal recommendations (documents → images/videos with related content)
        if (targetInfo.type === 'pdf' || targetInfo.type === 'text') {
          // If target is a document, recommend images/videos with related objects/tags
          if (fileInfo.type === 'image' && fileInfo.objects) {
            const summaryWords = (targetInfo.summary || '').toLowerCase().split(/\s+/);
            const matchingObjects = fileInfo.objects.filter((obj: string) => 
              summaryWords.some((word: string) => word.includes(obj.toLowerCase()) || obj.toLowerCase().includes(word))
            );
            score += matchingObjects.length * 2;
          }
        }
        
        // 3. Tag/object similarity
        if (fileInfo.tags && targetInfo.tags) {
          const shared = fileInfo.tags.filter((t: string) => targetInfo.tags.includes(t));
          score += shared.length * 1.5;
        }
        
        if (fileInfo.objects && targetInfo.objects) {
          const shared = fileInfo.objects.filter((o: string) => targetInfo.objects.includes(o));
          score += shared.length * 2;
        }
        
        // 4. Summary/description similarity (simple keyword matching)
        if (fileInfo.summary && targetInfo.summary) {
          const targetWords = new Set(targetInfo.summary.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
          const fileWords = new Set(fileInfo.summary.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
          const commonWords = [...targetWords].filter(w => fileWords.has(w));
          score += commonWords.length * 0.5;
        }
        
        // 5. Scene/context matching
        if (fileInfo.scene && targetInfo.scene && fileInfo.scene === targetInfo.scene) {
          score += 2;
        }
        
        // 6. CSV data similarity (if both are CSVs with similar columns)
        if (fileInfo.type === 'csv' && targetInfo.type === 'csv') {
          if (fileInfo.columns && targetInfo.columns) {
            const sharedCols = fileInfo.columns.filter((c: string) => targetInfo.columns.includes(c));
            score += sharedCols.length;
          }
        }
        
        // 7. Highlights similarity
        if (fileInfo.highlights && targetInfo.highlights) {
          const targetHighlightWords = new Set(
            targetInfo.highlights.flatMap((h: string) => h.toLowerCase().split(/\s+/)).filter((w: string) => w.length > 3)
          );
          const fileHighlightWords = new Set(
            fileInfo.highlights.flatMap((h: string) => h.toLowerCase().split(/\s+/)).filter((w: string) => w.length > 3)
          );
          const commonHighlightWords = [...targetHighlightWords].filter(w => fileHighlightWords.has(w));
          score += commonHighlightWords.length * 0.3;
        }
        
        // 8. AI-powered status bonus (prefer AI-analyzed files)
        if (fileInfo.status === 'analyzed' || fileInfo.aiPowered) {
          score += 0.5;
        }
        
      } catch (e) {
        console.warn('Recommendation scoring error:', e);
      }
      
      return { file: f, score };
    });
    
    // Sort by score and return top recommendations
    const sorted = scores
      .filter(s => s.score > 0) // Only return files with some similarity
      .sort((a, b) => b.score - a.score)
      .map(s => s.file)
      .slice(0, 5);
    
    // If we have good recommendations, return them; otherwise fall back to recent files
    return sorted.length > 0 ? sorted : getRecentFiles(otherFiles, 5);
  }

  // Default: return most recently uploaded files
  return getRecentFiles(otherFiles, 5);
}

function getRecentFiles(files: Array<{ filename: string; info: any }>, limit: number) {
  return files.slice().sort((a, b) => {
    // Extract timestamp from filename (format: timestamp-filename)
    const ta = parseInt(a.filename.split('-')[0] || '0', 10) || 0;
    const tb = parseInt(b.filename.split('-')[0] || '0', 10) || 0;
    return tb - ta || a.filename.localeCompare(b.filename);
  }).slice(0, limit);
}
