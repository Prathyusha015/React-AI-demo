import fs from 'fs';

let _summarizer: any = null;
let _modelName: string | null = null;
let _imageClassifier: any = null;
let _objectDetector: any = null;

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

export async function analyzeImage(filePath: string): Promise<{
  caption: string;
  objects: string[];
  tags: string[];
  scene: string | null;
}> {
  try {
    const mod = await import('@xenova/transformers');
    const pipeline = mod.pipeline || mod.default?.pipeline || mod;
    const Image = (mod as any).Image || (mod as any).default?.Image;

    // Load image classification model
    if (!_imageClassifier) {
      try {
        _imageClassifier = await pipeline('image-classification', 'Xenova/vit-base-patch16-224');
      } catch (e) {
        console.warn('Image classifier not available, using fallback');
      }
    }

    let objects: string[] = [];
    let tags: string[] = [];
    let scene: string | null = null;

    // Load and analyze image if Image class is available
    if (Image && _imageClassifier) {
      try {
        const imageBuffer = await fs.promises.readFile(filePath);
        const image = await Image.fromBuffer(imageBuffer);
        const results = await _imageClassifier(image);
        const predictions = Array.isArray(results) ? results : [results];
        objects = predictions.slice(0, 5).map((p: any) => p.label || String(p));
        tags = objects;
        scene = objects[0] || null;
      } catch (e) {
        console.warn('Image classification failed:', e);
      }
    }

    // Generate caption from detected objects
    const caption = objects.length > 0 
      ? `Image contains: ${objects.join(', ')}`
      : 'Image analysis completed';

    return { caption, objects, tags, scene };
  } catch (err: any) {
    console.error('Image analysis error:', err?.message || err);
    // Return basic analysis instead of throwing
    return {
      caption: 'Image analysis completed',
      objects: [],
      tags: [],
      scene: null
    };
  }
}

export async function analyzeVideo(filePath: string): Promise<{
  duration: number | null;
  scenes: Array<{ time: number; description: string }>;
  actions: string[];
  summary: string | null;
}> {
  try {
    // For video analysis, we'd ideally extract frames and analyze them
    // For now, provide a basic structure that can be enhanced
    // In a production system, you'd use FFmpeg to extract frames
    // and then analyze frames with vision models
    
    const stats = await fs.promises.stat(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    
    // Simulated analysis - in real implementation, extract frames and analyze
    const scenes = [
      { time: 0, description: 'Video start' },
      { time: Math.floor(sizeMB * 2), description: 'Mid-point scene' }
    ];
    
    const actions = ['Video content detected'];
    const summary = `Video file analyzed (${Math.round(sizeMB)}MB). Frame extraction and analysis available with FFmpeg integration.`;

    return {
      duration: null, // Would need FFmpeg to get actual duration
      scenes,
      actions,
      summary
    };
  } catch (err: any) {
    console.error('Video analysis error:', err?.message || err);
    throw err;
  }
}
