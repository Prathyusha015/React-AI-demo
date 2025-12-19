import fs from 'fs';
import path from 'path';

// FFmpeg imports - only used server-side for video processing
let ffmpeg: any = null;
let ffmpegPath: string | null = null;

// Lazy load ffmpeg only when needed (server-side only)
async function getFFmpeg() {
  if (ffmpeg === null) {
    try {
      // Check if we're in a server environment
      if (typeof window !== 'undefined') {
        return null; // Don't load FFmpeg on client side
      }
      
      // Dynamic import to avoid client-side bundling issues
      const ffmpegModule = await import('fluent-ffmpeg');
      ffmpeg = ffmpegModule.default;
      
      // Try to get FFmpeg path from installer, but handle errors gracefully
      // Use eval to prevent static analysis from trying to resolve the module
      try {
        // Dynamic require to avoid webpack/turbopack static analysis
        const ffmpegInstallerPath = '@ffmpeg-installer/ffmpeg';
        const ffmpegInstaller = await import(/* webpackIgnore: true */ ffmpegInstallerPath);
        ffmpegPath = ffmpegInstaller.path || ffmpegInstaller.default?.path;
        if (ffmpegPath && ffmpeg.setFfmpegPath) {
          ffmpeg.setFfmpegPath(ffmpegPath);
        }
        
        // Try to get ffprobe path from @ffprobe-installer/ffprobe
        try {
          const ffprobeInstallerPath = '@ffprobe-installer/ffprobe';
          const ffprobeInstaller = await import(/* webpackIgnore: true */ ffprobeInstallerPath);
          const ffprobePath = ffprobeInstaller.path || ffprobeInstaller.default?.path;
          if (ffprobePath && ffmpeg.setFfprobePath) {
            ffmpeg.setFfprobePath(ffprobePath);
            console.log('FFprobe path set successfully:', ffprobePath);
          }
        } catch (ffprobeErr: any) {
          console.warn('FFprobe installer not available, trying to find ffprobe in FFmpeg directory:', ffprobeErr?.message || ffprobeErr);
          
          // Fallback: Try to find ffprobe in the same directory as ffmpeg
          if (ffmpegPath) {
            const pathModule = await import('path');
            const ffmpegDir = pathModule.dirname(ffmpegPath);
            const ffprobePath = pathModule.join(ffmpegDir, 'ffprobe' + (process.platform === 'win32' ? '.exe' : ''));
            
            if (fs.existsSync(ffprobePath) && ffmpeg.setFfprobePath) {
              ffmpeg.setFfprobePath(ffprobePath);
              console.log('FFprobe found in FFmpeg directory:', ffprobePath);
            } else {
              console.warn('ffprobe not found, fluent-ffmpeg will try to find it automatically');
            }
          }
        }
      } catch (installerErr: any) {
        console.warn('FFmpeg installer not available, trying system FFmpeg:', installerErr?.message || installerErr);
        // Try to use system FFmpeg if available
        // ffmpeg will try to find it automatically
      }
    } catch (err) {
      console.warn('FFmpeg not available:', err);
      return null;
    }
  }
  return ffmpeg;
}

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
      console.warn('⚠️ OpenRouter API key not configured in OPENROUTER_API_KEY environment variable');
      console.warn('   Falling back to on-device summarization');
      return await summarizeOnDevice(text);
    }

    const selectedModel = model || 'openai/gpt-3.5-turbo';
    const textToSummarize = text.substring(0, 8000);
    
    console.log(`📤 Sending summarization request to OpenRouter (model: ${selectedModel}, text length: ${textToSummarize.length})`);

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
            content: `Please provide a concise summary of the following text:\n\n${textToSummarize}`
          }
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      let errorMessage = `OpenRouter API error (${response.status}): ${errorData}`;
      
      // Try to parse error for better message
      try {
        const errorJson = JSON.parse(errorData);
        errorMessage = `OpenRouter API error (${response.status}): ${errorJson.error?.message || errorJson.message || errorData}`;
      } catch {
        // Keep original error message if parsing fails
      }
      
      console.error('❌', errorMessage);
      console.warn('   Falling back to on-device summarization');
      // Fallback to on-device
      return await summarizeOnDevice(text);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || null;
    
    if (summary) {
      console.log(`✅ OpenRouter summary generated (${summary.length} chars)`);
    } else {
      console.warn('⚠️ OpenRouter returned empty summary, falling back to on-device');
      return await summarizeOnDevice(text);
    }
    
    return summary;
  } catch (err: any) {
    console.error('❌ OpenRouter summarize error:', err?.message || err);
    console.error('   Stack:', err?.stack);
    console.warn('   Falling back to on-device summarization');
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

/**
 * Analyze image using OpenRouter vision API (cloud-based, fast, no model download)
 */
async function analyzeImageWithOpenRouter(
  filePath: string,
  model?: string
): Promise<{
  caption: string;
  objects: string[];
  tags: string[];
  scene: string | null;
} | null> {
  try {
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) {
      console.warn('OpenRouter API key not configured for image analysis');
      return null;
    }

    // Read image and convert to base64
    const imageBuffer = await fs.promises.readFile(filePath);
    const base64Image = imageBuffer.toString('base64');
    
    // Determine image MIME type from file extension
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = 'image/jpeg';
    if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.webp') mimeType = 'image/webp';

    // Use a vision-capable model (GPT-4o-mini is fast and cost-effective)
    const selectedModel = model || 'openai/gpt-4o-mini';

    console.log('Using OpenRouter vision API for image analysis...');
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
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this image and provide a detailed description. List all objects, people, text, and scene context you can identify. Format your response as JSON: {"caption": "detailed description", "objects": ["object1", "object2"], "tags": ["tag1", "tag2"], "scene": "scene description"}'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenRouter vision API error:', response.status, errorData);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    if (!content) {
      return null;
    }

    // Try to parse JSON response
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      const parsed = JSON.parse(jsonStr);
      
      return {
        caption: parsed.caption || content,
        objects: Array.isArray(parsed.objects) ? parsed.objects : (parsed.objects ? parsed.objects.split(',').map((s: string) => s.trim()) : []),
        tags: Array.isArray(parsed.tags) ? parsed.tags : (parsed.tags ? parsed.tags.split(',').map((s: string) => s.trim()) : []),
        scene: parsed.scene || null
      };
    } catch (parseErr) {
      // If JSON parsing fails, extract information from text response
      const caption = content.substring(0, 300);
      const words = content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
      return {
        caption,
        objects: words.slice(0, 8),
        tags: words.slice(0, 15),
        scene: words[0] || null
      };
    }
  } catch (err: any) {
    console.error('OpenRouter image analysis error:', err?.message || err);
    return null;
  }
}

export async function analyzeImage(filePath: string, provider: LLMProvider = 'ondevice', model?: string): Promise<{
  caption: string;
  objects: string[];
  tags: string[];
  scene: string | null;
}> {
  // If using OpenRouter, try cloud-based vision analysis first (FAST, no model download)
  if (provider === 'openrouter') {
    try {
      const cloudAnalysis = await analyzeImageWithOpenRouter(filePath, model);
      if (cloudAnalysis) {
        console.log('Image analysis completed using OpenRouter (cloud)');
        return cloudAnalysis;
      }
    } catch (err) {
      console.warn('Cloud image analysis failed, falling back to on-device:', err);
      // Fall through to on-device
    }
  }

  // On-device analysis using transformers
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
    console.log('Starting video analysis for:', filePath);
    
    // Get ffmpeg instance (lazy loaded)
    const ffmpegInstance = await getFFmpeg();
    
    if (!ffmpegInstance) {
      console.warn('FFmpeg instance not available');
      // Fallback if FFmpeg is not available
      const stats = await fs.promises.stat(filePath);
      return {
        duration: null,
        scenes: [],
        actions: [],
        summary: `Basic analysis: Video file size is ${(stats.size / 1024 / 1024).toFixed(2)}MB. FFmpeg not available for detailed analysis.`
      };
    }

    console.log('FFmpeg instance loaded successfully');
    
    // Verify ffprobe is available
    if (!ffmpegInstance.ffprobe) {
      throw new Error('ffprobe method not available on ffmpeg instance');
    }
    console.log('ffprobe method is available');

    const stats = await fs.promises.stat(filePath);
    const filename = path.basename(filePath);
    const tempDir = path.join(path.dirname(filePath), 'temp_frames', filename);

    if (!fs.existsSync(tempDir)) {
      await fs.promises.mkdir(tempDir, { recursive: true });
      console.log('Created temp directory for frames:', tempDir);
    }

    // Get video metadata/duration
    console.log('Attempting to get video metadata with ffprobe...');
    const metadata: any = await new Promise((resolve, reject) => {
      try {
        ffmpegInstance.ffprobe(filePath, (err: any, data: any) => {
          if (err) {
            console.error('ffprobe error:', err);
            reject(err);
          } else {
            console.log('ffprobe success, duration:', data?.format?.duration);
            resolve(data);
          }
        });
      } catch (syncErr: any) {
        console.error('ffprobe sync error:', syncErr);
        reject(syncErr);
      }
    });

    const duration = metadata.format.duration || 0;
    console.log('Video duration:', duration, 'seconds');

    // Extract 3 frames: start, middle, end
    const frameTimes = [
      Math.min(1, duration * 0.1),
      duration * 0.5,
      duration * 0.9
    ].map(t => Math.floor(t));
    console.log('Extracting frames at times:', frameTimes);

    const scenes: Array<{ time: number; description: string }> = [];
    const actions: string[] = [];

    // Extract frames using ffmpeg
    console.log('Extracting frames with ffmpeg...');
    await new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpegInstance(filePath)
        .on('start', (commandLine: string) => {
          console.log('FFmpeg command:', commandLine);
        })
        .on('end', () => {
          console.log('Frame extraction completed');
          resolve(true);
        })
        .on('error', (err: any) => {
          console.error('FFmpeg frame extraction error:', err);
          reject(err);
        })
        .on('stderr', (stderrLine: string) => {
          console.log('FFmpeg stderr:', stderrLine);
        });
      
      ffmpegCommand.screenshots({
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
    console.error('Video analysis error stack:', err?.stack);
    console.error('Video analysis error details:', {
      filePath,
      hasFFmpeg: !!ffmpegInstance,
      errorType: err?.constructor?.name,
      errorCode: err?.code
    });
    // Fallback if FFmpeg fails
    const stats = await fs.promises.stat(filePath);
    return {
      duration: null,
      scenes: [],
      actions: [],
      summary: `Basic analysis: Video file size is ${(stats.size / 1024 / 1024).toFixed(2)}MB. Detailed AI analysis failed: ${err?.message || 'Unknown error'}.`
    };
  }
}
