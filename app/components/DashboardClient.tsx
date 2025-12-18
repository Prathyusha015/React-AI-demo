"use client";

import React, { useEffect, useState } from 'react';
import { Pie, Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
} from 'chart.js';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title
);

export default function DashboardClient() {
  const [files, setFiles] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<Array<any>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [processingStatus, setProcessingStatus] = useState<Record<string, string>>({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<any>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<any>(null);

  // Auto-refresh files list
  useEffect(() => {
    loadFiles();
    if (autoRefresh) {
      const interval = setInterval(loadFiles, 3000); // Refresh every 3 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // Listen for file update events
  useEffect(() => {
    const handleFilesUpdated = () => {
      loadFiles();
    };
    window.addEventListener('filesUpdated', handleFilesUpdated);
    return () => window.removeEventListener('filesUpdated', handleFilesUpdated);
  }, []);

  async function loadFiles() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/list');
      const json = await res.json();
      if (json?.files) {
        setFiles(json.files);
        // Update processing status
        const statuses: Record<string, string> = {};
        json.files.forEach((f: any) => {
          statuses[f.filename] = f.info?.status || 'unknown';
        });
        setProcessingStatus(statuses);
      } else {
        setError('No files returned');
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // auto-select first file and fetch recommendations
    if (files.length && !selected) {
      const first = files[0]?.filename;
      if (first) fetchRecommendations(first);
    }
  }, [files]);

  async function fetchRecommendations(filename: string) {
    setSelected(filename);
    setRecommended([]);
    setRecommending(true);
    try {
      const provider = localStorage.getItem('llmProvider') || 'ondevice';
      const model = localStorage.getItem('openRouterModel') || undefined;
      const res = await fetch(`/api/recommend?file=${encodeURIComponent(filename)}&vector=true&provider=${provider}${model ? `&model=${encodeURIComponent(model)}` : ''}`);
      const json = await res.json();
      if (json?.recommendations) setRecommended(json.recommendations || []);
    } catch (err) {
      console.error('Recommendations error:', err);
    } finally {
      setRecommending(false);
    }
  }

  async function performSearch(query: string) {
    if (!query || query.trim().length === 0) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setIsSearching(true);
    setShowSearchResults(true);
    try {
      const provider = localStorage.getItem('llmProvider') || 'ondevice';
      const model = localStorage.getItem('openRouterModel') || undefined;
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=10&provider=${provider}${model ? `&model=${encodeURIComponent(model)}` : ''}`);
      const json = await res.json();
      if (json?.results) {
        setSearchResults(json.results || []);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      console.error('Search error:', err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(searchQuery);
  };

  async function reprocessFile(filename: string) {
    setProcessingStatus(prev => ({ ...prev, [filename]: 'processing' }));
    try {
      // Get LLM provider preference from localStorage
      const provider = localStorage.getItem('llmProvider') || 'ondevice';
      const model = localStorage.getItem('openRouterModel') || null;

      const res = await fetch('/api/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: filename,
          provider,
          model
        })
      });
      const json = await res.json();
      if (json?.info) {
        await loadFiles();
        if (selected) fetchRecommendations(selected);
      }
    } catch (e) {
      setProcessingStatus(prev => ({ ...prev, [filename]: 'error' }));
    }
  }

  async function fetchSignedUrl(filename: string) {
    if (signedUrls[filename]) return signedUrls[filename];
    try {
      const res = await fetch(`/api/signed-url?file=${encodeURIComponent(filename)}`);
      const j = await res.json();
      if (j?.url) {
        setSignedUrls((s) => ({ ...s, [filename]: j.url }));
        return j.url;
      }
    } catch (e) {
      // ignore and fallback to local path
    }
    const local = `/uploads/${filename}`;
    setSignedUrls((s) => ({ ...s, [filename]: local }));
    return local;
  }

  const openPreview = async (file: any) => {
    // If it's a file that needs a signed URL (like image), fetch it first
    if (file.info?.type === 'image' || file.info?.type === 'video' || file.info?.type === 'pdf') {
      await fetchSignedUrl(file.filename);
    }
    setPreviewFile(file);
    setSidePanelOpen(true);
  };

  // Prepare chart data
  const counts = files.reduce((acc: any, f: any) => {
    const t = f.info?.type || 'unknown';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  const labels = Object.keys(counts);
  const pieData = {
    labels,
    datasets: [
      {
        label: 'Files by type',
        data: labels.map(l => counts[l]),
        backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'],
        borderWidth: 2,
        borderColor: '#fff',
      },
    ],
  };

  // Get CSV trend data for visualization
  const csvFiles = files.filter(f => f.info?.type === 'csv' && f.info?.trends);
  let trendData: any = null;
  if (csvFiles.length > 0) {
    const firstCSV = csvFiles[0];
    const trends = firstCSV.info.trends;
    const trendLabels = Object.keys(trends);
    trendData = {
      labels: trendLabels,
      datasets: [
        {
          label: 'Trend Change %',
          data: trendLabels.map(k => trends[k].changePercent),
          backgroundColor: trendLabels.map((k, i) =>
            trends[k].trend === 'increasing' ? '#10B981' :
              trends[k].trend === 'decreasing' ? '#EF4444' : '#6B7280'
          ),
          borderWidth: 1,
        },
      ],
    };
  }

  const getStatusBadge = (status: string, aiPowered?: boolean) => {
    const badges: Record<string, { text: string; color: string }> = {
      'analyzed': { text: aiPowered ? '✓ AI Analyzed' : '✓ Processed', color: 'bg-green-100 text-green-800' },
      'basic': { text: 'Basic', color: 'bg-gray-100 text-gray-800' },
      'processing': { text: 'Processing...', color: 'bg-blue-100 text-blue-800' },
      'error': { text: 'Error', color: 'bg-red-100 text-red-800' },
    };
    const badge = badges[status] || badges['basic'];
    return (
      <span className={`text-xs px-2 py-1 rounded-full font-medium ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  const getFileIcon = (type: string) => {
    const icons: Record<string, string> = {
      'pdf': '📄',
      'text': '📝',
      'csv': '📊',
      'image': '🖼️',
      'video': '🎥',
    };
    return icons[type] || '📁';
  };

  return (
    <div className="space-y-6">
      {/* Vector Search Bar */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 border border-blue-200">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value.trim().length === 0) {
                  setShowSearchResults(false);
                }
              }}
              placeholder="🔍 Search files using AI-powered vector search... (e.g., 'budget analysis', 'product images', 'sales data')"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {isSearching && (
              <div className="absolute right-3 top-2.5">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Search
          </button>
        </form>

        {/* Search Results */}
        {showSearchResults && searchResults.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-sm font-semibold text-gray-700 mb-2">
              Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} (Vector Similarity Search)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {searchResults.map((result: any, idx: number) => (
                <div
                  key={idx}
                  onClick={() => {
                    setSelected(result.filename);
                    fetchRecommendations(result.filename);
                    setShowSearchResults(false);
                  }}
                  className="bg-white p-3 rounded border border-gray-200 hover:border-blue-400 hover:shadow-md cursor-pointer transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-sm text-gray-900 truncate">
                        {result.filename}
                      </div>
                      {result.info?.summary && (
                        <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {result.info.summary.substring(0, 100)}...
                        </div>
                      )}
                    </div>
                    <div className="ml-2 text-xs font-semibold text-blue-600">
                      {(result.similarity * 100).toFixed(0)}% match
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showSearchResults && !isSearching && searchResults.length === 0 && searchQuery.trim().length > 0 && (
          <div className="mt-4 text-sm text-gray-500 text-center py-2">
            No results found. Try different keywords or upload more files.
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              Loading files...
            </div>
          )}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-1 rounded">
              ⚠️ {error}
            </div>
          )}
          {!loading && !error && files.length > 0 && (
            <div className="text-sm text-gray-600">
              ✓ {files.length} file{files.length !== 1 ? 's' : ''} loaded
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded"
          />
          Auto-refresh
        </label>
      </div>

      {files.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <div className="text-4xl mb-4">📤</div>
          <h3 className="text-lg font-medium text-gray-700 mb-2">No files uploaded yet</h3>
          <p className="text-sm text-gray-500">Upload documents, images, or videos to see AI-powered insights</p>
        </div>
      ) : (
        <>
          {/* Charts Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">File Type Distribution</h3>
              {labels.length > 0 ? (
                <div className="h-64">
                  <Pie data={pieData} options={{ maintainAspectRatio: false, responsive: true }} />
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">No data</div>
              )}
            </div>

            {trendData && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">CSV Trend Analysis</h3>
                <div className="h-64">
                  <Bar data={trendData} options={{ maintainAspectRatio: false, responsive: true }} />
                </div>
              </div>
            )}
          </div>

          {/* Files Grid */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Uploaded Files & AI Insights</h3>
            <div className="grid grid-cols-1 gap-4">
              {files.map((f, i) => {
                const info = f.info || {};
                const status = processingStatus[f.filename] || info.status || 'basic';
                const isSelected = selected === f.filename;

                return (
                  <div
                    key={i}
                    className={`rounded-lg border-2 p-4 transition-all ${isSelected
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                      }`}
                  >
                    {/* File Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="text-3xl">{getFileIcon(info.type)}</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h4 className="font-semibold text-gray-800">{f.filename}</h4>
                            {getStatusBadge(status, info.aiPowered)}
                            {info.llmProvider && (
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${info.llmProvider === 'openrouter'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-blue-100 text-blue-700'
                                }`}>
                                {info.llmProvider === 'openrouter' ? '🌐 OpenRouter' : '💻 On-Device'}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            Type: <span className="font-medium">{info.type || 'unknown'}</span>
                            {info.size && ` • ${Math.round(info.size / 1024)} KB`}
                            {info.pages && ` • ${info.pages} pages`}
                            {info.words && ` • ${info.words} words`}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => fetchRecommendations(f.filename)}
                          className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition"
                        >
                          Get Recommendations
                        </button>
                        <button
                          onClick={() => reprocessFile(f.filename)}
                          className="text-xs px-3 py-1.5 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
                        >
                          Regenerate
                        </button>
                        <button
                          onClick={() => openPreview(f)}
                          className="text-xs px-3 py-1.5 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
                        >
                          Preview
                        </button>
                      </div>
                    </div>

                    {/* AI Summary */}
                    {info.summary && (
                      <div className="mb-3 p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-semibold text-gray-700">🤖 AI Summary</span>
                          {info.llm && (
                            <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                              LLM Generated
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{info.summary}</p>
                      </div>
                    )}

                    {/* Key Highlights */}
                    {info.highlights && info.highlights.length > 0 && (
                      <div className="mb-3">
                        <div className="text-sm font-semibold text-gray-700 mb-2">✨ Key Highlights</div>
                        <ul className="space-y-1">
                          {info.highlights.slice(0, 3).map((h: string, idx: number) => (
                            <li key={idx} className="text-xs text-gray-600 flex items-start gap-2">
                              <span className="text-blue-500 mt-1">•</span>
                              <span>{h.length > 150 ? h.substring(0, 150) + '...' : h}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Image Analysis */}
                    {info.type === 'image' && (
                      <div className="mb-3 space-y-2">
                        {info.objects && info.objects.length > 0 && (
                          <div>
                            <div className="text-sm font-semibold text-gray-700 mb-1">🔍 Detected Objects</div>
                            <div className="flex flex-wrap gap-2">
                              {info.objects.map((obj: string, idx: number) => (
                                <span key={idx} className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                                  {obj}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {info.scene && (
                          <div className="text-xs text-gray-600">
                            <span className="font-medium">Scene:</span> {info.scene}
                          </div>
                        )}
                        {signedUrls[f.filename] && (
                          <img
                            src={signedUrls[f.filename]}
                            alt={f.filename}
                            className="mt-2 max-h-48 rounded border border-gray-200"
                            onLoad={() => fetchSignedUrl(f.filename)}
                          />
                        )}
                      </div>
                    )}

                    {/* Video Analysis */}
                    {info.type === 'video' && (
                      <div className="mb-3 space-y-2">
                        {info.scenes && info.scenes.length > 0 && (
                          <div>
                            <div className="text-sm font-semibold text-gray-700 mb-1">🎬 Video Scenes</div>
                            <div className="space-y-1">
                              {info.scenes.map((scene: any, idx: number) => (
                                <div key={idx} className="text-xs text-gray-600">
                                  <span className="font-medium">{scene.time}s:</span> {scene.description}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {info.actions && info.actions.length > 0 && (
                          <div>
                            <div className="text-sm font-semibold text-gray-700 mb-1">⚡ Detected Actions</div>
                            <div className="flex flex-wrap gap-2">
                              {info.actions.map((action: string, idx: number) => (
                                <span key={idx} className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded">
                                  {action}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* CSV Stats */}
                    {info.type === 'csv' && info.numericStats && (
                      <div className="mb-3">
                        <div className="text-sm font-semibold text-gray-700 mb-2">📊 Data Statistics</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {Object.entries(info.numericStats).slice(0, 6).map(([key, stats]: [string, any]) => (
                            <div key={key} className="bg-gray-50 p-2 rounded text-xs">
                              <div className="font-medium text-gray-700">{key}</div>
                              <div className="text-gray-600">
                                Min: {stats.min?.toFixed(2)} | Max: {stats.max?.toFixed(2)}
                              </div>
                              <div className="text-gray-600">Avg: {stats.avg?.toFixed(2)}</div>
                            </div>
                          ))}
                        </div>
                        {info.trends && (
                          <div className="mt-2">
                            <div className="text-xs font-semibold text-gray-700 mb-1">📈 Trends</div>
                            {Object.entries(info.trends).map(([key, trend]: [string, any]) => (
                              <div key={key} className="text-xs text-gray-600">
                                <span className="font-medium">{key}:</span> {trend.trend}
                                ({trend.changePercent > 0 ? '+' : ''}{trend.changePercent}%)
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Expandable Raw Data */}

                  </div>
                );
              })}
            </div>
          </div>

          {/* Recommendations Section */}
          {selected && (
            <div className="mt-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                💡 AI Recommendations for: {files.find(f => f.filename === selected)?.filename}
              </h3>
              {recommending ? (
                <div className="flex items-center gap-2 text-sm text-blue-600 p-4">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  Analyzing semantic similarities...
                </div>
              ) : recommended.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {recommended.map((r: any, idx: number) => (
                    <div
                      key={idx}
                      className="group bg-white rounded-lg p-3 border border-purple-200 hover:border-purple-400 hover:shadow-md transition cursor-pointer"
                      onClick={() => fetchRecommendations(r.filename)}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl group-hover:scale-110 transition-transform">{getFileIcon(r.info?.type)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-sm text-gray-900 truncate">{r.filename}</div>
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                              Match
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">Type: {r.info?.type || 'unknown'}</div>
                        </div>
                        <button
                          className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded group-hover:bg-purple-600 group-hover:text-white transition"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPreview(r);
                          }}
                        >
                          Analyze
                        </button>
                      </div>
                      {r.info?.summary && (
                        <div className="relative">
                          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-purple-200"></div>
                          <p className="text-xs text-gray-600 pl-2 line-clamp-2 italic">
                            "{r.info.summary}"
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-600">
                  {files.length <= 1
                    ? "Upload at least 2 files to enable recommendations. The AI needs multiple files to discover connections."
                    : "No recommendations available. The AI is analyzing relationships between files..."
                  }
                </div>
              )}
            </div>
          )}
        </>
      )}


      {/* Side Panel for Preview */}
      {
        sidePanelOpen && previewFile && (
          <div className="fixed inset-0 z-[100] flex justify-end top-0 left-0">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity"
              onClick={() => setSidePanelOpen(false)}
            ></div>

            {/* Panel */}
            <div className="relative w-full max-w-xl bg-white h-full shadow-2xl overflow-y-auto transform transition-transform border-l border-gray-200 flex flex-col">
              <div className="sticky top-0 bg-white/90 backdrop-blur z-10 pt-0 pb-6 px-6 flex items-center justify-between border-b border-gray-200">
                <div>
                  <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    {getFileIcon(previewFile.info?.type)} {previewFile.filename}
                  </h2>
                  <div className="text-xs text-gray-500">
                    {previewFile.info?.type?.toUpperCase()} • {previewFile.info?.size ? Math.round(previewFile.info.size / 1024) + ' KB' : 'Unknown Size'}
                  </div>
                </div>
                <button
                  onClick={() => setSidePanelOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-6 flex-1">
                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      fetchRecommendations(previewFile.filename);
                      setSidePanelOpen(false);
                    }}
                    className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
                  >
                    Set as Active File
                  </button>
                  <button
                    onClick={async () => {
                      const url = await fetchSignedUrl(previewFile.filename);
                      window.open(url, '_blank');
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                  >
                    Open Original
                  </button>
                </div>

                {/* Content Preview */}
                {(previewFile.info?.type === 'image' || previewFile.info?.type === 'video') && signedUrls[previewFile.filename] && (
                  <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                    {previewFile.info?.type === 'image' ? (
                      <img src={signedUrls[previewFile.filename]} alt="Preview" className="w-full h-auto object-contain" />
                    ) : (
                      <video src={signedUrls[previewFile.filename]} controls className="w-full h-auto" />
                    )}
                  </div>
                )}

                {/* AI Summary */}
                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">🤖 AI Summary</h3>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {previewFile.info?.summary || "No summary available."}
                  </p>
                </div>

                {/* Metadata Details */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">Extracted Metadata</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {previewFile.info?.highlights && (
                      <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                        <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Key Highlights</span>
                        <ul className="text-sm text-gray-600 list-disc ml-4 space-y-1">
                          {previewFile.info.highlights.map((h: string, i: number) => (
                            <li key={i}>{h}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {previewFile.info?.objects && (
                      <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                        <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Detected Objects</span>
                        <div className="flex flex-wrap gap-1">
                          {previewFile.info.objects.map((o: string, i: number) => (
                            <span key={i} className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded border border-green-100">{o}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {previewFile.info?.tags && (
                      <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                        <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Tags</span>
                        <div className="flex flex-wrap gap-1">
                          {previewFile.info.tags.map((t: string, i: number) => (
                            <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">#{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Raw Data Toggle */}
                <details className="group">
                  <summary className="cursor-pointer text-xs text-gray-500 hover:text-blue-600 transition flex items-center gap-1">
                    <span>Show Raw JSON</span>
                  </summary>
                  <pre className="mt-2 p-3 bg-gray-900 text-green-400 text-xs rounded overflow-x-auto">
                    {JSON.stringify(previewFile.info, null, 2)}
                  </pre>
                </details>

              </div>
            </div>
          </div>
        )
      }
    </div>
  );
}
