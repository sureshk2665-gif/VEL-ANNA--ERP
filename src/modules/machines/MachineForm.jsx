import { useRef, useState } from 'react';
import { engine } from '../../bridge/engine.js';
import RightsButton from '../../components/RightsButton.jsx';

const STATUSES = ['Running', 'Idle', 'Breakdown'];
const OTHER = '__other__';

/**
 * Add Machine (editing = null) or Edit Machine form. Saves into DB.machines with the same
 * record shape as before — {id, unit, slNo, code, name, type, location, capacity, installDate,
 * status} — because Production, Maintenance, Calibration and Reports read these records.
 * The machine's unit always follows its Production Location (G51-I → Unit-1, S-48 → Unit-2).
 *
 * The <select>s are restyled by the engine's ERP-wide dropdown widget, which moves each one
 * into its own wrapper; they must therefore never be conditionally rendered on their own —
 * the whole form is remounted (by engine render()) when switching between add and edit.
 */
export default function MachineForm({ editing, rights }) {
  const E = engine();
  const locationOptions = E.machineLocationOptionsList();
  const initialLoc = editing ? editing.location || '' : '';
  const known = !!initialLoc && locationOptions.includes(initialLoc);

  const [slNo, setSlNo] = useState(editing ? editing.slNo || '' : '');
  const [code, setCode] = useState(editing ? editing.code || '' : '');
  const [name, setName] = useState(editing ? editing.name || '' : '');
  const [type, setType] = useState(editing ? editing.type || '' : '');
  const [locChoice, setLocChoice] = useState(known ? initialLoc : initialLoc ? OTHER : '');
  const [location, setLocation] = useState(initialLoc);
  const [capacity, setCapacity] = useState(editing ? editing.capacity || '' : '');
  const [installDate, setInstallDate] = useState(editing ? editing.installDate || '' : E.today());
  const [status, setStatus] = useState(editing && STATUSES.includes(editing.status) ? editing.status : 'Running');
  const [showLocInput, setShowLocInput] = useState((!!initialLoc && !known) || locationOptions.length === 0);

  const locInputRef = useRef(null);
  const locked = !rights.canMutate;
  const saveNeeds = editing ? (rights.canMutate ? null : 'add') : 'add';

  // Same behaviour as the engine's onMachineLocationChange(): "Other (add new)" reveals a free
  // text box; any listed location fills it in and hides it.
  function onLocationChoice(value) {
    setLocChoice(value);
    if (value === OTHER) {
      setShowLocInput(true); setLocation('');
      requestAnimationFrame(() => locInputRef.current && locInputRef.current.focus());
    }
    else { setShowLocInput(false); setLocation(value); }
  }

  function validated() {
    const c = code.trim();
    const n = name.trim();
    if (!c || !n) { E.toast('Machine Code and Name required'); return null; }
    return {
      slNo: slNo.trim(), code: c, name: n, type: type.trim(),
      location: E.normalizeUnitLocation(location.trim()),
      capacity: capacity.trim(), installDate, status,
    };
  }

  function addMachine() {
    if (!E.requireWorkingUnit()) return;
    const v = validated();
    if (!v) return;
    E.DB.machines.push({
      id: 'mc' + Date.now(), unit: E.machineUnitForLocation(v.location) || E.currentUnit,
      slNo: v.slNo, code: v.code, name: v.name, type: v.type, location: v.location,
      capacity: v.capacity, installDate: v.installDate, status: v.status,
    });
    E.saveDB(); E.toast('Machine saved'); E.render();
  }

  function saveEditMachine() {
    const m = E.DB.machines.find((x) => x.id === E.editingMachineId);
    if (!m) return;
    const v = validated();
    if (!v) return;
    Object.assign(m, v);
    m.unit = E.machineUnitForLocation(m.location) || m.unit; // keep Plant in sync with location
    E.editingMachineId = null;
    E.saveDB(); E.toast('Machine updated'); E.render();
  }

  const text = (id, label, value, set, placeholder, extra = {}) => (
    <div>
      <label className="fl">{label}</label>
      <input id={id} placeholder={placeholder} value={value} disabled={locked} onChange={(e) => set(e.target.value)} {...extra} />
    </div>
  );

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <h3>{editing ? 'Edit' : 'Add'} Machine</h3>
      <div className="frow g4">
        {text('mcSlNo', 'Machine Sl.No', slNo, setSlNo, 'e.g. 1')}
        {text('mcCode', 'Machine Code', code, setCode, 'e.g. M-101')}
        {text('mcName', 'Machine Name', name, setName, 'e.g. Forging Press 500T')}
        {text('mcType', 'Type', type, setType, 'Press / Lathe / CNC / Furnace')}
      </div>
      <div className="frow g4">
        <div>
          <label className="fl">
            Production Location{' '}
            <span className="hint" style={{ position: 'static', fontSize: 9.5 }}>(linked to Production Location everywhere)</span>
          </label>
          <select id="mcLocSel" value={locChoice} disabled={locked} onChange={(e) => onLocationChoice(e.target.value)}>
            <option value="">— select location —</option>
            {locationOptions.map((l) => (
              <option key={l} value={l}>{E.machineLocationDisplayLabel(l)}</option>
            ))}
            <option value={OTHER}>Other (add new)</option>
          </select>
          <input
            id="mcLoc"
            placeholder="e.g. G51-I"
            value={location}
            disabled={locked}
            ref={locInputRef}
            onChange={(e) => setLocation(e.target.value)}
            style={{ marginTop: 6, display: showLocInput ? 'block' : 'none' }}
          />
        </div>
        {text('mcCap', 'Capacity', capacity, setCapacity, 'e.g. 500 Tonnes')}
        {text('mcDate', 'Install Date', installDate, setInstallDate, undefined, { type: 'date' })}
        <div>
          <label className="fl">Status</label>
          <select id="mcStatus" value={status} disabled={locked} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <RightsButton rights={rights} need={saveNeeds} className="btn amber" onClick={editing ? saveEditMachine : addMachine}>
        💾 {editing ? 'Save Changes' : 'Save Machine'}
      </RightsButton>
      {' '}
      {editing && (
        <RightsButton rights={rights} need="edit" className="btn ghost" onClick={() => E.cancelEditMachine()}>Cancel</RightsButton>
      )}
    </div>
  );
}
