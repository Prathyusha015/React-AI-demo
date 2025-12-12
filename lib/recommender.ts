// AI-powered recommendation system with semantic similarity and cross-modal matching
export function recommendFiles(files: Array<{ filename: string; info: any }>, target?: { filename?: string; info?: any }) {
  if (!files || !files.length) return [];

  // Filter out the target file itself
  const otherFiles = files.filter(f => f.filename !== target?.filename);
  if (otherFiles.length === 0) return [];

  // If target provided, use AI-powered semantic similarity
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
