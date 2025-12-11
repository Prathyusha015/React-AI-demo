# AI-Powered Insights Dashboard (Next.js Prototype)

This prototype demonstrates a small Next.js (app-router) demo for multi-modal AI-powered dashboards: upload documents, images, and videos and get lightweight AI-driven summaries, visualizations, and recommendations.

Key features in this prototype
- Upload files (PDF, TXT, CSV, images, videos) via the UI; files are saved to `public/uploads`.
- Lightweight processors in `lib/processors.ts` extract simple summaries, CSV stats, and basic image captions (stubs/prototypes).
- Dashboard (`app/components/DashboardClient.tsx`) shows a pie chart of file types and lists processed metadata.
- Simple recommendations via `lib/recommender.ts` and API at `/api/recommend`.

What I changed / added
- `app/api/upload/route.ts` — file upload endpoint (saves to `public/uploads`).
- `lib/processors.ts` — simple processors for text, CSV, PDF (stub), images, videos.
- `app/components/UploadClient.tsx` — client upload UI + progress.
- `app/api/list/route.ts` — list uploaded files and processed info.
- `app/components/DashboardClient.tsx` — dashboard with Chart.js pie chart and file list.
- `lib/recommender.ts` & `app/api/recommend/route.ts` — lightweight recommendation stub and endpoint.
- `package.json` — added `chart.js` and `react-chartjs-2` to dependencies.

Run locally

1. Install dependencies

```bash
npm install
```

2. Run dev server

```bash
npm run dev
```

3. Open in browser

Visit `http://localhost:3000` and use the Upload panel to add files. Uploaded files will appear in the Dashboard panel with extracted info. Files are stored under `public/uploads`.

Notes & caveats
- PDF extraction is a stub in `lib/processors.ts`. For richer PDF text extraction consider adding `pdf-parse` or `pdfjs-dist` and updating `processPDF`.
- The recommender is a heuristic-based stub. For semantic recommendations, integrate an embedding service (OpenAI, Hugging Face, or local model) and compute vector similarity.
- This prototype keeps all uploaded files in `public/uploads` for simplicity. For production use, store files in object storage (S3) and handle authentication and virus scanning.

Suggested next steps
- Integrate a server-side PDF/text extractor and image/video analysis (vision models).
- Replace the recommender with embeddings + nearest-neighbors (faiss/pgvector) for better recommendations.
- Add user authentication and isolate uploads per user.

If you want, I can now:
- Wire the recommender to use embeddings (requires API keys/setup).
- Add PDF extraction with `pdf-parse` and update `processPDF`.
- Run `npm install` here and smoke-test the dev server (if you want me to run commands locally).
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Optional: Supabase integration

This prototype supports using Supabase Storage + Postgres for file storage and metadata. When `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (or `SUPABASE_ANON_KEY`) are present, the server routes will prefer Supabase instead of local `public/uploads`.

Quick setup steps:

1. Create a Supabase project and a Storage bucket named `uploads`.
2. (Optional but recommended) Create a `files` table:

```sql
create table files (
	id uuid primary key default gen_random_uuid(),
	filename text not null,
	path text,
	info jsonb,
	created_at timestamptz default now(),
	reprocessed_at timestamptz
);
```

3. Add environment variables to `ai-demo/.env.local` (or your deployment environment):

```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key_here
# or
SUPABASE_ANON_KEY=your_anon_key_here
```

4. Install dependencies and run the dev server from the `ai-demo` folder:

```bash
cd ai-demo
npm install
npm run dev
```

Notes:
- The code will attempt to insert/update a row in the `files` table but will *not* create the table automatically — run the SQL above or provide your own migration.
- Storage bucket policies (public/private) determine how the UI should display/download files; if your bucket is private, you'll need signed URLs or a server proxy to stream files to clients.
- The Supabase client is created only when `SUPABASE_URL` and a key are present; otherwise the app falls back to local filesystem storage.
