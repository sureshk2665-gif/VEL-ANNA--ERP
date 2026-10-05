/**
 * Loads the original VIPL ERP engine after the React shell is mounted.
 *
 * The engine source lives in src/engine/*.js (one file per module) and is joined into a
 * single classic script, legacy/engine.js, by the plugin in vite.config.js. It must be a
 * classic (non-module) script in the global scope, because the markup it generates calls
 * its functions by name from inline onclick="…" handlers.
 */
let loading = null;

/** Idempotent: the engine is loaded only once, however many times this is called. */
export function loadLegacyEngine() {
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = `${import.meta.env.BASE_URL}legacy/engine.js?v=${__ENGINE_VERSION__}`;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`Could not load ${el.src}`));
      document.body.appendChild(el);
    });
  }
  return loading;
}
