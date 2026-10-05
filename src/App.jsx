import { useEffect } from 'react';
import LoginOverlay from './components/LoginOverlay.jsx';
import TopHeader from './components/TopHeader.jsx';
import Toast from './components/Toast.jsx';
import { loadLegacyEngine } from './legacy/loadLegacyEngine.js';
import './bridge/registry.jsx'; // defines window.ViplReact before the engine loads

/**
 * Application shell.
 *
 * React renders the static frame of the ERP (login screen, top header, main area, toast).
 * The business modules are driven by the original engine (src/engine/*.js), loaded once the
 * shell is mounted; it looks these elements up by their ids, so keep the ids unchanged.
 * Modules already migrated to React (see src/bridge/registry.jsx) are mounted into #main by
 * the engine through window.ViplReact.
 */
export default function App() {
  useEffect(() => {
    loadLegacyEngine().catch((err) => console.error('[VIPL ERP] failed to load engine:', err));
  }, []);

  return (
    <>
      <LoginOverlay />
      <div className="app" id="appRoot" style={{ display: 'none' }}>
        <TopHeader />
        <div className="main" id="main" />
      </div>
      <Toast />
    </>
  );
}
