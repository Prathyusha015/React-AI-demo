export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { processFile } from '../../../lib/processors';
import getSupabaseClient from '../../../lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const filename = body?.file;
    if (!filename) return NextResponse.json({ error: 'missing file' }, { status: 400 });

    const supabase = await getSupabaseClient();
    // If Supabase configured, download file from storage, process, and update DB
    if (supabase) {
      try {
        const { data, error: dlErr } = await supabase.storage.from('uploads').download(filename as string);
        if (dlErr || !data) {
          return NextResponse.json({ error: 'could not download from supabase', details: dlErr?.message }, { status: 500 });
        }

        // helper to convert various stream/blob types to Buffer
        async function toBuffer(src: any) {
          if (Buffer.isBuffer(src)) return src;
          if (src.arrayBuffer) {
            const ab = await src.arrayBuffer();
            return Buffer.from(ab);
          }
          if (typeof src.getReader === 'function') {
            // ReadableStream
            const reader = src.getReader();
            const chunks: Uint8Array[] = [];
            let done = false;
            // eslint-disable-next-line no-constant-condition
            while (!done) {
              // @ts-ignore
              const res = await reader.read();
              done = res.done;
              if (res.value) chunks.push(res.value);
            }
            return Buffer.concat(chunks.map((c) => Buffer.from(c)));
          }
          // fallback: try arrayBuffer via any
          const ab = await (src as any).arrayBuffer();
          return Buffer.from(ab);
        }

        const buffer = await toBuffer(data as any);
        const tmpDir = path.join(process.cwd(), 'tmp', 'uploads');
        await fs.promises.mkdir(tmpDir, { recursive: true });
        const tmpPath = path.join(tmpDir, filename as string);
        await fs.promises.writeFile(tmpPath, buffer);

        const info = await processFile(tmpPath);

        // update DB row if exists
        try {
          await supabase.from('files').update({ info, reprocessed_at: new Date().toISOString() }).eq('filename', filename);
        } catch (e) {}

        try { await fs.promises.unlink(tmpPath); } catch (e) {}

        return NextResponse.json({ success: true, filename, info, supabase: true });
      } catch (e: any) {
        return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
      }
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    const filePath = path.join(uploadDir, filename);
    if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'file not found' }, { status: 404 });

    const info = await processFile(filePath);
    try {
      const metaPath = path.join(uploadDir, `${filename}.meta.json`);
      await fs.promises.writeFile(metaPath, JSON.stringify({ filename, info, reprocessedAt: new Date().toISOString() }, null, 2));
    } catch (e) {}

    return NextResponse.json({ success: true, filename, info });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
