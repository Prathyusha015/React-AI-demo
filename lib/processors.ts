import fs from 'fs';
import path from 'path';
import { summarize, extractHighlights, analyzeImage, analyzeVideo } from './llm';

type LLMProvider = 'ondevice' | 'openrouter';

export async function processFile(filePath: string, mimeType?: string, provider: LLMProvider = 'ondevice', model?: string) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.txt') return await processText(filePath, provider, model);
    if (ext === '.csv') return await processCSV(filePath);
    if (ext === '.pdf') return await processPDF(filePath, provider, model);
    if (mimeType?.startsWith('image') || ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return await processImage(filePath);
    if (mimeType?.startsWith('video') || ['.mp4', '.mov', '.webm', '.mkv'].includes(ext)) return await processVideo(filePath);

    const stats = await fs.promises.stat(filePath);
    return { type: 'unknown', size: stats.size };
  } catch (err: any) {
    return { error: err?.message || String(err) };
  }
}

async function processText(filePath: string, provider: LLMProvider = 'ondevice', model?: string) {
  const txt = await fs.promises.readFile(filePath, 'utf8');
  const words = txt.split(/\s+/).filter(Boolean).length;
  // heuristic fallback summary
  const heuristic = txt.slice(0, 600);
  // attempt LLM summarize; if it fails, return heuristic
  const llm = await summarize(txt, provider, model).catch(() => null);
  const summary = llm || heuristic;
  // Extract key highlights
  const highlights = await extractHighlights(txt).catch(() => null);
  return { 
    type: 'text', 
    words, 
    summary, 
    llm: !!llm,
    llmProvider: provider,
    highlights: highlights || [],
    status: llm ? 'analyzed' : 'basic'
  };
}

async function processCSV(filePath: string) {
  const raw = await fs.promises.readFile(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines.length ? lines[0].split(',').map(h=>h.trim()) : [];
  const rows = lines.slice(1, 6).map(r => r.split(',').map(c => c.trim()));

  // Simple numeric column detection and stats (first 100 rows scanned)
  const scan = lines.slice(1, 101).map(r => r.split(',').map(c => c.trim()));
  const numericStats: Record<string, any> = {};
  const trends: Record<string, any> = {};
  
  for (let col = 0; col < header.length; col++) {
    const vals = scan.map(row => parseFloat(row[col])).filter(n => !Number.isNaN(n));
    if (vals.length) {
      const sum = vals.reduce((a,b)=>a+b,0);
      const avg = sum/vals.length;
      numericStats[header[col]||`col${col}`] = { 
        count: vals.length, 
        min: Math.min(...vals), 
        max: Math.max(...vals), 
        avg: avg 
      };
      
      // Trend analysis: check if values are increasing/decreasing
      if (vals.length > 5) {
        const firstHalf = vals.slice(0, Math.floor(vals.length / 2));
        const secondHalf = vals.slice(Math.floor(vals.length / 2));
        const firstAvg = firstHalf.reduce((a,b)=>a+b,0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a,b)=>a+b,0) / secondHalf.length;
        const trend = secondAvg > firstAvg ? 'increasing' : secondAvg < firstAvg ? 'decreasing' : 'stable';
        const changePercent = ((secondAvg - firstAvg) / Math.abs(firstAvg || 1)) * 100;
        trends[header[col]||`col${col}`] = { trend, changePercent: Math.round(changePercent * 100) / 100 };
      }
    }
  }

  return { 
    type: 'csv', 
    columns: header, 
    sample: rows, 
    numericStats,
    trends: Object.keys(trends).length > 0 ? trends : null,
    rowCount: lines.length - 1,
    status: 'analyzed'
  };
}

async function processPDF(filePath: string, provider: LLMProvider = 'ondevice', model?: string) {
  // Attempt to extract text using `pdf-parse`.
  try {
    const buffer = await fs.promises.readFile(filePath);
    // dynamic import so the dependency is optional at runtime
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = (pdfParseModule && (pdfParseModule.default || pdfParseModule)) as any;
    const data = await pdfParse(buffer);
    const text: string = data?.text || '';
    const words = text.split(/\s+/).filter(Boolean).length;
    const heuristic = text.slice(0, 1000);
    const llmSummary = await summarize(text, provider, model).catch(() => null);
    const summary = llmSummary || heuristic;
    // Extract key highlights
    const highlights = await extractHighlights(text).catch(() => null);
    return { 
      type: 'pdf', 
      size: buffer.length, 
      pages: data?.numpages ?? null, 
      words, 
      summary, 
      llm: !!llmSummary,
      llmProvider: provider,
      highlights: highlights || [],
      status: llmSummary ? 'analyzed' : 'basic'
    };
  } catch (err: any) {
    // Fallback: return file size and note the error
    const stats = await fs.promises.stat(filePath);
    return { type: 'pdf', size: stats.size, error: String(err?.message || err), note: 'PDF extraction failed or pdf-parse not installed' };
  }
}

async function processImage(filePath: string) {
  const stats = await fs.promises.stat(filePath);
  const filename = path.basename(filePath);
  
  // Attempt AI-powered image analysis
  try {
    const analysis = await analyzeImage(filePath);
    return {
      type: 'image',
      size: stats.size,
      caption: analysis.caption || `Image: ${filename}`,
      objects: analysis.objects || [],
      tags: analysis.tags || [],
      scene: analysis.scene || null,
      status: 'analyzed',
      aiPowered: true
    };
  } catch (err: any) {
    // Fallback: basic filename-based analysis
    const tokens = filename.replace(/[_\-\.]/g, ' ').split(/\s+/).filter(Boolean).slice(0,5);
    return { 
      type: 'image', 
      size: stats.size, 
      caption: `Image: ${filename}`,
      tags: tokens,
      status: 'basic',
      aiPowered: false,
      note: 'AI analysis unavailable, using basic metadata'
    };
  }
}

async function processVideo(filePath: string) {
  const stats = await fs.promises.stat(filePath);
  const filename = path.basename(filePath);
  
  // Attempt AI-powered video analysis
  try {
    const analysis = await analyzeVideo(filePath);
    return {
      type: 'video',
      size: stats.size,
      duration: analysis.duration || null,
      scenes: analysis.scenes || [],
      actions: analysis.actions || [],
      summary: analysis.summary || null,
      status: 'analyzed',
      aiPowered: true
    };
  } catch (err: any) {
    // Fallback: basic metadata
    return { 
      type: 'video', 
      size: stats.size,
      status: 'basic',
      aiPowered: false,
      note: `Video saved as ${filename}. AI analysis unavailable.`
    };
  }
}
