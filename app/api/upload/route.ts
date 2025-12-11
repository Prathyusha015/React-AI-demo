export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { processFile } from '../../../lib/processors';
import getSupabaseClient from '../../../lib/supabase';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files');

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const supabase = await getSupabaseClient();
    const tmpDir = path.join(process.cwd(), 'tmp', 'uploads');
    await fs.promises.mkdir(tmpDir, { recursive: true });

    const results: Array<any> = [];

    for (const item of files) {
      // In Node's Request.formData the file-like objects expose .name and .arrayBuffer()
      // @ts-ignore
      const file = item as File;
      const name = file.name || `file-${Date.now()}`;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const filename = `${Date.now()}-${name.replace(/\s+/g, '_')}`;
      // If Supabase is configured, process locally and upload to Supabase storage + insert DB row
      if (supabase) {
        const tmpPath = path.join(tmpDir, filename);
        await fs.promises.writeFile(tmpPath, buffer);
        const info = await processFile(tmpPath, (file as any).type);

        // Upload to Supabase storage (bucket: uploads)
        try {
          const { error: upErr } = await supabase.storage.from('uploads').upload(filename, buffer, { contentType: (file as any).type });
          if (upErr) {
            // still continue but include upload error in response
            results.push({ filename, info, supabaseUploadError: upErr.message });
          } else {
            results.push({ filename, info, uploaded: true });
          }
        } catch (e: any) {
          results.push({ filename, info, supabaseUploadError: String(e) });
        }

        // Try to insert metadata row into 'files' table (if present)
        try {
          await supabase.from('files').insert([{ filename, path: filename, info, created_at: new Date().toISOString() }]);
        } catch (e) {
          // ignore DB insert failures
        }

        // remove tmp file
        try { await fs.promises.unlink(tmpPath); } catch (e) {}
      } else {
        const filePath = path.join(uploadDir, filename);
        await fs.promises.writeFile(filePath, buffer);

        const info = await processFile(filePath, (file as any).type);
        results.push({ filename, info });

        // Cache metadata next to the file for faster listing and to avoid re-running heavy work
        try {
          const metaPath = path.join(uploadDir, `${filename}.meta.json`);
          await fs.promises.writeFile(metaPath, JSON.stringify({ filename, info, savedAt: new Date().toISOString() }, null, 2));
        } catch (e) {
          // ignore cache write failures
        }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
