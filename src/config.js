/**
 * Runtime configuration from Vite environment variables (set in Vercel → Settings →
 * Environment Variables, or in .env.local for development). Values are baked in at build
 * time, so redeploy after changing them. The engine reads them from window.__VIPL_CONFIG__
 * (see src/engine/00-config-sync.js); empty values fall back to the engine's defaults.
 *
 * Note: the anon/publishable key is meant to be public — it is visible in the browser either
 * way. Protection of the data comes from Supabase Row Level Security, not from hiding it.
 */
window.__VIPL_CONFIG__ = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  supabaseRowId: import.meta.env.VITE_SUPABASE_ROW_ID || '',
};
