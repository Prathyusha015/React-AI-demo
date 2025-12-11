import Image from "next/image";
import UploadClient from './components/UploadClient';
import DashboardClient from './components/DashboardClient';

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-4xl flex-col items-center gap-8 py-16 px-6 bg-white dark:bg-black sm:items-start">
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Image
              className="dark:invert"
              src="/next.svg"
              alt="Next.js logo"
              width={80}
              height={18}
              priority
            />
            <h1 className="text-lg font-semibold">AI-Powered Insights Dashboard (Prototype)</h1>
          </div>
        </div>

        <div className="w-full grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <UploadClient />
          </div>

          <div className="sm:col-span-2 rounded-lg border bg-white p-6">
            <h2 className="mb-2 text-sm font-medium">Dashboard (preview)</h2>
            <p className="text-sm text-zinc-600">Uploaded files will appear with extracted summaries, samples, and simple stats. Charts and recommendations are available below.</p>
            <div className="mt-4">
              {/* DashboardClient is client-side and renders charts */}
              <DashboardClient />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
