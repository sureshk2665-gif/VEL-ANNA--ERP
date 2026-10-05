import { useSyncExternalStore } from 'react';

/**
 * Access to the legacy engine for React modules — only through window.ViplEngine, which is
 * defined in src/engine/30-react-bridge.js. Always read values at render time (they are live
 * getters), never cache DB or currentUnit in React state.
 */
export const engine = () => window.ViplEngine;

/* ---- per-module refresh signal: the engine calls ViplReact.refresh(id) when it changes
   state that a mounted React screen shows (e.g. setHRSubTab, editEmployee). ---- */
const versions = new Map();
const listeners = new Map();

export function notifyModule(id) {
  versions.set(id, (versions.get(id) || 0) + 1);
  (listeners.get(id) || new Set()).forEach((fn) => fn());
}

/** Re-renders the calling component whenever notifyModule(id) is called. */
export function useModuleRefresh(id) {
  return useSyncExternalStore(
    (fn) => {
      if (!listeners.has(id)) listeners.set(id, new Set());
      listeners.get(id).add(fn);
      return () => listeners.get(id).delete(fn);
    },
    () => versions.get(id) || 0,
  );
}

/**
 * Per-action rights for a module — the same rules the engine's applyGranularRights() uses,
 * so React screens lock exactly the same controls the old screens did:
 *  - Software Admin / Admin roles are unrestricted;
 *  - inputs are read-only unless the user has Add or Edit;
 *  - deny(action) returns the tooltip text when that action is not allowed, else null.
 */
export function moduleRights(pageId) {
  const E = engine();
  const user = E.currentUser;
  const unrestricted = !user || user.role === 'admin' || user.role === 'restrictedAdmin';
  const r = (!unrestricted && user.rights && user.rights[pageId]) || {};
  const canMutate = unrestricted || !!(r.add || r.edit);
  const deny = (action) => {
    if (unrestricted || !action || r[action]) return null;
    return `You do not have "${E.RIGHT_ACTION_LABELS[action] || action}" permission for this module.`;
  };
  return { canMutate, deny };
}

/** YYYY-MM-DD → DD-MM-YYYY, same output as the engine's fmtDate() but as plain text. */
export function formatDate(iso) {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}
