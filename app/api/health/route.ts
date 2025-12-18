export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { supabaseServer } from '../../../lib/supabaseServer';

export async function GET() {
  const checks: Record<string, any> = {
    supabaseConfigured: false,
    supabaseConnected: false,
    tableExists: false,
    storageBucketExists: false,
    errors: [] as string[]
  };

  const supabase = supabaseServer();
  
  if (!supabase) {
    checks.errors.push('Supabase not configured (missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY)');
    return NextResponse.json({ 
      status: 'local_mode',
      message: 'Using local file storage (Supabase not configured)',
      checks 
    });
  }

  checks.supabaseConfigured = true;

  // Test database connection
  try {
    const { data, error } = await supabase.from('files').select('count').limit(1);
    if (error) {
      if (error.code === 'PGRST116' || error.message.includes('relation') || error.message.includes('does not exist')) {
        checks.errors.push('Files table does not exist. Run the SQL migration to create it.');
      } else {
        checks.errors.push(`Database error: ${error.message}`);
      }
    } else {
      checks.supabaseConnected = true;
      checks.tableExists = true;
    }
  } catch (e: any) {
    checks.errors.push(`Database connection error: ${e.message}`);
  }

  // Test storage bucket
  try {
    const { data, error } = await supabase.storage.from('uploads').list('', { limit: 1 });
    if (error) {
      if (error.message.includes('Bucket not found') || error.message.includes('not found')) {
        checks.errors.push('Storage bucket "uploads" does not exist. Create it in Supabase dashboard.');
      } else {
        checks.errors.push(`Storage error: ${error.message}`);
      }
    } else {
      checks.storageBucketExists = true;
    }
  } catch (e: any) {
    checks.errors.push(`Storage connection error: ${e.message}`);
  }

  const allGood = checks.supabaseConnected && checks.tableExists && checks.storageBucketExists;

  return NextResponse.json({
    status: allGood ? 'ok' : 'issues',
    message: allGood 
      ? 'Supabase is properly configured' 
      : 'Some Supabase configuration issues detected',
    checks
  });
}







