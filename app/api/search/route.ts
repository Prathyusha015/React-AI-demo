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
    // Ensure model is always a string or undefined (never an object)
    const modelParam = url.searchParams.get('model');
    const model = (modelParam && typeof modelParam === 'string') ? modelParam : undefined;

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

    if (supabase && queryEmbedding && queryEmbedding.length > 0) {
      // Use Supabase with pgvector for efficient vector search
      try {
        // Fetch files with embeddings (limited to prevent huge fetches)
        // Note: For production, create an RPC function for true pgvector search
        const { data: files, error } = await supabase
          .from('files')
          .select('filename, info, embedding')
          .not('embedding', 'is', null)
          .limit(200); // Limit to reasonable number for in-memory calculation

        if (error) {
          console.error('Supabase search error:', error);
        } else {
          console.log(`Found ${files?.length || 0} files with embeddings in database`);
          
          if (files && files.length > 0) {
            // Calculate similarity efficiently in memory
            const qLower = query.toLowerCase();
            const allScoredFiles = files
              .map((file: any) => {
                // Check for invalid embedding - but still allow keyword matching
                const hasValidEmbedding = file.embedding && Array.isArray(file.embedding) && file.embedding.length > 0;
                let similarity = 0;
                
                if (hasValidEmbedding) {
                  // Check dimension mismatch
                  if (file.embedding.length !== queryEmbedding.length) {
                    console.warn(`Dimension mismatch for ${file.filename}: file embedding (${file.embedding.length}) vs query (${queryEmbedding.length})`);
                    // Still try to calculate, but it will return 0
                  }
                  similarity = cosineSimilarity(queryEmbedding, file.embedding);
                } else {
                  console.warn(`File ${file.filename} has invalid embedding - using keyword-only matching`);
                }
                const filenameMatch = file.filename?.toLowerCase().includes(qLower);
                const summaryMatch = file.info?.summary?.toLowerCase().includes(qLower);
                
                // Multimodal field matching - check all file type specific fields
                const highlightsMatch = file.info?.highlights?.some((h: string) => 
                  h.toLowerCase().includes(qLower)
                );
                const tagsMatch = file.info?.tags?.some((t: string) => 
                  t.toLowerCase().includes(qLower)
                );
                
                // Image-specific fields
                const objectsMatch = file.info?.objects?.some((o: string) => 
                  o.toLowerCase().includes(qLower)
                );
                const sceneMatch = file.info?.scene?.toLowerCase().includes(qLower);
                const captionMatch = file.info?.caption?.toLowerCase().includes(qLower);
                const ocrMatch = file.info?.ocrText?.toLowerCase().includes(qLower);
                
                // Video-specific fields
                const scenesMatch = file.info?.scenes?.some((s: any) => {
                  const desc = typeof s === 'string' ? s : s.description || '';
                  return desc.toLowerCase().includes(qLower);
                });
                const actionsMatch = file.info?.actions?.some((a: string) => 
                  a.toLowerCase().includes(qLower)
                );
                
                // CSV-specific fields
                const columnsMatch = file.info?.columns?.some((c: string) => 
                  c.toLowerCase().includes(qLower)
                );
                const csvStatsMatch = file.info?.numericStats && 
                  Object.keys(file.info.numericStats).some((key: string) => 
                    key.toLowerCase().includes(qLower)
                  );
                
                let score = similarity;
                if (filenameMatch) score += 0.3;
                if (summaryMatch) score += 0.2;
                if (highlightsMatch) score += 0.15;
                if (tagsMatch) score += 0.1;
                if (objectsMatch) score += 0.15;
                if (sceneMatch) score += 0.1;
                if (captionMatch) score += 0.15;
                if (ocrMatch) score += 0.1;
                if (scenesMatch) score += 0.15;
                if (actionsMatch) score += 0.15;
                if (columnsMatch) score += 0.1;
                if (csvStatsMatch) score += 0.1;
                
                // Lower threshold to 0.05 to catch more matches, or allow keyword-only matches
                const hasKeywordMatch = filenameMatch || summaryMatch || highlightsMatch || tagsMatch ||
                  objectsMatch || sceneMatch || captionMatch || ocrMatch ||
                  scenesMatch || actionsMatch || columnsMatch || csvStatsMatch;
                if (score > 0.05 || hasKeywordMatch) {
                  console.log(`Match: ${file.filename} - similarity: ${similarity.toFixed(4)}, score: ${score.toFixed(4)}, keyword: ${hasKeywordMatch}`);
                  return {
                    filename: file.filename,
                    info: file.info,
                    similarity: score,
                    matchType: hasKeywordMatch ? 'hybrid' : 'vector'
                  };
                }
                return null;
              })
              .filter((item: any) => item !== null)
              .sort((a: any, b: any) => b.similarity - a.similarity)
              .slice(0, limit);

            console.log(`Returning ${allScoredFiles.length} search results from vector search`);

            // Even if vector search found results, also check files with invalid/null embeddings via keyword search
            // This ensures videos and other files with invalid embeddings are still searchable
            if (supabase) {
              try {
                const { data: filesWithoutEmbeddings, error: noEmbError } = await supabase
                  .from('files')
                  .select('filename, info, embedding')
                  .is('embedding', null)
                  .limit(50); // Check files without embeddings

                if (!noEmbError && filesWithoutEmbeddings && filesWithoutEmbeddings.length > 0) {
                  console.log(`Also checking ${filesWithoutEmbeddings.length} files without embeddings for keyword matches`);
                  
                  const keywordOnlyResults = filesWithoutEmbeddings
                    .map((file: any) => {
                      const filenameMatch = file.filename?.toLowerCase().includes(qLower);
                      const summaryMatch = file.info?.summary?.toLowerCase().includes(qLower);
                      const highlightsMatch = file.info?.highlights?.some((h: string) => 
                        h.toLowerCase().includes(qLower)
                      );
                      const tagsMatch = file.info?.tags?.some((t: string) => 
                        t.toLowerCase().includes(qLower)
                      );
                      const objectsMatch = file.info?.objects?.some((o: string) => 
                        o.toLowerCase().includes(qLower)
                      );
                      const sceneMatch = file.info?.scene?.toLowerCase().includes(qLower);
                      const captionMatch = file.info?.caption?.toLowerCase().includes(qLower);
                      const ocrMatch = file.info?.ocrText?.toLowerCase().includes(qLower);
                      const scenesMatch = file.info?.scenes?.some((s: any) => {
                        const desc = typeof s === 'string' ? s : s.description || '';
                        return desc.toLowerCase().includes(qLower);
                      });
                      const actionsMatch = file.info?.actions?.some((a: string) => 
                        a.toLowerCase().includes(qLower)
                      );
                      const columnsMatch = file.info?.columns?.some((c: string) => 
                        c.toLowerCase().includes(qLower)
                      );
                      const csvStatsMatch = file.info?.numericStats && 
                        Object.keys(file.info.numericStats).some((key: string) => 
                          key.toLowerCase().includes(qLower)
                        );

                      const hasMatch = filenameMatch || summaryMatch || highlightsMatch || tagsMatch ||
                        objectsMatch || sceneMatch || captionMatch || ocrMatch ||
                        scenesMatch || actionsMatch || columnsMatch || csvStatsMatch;

                      if (hasMatch) {
                        const matchCount = [
                          filenameMatch, summaryMatch, highlightsMatch, tagsMatch,
                          objectsMatch, sceneMatch, captionMatch, ocrMatch,
                          scenesMatch, actionsMatch, columnsMatch, csvStatsMatch
                        ].filter(Boolean).length;
                        
                        let score = 0.4; // Lower base score for keyword-only matches
                        if (filenameMatch && summaryMatch) score = 0.6;
                        else if (filenameMatch) score = 0.5;
                        else if (matchCount > 0) score = 0.4 + (matchCount * 0.03);
                        
                        return {
                          filename: file.filename,
                          info: file.info,
                          similarity: score,
                          matchType: 'keyword'
                        };
                      }
                      return null;
                    })
                    .filter((item: any) => item !== null);

                  if (keywordOnlyResults.length > 0) {
                    console.log(`Found ${keywordOnlyResults.length} additional keyword-only matches`);
                    // Merge and deduplicate results
                    const allResults = [...allScoredFiles, ...keywordOnlyResults];
                    const uniqueResults = allResults.filter((item, index, self) =>
                      index === self.findIndex((t) => t != null && t.filename === item.filename)
                    );
                    const sortedResults = uniqueResults
                      .sort((a: any, b: any) => b.similarity - a.similarity)
                      .slice(0, limit);

                    return NextResponse.json({
                      query,
                      results: sortedResults,
                      count: sortedResults.length,
                      provider,
                      vectorSearch: true,
                      hybrid: true,
                      debug: {
                        totalFiles: files.length,
                        filesWithEmbeddings: files.filter((f: any) => f.embedding && Array.isArray(f.embedding)).length,
                        filesWithoutEmbeddings: filesWithoutEmbeddings.length,
                        keywordMatches: keywordOnlyResults.length,
                        queryEmbeddingLength: queryEmbedding.length
                      }
                    });
                  }
                }
              } catch (err) {
                console.warn('Keyword supplement search error:', err);
              }
            }

            return NextResponse.json({
              query,
              results: allScoredFiles,
              count: allScoredFiles.length,
              provider,
              vectorSearch: true,
              debug: {
                totalFiles: files.length,
                filesWithEmbeddings: files.filter((f: any) => f.embedding && Array.isArray(f.embedding)).length,
                queryEmbeddingLength: queryEmbedding.length
              }
            });
          } else {
            console.log('No files with embeddings found in database');
          }
        }
      } catch (err: any) {
        console.error('Vector search error:', err);
        // Continue to fallback
      }
    }

    // Fast keyword-only search if no embedding available OR if vector search returned no results
    // IMPORTANT: Also fetch files with NULL/invalid embeddings to ensure videos are searchable
    if (supabase) {
      try {
        const qLower = query.toLowerCase();
        // Fetch ALL files (including those with null/invalid embeddings) to ensure videos are searchable
        // We'll filter in JavaScript since Supabase JSON queries are limited
        const { data: files, error: keywordError } = await supabase
          .from('files')
          .select('filename, info, embedding')
          .limit(limit * 10); // Fetch more to filter in JavaScript

        if (keywordError) {
          console.warn('Keyword search error:', keywordError);
        } else if (files && files.length > 0) {
          console.log(`Keyword search scanning ${files.length} files`);
          
          // Filter files that match the query in any field - FULL MULTIMODAL SEARCH
          const scoredFiles = files
            .map((file: any) => {
            const filenameMatch = file.filename?.toLowerCase().includes(qLower);
            const summaryMatch = file.info?.summary?.toLowerCase().includes(qLower);
            const highlightsMatch = file.info?.highlights?.some((h: string) => 
              h.toLowerCase().includes(qLower)
            );
            const tagsMatch = file.info?.tags?.some((t: string) => 
              t.toLowerCase().includes(qLower)
            );
            
            // Image-specific fields
            const objectsMatch = file.info?.objects?.some((o: string) => 
              o.toLowerCase().includes(qLower)
            );
            const sceneMatch = file.info?.scene?.toLowerCase().includes(qLower);
            const captionMatch = file.info?.caption?.toLowerCase().includes(qLower);
            const ocrMatch = file.info?.ocrText?.toLowerCase().includes(qLower);
            
            // Video-specific fields
            const scenesMatch = file.info?.scenes?.some((s: any) => {
              const desc = typeof s === 'string' ? s : s.description || '';
              return desc.toLowerCase().includes(qLower);
            });
            const actionsMatch = file.info?.actions?.some((a: string) => 
              a.toLowerCase().includes(qLower)
            );
            
            // CSV-specific fields
            const columnsMatch = file.info?.columns?.some((c: string) => 
              c.toLowerCase().includes(qLower)
            );
            const csvStatsMatch = file.info?.numericStats && 
              Object.keys(file.info.numericStats).some((key: string) => 
                key.toLowerCase().includes(qLower)
              );
            
            // Count matches for scoring
            const matchCount = [
              filenameMatch, summaryMatch, highlightsMatch, tagsMatch,
              objectsMatch, sceneMatch, captionMatch, ocrMatch,
              scenesMatch, actionsMatch, columnsMatch, csvStatsMatch
            ].filter(Boolean).length;
            
            let score = 0.5;
            if (filenameMatch && summaryMatch) score = 0.7;
            else if (filenameMatch) score = 0.6;
            else if (matchCount > 0) score = 0.5 + (matchCount * 0.05); // Boost for multiple matches
            
            return {
              filename: file.filename,
              info: file.info,
              similarity: score,
              matchType: 'keyword',
              hasEmbedding: !!(file.embedding && Array.isArray(file.embedding))
            };
          })
          .filter((item: any) => item.similarity > 0) // Only include files that matched
          .sort((a: any, b: any) => b.similarity - a.similarity)
          .slice(0, limit);
          
          console.log(`Keyword search found ${scoredFiles.length} matching files`);

          return NextResponse.json({
            query,
            results: scoredFiles,
            count: scoredFiles.length,
            provider,
            vectorSearch: false,
            debug: {
              totalFiles: files.length,
              filesWithEmbeddings: files.filter((f: any) => f.embedding && Array.isArray(f.embedding)).length
            }
          });
        } else {
          console.log('No files found with keyword search');
        }
      } catch (err) {
        console.warn('Keyword search error:', err);
      }
    }

    // Fallback: Fast keyword-only search for local files (NO embedding generation)
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      return NextResponse.json({ query, results: [], count: 0, provider });
    }

    const entries = await fs.promises.readdir(uploadDir);
    const qLower = query.toLowerCase();
    const results: Array<any> = [];

    console.log(`Fast keyword search. Scanning ${entries.length} files...`);

    // Fast keyword-only search - only load metadata, NO embedding generation
    for (const name of entries) {
      if (name.endsWith('.meta.json')) continue;

      try {
        const metaPath = path.join(uploadDir, `${name}.meta.json`);
        if (!fs.existsSync(metaPath)) continue; // Skip files without cached metadata

        const metaContent = await fs.promises.readFile(metaPath, 'utf8');
        const meta = JSON.parse(metaContent);
        const info = meta.info;

        // Quick keyword matching - FULL MULTIMODAL SEARCH
        const filenameMatch = name.toLowerCase().includes(qLower);
        const summaryMatch = info?.summary?.toLowerCase().includes(qLower);
        const highlightsMatch = info?.highlights?.some((h: string) => 
          h.toLowerCase().includes(qLower)
        );
        const tagsMatch = info?.tags?.some((t: string) => 
          t.toLowerCase().includes(qLower)
        );
        
        // Image-specific fields
        const objectsMatch = info?.objects?.some((o: string) => 
          o.toLowerCase().includes(qLower)
        );
        const sceneMatch = info?.scene?.toLowerCase().includes(qLower);
        const captionMatch = info?.caption?.toLowerCase().includes(qLower);
        const ocrMatch = info?.ocrText?.toLowerCase().includes(qLower);
        
        // Video-specific fields
        const scenesMatch = info?.scenes?.some((s: any) => {
          const desc = typeof s === 'string' ? s : s.description || '';
          return desc.toLowerCase().includes(qLower);
        });
        const actionsMatch = info?.actions?.some((a: string) => 
          a.toLowerCase().includes(qLower)
        );
        
        // CSV-specific fields
        const columnsMatch = info?.columns?.some((c: string) => 
          c.toLowerCase().includes(qLower)
        );
        const csvStatsMatch = info?.numericStats && 
          Object.keys(info.numericStats).some((key: string) => 
            key.toLowerCase().includes(qLower)
          );

        const hasMatch = filenameMatch || summaryMatch || highlightsMatch || tagsMatch ||
          objectsMatch || sceneMatch || captionMatch || ocrMatch ||
          scenesMatch || actionsMatch || columnsMatch || csvStatsMatch;

        if (hasMatch) {
          const matchCount = [
            filenameMatch, summaryMatch, highlightsMatch, tagsMatch,
            objectsMatch, sceneMatch, captionMatch, ocrMatch,
            scenesMatch, actionsMatch, columnsMatch, csvStatsMatch
          ].filter(Boolean).length;
          
          let score = 0.5;
          if (filenameMatch && summaryMatch) score = 0.7;
          else if (filenameMatch) score = 0.6;
          else if (matchCount > 0) score = 0.5 + (matchCount * 0.05);
          
          results.push({
            filename: name,
            info,
            similarity: score,
            matchType: 'keyword'
          });
        }

        // Limit results early for performance
        if (results.length >= limit * 2) break;
      } catch (err: any) {
        // Skip files with errors
        continue;
      }
    }

    const validResults = results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    console.log(`Fast keyword search finished. Found ${validResults.length} matches.`);

    return NextResponse.json({
      query,
      results: validResults,
      count: validResults.length,
      provider,
      vectorSearch: false,
      fallback: true
    });
  } catch (err: any) {
    console.error('Search API error:', err);
    return NextResponse.json({
      error: err?.message || String(err),
      results: []
    }, { status: 500 });
  }
}








