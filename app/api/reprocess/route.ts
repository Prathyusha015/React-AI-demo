export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { processFile } from '../../../lib/processors';
import { supabaseServer } from '../../../lib/supabaseServer';
import { processAndStoreEmbedding } from '../../../lib/embeddingStorage';

export async function POST(request: Request) {
  let filename = '';
  try {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
    }

    filename = body?.file;
    const provider = body?.provider || 'ondevice';
    const model = body?.model || null;
    if (!filename) return NextResponse.json({ error: 'missing file name' }, { status: 400 });

    const supabase = supabaseServer();
    let processingPath = '';
    let isTempFile = false;

    // 1. Try to get the file from Supabase Storage if configured
    if (supabase) {
      try {
        console.log(`Reprocess: Attempting to download ${filename} from Supabase...`);
        const { data, error: dlErr } = await supabase.storage.from('uploads').download(filename);

        if (dlErr || !data) {
          console.warn('Reprocess: Supabase download failed, checking local fallback:', dlErr?.message);
        } else {
          // Success: Save to temp file for processing
          const ab = await (data as any).arrayBuffer();
          const buffer = Buffer.from(ab);
          const tmpDir = path.join(process.cwd(), 'tmp', 'reprocess');
          await fs.promises.mkdir(tmpDir, { recursive: true });
          processingPath = path.join(tmpDir, filename);
          await fs.promises.writeFile(processingPath, buffer);
          isTempFile = true;
          console.log(`Reprocess: Saved ${filename} to temp path for processing.`);
        }
      } catch (e: any) {
        console.warn('Reprocess: Supabase flow failed:', e.message);
      }
    }

    // 2. Fallback to local disk if Supabase failed or not configured
    if (!processingPath) {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads');
      const localPath = path.join(uploadDir, filename);
      if (fs.existsSync(localPath)) {
        processingPath = localPath;
        isTempFile = false;
        console.log(`Reprocess: Using local file at ${localPath}`);
      }
    }

    if (!processingPath) {
      return NextResponse.json({ error: 'file not found in supabase or locally' }, { status: 404 });
    }

    // 3. Process the file
    console.log(`Reprocess: Starting AI analysis for ${filename}...`);
    const ext = path.extname(filename).toLowerCase();
    let mimeType: string | undefined;
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) mimeType = 'image';
    else if (ext === '.pdf') mimeType = 'application/pdf';

    const info: any = await processFile(processingPath, mimeType, provider as 'ondevice' | 'openrouter', model || undefined);

    if (info.error) {
      console.error(`Reprocess: Analysis error for ${filename}:`, info.error);
      return NextResponse.json({ error: info.error }, { status: 500 });
    }

    // 4. Update Database/Metadata
    if (supabase) {
      console.log(`Reprocess: Updating Supabase record for ${filename}...`);
      await supabase.from('files').update({ info, reprocessed_at: new Date().toISOString() }).eq('filename', filename);

      // Background embedding generation
      processAndStoreEmbedding(info, filename, provider as 'ondevice' | 'openrouter', model || undefined)
        .catch(err => console.error('Reprocess: Embedding generation background error:', err));
    }

    const metaDir = path.join(process.cwd(), 'public', 'uploads');
    if (fs.existsSync(metaDir)) {
      const metaPath = path.join(metaDir, `${filename}.meta.json`);
      await fs.promises.writeFile(metaPath, JSON.stringify({ filename, info, reprocessedAt: new Date().toISOString() }, null, 2))
        .catch(() => { }); // Optional local meta
    }

    // 5. Cleanup/Sync
    // Always ensure a copy exists in public/uploads for UI fallback
    const finalLocalPath = path.join(process.cwd(), 'public', 'uploads', filename);
    if (isTempFile && processingPath && !fs.existsSync(finalLocalPath)) {
      await fs.promises.copyFile(processingPath, finalLocalPath).catch(() => { });
    }

    if (isTempFile && processingPath) {
      await fs.promises.unlink(processingPath).catch(() => { });
    }

    console.log(`Reprocess: Successfully reprocessed ${filename}`);
    return NextResponse.json({ success: true, filename, info });

  } catch (err: any) {
    console.error('CRITICAL ERROR in /api/reprocess:', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
