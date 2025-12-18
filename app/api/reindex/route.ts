export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { generateEmbeddingText, generateEmbedding } from '../../../lib/embeddings';
import { supabaseServer } from '../../../lib/supabaseServer';

export async function POST(request: Request) {
    try {
        const { provider, model } = await request.json();

        console.log(`Starting reindex process with provider: ${provider}, model: ${model}`);

        const results: any[] = [];
        const uploadDir = path.join(process.cwd(), 'public', 'uploads');

        if (!fs.existsSync(uploadDir)) {
            return NextResponse.json({ message: 'No files to reindex', results: [] });
        }

        const entries = await fs.promises.readdir(uploadDir);
        const supabase = supabaseServer();

        // Process each file
        for (const name of entries) {
            if (name.endsWith('.meta.json')) continue;

            const filePath = path.join(uploadDir, name);
            const metaPath = path.join(uploadDir, `${name}.meta.json`);

            try {
                let info: any = null;

                // 1. Get current metadata
                if (fs.existsSync(metaPath)) {
                    const raw = await fs.promises.readFile(metaPath, 'utf8');
                    const parsed = JSON.parse(raw);
                    info = parsed.info;
                } else {
                    // If no metadata, we might need to re-process (skip for now to keep it simple, or fully reprocess)
                    // For reindexing, we assume files are already processed and we just want to update embeddings.
                    continue;
                }

                if (!info) continue;

                // 2. Generate new embedding
                const embeddingText = generateEmbeddingText(info);
                if (!embeddingText || embeddingText === 'No content available') {
                    results.push({ filename: name, status: 'skipped', reason: 'no_content' });
                    continue;
                }

                const embedding = await generateEmbedding(embeddingText, provider, model);

                if (!embedding) {
                    results.push({ filename: name, status: 'failed', reason: 'embedding_generation_failed' });
                    continue;
                }

                // 3. Update Supabase if configured
                if (supabase) {
                    const { error } = await supabase
                        .from('files')
                        .update({
                            embedding,
                            info: { ...info, llmProvider: provider } // Update provider in metadata
                        })
                        .eq('filename', name);

                    if (error) {
                        results.push({ filename: name, status: 'error', error: error.message });
                    } else {
                        results.push({ filename: name, status: 'updated_db' });
                    }
                }

                // 4. Update Local Metadata (always do this to keep sync)
                info.llmProvider = provider;
                await fs.promises.writeFile(metaPath, JSON.stringify({
                    filename: name,
                    info,
                    savedAt: new Date().toISOString()
                }, null, 2));

                if (!supabase) {
                    results.push({ filename: name, status: 'updated_local' });
                }

            } catch (e: any) {
                results.push({ filename: name, status: 'error', error: e.message });
            }
        }

        return NextResponse.json({ success: true, results });
    } catch (err: any) {
        console.error('Reindex error:', err);
        return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
    }
}
