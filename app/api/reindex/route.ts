export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { generateEmbeddingText, generateEmbedding } from '../../../lib/embeddings';
import { supabaseServer } from '../../../lib/supabaseServer';
import { storeEmbeddingInDB } from '../../../lib/embeddingStorage';

export async function POST(request: Request) {
    try {
        const { provider, model } = await request.json();

        console.log(`Starting reindex process with provider: ${provider}, model: ${model}`);

        const results: any[] = [];
        const supabase = supabaseServer();
        
        // If Supabase is configured, get files from database (includes files with invalid embeddings)
        if (supabase) {
            try {
                const { data: dbFiles, error } = await supabase
                    .from('files')
                    .select('filename, info, embedding')
                    .order('created_at', { ascending: false });

                if (!error && dbFiles && dbFiles.length > 0) {
                    console.log(`Found ${dbFiles.length} files in database to reindex`);
                    
                    for (const file of dbFiles) {
                        try {
                            const info = file.info || {};
                            const filename = file.filename;
                            
                            // Check if embedding is invalid
                            const hasInvalidEmbedding = !file.embedding || 
                                                       !Array.isArray(file.embedding) || 
                                                       file.embedding.length === 0;
                            
                            if (hasInvalidEmbedding) {
                                console.log(`Reindexing ${filename} - invalid embedding detected`);
                            }
                            
                            // Generate new embedding
                            const embeddingText = generateEmbeddingText(info);
                            if (!embeddingText || embeddingText === 'No content available') {
                                results.push({ filename, status: 'skipped', reason: 'no_content' });
                                continue;
                            }

                            const embedding = await generateEmbedding(embeddingText, provider, model);

                            if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
                                results.push({ filename, status: 'failed', reason: 'embedding_generation_failed' });
                                continue;
                            }

                            // Store embedding using the validated storage function
                            const stored = await storeEmbeddingInDB(filename, embedding);
                            if (stored) {
                                results.push({ filename, status: 'updated', hadInvalidEmbedding: hasInvalidEmbedding });
                            } else {
                                results.push({ filename, status: 'error', reason: 'storage_failed' });
                            }
                        } catch (e: any) {
                            results.push({ filename: file.filename, status: 'error', error: e.message });
                        }
                    }
                    
                    return NextResponse.json({ 
                        success: true, 
                        results,
                        message: `Reindexed ${results.filter(r => r.status === 'updated').length} files`
                    });
                }
            } catch (err: any) {
                console.warn('Database reindex failed, falling back to local files:', err);
            }
        }

        // Fallback to local file system
        const uploadDir = path.join(process.cwd(), 'public', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            return NextResponse.json({ message: 'No files to reindex', results: [] });
        }

        const entries = await fs.promises.readdir(uploadDir);

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

                // 3. Update Supabase if configured (use validated storage function)
                if (supabase) {
                    const stored = await storeEmbeddingInDB(name, embedding);
                    if (stored) {
                        // Also update info with provider
                        await supabase
                            .from('files')
                            .update({ info: { ...info, llmProvider: provider } })
                            .eq('filename', name);
                        results.push({ filename: name, status: 'updated_db' });
                    } else {
                        results.push({ filename: name, status: 'error', error: 'embedding_storage_failed' });
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
