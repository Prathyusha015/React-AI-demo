import fs from 'fs';
import path from 'path';
import { summarize } from './llm';

export async function processFile(filePath: string, mimeType?: string) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.txt') return await processText(filePath);
    if (ext === '.csv') return await processCSV(filePath);
    if (ext === '.pdf') return await processPDF(filePath);
    if (mimeType?.startsWith('image') || ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return await processImage(filePath);
    if (mimeType?.startsWith('video') || ['.mp4', '.mov', '.webm', '.mkv'].includes(ext)) return await processVideo(filePath);

    const stats = await fs.promises.stat(filePath);
    return { type: 'unknown', size: stats.size };
  } catch (err: any) {
    return { error: err?.message || String(err) };
  }
}

async function processText(filePath: string) {
  const txt = await fs.promises.readFile(filePath, 'utf8');
  const words = txt.split(/\s+/).filter(Boolean).length;
  // heuristic fallback summary
  const heuristic = txt.slice(0, 600);
  // attempt LLM summarize; if it fails, return heuristic
  const llm = await summarize(txt).catch(() => null);
  const summary = llm || heuristic;
  return { type: 'text', words, summary, llm: !!llm };
}

async function processCSV(filePath: string) {
  const raw = await fs.promises.readFile(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines.length ? lines[0].split(',').map(h=>h.trim()) : [];
  const rows = lines.slice(1, 6).map(r => r.split(',').map(c => c.trim()));

  // Simple numeric column detection and stats (first 100 rows scanned)
  const scan = lines.slice(1, 101).map(r => r.split(',').map(c => c.trim()));
  const numericStats: Record<string, any> = {};
  for (let col = 0; col < header.length; col++) {
    const vals = scan.map(row => parseFloat(row[col])).filter(n => !Number.isNaN(n));
    if (vals.length) {
      const sum = vals.reduce((a,b)=>a+b,0);
      numericStats[header[col]||`col${col}`] = { count: vals.length, min: Math.min(...vals), max: Math.max(...vals), avg: sum/vals.length };
    }
  }

  return { type: 'csv', columns: header, sample: rows, numericStats };
}

async function processPDF(filePath: string) {
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
    const llmSummary = await summarize(text).catch(() => null);
    const summary = llmSummary || heuristic;
    return { type: 'pdf', size: buffer.length, pages: data?.numpages ?? null, words, summary, llm: !!llmSummary };
  } catch (err: any) {
    // Fallback: return file size and note the error
    const stats = await fs.promises.stat(filePath);
    return { type: 'pdf', size: stats.size, error: String(err?.message || err), note: 'PDF extraction failed or pdf-parse not installed' };
  }
}

async function processImage(filePath: string) {
  const stats = await fs.promises.stat(filePath);
  const filename = path.basename(filePath);
  // Very simple caption/tags based on filename tokens
  const tokens = filename.replace(/[_\-\.]/g, ' ').split(/\s+/).filter(Boolean).slice(0,5);
  const caption = `Image ${filename}`;
  return { type: 'image', size: stats.size, caption, tags: tokens };
}

async function processVideo(filePath: string) {
  const stats = await fs.promises.stat(filePath);
  const filename = path.basename(filePath);
  return { type: 'video', size: stats.size, note: `Video saved as ${filename}. Advanced analysis not enabled.` };
}
