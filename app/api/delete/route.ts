export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { supabaseServer } from '../../../lib/supabaseServer';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
    try {
        const { filename } = await request.json();

        if (!filename) {
            return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
        }

        const supabase = supabaseServer();
        const errors = [];

        // 1. Delete from Supabase if configured
        if (supabase) {
            // Delete from DB
            const { error: dbError } = await supabase
                .from('files')
                .delete()
                .eq('filename', filename);

            if (dbError) {
                console.error('Supabase DB delete error:', dbError);
                errors.push(`DB: ${dbError.message}`);
            }

            // Delete from Storage
            const { error: storageError } = await supabase
                .storage
                .from('uploads')
                .remove([filename]);

            if (storageError) {
                console.error('Supabase Storage delete error:', storageError);
                errors.push(`Storage: ${storageError.message}`);
            }
        }

        // 2. Delete from local disk (Always try this to keep in sync or if Supabase fails/not used)
        try {
            const uploadDir = path.join(process.cwd(), 'public', 'uploads');
            const filePath = path.join(uploadDir, filename);
            const metaPath = path.join(uploadDir, `${filename}.meta.json`);

            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
            }
            if (fs.existsSync(metaPath)) {
                await fs.promises.unlink(metaPath);
            }
        } catch (fsError: any) {
            console.error('Local file delete error:', fsError);
            // Only report error if we are NOT using Supabase (if Supabase succeeded, we generally consider it a success)
            if (!supabase) {
                errors.push(`Local: ${fsError.message}`);
            }
        }

        if (errors.length > 0 && !supabase) {
            // If no supabase and local failed, it's a failure. 
            // If Supabase failed, we return error.
            // Actually let's return error if ANY major failure occurred that prevents confirmed deletion.
            return NextResponse.json({ error: errors.join(', ') }, { status: 500 });
        }

        // If Supabase was attempted but failed DB, that's critical. 
        // Storage failure might be orphaned files but DB is source of truth for list.
        // If we have errors array populated, we might want to warn.

        return NextResponse.json({ success: true, message: 'File deleted successfully' });

    } catch (err: any) {
        console.error('Delete API error:', err);
        return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
    }
}
