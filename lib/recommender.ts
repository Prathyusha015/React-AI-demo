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
    console.log(`Getting recommendations for: ${target.filename}, vector search: ${useVectorSearch}`);
    try {
      // Try vector-based recommendations if embeddings are available
      const targetEmbedding = target.embedding;

      if (targetEmbedding && targetEmbedding.length > 0) {
        // Calculate vector similarity for all files with embeddings
        const vectorScored = otherFiles
          .map(f => {
            if (!f.embedding || f.embedding.length === 0) return null;

            // Check dimension mismatch
            if (f.embedding.length !== targetEmbedding.length) {
              console.warn(`Dimension mismatch in recommendations: target (${targetEmbedding.length}) vs file ${f.filename} (${f.embedding.length})`);
              return null; // Skip dimension mismatches
            }

            const similarity = cosineSimilarity(targetEmbedding, f.embedding);
            
            // Require meaningful similarity (0.15 threshold) to avoid recommending unrelated content
            // This ensures only semantically similar files are recommended
            if (similarity <= 0.15) {
              console.log(`Skipping ${f.filename} - similarity ${similarity.toFixed(4)} too low`);
              return null;
            }
            
            return {
              file: f,
              similarity,
              vectorBased: true
            };
          })
          .filter((item): item is { file: any; similarity: number; vectorBased: boolean } =>
            item !== null
          )
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5);

        // If we have good vector-based results, return them
        if (vectorScored.length > 0) {
          const topSimilarities = vectorScored
            .slice(0, 3)
            .map(item => `${item.file.filename}: ${item.similarity.toFixed(4)}`);
          console.log(`Vector recommendations found ${vectorScored.length} matches: ${topSimilarities.join(', ')}`);
          return vectorScored.map(item => ({
            filename: item.file.filename,
            info: item.file.info
          }));
        } else {
          console.log('No vector recommendations found (similarity <= 0.15), falling back to heuristic');
        }
      }

      // If target doesn't have embedding, try to generate one locally (LIMIT 1)
      if (!targetEmbedding) {
        const embeddingText = generateEmbeddingText(target.info);
        if (embeddingText && embeddingText !== 'No content available') {
          // We only generate for the TARGET to compare against others who HAVE embeddings.
          // We do NOT generate for all other files on the fly as it is too slow.
          const generatedEmbedding = await generateEmbedding(embeddingText, provider, model);

          if (generatedEmbedding && generatedEmbedding.length > 0) {
            // Calculate similarity ONLY with files that already have embeddings
            const vectorScored = otherFiles
              .filter(f => {
                if (!f.embedding || f.embedding.length === 0) return false;
                // Check dimension match
                if (f.embedding.length !== generatedEmbedding.length) {
                  console.warn(`Dimension mismatch: generated (${generatedEmbedding.length}) vs file ${f.filename} (${f.embedding.length})`);
                  return false;
                }
                return true;
              })
              .map((f) => {
                const similarity = cosineSimilarity(generatedEmbedding, f.embedding!);
                return {
                  file: f,
                  similarity,
                  vectorBased: true
                };
              })
              .filter(item => {
                if (item.similarity <= 0.15) {
                  console.log(`Skipping ${item.file.filename} - similarity ${item.similarity.toFixed(4)} too low`);
                  return false;
                }
                return true;
              })
              .sort((a, b) => b.similarity - a.similarity)
              .slice(0, 5);

            if (vectorScored.length > 0) {
              return vectorScored.map(item => ({
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
  // Only proceed if we have a target and other files to compare
  if (target?.info && otherFiles.length > 0) {
    console.log(`Heuristic recommendation: comparing ${target.filename} against ${otherFiles.length} other files`);
    const scores = otherFiles.map(f => {
      let score = 0;
      const targetInfo = target.info;
      const fileInfo = f.info;

      try {
        // 1. Type matching (same type = slight bonus, but content similarity is more important)
        if (fileInfo.type && fileInfo.type === targetInfo.type) {
          score += 0.5; // Reduced from 3 - type alone shouldn't be enough
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
          // Also recommend videos with related scenes/actions
          if (fileInfo.type === 'video') {
            const summaryWords = (targetInfo.summary || '').toLowerCase().split(/\s+/);
            const summaryText = summaryWords.join(' ');
            
            // Check video scenes
            if (fileInfo.scenes && Array.isArray(fileInfo.scenes)) {
              const matchingScenes = fileInfo.scenes.filter((s: any) => {
                const desc = typeof s === 'string' ? s : s.description || '';
                return summaryWords.some((word: string) => 
                  desc.toLowerCase().includes(word) && word.length > 3
                );
              });
              score += matchingScenes.length * 1.5;
            }
            
            // Check video actions
            if (fileInfo.actions && Array.isArray(fileInfo.actions)) {
              const matchingActions = fileInfo.actions.filter((action: string) =>
                summaryWords.some((word: string) => 
                  action.toLowerCase().includes(word) && word.length > 3
                )
              );
              score += matchingActions.length * 1.5;
            }
          }
        }
        
        // Video-to-video recommendations
        if (targetInfo.type === 'video' && fileInfo.type === 'video') {
          // Match by scenes
          if (targetInfo.scenes && fileInfo.scenes) {
            const targetSceneWords = new Set(
              targetInfo.scenes.flatMap((s: any) => {
                const desc = typeof s === 'string' ? s : s.description || '';
                return desc.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
              })
            );
            const fileSceneWords = new Set(
              fileInfo.scenes.flatMap((s: any) => {
                const desc = typeof s === 'string' ? s : s.description || '';
                return desc.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
              })
            );
            const commonSceneWords = [...targetSceneWords].filter(w => fileSceneWords.has(w));
            score += commonSceneWords.length * 1.5;
          }
          
          // Match by actions
          if (targetInfo.actions && fileInfo.actions) {
            const sharedActions = targetInfo.actions.filter((a: string) => 
              fileInfo.actions.includes(a)
            );
            score += sharedActions.length * 2;
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

        // 4. Summary/description similarity (simple keyword matching) - MOST IMPORTANT
        if (fileInfo.summary && targetInfo.summary) {
          const targetWords = new Set(targetInfo.summary.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
          const fileWords = new Set(fileInfo.summary.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
          const commonWords = [...targetWords].filter(w => fileWords.has(w));
          // Increase weight - content similarity is key
          score += commonWords.length * 2;
          
          // Bonus for significant content overlap (at least 3 common meaningful words)
          if (commonWords.length >= 3) {
            score += 2;
          }
        }
        
        // Image-to-image content matching
        if (targetInfo.type === 'image' && fileInfo.type === 'image') {
          // Match by objects (most important for images)
          if (targetInfo.objects && fileInfo.objects) {
            const sharedObjects = targetInfo.objects.filter((o: string) => 
              fileInfo.objects.includes(o)
            );
            score += sharedObjects.length * 3; // High weight for object matches
          }
          
          // Match by scene
          if (targetInfo.scene && fileInfo.scene) {
            const targetSceneWords = new Set(targetInfo.scene.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
            const fileSceneWords = new Set(fileInfo.scene.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
            const commonSceneWords = [...targetSceneWords].filter(w => fileSceneWords.has(w));
            score += commonSceneWords.length * 2;
          }
          
          // Match by caption
          if (targetInfo.caption && fileInfo.caption) {
            const targetCaptionWords = new Set(targetInfo.caption.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
            const fileCaptionWords = new Set(fileInfo.caption.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
            const commonCaptionWords = [...targetCaptionWords].filter(w => fileCaptionWords.has(w));
            score += commonCaptionWords.length * 1.5;
          }
        }
        
        // PDF-to-PDF content matching
        if (targetInfo.type === 'pdf' && fileInfo.type === 'pdf') {
          // Match by summary (main content indicator)
          if (targetInfo.summary && fileInfo.summary) {
            const targetWords = new Set(targetInfo.summary.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4));
            const fileWords = new Set(fileInfo.summary.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4));
            const commonWords = [...targetWords].filter(w => fileWords.has(w));
            score += commonWords.length * 2.5;
            
            // Significant overlap bonus
            if (commonWords.length >= 5) {
              score += 3;
            }
          }
          
          // Match by highlights
          if (targetInfo.highlights && fileInfo.highlights) {
            const targetHighlightWords = new Set(
              targetInfo.highlights.flatMap((h: string) => h.toLowerCase().split(/\s+/)).filter((w: string) => w.length > 4)
            );
            const fileHighlightWords = new Set(
              fileInfo.highlights.flatMap((h: string) => h.toLowerCase().split(/\s+/)).filter((w: string) => w.length > 4)
            );
            const commonHighlightWords = [...targetHighlightWords].filter(w => fileHighlightWords.has(w));
            score += commonHighlightWords.length * 1.5;
          }
        }

        // 5. Scene/context matching (for images and videos)
        if (fileInfo.scene && targetInfo.scene && fileInfo.scene === targetInfo.scene) {
          score += 2;
        }
        
        // Video scene descriptions matching
        if (targetInfo.scenes && fileInfo.scenes) {
          const targetDescriptions = targetInfo.scenes.map((s: any) => 
            typeof s === 'string' ? s : s.description || ''
          ).join(' ').toLowerCase();
          const fileDescriptions = fileInfo.scenes.map((s: any) => 
            typeof s === 'string' ? s : s.description || ''
          ).join(' ').toLowerCase();
          
          const targetWords = new Set(targetDescriptions.split(/\s+/).filter((w: string) => w.length > 3));
          const fileWords = new Set(fileDescriptions.split(/\s+/).filter((w: string) => w.length > 3));
          const commonWords = [...targetWords].filter(w => fileWords.has(w));
          score += commonWords.length * 0.5;
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
    // IMPORTANT: Require minimum score of 3.0 to ensure actual content similarity
    // This prevents recommending files just because they're the same type or have minor overlaps
    const minScoreThreshold = 3.0;
    const sorted = scores
      .filter(s => {
        const passes = s.score >= minScoreThreshold;
        if (!passes) {
          console.log(`Skipping ${s.file.filename} - score ${s.score.toFixed(2)} < ${minScoreThreshold}`);
        }
        return passes;
      })
      .sort((a, b) => b.score - a.score)
      .map(s => s.file)
      .slice(0, 5);

    const topScore = scores.length > 0 ? Math.max(...scores.map(s => s.score)) : 0;
    const topScores = scores
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => `${s.file.filename}: ${s.score.toFixed(2)}`);
    
    console.log(`Heuristic recommendations for ${target.filename}:`);
    console.log(`  Top scores: ${topScores.join(', ')}`);
    console.log(`  Files with score >= ${minScoreThreshold}: ${sorted.length}`);

    // If we have good recommendations, return them; otherwise return empty (don't show unrelated files)
    if (sorted.length > 0) {
      console.log(`  Returning ${sorted.length} recommendations`);
      return sorted;
    } else {
      console.log(`  No matches found (top score: ${topScore.toFixed(2)} < ${minScoreThreshold}), returning empty recommendations`);
      return []; // Don't return unrelated files just because they exist
    }
  }

  // Default: if no target provided, don't return recommendations
  // Only return recommendations when we have a target file to compare against
  console.log('No target file provided, returning empty recommendations');
  return [];
}

function getRecentFiles(files: Array<{ filename: string; info: any }>, limit: number) {
  return files.slice().sort((a, b) => {
    // Extract timestamp from filename (format: timestamp-filename)
    const ta = parseInt(a.filename.split('-')[0] || '0', 10) || 0;
    const tb = parseInt(b.filename.split('-')[0] || '0', 10) || 0;
    return tb - ta || a.filename.localeCompare(b.filename);
  }).slice(0, limit);
}
