import DashboardClient from './components/DashboardClient';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 font-sans">
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            AI Insights Dashboard
          </h1>
          <p className="text-gray-600 text-sm">
            View analyzed files with summaries, highlights, trends, and AI recommendations
          </p>
        </div>

        {/* Dashboard Content */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <DashboardClient />
        </div>

        {/* Feature Info Cards */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <div className="text-blue-600 font-semibold mb-1">📄 Document Analysis</div>
            <p className="text-xs text-gray-600">AI extracts summaries, key highlights, and trends from PDFs, text files, and CSVs</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <div className="text-green-600 font-semibold mb-1">🖼️ Image & Video AI</div>
            <p className="text-xs text-gray-600">Object detection, scene analysis, and automatic captioning for images and videos</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <div className="text-purple-600 font-semibold mb-1">💡 Smart Recommendations</div>
            <p className="text-xs text-gray-600">AI suggests related files based on content similarity and cross-modal connections</p>
          </div>
        </div>
      </main>
    </div>
  );
}
