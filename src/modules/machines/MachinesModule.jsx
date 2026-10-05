import { engine, moduleRights, useModuleRefresh } from '../../bridge/engine.js';
import MachineSummary from './MachineSummary.jsx';
import MachineForm from './MachineForm.jsx';
import MachineCard from './MachineCard.jsx';

/**
 * Machine Master — company-wide Machine Summary, Add/Edit Machine form and the machine
 * register for the active unit. Edit state is the engine's editingMachineId (the breadcrumb
 * "← Back to Machine List" button uses it), and editMachine()/cancelEditMachine() re-run the
 * engine's render(), exactly as before.
 */
export default function MachinesModule() {
  useModuleRefresh('machines');
  const E = engine();
  const rights = moduleRights('machines');
  const list = E.DB.machines.filter((x) => E.reportUnitMatch(x.unit));
  const editing = E.editingMachineId ? E.DB.machines.find((x) => x.id === E.editingMachineId) : null;

  return (
    <>
      <div className="topbar"><div /></div>
      <MachineSummary />
      <MachineForm key={editing ? editing.id : 'new'} editing={editing} rights={rights} />
      <div className="panel">
        <h3>Machines <span className="hint">{list.length} registered</span></h3>
        <div className="grid-box">
          {list.length ? (
            list.slice().reverse().map((m) => <MachineCard key={m.id} machine={m} rights={rights} />)
          ) : (
            <div className="empty">No machines registered for this unit yet.</div>
          )}
        </div>
      </div>
    </>
  );
}
