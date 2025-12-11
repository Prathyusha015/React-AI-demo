export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import getSupabaseClient from '../../../lib/supabase';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const file = url.searchParams.get('file');
    const ttl = Number(url.searchParams.get('ttl') || '60');
    if (!file) return NextResponse.json({ error: 'missing file' }, { status: 400 });

    const supabase = await getSupabaseClient();
    if (!supabase) return NextResponse.json({ error: 'supabase not configured' }, { status: 404 });

    // create a signed URL for the uploads bucket
    try {
      const { data, error } = await supabase.storage.from('uploads').createSignedUrl(file, ttl);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ url: data.signedUrl, expires_at: data.signedURLExpiresAt || null });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
