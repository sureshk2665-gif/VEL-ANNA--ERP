const UNITS = [
  { value: 'Admin', label: 'Admin Office' },
  { value: 'Unit-1', label: 'Unit 1 (G51-I)' },
  { value: 'Unit-2', label: 'Unit 2 (S-48)' },
];

/**
 * Sticky top header: user tag, brand, module nav, breadcrumb, unit picker, theme grid,
 * sync status and logout. #nav, #userTag, #dashBreadcrumb, #themeGrid and the sync
 * indicator are populated by the engine; button clicks are wired up in 28-init.js.
 */
export default function TopHeader() {
  return (
    <header className="topHeader">
      <div className="th-seg th-seg-left">
        <div className="userTag" id="userTag" />
        <div className="th-brand">
          <span className="v-logo">V</span>
          <div className="th-brand-text">
            <div className="th-title">VIPL ERP</div>
            <div className="th-sub">Visalam Industries · Kakalur, Thiruvalur</div>
          </div>
        </div>
      </div>
      <div className="nav" id="nav" />
      <div className="th-seg th-seg-right">
        <div className="dash-nav-center">
          <span className="dash-breadcrumb" id="dashBreadcrumb" />
          <button className="btn ghost th-dash-home" id="dashHomeBtnFixed" title="Go to Dashboard">
            🏠 Dashboard
          </button>
        </div>
        <div className="th-unit" id="activeUnitPick">
          <label>Unit</label>
          <select id="unitSelect">
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
        <div className="th-theme">
          <div className="theme-grid" id="themeGrid" />
        </div>
        <button className="th-sync" id="syncNowBtn" title="Click to pull the latest shared data from the database now">
          <span className="dot" id="syncDot" />
          <span id="syncLabel">Sync</span>
        </button>
        <button className="btn ghost th-logout" id="logoutBtn" title="Sign out">⎋ Logout</button>
      </div>
    </header>
  );
}
