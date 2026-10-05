import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Auth for the engine, exposed as window.ViplAuth (only when authMode is
 * 'supabase'). The ERP keeps its own username field: "vipl1" signs in as the Supabase user
 * "vipl1@<authEmailDomain>" (or a full email address can be typed). Which modules a person
 * may use is still decided by their ERP user record (Admin → Users) with the same username.
 *
 * The session is kept in memory only — like the original app, reloading the page or
 * logging out always returns to the sign-in screen.
 */
const cfg = window.__VIPL_CONFIG__ || {};

if (cfg.authMode === 'supabase') {
  const client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const toEmail = (username) => {
    const u = (username || '').trim().toLowerCase();
    return u.includes('@') ? u : `${u}@${cfg.authEmailDomain}`;
  };

  window.ViplAuth = {
    enabled: true,
    toEmail,
    /** Resolves to { ok: true } or { ok: false, message } — never throws. */
    async signIn(username, password) {
      try {
        const { error } = await client.auth.signInWithPassword({ email: toEmail(username), password });
        if (!error) return { ok: true };
        const invalid = /invalid login credentials/i.test(error.message);
        return { ok: false, message: invalid ? 'Invalid username or password.' : `Sign-in failed: ${error.message}` };
      } catch (e) {
        return { ok: false, message: 'Could not reach the sign-in server — check your internet connection.' };
      }
    },
    async signOut() {
      try { await client.auth.signOut(); } catch (e) { /* session is dropped locally anyway */ }
    },
    /** Current access token (refreshed automatically), or null when not signed in. */
    async getAccessToken() {
      const { data } = await client.auth.getSession();
      return data.session ? data.session.access_token : null;
    },
  };
}
