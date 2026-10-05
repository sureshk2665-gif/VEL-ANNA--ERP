/* ---------------- REACT BRIDGE ----------------
   The one, explicit doorway through which React components (src/modules/*) read and change
   engine state. Engine globals declared with let/const are not properties of window, so they
   are exposed here as live getters/setters; functions are passed through as-is. React code
   must only use what is listed here — add to it when a new module is migrated. */
window.ViplEngine = {
  get DB(){ return DB; },
  get currentUnit(){ return currentUnit; },
  get currentUser(){ return currentUser; },
  RIGHT_ACTION_LABELS,

  // Human Resources module state
  get hrSubTab(){ return hrSubTab; },
  set hrSubTab(v){ hrSubTab = v; },
  get editingEmployeeId(){ return editingEmployeeId; },
  set editingEmployeeId(v){ editingEmployeeId = v; },

  // Machine Master module state
  get editingMachineId(){ return editingMachineId; },
  set editingMachineId(v){ editingMachineId = v; },

  // helpers
  saveDB, render, toast, today, fmtDate, deleteRow,
  subOK, reportUnitMatch, requireWorkingUnit, unitLabel,
  setHRSubTab, editEmployee, cancelEditEmployee,
  editMachine, cancelEditMachine, printMachine,
  machineLocationOptionsList, machineLocationDisplayLabel, normalizeUnitLocation, machineUnitForLocation,
};
