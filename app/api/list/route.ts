export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { processFile } from '../../../lib/processors';
import { supabaseServer } from '../../../lib/supabaseServer';

export async function GET() {
  try {
    const supabase = supabaseServer();
    // If Supabase configured, prefer listing from DB table 'files'
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('files')
          .select('*')
          .order('created_at', { ascending: false });
          
        if (error) {
          console.error('Supabase DB query error:', error);
          // If table doesn't exist, provide helpful error message
          if (error.code === 'PGRST205' || error.message.includes('Could not find the table')) {
            console.error('⚠️ Files table does not exist! Create it using the SQL in SUPABASE_SETUP.md');
          }
          // fallback to storage listing
          throw error;
        }
        
        if (data && data.length > 0) {
          console.log(`Found ${data.length} files in database`);
          const results = data.map((r: any) => ({ 
            filename: r.filename, 
            info: r.info || {}, 
            supabase: true, 
            row: r,
            created_at: r.created_at
          }));
          return NextResponse.json({ files: results });
        } else {
          console.log('No files found in database, trying storage...');
          // If DB is empty, try storage as fallback
          throw new Error('No files in database');
        }
      } catch (e: any) {
        console.warn('DB query failed, trying storage:', e?.message);
        // try storage listing as fallback
        try {
          const { data: listData, error: listErr } = await supabase.storage.from('uploads').list('');
          if (listErr) {
            console.error('Storage list error:', listErr);
            throw listErr;
          }
          if (listData && listData.length > 0) {
            console.log(`Found ${listData.length} files in storage`);
            const results = listData.map((f: any) => ({ 
              filename: f.name, 
              size: f.size, 
              updated_at: f.updated_at,
              fromStorage: true
            }));
            return NextResponse.json({ files: results });
          }
          // If storage is also empty, fall through to disk reading
        } catch (e2: any) {
          console.warn('Storage listing also failed:', e2?.message);
          // final fallback to disk reading below
        }
      }
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    const exists = fs.existsSync(uploadDir);
    if (!exists) return NextResponse.json({ files: [] });

    const entries = await fs.promises.readdir(uploadDir);
    const results: Array<any> = [];
    for (const name of entries) {
      // Skip metadata files
      if (name.endsWith('.meta.json')) continue;
      const filePath = path.join(uploadDir, name);
      try {
        // Prefer cached metadata if available
        const metaPath = path.join(uploadDir, `${name}.meta.json`);
        if (fs.existsSync(metaPath)) {
          try {
            const raw = await fs.promises.readFile(metaPath, 'utf8');
            const parsed = JSON.parse(raw);
            results.push({ filename: name, info: parsed.info, cached: true });
            continue;
          } catch (e) {
            // fall through to reprocess
          }
        }

        const info = await processFile(filePath);
        results.push({ filename: name, info });
      } catch (err: any) {
        results.push({ filename: name, error: String(err) });
      }
    }

    return NextResponse.json({ files: results });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
