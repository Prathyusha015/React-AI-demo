export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { processFile } from '../../../lib/processors';
import { supabaseServer } from '../../../lib/supabaseServer';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files');
    // Get LLM provider preference from form data (default to 'ondevice')
    const provider = (formData.get('provider') as string) || 'ondevice';
    const model = formData.get('model') as string | null;

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const supabase = supabaseServer();
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
      
      // File size validation (50MB limit for demo safety)
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
      if (buffer.length > MAX_FILE_SIZE) {
        results.push({ 
          filename: name, 
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` 
        });
        continue;
      }
      
      const filename = `${Date.now()}-${name.replace(/\s+/g, '_')}`;
      // If Supabase is configured, process locally and upload to Supabase storage + insert DB row
      if (supabase) {
        const tmpPath = path.join(tmpDir, filename);
        await fs.promises.writeFile(tmpPath, buffer);
        const info = await processFile(tmpPath, (file as any).type, provider as 'ondevice' | 'openrouter', model || undefined);

        // Upload to Supabase storage (bucket: uploads)
        let storageUploaded = false;
        let storageError: string | null = null;
        try {
          const { data: uploadData, error: upErr } = await supabase.storage.from('uploads').upload(filename, buffer, { contentType: (file as any).type });
          if (upErr) {
            storageError = upErr.message;
            results.push({ filename, info, supabaseStorageError: upErr.message });
          } else {
            storageUploaded = true;
            results.push({ filename, info, uploadedToStorage: true, storagePath: uploadData?.path });
          }
        } catch (e: any) {
          storageError = String(e);
          results.push({ filename, info, supabaseStorageError: String(e) });
        }

        // Try to insert metadata row into 'files' table (if present)
        let dbInserted = false;
        let dbError: string | null = null;
        try {
          // Ensure info is properly serialized for JSONB
          const dbPayload = {
            filename,
            path: filename,
            info: info || {},
            created_at: new Date().toISOString()
          };
          
          const { data: dbData, error: dbErr } = await supabase
            .from('files')
            .insert([dbPayload])
            .select();
            
          if (dbErr) {
            dbError = dbErr.message;
            console.error('Supabase DB insert error:', dbErr);
            results[results.length - 1] = { 
              ...results[results.length - 1], 
              supabaseDbError: dbErr.message,
              supabaseDbErrorDetails: dbErr
            };
          } else if (dbData && dbData.length > 0) {
            dbInserted = true;
            results[results.length - 1] = { 
              ...results[results.length - 1], 
              insertedToDb: true, 
              dbId: dbData[0]?.id 
            };
            console.log('File inserted to DB:', filename, 'ID:', dbData[0]?.id);
          } else {
            console.warn('DB insert returned no data for:', filename);
            results[results.length - 1] = { 
              ...results[results.length - 1], 
              supabaseDbWarning: 'Insert succeeded but no data returned'
            };
          }
        } catch (e: any) {
          dbError = String(e);
          console.error('DB insert exception:', e);
          results[results.length - 1] = { 
            ...results[results.length - 1], 
            supabaseDbError: String(e),
            supabaseDbException: e
          };
        }

        // remove tmp file
        try { await fs.promises.unlink(tmpPath); } catch (e) {}
      } else {
        const filePath = path.join(uploadDir, filename);
        await fs.promises.writeFile(filePath, buffer);

        const info = await processFile(filePath, (file as any).type, provider as 'ondevice' | 'openrouter', model || undefined);
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
