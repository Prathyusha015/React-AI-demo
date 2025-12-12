"use client";

import React, { useState, useEffect } from 'react';

export default function UploadClient() {
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<Record<string, string>>({});

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setResults([]);
    setError(null);
    setProcessingStatus({});
    const list = e.target.files;
    if (!list) return setFiles([]);
    setFiles(Array.from(list));
  }

  function uploadWithXhr(filesToUpload: File[]) {
    return new Promise<any>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const fd = new FormData();
      filesToUpload.forEach(f => {
        fd.append('files', f);
        setProcessingStatus(prev => ({ ...prev, [f.name]: 'queued' }));
      });
      
      // Get LLM provider preference from localStorage
      const provider = localStorage.getItem('llmProvider') || 'ondevice';
      const model = localStorage.getItem('openRouterModel') || null;
      fd.append('provider', provider);
      if (model) {
        fd.append('model', model);
      }
      
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
    
    // Set all files to processing
    files.forEach(f => {
      setProcessingStatus(prev => ({ ...prev, [f.name]: 'uploading' }));
    });

    try {
      const res = await uploadWithXhr(files);
      if (res?.results) {
        setResults(res.results);
        // Update processing status
        res.results.forEach((r: any) => {
          setProcessingStatus(prev => ({ 
            ...prev, 
            [r.filename]: r.info?.status || (r.info?.error ? 'error' : 'completed')
          }));
        });
        
        // Trigger dashboard refresh after a short delay
        setTimeout(() => {
          window.dispatchEvent(new Event('filesUpdated'));
        }, 1000);
      } else if (res?.error) {
        setError(res.error);
        files.forEach(f => {
          setProcessingStatus(prev => ({ ...prev, [f.name]: 'error' }));
        });
      }
    } catch (err: any) {
      setError(err?.message || String(err));
      files.forEach(f => {
        setProcessingStatus(prev => ({ ...prev, [f.name]: 'error' }));
      });
    } finally {
      setUploading(false);
      setProgress(100);
    }
  }

  const getFileTypeIcon = (file: File) => {
    const type = file.type;
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎥';
    if (type === 'application/pdf') return '📄';
    if (type === 'text/csv' || file.name.endsWith('.csv')) return '📊';
    if (type.startsWith('text/') || file.name.endsWith('.txt')) return '📝';
    return '📁';
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { text: string; color: string; icon: string }> = {
      'queued': { text: 'Queued', color: 'bg-gray-100 text-gray-700', icon: '⏳' },
      'uploading': { text: 'Uploading', color: 'bg-blue-100 text-blue-700', icon: '⬆️' },
      'processing': { text: 'AI Processing', color: 'bg-purple-100 text-purple-700', icon: '🤖' },
      'completed': { text: 'Complete', color: 'bg-green-100 text-green-700', icon: '✓' },
      'analyzed': { text: 'Analyzed', color: 'bg-green-100 text-green-700', icon: '✓' },
      'error': { text: 'Error', color: 'bg-red-100 text-red-700', icon: '⚠️' },
    };
    const badge = badges[status] || badges['queued'];
    return (
      <span className={`text-xs px-2 py-1 rounded-full font-medium ${badge.color} flex items-center gap-1`}>
        <span>{badge.icon}</span>
        {badge.text}
      </span>
    );
  };

  return (
    <div className="w-full rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 shadow-sm hover:border-blue-400 transition">
      <div className="mb-4">
        <label className="block text-lg font-semibold text-gray-800 mb-2">
          📤 Upload Files
        </label>
        <p className="text-xs text-gray-600 mb-4">
          Upload documents (PDF, TXT, CSV), images, or videos for AI analysis
        </p>
        <input
          type="file"
          multiple
          onChange={onSelect}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
        />
      </div>

      {files.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="text-sm font-medium text-gray-700">Selected Files ({files.length}):</div>
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-lg">{getFileTypeIcon(f)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{f.name}</div>
                  <div className="text-xs text-gray-500">{Math.round(f.size/1024)} KB</div>
                </div>
              </div>
              {processingStatus[f.name] && (
                <div className="ml-2">
                  {getStatusBadge(processingStatus[f.name])}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <button
          onClick={onUpload}
          disabled={uploading || files.length === 0}
          className="flex-1 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 text-white font-medium hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md hover:shadow-lg"
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Uploading & Processing...
            </span>
          ) : (
            '🚀 Upload & Analyze'
          )}
        </button>
        <button
          onClick={() => { 
            setFiles([]); 
            setResults([]); 
            setProgress(0); 
            setError(null);
            setProcessingStatus({});
          }}
          className="px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition"
        >
          Clear
        </button>
      </div>

      {uploading && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">Upload Progress</span>
            <span className="text-sm text-gray-600">{progress}%</span>
          </div>
          <div className="h-3 w-full rounded-full bg-gray-200 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Files are being uploaded and analyzed by AI. This may take a moment...
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-700">
            <span>⚠️</span>
            <span className="text-sm font-medium">Error: {error}</span>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">✓</span>
            <h3 className="text-sm font-semibold text-green-800">
              Successfully Processed ({results.length} file{results.length !== 1 ? 's' : ''})
            </h3>
          </div>
          <div className="space-y-2">
            {results.map((r, idx) => (
              <div key={idx} className="bg-white p-2 rounded border border-green-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm">{getFileTypeIcon(files.find(f => f.name === r.filename.split('-').slice(1).join('-')) || files[0])}</span>
                  <span className="text-sm font-medium text-gray-800">{r.filename}</span>
                  {r.info?.status && (
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      r.info.status === 'analyzed' ? 'bg-green-100 text-green-700' :
                      r.info.status === 'basic' ? 'bg-gray-100 text-gray-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {r.info.status}
                    </span>
                  )}
                  {r.insertedToDb && (
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                      ✓ Saved to DB
                    </span>
                  )}
                  {r.supabaseDbError && (
                    <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700" title={r.supabaseDbError}>
                      ⚠ DB Error
                    </span>
                  )}
                </div>
                {r.info?.summary && (
                  <p className="text-xs text-gray-600 line-clamp-2 mt-1">{r.info.summary}</p>
                )}
                {r.supabaseDbError && (
                  <p className="text-xs text-yellow-700 mt-1">
                    ⚠ Database error: {r.supabaseDbError}. File uploaded to storage but not saved to database.
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-3">
            💡 Files are now available in the dashboard. Check AI insights, recommendations, and visualizations!
          </p>
        </div>
      )}
    </div>
  );
}
