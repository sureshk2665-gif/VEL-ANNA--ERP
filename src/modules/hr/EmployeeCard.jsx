import { engine, formatDate } from '../../bridge/engine.js';
import RightsButton from '../../components/RightsButton.jsx';

/** One employee record card with Edit / Del actions. */
export default function EmployeeCard({ employee: e, rights }) {
  const E = engine();
  const resigned = e.status === 'Resigned';
  return (
    <div className="rec-card">
      <div className="rc-title">{e.empCode}</div>
      <div className="rc-sub">{e.empName}</div>
      <span className={`pill rc-pill ${resigned ? 'fail' : 'done'}`}>{resigned ? 'Resigned' : 'Current'}</span>
      <div className="rc-row"><span className="k">Designation</span><span className="v">{e.designation || '—'}</span></div>
      <div className="rc-row"><span className="k">Date of Joining</span><span className="v">{formatDate(e.doj)}</span></div>
      <div className="rc-actions">
        <RightsButton rights={rights} need="edit" className="btn small ghost" onClick={() => E.editEmployee(e.id)}>Edit</RightsButton>{' '}
        <RightsButton rights={rights} need="del" className="btn danger" onClick={() => E.deleteRow('employees', e.id)}>Del</RightsButton>
      </div>
    </div>
  );
}
