import { engine, moduleRights, useModuleRefresh } from '../../bridge/engine.js';
import EmployeeForm from './EmployeeForm.jsx';
import EmployeeCard from './EmployeeCard.jsx';

/**
 * Human Resources — Current Employees / Resigned Employees.
 *
 * Both tabs are filtered views of the one DB.employees list (status 'Current' | 'Resigned'),
 * so changing an employee's status moves them between tabs. Tab and edit state are the
 * engine's hrSubTab / editingEmployeeId, so engine code (breadcrumb back-button, render())
 * keeps controlling them as before.
 */
export default function HRModule() {
  useModuleRefresh('hr');
  const E = engine();
  const tab = E.hrSubTab;
  const resigned = tab === 'resigned';
  const rights = moduleRights('hr');

  const list = E.DB.employees.filter(
    (x) => E.reportUnitMatch(x.unit) && (x.status === 'Resigned') === resigned,
  );
  const editing = E.editingEmployeeId
    ? E.DB.employees.find((x) => x.id === E.editingEmployeeId && (x.status === 'Resigned') === resigned)
    : null;

  return (
    <>
      <div className="topbar"><div /></div>
      <div className="subtabs" style={{ marginTop: 12 }}>
        {E.subOK('hr', 'current') && (
          <button className={tab === 'current' ? 'active' : ''} onClick={() => E.setHRSubTab('current')}>
            Current Employees
          </button>
        )}
        {E.subOK('hr', 'resigned') && (
          <button className={tab === 'resigned' ? 'active' : ''} onClick={() => E.setHRSubTab('resigned')}>
            Resigned Employees
          </button>
        )}
      </div>
      <div id="hrSub" style={{ marginTop: 12 }}>
        {/* Current tab always shows the Add/Edit form; Resigned tab only while editing. */}
        {(!resigned || editing) && <EmployeeForm key={editing ? editing.id : 'new'} editing={editing} rights={rights} />}
        <div className="panel">
          <h3>
            {resigned ? 'Resigned Employees' : 'Current Employees'}{' '}
            <span className="hint">{list.length} {resigned ? 'resigned' : 'on roll'}</span>
          </h3>
          <div className="grid-box">
            {list.length ? (
              list.slice().reverse().map((e) => <EmployeeCard key={e.id} employee={e} rights={rights} />)
            ) : (
              <div className="empty">
                {resigned ? 'No resigned employees for this unit.' : 'No current employees for this unit yet.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
