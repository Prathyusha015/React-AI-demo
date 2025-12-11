export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { processFile } from '../../../lib/processors';
import getSupabaseClient from '../../../lib/supabase';

export async function GET() {
  try {
    const supabase = await getSupabaseClient();
    // If Supabase configured, prefer listing from DB table 'files'
    if (supabase) {
      try {
        const { data, error } = await supabase.from('files').select('*').order('created_at', { ascending: false });
        if (error) {
          // fallback to storage listing
          throw error;
        }
        const results = (data || []).map((r: any) => ({ filename: r.filename, info: r.info, supabase: true, row: r }));
        return NextResponse.json({ files: results });
      } catch (e) {
        // try storage listing as fallback
        try {
          const { data: listData, error: listErr } = await supabase.storage.from('uploads').list('');
          if (listErr) throw listErr;
          const results = (listData || []).map((f: any) => ({ filename: f.name, size: f.size, updated_at: f.updated_at }));
          return NextResponse.json({ files: results });
        } catch (e2) {
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
