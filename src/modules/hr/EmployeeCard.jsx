import { engine, formatDate } from '../../bridge/engine.js';

/** One employee record card with Edit / Del actions. */
export default function EmployeeCard({ employee: e, rights }) {
  const E = engine();
  const resigned = e.status === 'Resigned';
  const denyEdit = rights.deny('edit');
  const denyDel = rights.deny('del');
  return (
    <div className="rec-card">
      <div className="rc-title">{e.empCode}</div>
      <div className="rc-sub">{e.empName}</div>
      <span className={`pill rc-pill ${resigned ? 'fail' : 'done'}`}>{resigned ? 'Resigned' : 'Current'}</span>
      <div className="rc-row"><span className="k">Designation</span><span className="v">{e.designation || '—'}</span></div>
      <div className="rc-row"><span className="k">Date of Joining</span><span className="v">{formatDate(e.doj)}</span></div>
      <div className="rc-actions">
        <button className="btn small ghost" disabled={!!denyEdit} title={denyEdit || undefined} onClick={() => E.editEmployee(e.id)}>
          Edit
        </button>{' '}
        <button className="btn danger" disabled={!!denyDel} title={denyDel || undefined} onClick={() => E.deleteRow('employees', e.id)}>
          Del
        </button>
      </div>
    </div>
  );
}
