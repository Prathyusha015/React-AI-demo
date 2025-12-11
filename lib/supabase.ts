let supabase: any = null;

export async function getSupabaseClient(): Promise<any | null> {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !serviceKey) return null;

  try {
    // Try to load with a runtime require (avoids bundlers resolving the package at build-time)
    try {
      // use eval to avoid static analysis by bundlers
      // @ts-ignore
      const req = eval('require');
      const mod = req('@supabase/supabase-js');
      const createClient = mod.createClient || mod.default?.createClient;
      if (!createClient) return null;
      supabase = createClient(url, serviceKey, {
        auth: { persistSession: false },
        global: { headers: { 'x-application-name': 'ai-demo' } },
      });
      return supabase;
    } catch (e) {
      // If require isn't available (pure ESM) or package missing, try dynamic import as a fallback
      try {
        const mod = await new Function('return import("@supabase/supabase-js")')();
        const createClient = mod.createClient || mod.default?.createClient;
        if (!createClient) return null;
        supabase = createClient(url, serviceKey, {
          auth: { persistSession: false },
          global: { headers: { 'x-application-name': 'ai-demo' } },
        });
        return supabase;
      } catch (e2) {
        return null;
      }
    }
  } catch (e) {
    // package not installed or failed to load
    return null;
  }
}

export default getSupabaseClient;
