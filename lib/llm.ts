let _summarizer: any = null;
let _modelName: string | null = null;

export async function summarize(text: string) {
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
