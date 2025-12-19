import UploadClient from '../components/UploadClient';

export default function UploadPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 font-sans">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            Upload Files
          </h1>
          <p className="text-gray-600 text-sm">
            Upload documents, images, and videos for AI-powered analysis and insights
          </p>
        </div>

        {/* Upload Panel */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <UploadClient />
        </div>

        {/* Upload Info */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">📋 Supported File Types</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-blue-700">
            <div>
              <span className="font-medium">Documents:</span> PDF, DOCX, TXT
            </div>
            <div>
              <span className="font-medium">Data:</span> CSV
            </div>
            <div>
              <span className="font-medium">Images:</span> JPG, PNG, GIF, WEBP
            </div>
            <div>
              <span className="font-medium">Videos:</span> MP4, MOV, WEBM
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}














