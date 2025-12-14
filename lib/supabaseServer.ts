import { createClient } from "@supabase/supabase-js";

export function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  // Return null if Supabase is not configured (app will fallback to local storage)
  if (!url || !key) {
    return null;
  }

  try {
    return createClient(url, key);
  } catch (e) {
    console.warn('Failed to initialize Supabase client (check your .env.local URL):', e);
    return null;
  }
}
