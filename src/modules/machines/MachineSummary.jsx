import { engine } from '../../bridge/engine.js';

const rank = (u) => (u === 'Unit-1' ? 0 : u === 'Unit-2' ? 1 : u === 'Admin' ? 2 : 3);

/**
 * Company-wide machine count, always computed from the FULL register (not the active unit):
 * Unit 1 / Unit 2 / Total headline boxes, then Total / CNC / VMC per plant. Total is counted
 * independently (machines.length), so machines recorded under Admin Office are shown too.
 */
export default function MachineSummary() {
  const E = engine();
  const all = E.DB.machines || [];
  const u1Count = all.filter((m) => m.unit === 'Unit-1').length;
  const u2Count = all.filter((m) => m.unit === 'Unit-2').length;
  const totalCount = all.length;
  const adminCount = totalCount - u1Count - u2Count;

  const groups = {};
  all.forEach((m) => {
    const u = m.unit || 'Admin';
    if (!groups[u]) groups[u] = { total: 0, cnc: 0, vmc: 0 };
    groups[u].total++;
    const t = (m.type || '').trim().toUpperCase();
    if (t === 'CNC') groups[u].cnc++;
    else if (t === 'VMC') groups[u].vmc++;
  });
  const plants = Object.keys(groups).sort((a, b) => rank(a) - rank(b));

  return (
    <div className="panel machine-summary-panel">
      <h3 style={{ justifyContent: 'flex-start', textAlign: 'left' }}>
        🏭 Machine Summary <span className="hint">Company-wide machine count, by Plant</span>
      </h3>
      <div className="machine-overview-grid">
        <OverviewBox color="c-blue" label="📍 Unit 1 (G51-I)" value={u1Count} sub="Machines" />
        <OverviewBox color="c-teal" label="📍 Unit 2 (S-48)" value={u2Count} sub="Machines" />
        <OverviewBox
          color="c-amber"
          label="🏭 Total Machines"
          value={totalCount}
          sub={`All Plants${adminCount > 0 ? ` (incl. ${adminCount} under Admin Office)` : ''}`}
        />
      </div>
      {plants.length > 0 && (
        <div className="machine-summary-grid">
          {plants.map((u) => (
            <div className="mc-summary-block ok" key={u}>
              <div className="mc-summary-head">
                <h3>{u === 'Admin' ? '🏢' : '📍'} {E.unitLabel(u)}</h3>
              </div>
              <div className="mc-stats">
                <Stat color="c-blue" label="Total Machines" value={groups[u].total} />
                <Stat color="c-cyan" label="CNC Machines" value={groups[u].cnc} />
                <Stat color="c-purple" label="VMC Machines" value={groups[u].vmc} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OverviewBox({ color, label, value, sub }) {
  return (
    <div className={`mc-ov-box ${color}`}>
      <div className="mc-ov-l">{label}</div>
      <div className="mc-ov-v">{value}</div>
      <div className="mc-ov-s">{sub}</div>
    </div>
  );
}

function Stat({ color, label, value }) {
  return (
    <div className={`mc-stat ${color}`}>
      <div className="mk">{label}</div>
      <div className="mv">{value}</div>
    </div>
  );
}
