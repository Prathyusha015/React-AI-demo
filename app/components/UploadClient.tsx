"use client";

import React, { useState } from 'react';

export default function UploadClient() {
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setResults([]);
    setError(null);
    const list = e.target.files;
    if (!list) return setFiles([]);
    setFiles(Array.from(list));
  }

  function uploadWithXhr(filesToUpload: File[]) {
    return new Promise<any>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const fd = new FormData();
      filesToUpload.forEach(f => fd.append('files', f));
      xhr.open('POST', '/api/upload');
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const p = Math.round((evt.loaded / evt.total) * 100);
          setProgress(p);
        }
      };
      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText);
          resolve(json);
        } catch (err) {
          reject(err);
        }
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(fd);
    });
  }

  async function onUpload() {
    if (!files.length) return;
    setUploading(true);
    setProgress(0);
    setResults([]);
    setError(null);
    try {
      const res = await uploadWithXhr(files);
      if (res?.results) setResults(res.results);
      else if (res?.error) setError(res.error);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setUploading(false);
      setProgress(100);
    }
  }

  return (
    <div className="w-full rounded-lg border border-dashed border-zinc-200 bg-white p-6 shadow-sm">
      <label className="mb-2 block text-sm font-medium text-zinc-700">Upload files</label>
      <input type="file" multiple onChange={onSelect} className="mb-4" />

      <div className="mb-4 flex gap-2">
        <button
          onClick={onUpload}
          disabled={uploading || files.length === 0}
          className="rounded bg-sky-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        <button
          onClick={() => { setFiles([]); setResults([]); setProgress(0); setError(null); }}
          className="rounded border px-4 py-2"
        >
          Clear
        </button>
      </div>

      {uploading && (
        <div className="mb-4">
          <div className="h-2 w-full rounded bg-zinc-100">
            <div className="h-2 rounded bg-sky-600" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1 text-sm text-zinc-600">{progress}%</div>
        </div>
      )}

      {files.length > 0 && (
        <div className="mb-4">
          <div className="text-sm text-zinc-600">Selected files:</div>
          <ul className="mt-2 list-disc pl-5">
            {files.map((f, i) => (
              <li key={i} className="text-sm">{f.name} — {Math.round(f.size/1024)} KB</li>
            ))}
          </ul>
        </div>
      )}

      {error && <div className="mb-4 text-sm text-red-600">Error: {error}</div>}

      {results.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-medium">Results</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {results.map((r, idx) => (
              <div key={idx} className="rounded border p-3 text-sm">
                <div className="mb-2 font-medium">{r.filename}</div>
                <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(r.info, null, 2)}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
