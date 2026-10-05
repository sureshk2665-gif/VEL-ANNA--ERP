# VIPL ERP

Works-management ERP for **Visalam Industries Pvt Ltd** (Admin Office, Unit 1, Unit 2):
Quotation, Customer PO, Product Development, Planning, Purchase, Receiving Inspection,
Stores, Production, Final Inspection, Finished Goods, Sales, Job Card Tracking, Machine
Master, Maintenance, Tool Management, Calibration, HR, Finance and Admin.

Originally built as one self-contained HTML file. That file is kept unchanged in
[`original/VIPL-ERP.html`](original/VIPL-ERP.html) for reference; the project below is the
same application split into a React + Vite codebase.

## Hosting

Deployed on **Vercel** with data in **Supabase** — step-by-step guide in
[DEPLOYMENT.md](DEPLOYMENT.md). Configuration: copy [`.env.example`](.env.example) to `.env.local`.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/ (static files, host anywhere)
npm run preview    # serve the production build locally
npm run check:legacy   # syntax-check the module engine
```

Default first-run logins (seeded only when the database is empty): `softwareadmin`, `admin`,
`vipl1`, `vipl2` — the password equals the username. Change them in **Admin → Users**.

## Project layout

```
index.html                 page skeleton (#root) + Google Fonts
vite.config.js             Vite config + plugin that joins src/engine into one script
src/
  main.jsx                 React entry — mounts <App/> and imports all CSS
  App.jsx                  application shell; loads the module engine after mounting
  components/
    LoginOverlay.jsx       sign-in screen (username/password → 4-digit code)
    TopHeader.jsx          header: user, brand, nav, unit picker, themes, sync, logout
    Toast.jsx              toast message container
  legacy/loadLegacyEngine.js  loads legacy/engine.js once
  bridge/                  React ⇄ engine connection (registry of migrated screens, helpers)
  modules/hr/              Human Resources screens (React)
  styles/                  CSS split by area, imported in order from styles/index.css
    01-theme.css           colour tokens + Dark / Light / Corporate / Slate / Forest themes
    02-base.css … 15-modals-misc.css
  engine/                  the ERP module engine, one file per area
    00-config-sync.js      local cache + Supabase shared-database sync
    01-db-schema.js        DB structure
    02-app-state.js        app state, units, save queue
    04-print-engine.js     A4 print / PDF engine
    09-quotation.js … 27-admin-users.js   one file per module
    28-init.js             login, logout, startup
    29-dropdown-widget.js  ERP-wide searchable dropdown
    30-react-bridge.js     window.ViplEngine — what React modules may use
scripts/                   build helpers (engine joiner, syntax check)
original/VIPL-ERP.html     the untouched original single-file version
```

## How the engine works (read before editing `src/engine`)

The modules render their screens as HTML strings and use inline `onclick="someFunction()"`
handlers, and early code calls functions declared much later. So the files in `src/engine/`
are **not** ES modules: the build joins them, in filename order, into one classic script
(`legacy/engine.js`) — exactly how the original single `<script>` behaved. That means:

- every top-level function/variable is global and visible to every other engine file;
- keep the numeric filename prefixes; a new file is picked up automatically by its name;
- the shell components keep the element ids the engine looks up (`#main`, `#nav`,
  `#loginBtn`, `#unitSelect`, …) — don't rename them.

## Moving modules to React

Migrated so far: **Human Resources** (`src/modules/hr`).

How a migrated module plugs in:

1. The engine still owns the data (`DB`) and module state (e.g. `hrSubTab`,
   `editingEmployeeId`), so other modules that read them keep working.
2. `src/engine/30-react-bridge.js` exposes them to React as `window.ViplEngine` (live
   getters/setters + engine helpers such as `saveDB`, `render`, `toast`, `deleteRow`).
3. The module's old `renderX(main)` becomes a one-line wrapper that calls
   `window.ViplReact.mount('<id>', main)`; `src/bridge/registry.jsx` maps the id to the React
   screen and renders it synchronously, so the engine's post-render steps (unit badge,
   user-rights lock, Reports and Back buttons) still apply.
4. Engine functions that other code calls (e.g. `editEmployee`, `cancelEditEmployee`) stay
   as small wrappers that update engine state and call `window.ViplReact.refresh('<id>')`.
5. React components use `moduleRights('<id>')` from `src/bridge/engine.js` for the same
   Add / Edit / Delete locking rules the engine applies.
6. Saved records must keep exactly the same fields — other modules read them.

Next good candidates: Machine Master, Maintenance, then the larger modules.

## Shared database

Data is stored as one JSON row in Supabase (`erp_data` table, schema in
[`supabase/schema.sql`](supabase/schema.sql)) so every computer sees the same records, with the
browser's localStorage as an offline cache. The connection is set with the
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` environment variables (`src/config.js`); without
them the built-in project in `src/engine/00-config-sync.js` is used.

> ⚠️ `npm run dev` uses the live database unless `.env.local` sets `VITE_SUPABASE_URL=off`.
