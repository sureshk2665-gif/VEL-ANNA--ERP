import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { notifyModule } from './engine.js';
import HRModule from '../modules/hr/HRModule.jsx';

/** Engine page id → React screen. Add an entry here when a module is migrated. */
const MODULES = {
  hr: HRModule,
};

let mounted = []; // [{ id, root }]

/**
 * window.ViplReact — called by the engine:
 *  mount(id, main)  from the module's renderX(main): renders the React screen into #main
 *                   synchronously, so the engine's post-render steps (unit badge, user-rights
 *                   lock, Reports button, Dashboard button) run on the finished markup.
 *  refresh(id)      re-render the mounted screen after the engine changed its state.
 *  unmountAll()     from render(), before #main is rebuilt for any page.
 */
window.ViplReact = {
  mount(id, main) {
    const Screen = MODULES[id];
    if (!Screen) throw new Error(`No React screen registered for "${id}"`);
    main.innerHTML = '';
    const host = document.createElement('div');
    host.className = `react-module react-module-${id}`;
    main.appendChild(host);
    const root = createRoot(host);
    flushSync(() => root.render(<Screen />));
    mounted.push({ id, root });
  },
  refresh(id) {
    notifyModule(id);
  },
  unmountAll() {
    const old = mounted;
    mounted = [];
    // Deferred: render() is often called from inside one of these screens' own click
    // handlers, and a root must not be torn down while it is still handling that event.
    if (old.length) queueMicrotask(() => old.forEach(({ root }) => root.unmount()));
  },
};
