export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { supabaseServer } from '../../../lib/supabaseServer';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const file = url.searchParams.get('file');
    const ttl = Number(url.searchParams.get('ttl') || '60');
    if (!file) return NextResponse.json({ error: 'missing file' }, { status: 400 });

    const supabase = supabaseServer();

    // If Supabase is configured, try to get signed URL
    if (supabase) {
      try {
        // First check if file exists in storage
        const { data: fileData, error: listError } = await supabase.storage
          .from('uploads')
          .list(file.split('/')[0] || '', {
            limit: 1,
            search: file
          });

        // Try to create signed URL
        const { data, error } = await supabase.storage.from('uploads').createSignedUrl(file, ttl);
        
        if (error) {
          // If file not found in storage, fall back to local file
          if (error.statusCode === '404' || error.message?.includes('not found')) {
            console.warn(`File ${file} not found in Supabase storage, falling back to local file`);
            const localPath = path.join(process.cwd(), 'public', 'uploads', file);
            if (fs.existsSync(localPath)) {
              return NextResponse.json({ 
                url: `/uploads/${file}`, 
                local: true,
                expires_at: null 
              });
            } else {
              return NextResponse.json({ 
                error: 'File not found in storage or local filesystem' 
              }, { status: 404 });
            }
          }
          
          console.error('Supabase signed URL error:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        
        return NextResponse.json({ 
          url: data.signedUrl, 
          expires_at: (data as any).signedURLExpiresAt || null 
        });
      } catch (e: any) {
        console.error('Exception in signed URL creation:', e);
        // Fall back to local file on any error
        const localPath = path.join(process.cwd(), 'public', 'uploads', file);
        if (fs.existsSync(localPath)) {
          return NextResponse.json({ 
            url: `/uploads/${file}`, 
            local: true,
            expires_at: null 
          });
        }
        return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
      }
    }

    // If Supabase not configured, use local file
    const localPath = path.join(process.cwd(), 'public', 'uploads', file);
    if (fs.existsSync(localPath)) {
      return NextResponse.json({ 
        url: `/uploads/${file}`, 
        local: true,
        expires_at: null 
      });
    }

    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  } catch (err: any) {
    console.error('CRITICAL ERROR in /api/signed-url:', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
