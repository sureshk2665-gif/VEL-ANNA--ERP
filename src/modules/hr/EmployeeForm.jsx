import { useState } from 'react';
import { engine } from '../../bridge/engine.js';
import RightsButton from '../../components/RightsButton.jsx';

/**
 * Add Employee (editing = null) or Edit Employee form. Saves into DB.employees with exactly
 * the same record shape as before — {id, unit, empCode, empName, doj, designation, status} —
 * because Production (Operator / Inspector dropdowns) and Reports read these records.
 */
export default function EmployeeForm({ editing, rights }) {
  const E = engine();
  const [empCode, setEmpCode] = useState(editing ? editing.empCode || '' : '');
  const [empName, setEmpName] = useState(editing ? editing.empName || '' : '');
  const [doj, setDoj] = useState(editing ? editing.doj || '' : E.today());
  const [designation, setDesignation] = useState(editing ? editing.designation || '' : '');
  const [isResigned, setIsResigned] = useState(!!editing && editing.status === 'Resigned');

  const locked = !rights.canMutate;
  // Same rules as before: Save Employee needs Add; Save Changes needs Add or Edit; Cancel needs Edit.
  const saveNeeds = editing ? (rights.canMutate ? null : 'add') : 'add';

  function validated() {
    const code = empCode.trim();
    const name = empName.trim();
    if (!code || !name) { E.toast('Employee Code and Employee Name required'); return null; }
    return { empCode: code, empName: name, doj, designation: designation.trim(), status: isResigned ? 'Resigned' : 'Current' };
  }

  function addEmployee() {
    if (!E.requireWorkingUnit()) return;
    const v = validated();
    if (!v) return;
    E.DB.employees.push({ id: 'emp' + Date.now(), unit: E.currentUnit, ...v });
    E.saveDB(); E.toast('Employee saved'); E.render();
  }

  // Current/Resigned are filtered views of one list, so saving with "Mark as Resigned" ticked
  // is all it takes to move the employee to the other tab (and back if unticked later).
  function saveEditEmployee() {
    const rec = E.DB.employees.find((x) => x.id === E.editingEmployeeId);
    if (!rec) return;
    const v = validated();
    if (!v) return;
    Object.assign(rec, v);
    E.editingEmployeeId = null;
    E.saveDB(); E.toast('Employee updated'); E.render();
  }

  return (
    <div className="panel">
      <h3>{editing ? 'Edit' : 'Add'} Employee</h3>
      <div className="frow g4">
        <div>
          <label className="fl">Employee Code</label>
          <input id="empCode" placeholder="e.g. VIPL-EMP-101" value={empCode} disabled={locked} onChange={(e) => setEmpCode(e.target.value)} />
        </div>
        <div>
          <label className="fl">Employee Name</label>
          <input id="empName" placeholder="e.g. Ramesh Kumar" value={empName} disabled={locked} onChange={(e) => setEmpName(e.target.value)} />
        </div>
        <div>
          <label className="fl">Date of Joining</label>
          <input id="empDoj" type="date" value={doj} disabled={locked} onChange={(e) => setDoj(e.target.value)} />
        </div>
        <div>
          <label className="fl">Designation</label>
          <input id="empDesig" placeholder="e.g. CNC Operator" value={designation} disabled={locked} onChange={(e) => setDesignation(e.target.value)} />
        </div>
      </div>
      <div className="frow" style={{ marginTop: 2, marginBottom: 0 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 11.5, cursor: 'pointer' }}>
          <input type="checkbox" id="empResigned" checked={isResigned} disabled={locked} onChange={(e) => setIsResigned(e.target.checked)} />
          Mark as Resigned <span className="hint" style={{ position: 'static', fontSize: 9.5 }}>(unchecked = Current)</span>
        </label>
      </div>
      <RightsButton
        rights={rights}
        need={saveNeeds}
        className="btn amber"
        style={{ marginTop: 10 }}
        onClick={editing ? saveEditEmployee : addEmployee}
      >
        💾 {editing ? 'Save Changes' : 'Save Employee'}
      </RightsButton>
      {' '}
      {editing && (
        <RightsButton rights={rights} need="edit" className="btn ghost" onClick={() => E.cancelEditEmployee()}>
          Cancel
        </RightsButton>
      )}
    </div>
  );
}
