/**
 * Runtime configuration from Vite environment variables (set in Vercel → Settings →
 * Environment Variables, or in .env.local for development). Values are baked in at build
 * time, so redeploy after changing them. The engine reads them from window.__VIPL_CONFIG__
 * (see src/engine/00-config-sync.js); empty values fall back to the engine's defaults.
 *
 * Note: the publishable (anon) key is meant to be public — it is visible in the browser
 * either way. The data is protected by Supabase Auth + Row Level Security, not by hiding it.
 */
const env = import.meta.env;
const supabaseUrl = env.VITE_SUPABASE_URL || '';

// Supabase Auth sign-in is ON whenever a Supabase project is configured through the
// environment (the secure setup in supabase/schema.sql). VITE_AUTH_MODE=anon switches back
// to the old open access mode for a project still using the legacy policy.
const authMode = supabaseUrl && supabaseUrl !== 'off' && env.VITE_AUTH_MODE !== 'anon' ? 'supabase' : 'anon';

window.__VIPL_CONFIG__ = {
  supabaseUrl,
  supabaseAnonKey: env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '',
  supabaseRowId: env.VITE_SUPABASE_ROW_ID || '',
  authMode,
  // Usernames are turned into Supabase Auth logins as <username>@<this domain>.
  authEmailDomain: env.VITE_AUTH_EMAIL_DOMAIN || 'vipl-erp.local',
};
