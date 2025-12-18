export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { chatWithContext } from '../../../lib/llm';
import { supabaseServer } from '../../../lib/supabaseServer';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { query, provider = 'ondevice', model } = body;

        if (!query) {
            return NextResponse.json({ error: 'Query is required' }, { status: 400 });
        }

        // 1. Gather all file metadata for context
        let files: any[] = [];
        const supabase = supabaseServer();

        if (supabase) {
            const { data } = await supabase.from('files').select('*').order('created_at', { ascending: false });
            files = data || [];
        } else {
            // Local fallback
            const uploadDir = path.join(process.cwd(), 'public', 'uploads');
            if (fs.existsSync(uploadDir)) {
                const entries = await fs.promises.readdir(uploadDir);
                for (const name of entries) {
                    if (name.endsWith('.meta.json')) {
                        const raw = await fs.promises.readFile(path.join(uploadDir, name), 'utf8');
                        files.push(JSON.parse(raw));
                    }
                }
            }
        }

        // 2. Call the chat logic
        const answer = await chatWithContext(query, files, provider, model);

        return NextResponse.json({ answer });
    } catch (err: any) {
        console.error('Chat API error:', err);
        return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
    }
}
