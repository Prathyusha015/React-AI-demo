export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { processFile } from '../../../lib/processors';
import { supabaseServer } from '../../../lib/supabaseServer';
import { processAndStoreEmbedding } from '../../../lib/embeddingStorage';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files');
    const provider = (formData.get('provider') as string) || 'ondevice';
    const model = formData.get('model') as string | null;

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const supabase = supabaseServer();

    const results: Array<any> = [];

    for (const item of files) {
      // @ts-ignore
      const file = item as File;
      const name = file.name || `file-${Date.now()}`;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const MAX_FILE_SIZE = 50 * 1024 * 1024;
      if (buffer.length > MAX_FILE_SIZE) {
        results.push({ filename: name, error: 'File too large' });
        continue;
      }

      const filename = `${Date.now()}-${name.replace(/\s+/g, '_')}`;
      const localPath = path.join(uploadDir, filename);

      // Save local copy
      await fs.promises.writeFile(localPath, buffer);

      // Process file
      const info = await processFile(localPath, (file as any).type, provider as 'ondevice' | 'openrouter', model || undefined);

      if (supabase) {
        // Upload to storage
        try {
          const { data: uploadData, error: upErr } = await supabase.storage.from('uploads').upload(filename, buffer, { contentType: (file as any).type });
          if (upErr) {
            results.push({ filename, info, supabaseStorageError: upErr.message });
          } else {
            results.push({ filename, info, uploadedToStorage: true, storagePath: uploadData?.path });
          }
        } catch (e: any) {
          results.push({ filename, info, supabaseStorageError: String(e) });
        }

        // Insert to DB
        try {
          const dbPayload = { filename, path: filename, info: info || {}, created_at: new Date().toISOString() };
          const { data: dbData, error: dbErr } = await supabase.from('files').insert([dbPayload]).select();

          if (dbErr) {
            results[results.length - 1] = { ...results[results.length - 1], supabaseDbError: dbErr.message };
          } else if (dbData && dbData.length > 0) {
            results[results.length - 1] = { ...results[results.length - 1], insertedToDb: true, dbId: dbData[0]?.id };

            // Background embedding
            processAndStoreEmbedding(info, filename, provider as 'ondevice' | 'openrouter', model || undefined)
              .catch(err => console.error('Embedding error:', err));
          }
        } catch (e: any) {
          results[results.length - 1] = { ...results[results.length - 1], supabaseDbError: String(e) };
        }
      } else {
        // Local only mode
        results.push({ filename, info });
        try {
          const metaPath = path.join(uploadDir, `${filename}.meta.json`);
          await fs.promises.writeFile(metaPath, JSON.stringify({ filename, info, savedAt: new Date().toISOString() }, null, 2));
        } catch (e) { }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    console.error('Upload Error:', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
