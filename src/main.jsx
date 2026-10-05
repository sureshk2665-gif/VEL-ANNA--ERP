import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';

// StrictMode is intentionally not used: the legacy module engine (public/legacy/*.js)
// writes directly into DOM nodes rendered by the shell components, so those nodes must
// be mounted exactly once.
createRoot(document.getElementById('root')).render(<App />);
