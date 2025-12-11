// Simple recommendation stub: rank files by lightweight similarity heuristics.
export function recommendFiles(files: Array<{ filename: string; info: any }>, target?: { filename?: string; info?: any }) {
  if (!files || !files.length) return [];

  // If target provided, try to find files with shared keys/tags
  if (target?.info) {
    const scores = files.map(f => {
      let score = 0;
      try {
        if (f.info.type && f.info.type === target.info.type) score += 2;
        if (f.info.tags && target.info.tags) {
          const shared = f.info.tags.filter((t: string) => target.info.tags.includes(t));
          score += shared.length;
        }
        if (f.info.numericStats && target.info.numericStats) score += 1;
      } catch (e) {}
      return { file: f, score };
    });
    return scores.sort((a,b)=>b.score-a.score).map(s=>s.file).slice(0,5);
  }

  // Default: return newest files (by filename timestamp if present) then alphabetic
  const sorted = files.slice().sort((a,b) => {
    const ta = parseInt(a.filename.split(/[^0-9]/).join('') || '0', 10) || 0;
    const tb = parseInt(b.filename.split(/[^0-9]/).join('') || '0', 10) || 0;
    return tb - ta || a.filename.localeCompare(b.filename);
  });
  return sorted.slice(0,5);
}
