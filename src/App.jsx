import { useEffect } from 'react';
import LoginOverlay from './components/LoginOverlay.jsx';
import TopHeader from './components/TopHeader.jsx';
import Toast from './components/Toast.jsx';
import { loadLegacyEngine } from './legacy/loadLegacyEngine.js';

/**
 * Application shell.
 *
 * React renders the static frame of the ERP (login screen, top header, main area, toast).
 * The business modules (Quotation, Purchase, Production, Stores, Sales, …) are still driven
 * by the original engine in public/legacy/*.js, which is loaded once the shell is mounted
 * and looks these elements up by their ids. Keep the ids below unchanged.
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
