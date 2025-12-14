export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { generateEmbedding, cosineSimilarity } from '../../../lib/embeddings';
import { supabaseServer } from '../../../lib/supabaseServer';
import fs from 'fs';
import path from 'path';
import { processFile } from '../../../lib/processors';

type EmbeddingProvider = 'ondevice' | 'openrouter';

/**
 * Vector-based semantic search API
 * 
 * GET /api/search?q=query&limit=5&provider=ondevice
 * 
 * Searches files using vector similarity
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    const provider = (url.searchParams.get('provider') || 'ondevice') as EmbeddingProvider;
    const model = url.searchParams.get('model') || undefined;

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }



    console.log(`Generating embedding for query: "${query}" using ${provider}...`);
    // Generate embedding for the search query
    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = await generateEmbedding(query, provider, model);
    } catch (e) {
      console.warn('Embedding generation failed, falling back to keyword search:', e);
    }

    // Note: We no longer exit here if embedding is null. We continue to allow keyword fallback.
    // if (!queryEmbedding || queryEmbedding.length === 0) { ... }

    if (queryEmbedding) {
      console.log('Query embedding generated successfully.');
    } else {
      console.log('Proceeding with keyword-only search.');
    }

    const supabase = supabaseServer();
    const results: Array<{ filename: string; info: any; similarity: number }> = [];

    if (supabase) {
      // Use Supabase with pgvector for efficient vector search
      try {
        // Use cosine distance (1 - cosine similarity) for pgvector
        // pgvector uses <=> operator for cosine distance
        const { data: files, error } = await supabase
          .from('files')
          .select('filename, info, embedding')
          .not('embedding', 'is', null)
          .limit(limit * 2); // Get more results to filter

        if (error) {
          console.error('Supabase search error:', error);
          // Fallback to in-memory search
        } else if (files && files.length > 0) {
          // Calculate cosine similarity for each file
          const scoredFiles = files
            .map((file: any) => {
              if (!file.embedding || !Array.isArray(file.embedding)) {
                return null;
              }
              let similarity = 0;
              if (queryEmbedding && Array.isArray(queryEmbedding)) {
                similarity = cosineSimilarity(queryEmbedding, file.embedding);
              }

              let score = similarity;
              let matchType = 'vector';

              // Hybrid boosting: Keyword match in filename or summary
              const qLower = query.toLowerCase();
              const filenameMatch = file.filename.toLowerCase().includes(qLower);
              const summaryMatch = file.info?.summary?.toLowerCase().includes(qLower);

              if (filenameMatch) score += 0.3;
              if (summaryMatch) score += 0.2;

              if (score > 0.1) {
                return {
                  filename: file.filename,
                  info: file.info,
                  similarity: score,
                  matchType: (filenameMatch || summaryMatch) ? 'hybrid' : 'vector'
                };
              }

              // Fallback: Pure keyword match
              if (filenameMatch || summaryMatch) {
                return {
                  filename: file.filename,
                  info: file.info,
                  similarity: 0.5,
                  matchType: 'keyword'
                };
              }

              return null;
            })
            .filter((item: any) => item !== null)
            .sort((a: any, b: any) => b.similarity - a.similarity)
            .slice(0, limit);

          return NextResponse.json({
            query,
            results: scoredFiles,
            count: scoredFiles.length,
            provider,
            vectorSearch: true
          });
        }
      } catch (err: any) {
        console.error('Vector search error:', err);
        // Fallback to in-memory search
      }
    }

    // Fallback: In-memory vector search (for local storage or if Supabase fails)
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      return NextResponse.json({ query, results: [], count: 0, provider });
    }

    const entries = await fs.promises.readdir(uploadDir);
    const files: Array<any> = [];

    console.log(`Falling back to local file search. Scanning ${entries.length} files...`);

    // Load files and their metadata
    for (const name of entries) {
      if (name.endsWith('.meta.json')) continue; // Skip metadata files

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
          // Process file if no metadata cache
          info = await processFile(filePath);
        }

        if (info) {
          files.push({ filename: name, info });
        }
      } catch (err: any) {
        console.warn('Error processing file for search:', name, err);
      }
    }

    // Generate embeddings for all files and calculate similarity
    const { generateEmbeddingText } = await import('../../../lib/embeddings');

    const scoredFiles = await Promise.all(
      files.map(async (file) => {
        try {
          // 1. Calculate Keyword Match First
          const qLower = query.toLowerCase();
          const filenameMatch = file.filename.toLowerCase().includes(qLower);
          const summaryMatch = file.info?.summary?.toLowerCase().includes(qLower);

          let score = 0;
          let matchType = 'none';

          if (filenameMatch) score += 0.3;
          if (summaryMatch) score += 0.2;

          if (score > 0) matchType = 'keyword';

          // 2. Calculate Vector Similarity if possible
          // Only attempt if we have a query embedding
          if (queryEmbedding && queryEmbedding.length > 0) {
            const embeddingText = generateEmbeddingText(file.info);
            if (embeddingText && embeddingText !== 'No content available') {
              const fileEmbedding = await generateEmbedding(embeddingText, provider, model);

              if (fileEmbedding && fileEmbedding.length > 0) {
                const similarity = cosineSimilarity(queryEmbedding, fileEmbedding);
                score += similarity;
                if (similarity > 0.1) matchType = (matchType === 'keyword') ? 'hybrid' : 'vector';
              }
            }
          }

          if (score > 0.1 || matchType !== 'none') {
            // Ensure at least some score for keyword-only matches
            if (score === 0 && matchType === 'keyword') score = 0.5;

            console.log(`Match found: ${file.filename} (score: ${score.toFixed(4)}, type: ${matchType})`);
            return {
              filename: file.filename,
              info: file.info,
              similarity: score,
              matchType
            };
          }

          return null;
        } catch (err: any) {
          console.warn('Error generating embedding for file:', file.filename, err);

          // Emergency Fallback: Keyword search if embedding failed
          const qLower = query.toLowerCase();
          if (file.filename.toLowerCase().includes(qLower) || file.info?.summary?.toLowerCase().includes(qLower)) {
            return {
              filename: file.filename,
              info: file.info,
              similarity: 0.4,
              matchType: 'keyword_fallback'
            };
          }
          return null;
        }
      })
    );

    const validResults = scoredFiles
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => (b?.similarity || 0) - (a?.similarity || 0))
      .slice(0, limit);

    console.log(`Search finished. Found ${validResults.length} matches.`);

    return NextResponse.json({
      query,
      results: validResults,
      count: validResults.length,
      provider,
      vectorSearch: true,
      fallback: !supabase // Indicate if using fallback method
    });
  } catch (err: any) {
    console.error('Search API error:', err);
    return NextResponse.json({
      error: err?.message || String(err),
      results: []
    }, { status: 500 });
  }
}
