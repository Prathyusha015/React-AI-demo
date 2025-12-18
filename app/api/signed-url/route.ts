export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { supabaseServer } from '../../../lib/supabaseServer';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const file = url.searchParams.get('file');
    const ttl = Number(url.searchParams.get('ttl') || '60');
    if (!file) return NextResponse.json({ error: 'missing file' }, { status: 400 });

    const supabase = supabaseServer();
    if (!supabase) return NextResponse.json({ error: 'supabase not configured' }, { status: 404 });

    // create a signed URL for the uploads bucket
    try {
      const { data, error } = await supabase.storage.from('uploads').createSignedUrl(file, ttl);
      if (error) {
        console.error('Supabase signed URL error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ url: data.signedUrl, expires_at: (data as any).signedURLExpiresAt || null });
    } catch (e: any) {
      console.error('Exception in signed URL creation:', e);
      return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
    }
  } catch (err: any) {
    console.error('CRITICAL ERROR in /api/signed-url:', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
