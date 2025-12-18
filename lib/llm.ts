import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

let _summarizer: any = null;
let _modelName: string | null = null;
let _imageClassifier: any = null;
let _objectDetector: any = null;
let _ocrPipeline: any = null;

type LLMProvider = 'ondevice' | 'openrouter';

/**
 * Summarize text using either on-device LLM or OpenRouter API
 */
export async function summarize(text: string, provider: LLMProvider = 'ondevice', model?: string) {
  if (provider === 'openrouter') {
    return await summarizeWithOpenRouter(text, model);
  }
  return await summarizeOnDevice(text);
}

/**
 * On-device summarization using @xenova/transformers
 */
async function summarizeOnDevice(text: string) {
  try {
    // dynamic import so project still works if dependency isn't installed
    const mod = await import('@xenova/transformers');
    const pipeline = mod.pipeline || mod.default?.pipeline || mod;

    if (!_summarizer) {
      // Try a short ordered list of candidate Xenova-hosted WASM-compatible models.
      const preferred = process.env.SUMMARY_MODEL ? [process.env.SUMMARY_MODEL] : [];
      const candidates = preferred.concat([
        'Xenova/distilbart-cnn-12-6',
        'Xenova/tiny-distilbart-cnn-6-6',
        'sshleifer/distilbart-cnn-12-6'
      ]);

      let lastErr: any = null;
      for (const model of candidates) {
        try {
          console.log('LLM: attempting to load model', model);
          _summarizer = await pipeline('summarization', model);
          _modelName = model;
          console.log('LLM: loaded model', model);
          break;
        } catch (e) {
          lastErr = e;
          console.warn('LLM: failed to load model', model, e?.message || e);
          _summarizer = null;
          _modelName = null;
        }
      }
      if (!_summarizer) {
        throw lastErr || new Error('No summarization model available');
      }
    }

    // Run summarization; options tuned for short summaries
    const out = await _summarizer(text, { max_length: 200, min_length: 30 });
    // Normalize output
    if (Array.isArray(out)) {
      const first = out[0] || out;
      return first?.summary_text || first?.generated_text || String(first);
    }
    return out?.summary_text || out?.generated_text || String(out);
  } catch (err: any) {
    // On error, return null so callers can fallback
    console.error('LLM summarize error:', err?.message || err);
    return null;
  }
}

/**
 * Summarize using OpenRouter API
 */
async function summarizeWithOpenRouter(text: string, model?: string): Promise<string | null> {
  try {
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) {
      console.warn('OpenRouter API key not configured, falling back to on-device');
      return await summarizeOnDevice(text);
    }

    const selectedModel = model || 'openai/gpt-3.5-turbo';

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'AI Dashboard',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that provides concise summaries and key insights. Keep responses brief and focused.'
          },
          {
            role: 'user',
            content: `Please provide a concise summary of the following text:\n\n${text.substring(0, 8000)}`
          }
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenRouter API error:', response.status, errorData);
      // Fallback to on-device
      return await summarizeOnDevice(text);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err: any) {
    console.error('OpenRouter summarize error:', err?.message || err);
    // Fallback to on-device
    return await summarizeOnDevice(text);
  }
}

export async function extractHighlights(text: string): Promise<string[]> {
  try {
    // Use summarization to extract key points
    // Split text into sentences and extract important ones
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    if (sentences.length === 0) return [];

    // Take first 3-5 key sentences as highlights
    const keySentences = sentences.slice(0, Math.min(5, sentences.length));
    return keySentences.map(s => s.trim()).filter(Boolean);
  } catch (err: any) {
    console.error('Extract highlights error:', err?.message || err);
    return [];
  }
}

/**
 * Chat with all files as context (the Global Knowledge Brain)
 */
export async function chatWithContext(
  query: string,
  files: any[],
  provider: LLMProvider = 'ondevice',
  model?: string
): Promise<string> {
  // Construct a context string from all files
  const contextParts = files.map((f, i) => {
    const info = f.info || {};
    return `[File ${i + 1}: ${f.filename}]
Type: ${info.type}
Summary: ${info.summary || 'No summary'}
Highlights: ${Array.isArray(info.highlights) ? info.highlights.join(', ') : 'None'}
Tags: ${Array.isArray(info.tags) ? info.tags.join(', ') : 'None'}`;
  }).join('\n\n');

  const systemPrompt = `You are a Multimodal Intelligence Assistant. 
You have knowledge of the following files uploaded by the user:
${contextParts}

Use this information to answer the user's questions. If the information isn't in the files, use your general knowledge but clearly state what the files say. Be concise.`;

  if (provider === 'openrouter') {
    return await chatWithOpenRouter(query, systemPrompt, model);
  }

  // Minimal fallback for on-device chat (uses summarizer to find relevance)
  return `On-device chat is limited. Based on my analysis: ${contextParts.substring(0, 500)}...`;
}

async function chatWithOpenRouter(query: string, systemPrompt: string, model?: string): Promise<string> {
  try {
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) return "OpenRouter key missing.";

    const selectedModel = model || 'openai/gpt-3.5-turbo';
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'AI Multimodal Dashboard',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) return `API Error: ${response.status}`;
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "No response.";
  } catch (e) {
    return "Chat failed.";
  }
}

export async function analyzeImage(filePath: string): Promise<{
  caption: string;
  objects: string[];
  tags: string[];
  scene: string | null;
}> {
  try {
    const mod = await import('@xenova/transformers');
    const pipeline = mod.pipeline || mod.default?.pipeline || mod;

    // Use image-to-text for actual captioning (summarization)
    // Model: Xenova/vit-gpt2-image-captioning is excellent for this
    if (!_imageClassifier) {
      try {
        console.log('Loading image captioning model...');
        _imageClassifier = await pipeline('image-to-text', 'Xenova/vit-gpt2-image-captioning');
        console.log('Image captioning model loaded.');
      } catch (e) {
        console.warn('Image captioner failed to load, falling back to classification');
        // Fallback to classification if captioning fails
        _imageClassifier = await pipeline('image-classification', 'Xenova/vit-base-patch16-224');
      }
    }

    let objects: string[] = [];
    let tags: string[] = [];
    let scene: string | null = null;
    let caption = '';

    // Analyze image
    if (_imageClassifier) {
      try {
        const imageBuffer = await fs.promises.readFile(filePath);
        // transformers.js handles buffer/path inputs flexibly in recent versions, 
        // but passing the path directly usually works best for local files if supported, 
        // or we convert to RawImage. For cleanliness, let's rely on the pipeline to handle it or use the standard input.
        // The safest way with the nodejs binding is often passing the URL/path directly if supported, 
        // but `pipeline` often expects an input it can process. 
        // Let's use `raw` approach if needed, but `pipeline(task, model)(input)` usually accepts file paths in node.

        // Use RawImage (most common) or Image as fallback
        const RawImage = (mod as any).RawImage || (mod as any).default?.RawImage || (mod as any).Image || (mod as any).default?.Image;
        if (!RawImage) throw new Error('Could not find RawImage class in @xenova/transformers');
        const image = await RawImage.fromBuffer(imageBuffer);

        const results = await _imageClassifier(image);

        // Handle different output formats based on the task (captioning vs classification)
        if (Array.isArray(results) && results[0]?.generated_text) {
          // Image-to-Text result: [{ generated_text: "a cat sitting on a couch" }]
          caption = results[0].generated_text;
          // Extract simple tags from the caption
          tags = caption.split(' ').filter((w: string) => w.length > 4);
          // "Fake" objects list from tags for now
          objects = tags;
        } else {
          // Classification result
          const predictions = Array.isArray(results) ? results : [results];
          objects = predictions.slice(0, 5).map((p: any) => p.label || String(p));
          tags = objects;
          scene = objects[0] || null;
          caption = `Image contains: ${objects.join(', ')}`;
        }
      } catch (e: any) {
        console.error('Image AI analysis failed:', e);
        caption = `Analysis execution failed: ${e.message}`;
      }
    } else {
      caption = 'Model failed to initialize. Try restarting app or check internet.';
    }

    if (!caption) caption = 'Image analysis returned empty result.';

    return { caption, objects, tags, scene };
  } catch (err: any) {
    console.error('Image analysis error:', err?.message || err);
    // Return explicit error
    return {
      caption: `System Error: ${err.message}`,
      objects: [],
      tags: [],
      scene: null
    };
  }
}

/**
 * Perform Optical Character Recognition (OCR) on an image
 */
export async function performOCR(filePath: string): Promise<string | null> {
  try {
    const mod = await import('@xenova/transformers');
    const pipeline = mod.pipeline || mod.default?.pipeline || mod;
    const RawImage = (mod as any).RawImage || (mod as any).default?.RawImage || (mod as any).Image || (mod as any).default?.Image;

    if (!_ocrPipeline) {
      console.log('Loading OCR model (trocr-small-printed)...');
      _ocrPipeline = await pipeline('image-to-text', 'Xenova/trocr-small-printed');
    }

    const imageBuffer = await fs.promises.readFile(filePath);
    const image = await RawImage.fromBuffer(imageBuffer);

    const results = await _ocrPipeline(image);
    return results[0]?.generated_text || null;
  } catch (err: any) {
    console.error('OCR Error:', err);
    return null;
  }
}

export async function analyzeVideo(filePath: string): Promise<{
  duration: number | null;
  scenes: Array<{ time: number; description: string }>;
  actions: string[];
  summary: string | null;
}> {
  try {
    const stats = await fs.promises.stat(filePath);
    const filename = path.basename(filePath);
    const tempDir = path.join(path.dirname(filePath), 'temp_frames', filename);

    if (!fs.existsSync(tempDir)) {
      await fs.promises.mkdir(tempDir, { recursive: true });
    }

    // Get video metadata/duration
    const metadata: any = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const duration = metadata.format.duration || 0;

    // Extract 3 frames: start, middle, end
    const frameTimes = [
      Math.min(1, duration * 0.1),
      duration * 0.5,
      duration * 0.9
    ].map(t => Math.floor(t));

    const scenes: Array<{ time: number; description: string }> = [];
    const actions: string[] = [];

    // Extract frames using ffmpeg
    await new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .on('end', () => resolve(true))
        .on('error', (err) => reject(err))
        .screenshots({
          count: 3,
          folder: tempDir,
          filename: 'frame-%i.png',
          timestamps: frameTimes
        });
    });

    // Analyze each extracted frame
    const frameFiles = await fs.promises.readdir(tempDir);
    for (let i = 0; i < frameFiles.length; i++) {
      const framePath = path.join(tempDir, frameFiles[i]);
      try {
        const analysis = await analyzeImage(framePath);
        scenes.push({
          time: frameTimes[i] || i,
          description: analysis.caption
        });
        if (analysis.objects.length > 0) {
          actions.push(...analysis.objects.slice(0, 2));
        }
      } catch (e) {
        console.warn(`Failed to analyze frame ${i}:`, e);
      }
    }

    // Cleanup temp frames
    try {
      for (const f of frameFiles) {
        await fs.promises.unlink(path.join(tempDir, f));
      }
      await fs.promises.rmdir(tempDir);
    } catch (e) {
      console.warn('Failed to cleanup temp frames:', e);
    }

    const uniqueActions = Array.from(new Set(actions)).filter(a => a.length > 3);
    const summary = scenes.length > 0
      ? `Video summary: ${scenes.map(s => s.description).join(' Then, ')}.`
      : `Video file analyzed. Detected duration: ${Math.round(duration)}s.`;

    return {
      duration,
      scenes,
      actions: uniqueActions,
      summary
    };
  } catch (err: any) {
    console.error('Video analysis error:', err?.message || err);
    // Fallback if FFmpeg fails
    const stats = await fs.promises.stat(filePath);
    return {
      duration: null,
      scenes: [],
      actions: [],
      summary: `Basic analysis: Video file size is ${(stats.size / 1024 / 1024).toFixed(2)}MB. Detailed AI analysis failed.`
    };
  }
}
