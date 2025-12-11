"use client";

import React, { useEffect, useState } from 'react';
import { Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function DashboardClient() {
  const [files, setFiles] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<Array<any>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string,string>>({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/list');
        const json = await res.json();
        if (json?.files) setFiles(json.files);
        else setError('No files returned');
      } catch (err: any) {
        setError(err?.message || String(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
    try {
      const res = await fetch(`/api/recommend?file=${encodeURIComponent(filename)}`);
      const json = await res.json();
      if (json?.recommendations) setRecommended(json.recommendations || []);
    } catch (err) {
      // ignore silently for now
    }
  }

  async function reprocessFile(filename: string) {
    try {
      const res = await fetch('/api/reprocess', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: filename }) });
      const json = await res.json();
      if (json?.info) {
        // refresh files list to pick up updated metadata
        const list = await (await fetch('/api/list')).json();
        if (list?.files) setFiles(list.files);
        // if recommendations were visible, refresh them
        if (selected) fetchRecommendations(selected);
      }
    } catch (e) {
      // ignore
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

  const counts = files.reduce((acc:any, f:any) => {
    const t = f.info?.type || 'unknown';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  const labels = Object.keys(counts);
  const data = {
    labels,
    datasets: [
      {
        label: 'Files by type',
        data: labels.map(l => counts[l]),
        backgroundColor: ['#60A5FA', '#34D399', '#FBBF24', '#F87171', '#C4B5FD'],
        borderWidth: 1,
      },
    ],
  };

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium">Overview</h3>
      {loading && <div className="mb-2 text-sm text-zinc-600">Loading...</div>}
      {error && <div className="mb-2 text-sm text-red-600">{error}</div>}

      {labels.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded border p-3">
            <Pie data={data} />
          </div>

          <div className="rounded border p-3">
            <div className="mb-2 text-sm font-medium">Files</div>
            <div className="space-y-2 text-xs">
              {files.map((f, i) => (
                <div key={i} className={`rounded border p-2 ${selected === f.filename ? 'ring-2 ring-sky-200' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{f.filename}</div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => fetchRecommendations(f.filename)} className="text-[11px] rounded bg-zinc-100 px-2 py-1">Recommend</button>
                        <button onClick={() => reprocessFile(f.filename)} className="text-[11px] rounded bg-zinc-100 px-2 py-1">Regenerate</button>
                        <button onClick={async () => {
                          const url = await fetchSignedUrl(f.filename);
                          // open preview in new tab for now
                          window.open(url, '_blank');
                        }} className="text-[11px] rounded bg-zinc-100 px-2 py-1">Preview</button>
                    </div>
                  </div>
                  <div className="text-zinc-600">Type: {f.info?.type || 'unknown'}</div>
                  {f.info?.summary && (
                    <div className="mt-2 rounded bg-zinc-50 p-2 text-sm">
                      <div className="font-medium">Summary{f.info?.llm ? ' (LLM)' : ''}</div>
                      <div className="text-xs mt-1 whitespace-pre-wrap">{f.info.summary}</div>
                    </div>
                  )}
                  <pre className="mt-2 max-h-28 overflow-auto text-[11px]">{JSON.stringify(f.info, null, 2)}</pre>
                  {/* inline preview if we have a cached signed url or local path */}
                  {signedUrls[f.filename] && (() => {
                    const url = signedUrls[f.filename];
                    const ext = f.filename.split('.').pop()?.toLowerCase() || '';
                    if (['png','jpg','jpeg','gif','webp'].includes(ext)) {
                      return <img src={url} alt={f.filename} className="mt-2 max-h-48" />;
                    }
                    if (ext === 'pdf') {
                      return <iframe src={url} className="mt-2 h-64 w-full" />;
                    }
                    return <a href={url} target="_blank" rel="noreferrer" className="mt-2 text-xs text-sky-600">Open file</a>;
                  })()}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded border p-3">
            <div className="mb-2 text-sm font-medium">Recommended</div>
            {recommended.length ? (
              <div className="space-y-2 text-xs">
                {recommended.map((r: any, idx: number) => (
                  <div key={idx} className="rounded border p-2">
                    <div className="font-medium">{r.filename}</div>
                    <div className="text-zinc-600">Type: {r.info?.type || 'unknown'}</div>
                    <pre className="mt-2 max-h-24 overflow-auto text-[11px]">{JSON.stringify(r.info, null, 2)}</pre>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-zinc-600">No recommendations yet. Select a file to get suggestions.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-sm text-zinc-600">No uploaded files yet — upload to see insights.</div>
      )}
    </div>
  );
}
