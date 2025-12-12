export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { processFile } from '../../../lib/processors';
import { recommendFiles } from '../../../lib/recommender';
import { supabaseServer } from '../../../lib/supabaseServer';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const target = url.searchParams.get('file') || undefined;
    const useVector = url.searchParams.get('vector') !== 'false'; // Default to true
    const provider = (url.searchParams.get('provider') || 'ondevice') as 'ondevice' | 'openrouter';
    const model = url.searchParams.get('model') || undefined;

    const supabase = supabaseServer();
    let files: Array<any> = [];

    // Try to load from Supabase first (includes embeddings)
    if (supabase) {
      try {
        const { data: dbFiles, error } = await supabase
          .from('files')
          .select('filename, info, embedding')
          .order('created_at', { ascending: false });

        if (!error && dbFiles && dbFiles.length > 0) {
          files = dbFiles.map((f: any) => ({
            filename: f.filename,
            info: f.info || {},
            embedding: f.embedding || undefined
          }));
        }
      } catch (err) {
        console.warn('Error loading from Supabase, falling back to local:', err);
      }
    }

    // Fallback to local file system if Supabase not available or empty
    if (files.length === 0) {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads');
      const exists = fs.existsSync(uploadDir);
      if (!exists) return NextResponse.json({ recommendations: [] });

      const entries = await fs.promises.readdir(uploadDir);
      for (const name of entries) {
        if (name.endsWith('.meta.json')) continue;
        
        const filePath = path.join(uploadDir, name);
        try {
          // Try to load cached metadata
          const metaPath = path.join(uploadDir, `${name}.meta.json`);
          let info: any = null;
          
          if (fs.existsSync(metaPath)) {
            const metaContent = await fs.promises.readFile(metaPath, 'utf8');
            const meta = JSON.parse(metaContent);
            info = meta.info;
          } else {
            info = await processFile(filePath);
          }
          
          files.push({ filename: name, info });
        } catch (err: any) {
          files.push({ filename: name, error: String(err) });
        }
      }
    }

    const targetFile = files.find(f => f.filename === target);
    const recommendations = await recommendFiles(files, targetFile, useVector, provider, model);

    return NextResponse.json({ 
      recommendations,
      vectorBased: useVector && targetFile !== undefined,
      count: recommendations.length
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
