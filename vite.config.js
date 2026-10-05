import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildEngine, ENGINE_DIR } from './scripts/engine.mjs';

const ENGINE_FILE = 'legacy/engine.js';

/**
 * The original ERP engine lives in src/engine/*.js, one file per module, so it can be read
 * and edited module by module. Those files depend on JavaScript hoisting across the whole
 * engine (early code calls functions declared in later files), so they cannot run as
 * separate scripts. This plugin joins them, in filename order, into a single classic script:
 * served live at /legacy/engine.js during `npm run dev`, emitted to dist/ on `npm run build`.
 */
function legacyEngine() {
  let base = '/';
  return {
    name: 'vipl-legacy-engine',
    configResolved(config) { base = config.base.startsWith('.') ? '/' : config.base; },
    configureServer(server) {
      server.watcher.add(ENGINE_DIR);
      server.watcher.on('change', (file) => {
        if (file.startsWith(ENGINE_DIR)) server.ws.send({ type: 'full-reload' });
      });
      server.middlewares.use((req, res, next) => {
        if (req.url.split('?')[0] !== base + ENGINE_FILE) return next();
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(buildEngine());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: ENGINE_FILE, source: buildEngine() });
    },
  };
}

// `base: './'` keeps the build portable (works from any sub-folder / static host).
export default defineConfig({
  base: './',
  plugins: [react(), legacyEngine()],
  define: { __ENGINE_VERSION__: JSON.stringify(String(Date.now())) },
});
