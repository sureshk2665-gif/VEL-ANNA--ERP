const STORE_KEY = 'visalam_erp_data_v1';
// Set the instant a change is written to the local cache and only cleared once that same
// change has been CONFIRMED pushed to Supabase. This is what lets the app recover a save that
// was interrupted (tab closed/refreshed) before its background sync finished — see markPendingSave()/
// doPushToSupabase()/loadDB() below. This is the fix for "save looks fine, but sometimes old data
// comes back after refreshing or reopening": that happened because the Supabase push runs in the
// background and nothing previously tracked whether it had actually finished before the page reloaded.
const PENDING_KEY = 'visalam_erp_pending_v1';

/* ================= SHARED DATABASE (CROSS-COMPUTER SYNC) =================
   ROOT CAUSE OF "data loads on my computer but not on another computer":
   This app previously stored ALL of its data (DB, below) ONLY in the browser's own
   localStorage (see the old loadDB()/saveDB() — localStorage.getItem/setItem on STORE_KEY).
   localStorage is per-browser/per-device — it is never sent anywhere — so every computer
   had its own separate, empty copy. Logging in with the same username on another computer
   loaded THAT computer's (empty) localStorage, not the data you entered elsewhere. This was
   not a login/auth bug; the app simply had no shared backend to log in *to*.

   FIX: store the same DB as one shared JSON row in a free Supabase (Postgres) project via
   its auto-generated REST API, so every computer reads/writes the SAME record. localStorage
   is kept as a fast local cache / offline fallback only — Supabase is now the source of truth
   whenever it's reachable.

   ---- ONE-TIME SETUP (do this once) ----
   1. Create a free project at https://supabase.com
   2. In the Supabase SQL Editor, run:
        create table erp_data (
          id text primary key,
          data jsonb not null,
          updated_at timestamptz not null default now()
        );
        alter table erp_data enable row level security;
        create policy "erp_data_anon_all" on erp_data
          for all using (true) with check (true);
      (This app already has its own username/password login screen restricting who can use
      it, so a single shared read/write row behind the anon key is acceptable here — the same
      approach used for VIPL-PAYROLL-ERP.)
   3. In Supabase → Settings → API, copy the "Project URL" and the "anon public" key and set
      them as VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (Vercel → Project → Settings →
      Environment Variables, or .env.local for local development — see DEPLOYMENT.md).
      src/config.js passes them to this engine as window.__VIPL_CONFIG__.
   4. Redeploy. Every computer that logs in now shares the same live data.
   If the variables are not set, the built-in project below is used. Setting
   VITE_SUPABASE_URL=off switches to the old per-browser localStorage-only behaviour
   (useful for local testing without touching the live data).
=========================================================================== */
const VIPL_CONFIG = window.__VIPL_CONFIG__ || {};
const SUPABASE_URL = VIPL_CONFIG.supabaseUrl === 'off' ? ''
  : (VIPL_CONFIG.supabaseUrl || 'https://dkqwtohicclbejkmtzbm.supabase.co').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = SUPABASE_URL
  ? (VIPL_CONFIG.supabaseAnonKey || 'sb_publishable_2ifBJmvZKWomWQWGOGNbeA_7sM37XWq')   // Supabase → Settings → API → "anon public" key
  : '';
const SUPABASE_ROW_ID = VIPL_CONFIG.supabaseRowId || 'main'; // single shared row — every computer reads/writes this one record
const supabaseConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);
// Supabase Auth mode (window.ViplAuth, src/auth/supabaseAuth.js): the database only answers
// signed-in users, so every request carries the user's access token instead of the anon key,
// and nothing is read or written before sign-in (see bootData() / attemptLogin() in 28-init.js).
const AUTH_MODE = !!(supabaseConfigured() && window.ViplAuth && window.ViplAuth.enabled);
async function supabaseHeaders(extra){
  let bearer = SUPABASE_ANON_KEY;
  if(AUTH_MODE){
    bearer = await window.ViplAuth.getAccessToken();
    if(!bearer) return null; // not signed in — the database would refuse the request anyway
  }
  return Object.assign({ apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${bearer}` }, extra||{});
}

async function fetchRemoteDB(){
  if(!supabaseConfigured()) return null;
  try{
    const headers = await supabaseHeaders();
    if(!headers){ console.warn('[VIPL ERP] Supabase PULL skipped — not signed in'); return null; }
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/erp_data?id=eq.${SUPABASE_ROW_ID}&select=data`,
      { headers }
    );
    if(!res.ok){
      // Surface the REAL reason a pull failed (missing table, RLS policy not applied, bad key,
      // etc.) in the console instead of silently swallowing it — this was previously
      // indistinguishable from "offline", which made the root cause impossible to diagnose.
      let body=''; try{ body = await res.text(); }catch(e2){}
      console.error('[VIPL ERP] Supabase PULL failed:', res.status, res.statusText, body);
      return null;
    }
    const rows = await res.json();
    return (rows && rows[0] && rows[0].data) ? rows[0].data : null;
  }catch(e){
    console.error('[VIPL ERP] Supabase PULL error (network/CORS/offline):', e);
    return null; // offline / unreachable — caller falls back to local cache
  }
}
async function pushRemoteDB(data){
  if(!supabaseConfigured()) return false;
  try{
    const headers = await supabaseHeaders({ 'Content-Type':'application/json', Prefer:'resolution=merge-duplicates' });
    if(!headers){ console.warn('[VIPL ERP] Supabase PUSH skipped — not signed in'); return false; }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/erp_data?on_conflict=id`, {
      method:'POST',
      headers,
      body: JSON.stringify([{ id: SUPABASE_ROW_ID, data, updated_at: new Date().toISOString() }])
    });
    if(!res.ok){
      let body=''; try{ body = await res.text(); }catch(e2){}
      console.error('[VIPL ERP] Supabase PUSH failed:', res.status, res.statusText, body);
    }
    return res.ok;
  }catch(e){
    console.error('[VIPL ERP] Supabase PUSH error (network/CORS/offline):', e);
    return false; // offline — local cache still has the change, will retry next save
  }
}
// Merge two DB snapshots record-by-record (matched by `id`) instead of one wholesale
// overwriting the other. `preferred` wins when the same id exists in both, but any record
// that only exists in `other` is KEPT, not discarded. This is the actual fix for computers
// ending up with different, diverging gauge lists: the old code pushed/pulled the ENTIRE DB
// object as one blob, so if a push from Computer A ever failed silently (or Computer A's
// local cache was even slightly behind), the next successful push from A would overwrite and
// erase every record any other computer had added in the meantime — explaining exactly why
// two computers showed two different, non-overlapping sets of Customer Gauge numbers.
function mergeDbForSync(preferred, other){
  if(!other) return preferred;
  if(!preferred) return other;
  const merged = Object.assign({}, other, preferred);
  Object.keys(preferred).forEach(k=>{
    if(Array.isArray(preferred[k]) && Array.isArray(other[k])){
      const byId = new Map();
      other[k].forEach(r=>{ if(r && r.id!==undefined && r.id!=='') byId.set(r.id, r); });
      preferred[k].forEach(r=>{ if(r && r.id!==undefined && r.id!=='') byId.set(r.id, r); });
      merged[k] = Array.from(byId.values());
    }
  });
  if(preferred.counters || other.counters){
    merged.counters = {};
    const keys = new Set([...Object.keys(other.counters||{}), ...Object.keys(preferred.counters||{})]);
    keys.forEach(ck=>{ merged.counters[ck] = Math.max((other.counters||{})[ck]||0, (preferred.counters||{})[ck]||0); });
  }
  return merged;
}
let lastSyncOk = null; // null = not yet attempted, true/false = last known result
function setSyncStatus(state){
  // state: 'busy' | true | false
  lastSyncOk = state===true ? true : state===false ? false : lastSyncOk;
  const dot = document.getElementById('syncDot');
  const label = document.getElementById('syncLabel');
  if(!dot || !label) return;
  dot.classList.remove('ok','err','busy');
  if(state==='busy'){ dot.classList.add('busy'); label.textContent='Syncing…'; }
  else if(state===true){ dot.classList.add('ok'); label.textContent='Synced'; }
  else if(state===false){ dot.classList.add('err'); label.textContent='Sync error'; }
  else { label.textContent='Sync'; }
}
async function manualSync(){
  if(!supabaseConfigured()){ toast('Shared database is not configured'); return; }
  setSyncStatus('busy');
  const remote = await fetchRemoteDB();
  if(remote===null){
    setSyncStatus(false);
    toast('⚠ Could not reach the shared database — check your internet connection (see browser console for details)');
    return;
  }
  // Normally remote is the freshest source of truth on a manual pull — EXCEPT if this browser
  // still has a save that hasn't been confirmed pushed yet (PENDING_KEY): that local edit is
  // newer than whatever remote has, so it must keep winning on conflicts, not get overwritten.
  const stillPending = (()=>{ try{ return !!localStorage.getItem(PENDING_KEY); }catch(e){ return false; } })();
  DB = stillPending ? mergeDbForSync(DB, remote) : mergeDbForSync(remote, DB);
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }catch(e){}
  if(stillPending) saveDB(); // re-attempt pushing the still-unsynced local edit now that we've reached the database
  setSyncStatus(true);
  toast('✓ Synced with shared database');
  render();
}
// Auto-refresh from the shared database periodically and whenever the tab regains focus, so a
// long-open tab on one computer picks up records added on another computer without needing a
// manual reload. Skipped while the user is actively typing (focused in a text field) so it
// never yanks away an in-progress edit.
let lastFormInteractionAt = 0; // updated on any input/change inside a form field, see listeners below
const AUTO_SYNC_GRACE_MS = 15000; // don't let a background sync re-render wipe a form the user touched in the last 15s
function autoSyncGuardOk(){
  const ae = document.activeElement;
  if(ae){
    const tag = ae.tagName;
    if(tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT' || ae.isContentEditable) return false;
  }
  if(Date.now() - lastFormInteractionAt < AUTO_SYNC_GRACE_MS) return false;
  return true;
}
document.addEventListener('input', e=>{
  const tag = e.target && e.target.tagName;
  if(tag==='INPUT' || tag==='TEXTAREA' || (e.target && e.target.isContentEditable)) lastFormInteractionAt = Date.now();
});
document.addEventListener('change', e=>{
  const tag = e.target && e.target.tagName;
  if(tag==='SELECT' || tag==='INPUT') lastFormInteractionAt = Date.now();
});
async function autoSyncPull(){
  if(!currentUser || !supabaseConfigured() || !autoSyncGuardOk()) return;
  const remote = await fetchRemoteDB();
  if(remote===null){ setSyncStatus(false); return; }
  // Same rule as manualSync(): don't let a background pull overwrite a save from THIS browser
  // that hasn't been confirmed pushed yet — keep it winning on conflicts until it's synced.
  const stillPending = (()=>{ try{ return !!localStorage.getItem(PENDING_KEY); }catch(e){ return false; } })();
  DB = stillPending ? mergeDbForSync(DB, remote) : mergeDbForSync(remote, DB);
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }catch(e){}
  if(stillPending) saveDB();
  setSyncStatus(true);
  render();
}
