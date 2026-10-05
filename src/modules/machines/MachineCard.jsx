import { engine, formatDate } from '../../bridge/engine.js';
import RightsButton from '../../components/RightsButton.jsx';

const STATUS_PILL = { Running: 'done', Breakdown: 'fail' };

/** One machine record card with Edit / Print / Del actions. */
export default function MachineCard({ machine: m, rights }) {
  const E = engine();
  return (
    <div className="rec-card">
      <div className="rc-title">{m.slNo ? `#${m.slNo} — ` : ''}{m.code}</div>
      <div className="rc-sub">{m.name}</div>
      <span className={`pill rc-pill ${STATUS_PILL[m.status] || 'open'}`}>{m.status}</span>
      <Row k="Sl.No" v={m.slNo} />
      <Row k="Type" v={m.type} />
      <Row k="Production Location" v={m.location} />
      <Row k="Capacity" v={m.capacity} />
      <Row k="Installed" v={formatDate(m.installDate)} />
      <div className="rc-actions">
        <RightsButton rights={rights} need="edit" className="btn small ghost" onClick={() => E.editMachine(m.id)}>Edit</RightsButton>{' '}
        <RightsButton rights={rights} need="print" className="btn small ghost" onClick={() => E.printMachine(m.id)}>Print</RightsButton>{' '}
        <RightsButton rights={rights} need="del" className="btn danger" onClick={() => E.deleteRow('machines', m.id)}>Del</RightsButton>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="rc-row"><span className="k">{k}</span><span className="v">{v || '—'}</span></div>
  );
}
