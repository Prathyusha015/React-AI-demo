export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { processFile } from '../../../lib/processors';
import { recommendFiles } from '../../../lib/recommender';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const target = url.searchParams.get('file') || undefined;

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    const exists = fs.existsSync(uploadDir);
    if (!exists) return NextResponse.json({ recommendations: [] });

    const entries = await fs.promises.readdir(uploadDir);
    const files: Array<any> = [];
    for (const name of entries) {
      const filePath = path.join(uploadDir, name);
      try {
        const info = await processFile(filePath);
        files.push({ filename: name, info });
      } catch (err: any) {
        files.push({ filename: name, error: String(err) });
      }
    }

    const targetFile = files.find(f => f.filename === target);
    const recommendations = recommendFiles(files, targetFile);

    return NextResponse.json({ recommendations });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
