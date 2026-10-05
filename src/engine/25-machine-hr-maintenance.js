/* ---------------- MACHINE MASTER ---------------- */
/* ---- Machine Master: Machine Summary — shown at the top of the module, always computed
   from the FULL machine register (not filtered to whichever unit is currently active), so
   Unit 1, Unit 2, and the company Total are always visible together in one place:
     1) A top overview row — Unit 1 (G51-I) machine count, Unit 2 (S-48) machine count, and
        Total Machines (grand total across the whole company, incl. any machine recorded
        directly under Admin Office).
     2) A per-plant detail row — Total / CNC / VMC machines for each plant that has machines.
   Total Machines is deliberately computed independently (DB.machines.length) rather than as
   u1+u2, and a note is shown if it doesn't equal u1+u2, so the figure is always verifiably
   correct even if a machine is recorded directly under Admin Office rather than a plant. ---- */
function machineSummaryHtml(){
  const all = DB.machines || [];
  const u1Count = all.filter(m=>m.unit==='Unit-1').length;
  const u2Count = all.filter(m=>m.unit==='Unit-2').length;
  const totalCount = all.length;
  const adminCount = totalCount - u1Count - u2Count;

  // Per-plant Total/CNC/VMC breakdown — every plant that has at least one machine.
  const groups = {}; const order = [];
  all.forEach(m=>{
    const u = m.unit || 'Admin';
    if(!groups[u]){ groups[u] = {total:0, cnc:0, vmc:0}; order.push(u); }
    groups[u].total++;
    const t = (m.type||'').trim().toUpperCase();
    if(t==='CNC') groups[u].cnc++;
    else if(t==='VMC') groups[u].vmc++;
  });
  const rank = u=>u==='Unit-1'?0:u==='Unit-2'?1:u==='Admin'?2:3;
  order.sort((a,b)=>rank(a)-rank(b));

  return `
  <div class="panel machine-summary-panel">
    <h3 style="justify-content:flex-start; text-align:left;">🏭 Machine Summary <span class="hint">Company-wide machine count, by Plant</span></h3>
    <div class="machine-overview-grid">
      <div class="mc-ov-box c-blue"><div class="mc-ov-l">📍 Unit 1 (G51-I)</div><div class="mc-ov-v">${u1Count}</div><div class="mc-ov-s">Machines</div></div>
      <div class="mc-ov-box c-teal"><div class="mc-ov-l">📍 Unit 2 (S-48)</div><div class="mc-ov-v">${u2Count}</div><div class="mc-ov-s">Machines</div></div>
      <div class="mc-ov-box c-amber"><div class="mc-ov-l">🏭 Total Machines</div><div class="mc-ov-v">${totalCount}</div><div class="mc-ov-s">All Plants${adminCount>0?` (incl. ${adminCount} under Admin Office)`:''}</div></div>
    </div>
    ${order.length ? `
    <div class="machine-summary-grid">
      ${order.map(u=>{
        const g = groups[u];
        return `
        <div class="mc-summary-block ok">
          <div class="mc-summary-head"><h3>${u==='Admin'?'🏢':'📍'} ${esc(unitLabel(u))}</h3></div>
          <div class="mc-stats">
            <div class="mc-stat c-blue"><div class="mk">Total Machines</div><div class="mv">${g.total}</div></div>
            <div class="mc-stat c-cyan"><div class="mk">CNC Machines</div><div class="mv">${g.cnc}</div></div>
            <div class="mc-stat c-purple"><div class="mk">VMC Machines</div><div class="mv">${g.vmc}</div></div>
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}
  </div>`;
}
function renderMachines(main){
  const list = DB.machines.filter(x=>reportUnitMatch(x.unit));
  const editing = editingMachineId ? DB.machines.find(x=>x.id===editingMachineId) : null;
  main.innerHTML = `
    <div class="topbar"><div></div></div>
    ${machineSummaryHtml()}
    <div class="panel" style="margin-top:12px;">
      <h3>${editing?'Edit':'Add'} Machine</h3>
      <div class="frow g4">
        <div><label class="fl">Machine Sl.No</label><input id="mcSlNo" placeholder="e.g. 1" value="${editing?esc(editing.slNo||''):''}"></div>
        <div><label class="fl">Machine Code</label><input id="mcCode" placeholder="e.g. M-101" value="${editing?esc(editing.code):''}"></div>
        <div><label class="fl">Machine Name</label><input id="mcName" placeholder="e.g. Forging Press 500T" value="${editing?esc(editing.name):''}"></div>
        <div><label class="fl">Type</label><input id="mcType" placeholder="Press / Lathe / CNC / Furnace" value="${editing?esc(editing.type||''):''}"></div>
      </div>
      <div class="frow g4">
        <div><label class="fl">Production Location <span class="hint" style="position:static; font-size:9.5px;">(linked to Production Location everywhere)</span></label>${machineLocationPickerHtml('mcLocSel','mcLoc',editing?editing.location:'','e.g. G51-I')}</div>
        <div><label class="fl">Capacity</label><input id="mcCap" placeholder="e.g. 500 Tonnes" value="${editing?esc(editing.capacity||''):''}"></div>
        <div><label class="fl">Install Date</label><input id="mcDate" type="date" value="${editing?esc(editing.installDate||''):today()}"></div>
        <div><label class="fl">Status</label><select id="mcStatus">
          <option ${editing&&editing.status==='Running'?'selected':''}>Running</option>
          <option ${editing&&editing.status==='Idle'?'selected':''}>Idle</option>
          <option ${editing&&editing.status==='Breakdown'?'selected':''}>Breakdown</option>
        </select></div>
      </div>
      <button class="btn amber" onclick="${editing?'saveEditMachine()':'addMachine()'}">💾 ${editing?'Save Changes':'Save Machine'}</button>
      ${editing?`<button class="btn ghost" onclick="cancelEditMachine()">Cancel</button>`:''}
    </div>
    <div class="panel">
      <h3>Machines <span class="hint">${list.length} registered</span></h3>
      <div class="grid-box">
        ${list.slice().reverse().map(m=>`
          <div class="rec-card">
            <div class="rc-title">${esc(m.slNo?('#'+m.slNo+' — '):'')}${esc(m.code)}</div>
            <div class="rc-sub">${esc(m.name)}</div>
            <span class="pill rc-pill ${m.status==='Running'?'done':m.status==='Breakdown'?'fail':'open'}">${m.status}</span>
            <div class="rc-row"><span class="k">Sl.No</span><span class="v">${esc(m.slNo)||'—'}</span></div>
            <div class="rc-row"><span class="k">Type</span><span class="v">${esc(m.type)||'—'}</span></div>
            <div class="rc-row"><span class="k">Production Location</span><span class="v">${esc(m.location)||'—'}</span></div>
            <div class="rc-row"><span class="k">Capacity</span><span class="v">${esc(m.capacity)||'—'}</span></div>
            <div class="rc-row"><span class="k">Installed</span><span class="v">${fmtDate(m.installDate)||'—'}</span></div>
            <div class="rc-actions">
              <button class="btn small ghost" onclick="editMachine('${m.id}')">Edit</button>
              <button class="btn small ghost" onclick="printMachine('${m.id}')">Print</button>
              <button class="btn danger" onclick="deleteRow('machines','${m.id}')">Del</button>
            </div>
          </div>`).join('') || '<div class="empty">No machines registered for this unit yet.</div>'}
      </div>
    </div>
  `;
}
function addMachine(){
  if(!requireWorkingUnit()) return;
  const code=document.getElementById('mcCode').value.trim();
  const name=document.getElementById('mcName').value.trim();
  if(!code||!name){ toast('Machine Code and Name required'); return; }
  const location = normalizeUnitLocation(document.getElementById('mcLoc').value.trim());
  DB.machines.push({
    id:'mc'+Date.now(), unit: machineUnitForLocation(location) || currentUnit, slNo:document.getElementById('mcSlNo').value.trim(), code, name,
    type:document.getElementById('mcType').value.trim(), location,
    capacity:document.getElementById('mcCap').value.trim(), installDate:document.getElementById('mcDate').value,
    status:document.getElementById('mcStatus').value
  });
  saveDB(); toast('Machine saved'); render();
}
function editMachine(id){ editingMachineId = id; render(); }
function cancelEditMachine(){ editingMachineId = null; render(); }
function saveEditMachine(){
  const m = DB.machines.find(x=>x.id===editingMachineId);
  if(!m) return;
  const code=document.getElementById('mcCode').value.trim();
  const name=document.getElementById('mcName').value.trim();
  if(!code||!name){ toast('Machine Code and Name required'); return; }
  m.slNo=document.getElementById('mcSlNo').value.trim();
  m.code=code; m.name=name;
  m.type=document.getElementById('mcType').value.trim();
  m.location=normalizeUnitLocation(document.getElementById('mcLoc').value.trim());
  // Keep the machine's Plant (unit) in sync with whatever Production Location was just
  // selected, so it always agrees with the location shown on the card and with the Machine
  // Summary counts — a machine moved to "S-48" always counts as a Unit 2 machine.
  m.unit = machineUnitForLocation(m.location) || m.unit;
  m.capacity=document.getElementById('mcCap').value.trim();
  m.installDate=document.getElementById('mcDate').value;
  m.status=document.getElementById('mcStatus').value;
  editingMachineId = null;
  saveDB(); toast('Machine updated'); render();
}
function printMachines(){
  const list = DB.machines.filter(x=>reportUnitMatch(x.unit));
  const headers = ['Sl.No','Code','Name','Type','Production Location','Capacity','Install Date','Status'];
  const rows = list.map(m=>[esc(m.slNo)||'—', esc(m.code), esc(m.name), esc(m.type)||'—', esc(m.location)||'—', esc(m.capacity)||'—', fmtDate(m.installDate)||'—', esc(m.status)]);
  printReport('Machine Master List', headers, rows, {barLeft:`Unit: ${esc(reportScopeLabel())}`, barRight:`Total Machines: ${list.length}`});
}
function printMachine(id){
  const m = DB.machines.find(x=>x.id===id);
  if(!m) return;
  const headers = ['Field','Details'];
  const rows = [
    ['Sl.No', esc(m.slNo)||'—'],
    ['Machine Code', esc(m.code)],
    ['Machine Name', esc(m.name)],
    ['Type', esc(m.type)||'—'],
    ['Production Location', esc(m.location)||'—'],
    ['Capacity', esc(m.capacity)||'—'],
    ['Install Date', fmtDate(m.installDate)||'—'],
    ['Status', esc(m.status)]
  ];
  printReport('Machine Detail', headers, rows, {barLeft:`Unit: ${esc(unitLabel())}`, showSign:false});
}

/* ---------------- HUMAN RESOURCES ---------------- */
// The Human Resources screens are React components (src/modules/hr). These engine functions
// stay as thin wrappers so render(), the breadcrumb back-button and any other engine code
// that calls them keeps working unchanged. State (hrSubTab / editingEmployeeId) and data
// (DB.employees) still live in the engine, exactly as before.
function renderHR(main){
  if(!subOK('hr', hrSubTab)) hrSubTab = firstAllowedSub('hr') || hrSubTab;
  window.ViplReact.mount('hr', main);
}
function setHRSubTab(t){ hrSubTab = t; editingEmployeeId = null; renderHRSub(); }
function renderHRSub(){ window.ViplReact.refresh('hr'); }
function editEmployee(id){ editingEmployeeId = id; renderHRSub(); }
function cancelEditEmployee(){ editingEmployeeId = null; renderHRSub(); }



/* ====================================================================================
   MAINTENANCE MODULE
   Sub-tabs: Log (existing machine maintenance history) · Maintenance Items (Item Master,
   type:'MAINTENANCE') · Maintenance Suppliers (Supplier Master, type:'Maintenance Supplier') ·
   Maintenance PO (the requirement: buy new items OR send existing machine items out for
   repair/service and receive them back — with full Status & History).
   Both Items and Suppliers are managed HERE but stored in the SAME shared DB.items / DB.suppliers
   masters used everywhere else in the ERP — no duplicate master lists are created.
   ==================================================================================== */
function setMaintenanceSubTab(t){
  maintenanceSubTab = t;
  maintPOFormOpen=false; maintPOActionId=null; editingMaintPOId=null; maintPOItemsDraft=[]; editingMaintItemId=null; editingMaintSupplierId=null;
  render();
}
function renderMaintenance(main){
  if(!subOK('maintenance', maintenanceSubTab)) maintenanceSubTab = firstAllowedSub('maintenance') || maintenanceSubTab;
  main.innerHTML = `
    <div class="topbar"><div></div></div>
    <div class="subtabs" style="margin-top:12px;">
      ${subOK('maintenance','log')?`<button class="${maintenanceSubTab==='log'?'active':''}" onclick="setMaintenanceSubTab('log')">🩺 Maintenance Log</button>`:''}
      ${subOK('maintenance','po')?`<button class="${maintenanceSubTab==='po'?'active':''}" onclick="setMaintenanceSubTab('po')">🧾 Maintenance PO</button>`:''}
      ${subOK('maintenance','items')?`<button class="${maintenanceSubTab==='items'?'active':''}" onclick="setMaintenanceSubTab('items')">🔩 Maintenance Items</button>`:''}
      ${subOK('maintenance','suppliers')?`<button class="${maintenanceSubTab==='suppliers'?'active':''}" onclick="setMaintenanceSubTab('suppliers')">🚚 Maintenance Suppliers</button>`:''}
    </div>
    <div id="maintSub"></div>
  `;
  const sub = document.getElementById('maintSub');
  if(maintenanceSubTab==='po') return renderMaintenancePO(sub);
  if(maintenanceSubTab==='items') return renderMaintenanceItems(sub);
  if(maintenanceSubTab==='suppliers') return renderMaintenanceSuppliers(sub);
  return renderMaintenanceLog(sub);
}

/* ---- Maintenance Log (machine service history — unchanged from before, just relocated under its own sub-tab) ---- */
function renderMaintenanceLog(main){
  const list = DB.maintenance.filter(x=>reportUnitMatch(x.unit));
  const machines = DB.machines.filter(x=>reportUnitMatch(x.unit)).slice().sort(machineCompare);
  const machOpts = machines.map(m=>`<option value="${m.id}">${esc(m.code)} — ${esc(m.name)}</option>`).join('') || '<option value="">No machines added</option>';
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <h3>Log Maintenance</h3>
      <div class="frow g3">
        <div><label class="fl">Machine</label><select id="mtMachine">${machOpts}</select></div>
        <div><label class="fl">Type</label><select id="mtType"><option>Preventive</option><option>Breakdown</option></select></div>
        <div><label class="fl">Date</label><input id="mtDate" type="date" value="${today()}"></div>
      </div>
      <div class="frow g2">
        <div><label class="fl">Description</label><input id="mtDesc" placeholder="Work carried out"></div>
        <div><label class="fl">Performed By</label><input id="mtBy" placeholder="Technician / vendor"></div>
      </div>
      <div class="frow g2">
        <div><label class="fl">Next Due Date</label><input id="mtNext" type="date"></div>
        <div><label class="fl">Status</label><select id="mtStatus"><option>Completed</option><option>Pending</option></select></div>
      </div>
      <button class="btn amber" onclick="addMaintenance()">💾 Save Maintenance Log</button>
    </div>
    <div class="panel">
      <div class="frow" style="margin-bottom:10px;"><button class="btn ghost" onclick="printMaintenance()">🖨 Print</button></div>
      <h3>Maintenance Records <span class="hint">${list.length} entries</span></h3>
      <div class="grid-box">
        ${list.slice().reverse().map(m=>{
          const mach = DB.machines.find(x=>x.id===m.machineId);
          return `<div class="rec-card">
            <div class="rc-title">${mach?esc(mach.code):'—'}</div>
            <div class="rc-sub">${esc(m.type)} · ${fmtDate(m.date)}</div>
            <span class="pill rc-pill ${m.status==='Completed'?'done':'open'}">${m.status}</span>
            <div class="rc-row"><span class="k">Description</span><span class="v">${esc(m.description)||'—'}</span></div>
            <div class="rc-row"><span class="k">Performed By</span><span class="v">${esc(m.performedBy)||'—'}</span></div>
            <div class="rc-row"><span class="k">Next Due</span><span class="v">${fmtDate(m.nextDue)||'—'}</span></div>
            <div class="rc-actions"><button class="btn danger" onclick="deleteRow('maintenance','${m.id}')">Del</button></div>
          </div>`;
        }).join('') || '<div class="empty">No maintenance logs for this unit yet.</div>'}
      </div>
    </div>
  `;
}
function addMaintenance(){
  if(!requireWorkingUnit()) return;
  const machineId=document.getElementById('mtMachine').value;
  const desc=document.getElementById('mtDesc').value.trim();
  if(!machineId){ toast('Select a machine first'); return; }
  if(!desc){ toast('Description required'); return; }
  DB.maintenance.push({
    id:'mt'+Date.now(), unit:currentUnit, machineId, type:document.getElementById('mtType').value,
    date:document.getElementById('mtDate').value, description:desc, performedBy:document.getElementById('mtBy').value.trim(),
    nextDue:document.getElementById('mtNext').value, status:document.getElementById('mtStatus').value
  });
  saveDB(); toast('Maintenance log saved'); render();
}
function printMaintenance(){
  const list = DB.maintenance.filter(x=>reportUnitMatch(x.unit));
  const headers = ['Machine','Type','Date','Description','Performed By','Next Due','Status'];
  const rows = list.map(m=>{
    const mach = DB.machines.find(x=>x.id===m.machineId);
    return [mach?esc(mach.code):'—', esc(m.type), fmtDate(m.date)||'—', esc(m.description)||'—', esc(m.performedBy)||'—', fmtDate(m.nextDue)||'—', esc(m.status)];
  });
  printReport('Maintenance Log', headers, rows, {barLeft:`Unit: ${esc(reportScopeLabel())}`, barRight:`Total Entries: ${list.length}`});
}

/* ---- Maintenance Items — a filtered slice of the shared Item Master (DB.items, type:'MAINTENANCE')
   for spares, consumables & services used in Maintenance PO. Same master used by Purchase → Items;
   just managed here too for convenience, so nothing is duplicated. ---- */
function maintenanceItemsList(){ return DB.items.filter(x=>x.type==='MAINTENANCE'); }
// Item Code is always system-generated from the Item Master's own numbering (never free-typed) —
// keeps every Maintenance Item uniquely and predictably coded, same principle as PO/Invoice numbering.
function nextMaintItemCode(){ return nextSeqNo(maintenanceItemsList(), 'code', 'MI'); }
function maintenanceItemOptionsHtml(selected){
  return maintenanceItemsList().map(it=>`<option value="${it.id}" data-uom="${esc(it.uom)}" data-rate="${it.marketPrice||0}" ${selected===it.id?'selected':''}>${esc(it.code)} — ${esc(it.name)}</option>`).join('');
}
function renderMaintenanceItems(main){
  const list = maintenanceItemsList();
  const editing = editingMaintItemId ? DB.items.find(x=>x.id===editingMaintItemId) : null;
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <h3>${editing?'Edit Maintenance Item':'New Maintenance Item'} <span class="hint" style="position:static; font-size:9.5px;">(spare part / consumable / service — shared Item Master)</span></h3>
      <div class="frow g4">
        <div><label class="fl">Item Code <span class="hint" style="position:static; font-size:9.5px;">(auto-generated)</span></label><input id="miCode" value="${editing?esc(editing.code):nextMaintItemCode()}" disabled></div>
        <div style="grid-column:2/4;"><label class="fl">Item Name</label><input id="miName" placeholder="e.g. Ball Bearing 6205 ZZ" value="${editing?esc(editing.name):''}"></div>
        <div><label class="fl">UOM</label><select id="miUom"><option value="">— select —</option><option value="Nos" ${editing&&editing.uom==='Nos'?'selected':''}>Nos</option><option value="Set" ${editing&&editing.uom==='Set'?'selected':''}>Set</option><option value="Ltr" ${editing&&editing.uom==='Ltr'?'selected':''}>Ltr</option><option value="Kg" ${editing&&editing.uom==='Kg'?'selected':''}>Kg</option><option value="Mtr" ${editing&&editing.uom==='Mtr'?'selected':''}>Mtr</option><option value="Job" ${editing&&editing.uom==='Job'?'selected':''}>Job</option></select></div>
      </div>
      <div class="frow g2">
        <div><label class="fl">Category</label><select id="miCategory">
          <option value="Spare Part" ${editing&&editing.material==='Spare Part'?'selected':''}>Spare Part</option>
          <option value="Consumable" ${editing&&editing.material==='Consumable'?'selected':''}>Consumable</option>
          <option value="Service" ${editing&&editing.material==='Service'?'selected':''}>Service (repair/calibration/AMC)</option>
        </select></div>
        <div><label class="fl">Standard Rate (₹)</label><input id="miRate" type="number" placeholder="0.00" value="${editing?editing.marketPrice:''}"></div>
      </div>
      <button class="btn amber" onclick="${editing?'saveEditMaintenanceItem()':'addMaintenanceItem()'}">${editing?'💾 Save Changes':'💾 Save Maintenance Item'}</button>
      ${editing?`<button class="btn ghost" onclick="cancelEditMaintenanceItem()">Cancel</button>`:''}
    </div>
    <div class="panel">
      <div class="section-total"><h3>Maintenance Items <span class="hint">${list.length} total</span></h3></div>
      <div class="grid-box">
        ${list.slice().reverse().map(it=>`
          <div class="rec-card">
            <div class="rc-title">${esc(it.code)||'—'}</div>
            <div class="rc-sub">${esc(it.name)}</div>
            <span class="typepill rc-pill">${esc(it.material)||'Spare Part'}</span>
            <div class="rc-row"><span class="k">UOM</span><span class="v">${esc(it.uom)||'—'}</span></div>
            <div class="rc-row"><span class="k">Standard Rate</span><span class="v">${fmtMoney(it.marketPrice)}</span></div>
            <div class="rc-actions">
              <button class="btn small ghost" onclick="editMaintenanceItem('${it.id}')">Edit</button>
              <button class="btn danger" onclick="deleteRow('items','${it.id}')">Del</button>
            </div>
          </div>`).join('') || '<div class="empty">No maintenance items added yet.</div>'}
      </div>
    </div>
  `;
}
function addMaintenanceItem(){
  if(!requireAdminOffice()) return;
  const name = document.getElementById('miName').value.trim();
  if(!name){ toast('Item Name is required'); return; }
  DB.items.push({
    id:'it'+Date.now(), no:uid('it'), code:nextMaintItemCode(), name, type:'MAINTENANCE',
    uom:document.getElementById('miUom').value.trim(), material:document.getElementById('miCategory').value,
    vqPrice:0, marketPrice:parseFloat(document.getElementById('miRate').value)||0,
    marketPriceEffDate:today(), marketPriceHistory:[]
  });
  saveDB(); toast('Maintenance item added'); render();
}
function editMaintenanceItem(id){ editingMaintItemId = id; render(); }
function cancelEditMaintenanceItem(){ editingMaintItemId = null; render(); }
function saveEditMaintenanceItem(){
  if(!requireAdminOffice()) return;
  const it = DB.items.find(x=>x.id===editingMaintItemId);
  if(!it) return;
  const name = document.getElementById('miName').value.trim();
  if(!name){ toast('Item Name is required'); return; }
  it.name = name; // Item Code is system-generated and immutable — never re-derived or edited here
  it.uom = document.getElementById('miUom').value.trim(); it.material = document.getElementById('miCategory').value;
  it.marketPrice = parseFloat(document.getElementById('miRate').value)||0;
  editingMaintItemId = null;
  saveDB(); toast('Maintenance item updated'); render();
}

/* ---- Maintenance Suppliers — a filtered slice of the shared Supplier Master (DB.suppliers,
   type:'Maintenance Supplier'), same pattern/fields as the Purchase module's Raw Material Suppliers. ---- */
function maintenanceSuppliersList(){ return DB.suppliers.filter(s=>s.type==='Maintenance Supplier'); }
function maintenanceSupplierOptionsHtml(){
  return maintenanceSuppliersList().map(s=>`<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('');
}
function renderMaintenanceSuppliers(main){
  const list = maintenanceSuppliersList();
  const editing = editingMaintSupplierId ? DB.suppliers.find(x=>x.id===editingMaintSupplierId) : null;
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <h3>${editing?'Edit Maintenance Supplier':'New Maintenance Supplier'}</h3>
      <div class="frow g4">
        <div><label class="fl">Supplier Name</label><input id="msName" placeholder="e.g. Apex Machine Repairs" value="${editing?esc(editing.name):''}"></div>
        <div><label class="fl">GSTIN</label><input id="msGstin" placeholder="33XXXXX..." value="${editing?esc(editing.gstin):''}"></div>
        <div><label class="fl">Phone</label><input id="msPhone" placeholder="+91 ..." value="${editing?esc(editing.phone):''}"></div>
        <div><label class="fl">Contact Person</label><input id="msContact" placeholder="Name" value="${editing?esc(editing.contact):''}"></div>
      </div>
      <div class="frow g2">
        <div><label class="fl">Email</label><input id="msEmail" type="email" placeholder="e.g. service@supplier.com" value="${editing?esc(editing.email):''}"></div>
        <div><label class="fl">Address</label><textarea id="msAddress" class="addr-box" placeholder="Supplier address">${editing?esc(editing.address):''}</textarea></div>
      </div>
      <button class="btn amber" onclick="${editing?'saveEditMaintenanceSupplier()':'addMaintenanceSupplier()'}">${editing?'💾 Save Changes':'💾 Save Maintenance Supplier'}</button>
      ${editing?`<button class="btn ghost" onclick="cancelEditMaintenanceSupplier()">Cancel</button>`:''}
    </div>
    <div class="panel">
      <div class="section-total"><h3>Maintenance Suppliers <span class="hint">${list.length} total</span></h3></div>
      <div class="grid-box">
        ${list.slice().reverse().map(s=>`
          <div class="rec-card">
            <div class="rc-title">${esc(s.name)}</div>
            <div class="rc-sub">🚚 Maintenance Supplier${s.gstin?' · '+esc(s.gstin):''}</div>
            <div class="rc-row"><span class="k">Phone</span><span class="v">${esc(s.phone)||'—'}</span></div>
            <div class="rc-row"><span class="k">Email</span><span class="v">${esc(s.email)||'—'}</span></div>
            <div class="rc-row"><span class="k">Contact</span><span class="v">${esc(s.contact)||'—'}</span></div>
            <div class="rc-row"><span class="k">Address</span><span class="v">${esc(s.address)||'—'}</span></div>
            <div class="rc-actions">
              <button class="btn small ghost" onclick="editMaintenanceSupplier('${s.id}')">Edit</button>
              <button class="btn danger" onclick="deleteRow('suppliers','${s.id}')">Del</button>
            </div>
          </div>`).join('') || '<div class="empty">No maintenance suppliers added yet.</div>'}
      </div>
    </div>
  `;
}
function addMaintenanceSupplier(){
  if(!requireAdminOffice()) return;
  const name = document.getElementById('msName').value.trim();
  if(!name){ toast('Supplier name is required'); return; }
  DB.suppliers.push({
    id:'sp'+Date.now(), no:uid('sp'), name, type:'Maintenance Supplier',
    gstin:document.getElementById('msGstin').value.trim(),
    phone:document.getElementById('msPhone').value.trim(),
    email:document.getElementById('msEmail').value.trim(),
    contact:document.getElementById('msContact').value.trim(),
    address:document.getElementById('msAddress').value.trim()
  });
  saveDB(); toast('Maintenance Supplier added'); render();
}
function editMaintenanceSupplier(id){ editingMaintSupplierId = id; render(); }
function cancelEditMaintenanceSupplier(){ editingMaintSupplierId = null; render(); }
function saveEditMaintenanceSupplier(){
  if(!requireAdminOffice()) return;
  const s = DB.suppliers.find(x=>x.id===editingMaintSupplierId);
  if(!s) return;
  const name = document.getElementById('msName').value.trim();
  if(!name){ toast('Supplier name is required'); return; }
  s.name=name; s.type='Maintenance Supplier'; s.gstin=document.getElementById('msGstin').value.trim();
  s.phone=document.getElementById('msPhone').value.trim();
  s.email=document.getElementById('msEmail').value.trim();
  s.contact=document.getElementById('msContact').value.trim();
  s.address=document.getElementById('msAddress').value.trim();
  editingMaintSupplierId = null;
  saveDB(); toast('Maintenance Supplier updated'); render();
}

/* ---- Maintenance PO — covers BOTH workflows, with MULTIPLE items on a single PO:
     Purchase : Requirement → PO (Open) → Receive → Received
     Repair   : Requirement → PO (Open) → Send to Supplier (Sent) → Receive Back (Received)
   Every state change is appended to the record's history[] so the card always shows a full
   Status & History trail. A PO can be edited while Open (to add/remove/change items) and every
   PO can be printed as a complete, professional document with full PO/Supplier/Item detail. ---- */
function toggleMaintPOForm(){
  if(maintPOFormOpen){ maintPOFormOpen=false; editingMaintPOId=null; maintPOItemsDraft=[]; render(); return; }
  editingMaintPOId = null;
  maintPOUnitSel = (currentUnit==='Unit-1'||currentUnit==='Unit-2') ? currentUnit : '';
  maintPOTypeSel = 'Purchase';
  maintPOItemsDraft = [emptyMaintPOItemRow()];
  maintPOFormOpen = true;
  render();
}
function emptyMaintPOItemRow(){ return {machineId:'', itemId:'', itemDesc:'', uom:'', qty:1, rate:''}; }
function onMaintPOUnitChange(selEl){ maintPOUnitSel = selEl.value; render(); }
function setMaintPOType(t){ maintPOTypeSel = t; render(); }
function addMaintPOItemRow(){ maintPOItemsDraft.push(emptyMaintPOItemRow()); render(); }
function removeMaintPOItemRow(i){
  maintPOItemsDraft.splice(i,1);
  if(!maintPOItemsDraft.length) maintPOItemsDraft.push(emptyMaintPOItemRow());
  render();
}
// Text/number fields update the draft directly WITHOUT a full re-render, so typing doesn't lose
// input focus (same pattern used by the Purchase Order's updatePOItemRow for its Qty/Rate cells).
function updateMaintPOItemRow(i, field, val){
  if(!maintPOItemsDraft[i]) return;
  maintPOItemsDraft[i][field] = val;
  if(field==='qty'||field==='rate') updateMaintPOTermsPreview();
}
function onMaintPOItemRowMachineChange(i, val){
  if(!maintPOItemsDraft[i]) return;
  maintPOItemsDraft[i].machineId = val;
}
// Item picked from Maintenance Items master (or "Other" to type manually) — this changes the row's
// layout (shows/hides the free-text description box), so it re-renders (a discrete click, unlike
// continuous typing, so focus loss doesn't matter here).
function onMaintPOItemRowItemChange(i, selEl){
  if(!maintPOItemsDraft[i]) return;
  const row = maintPOItemsDraft[i];
  if(selEl.value==='__other__'){
    row.itemId=''; row.itemDesc=''; row.uom='';
  } else if(selEl.value){
    const it = DB.items.find(x=>x.id===selEl.value);
    row.itemId = selEl.value; row.itemDesc='';
    row.uom = it ? (it.uom||'') : '';
    if(maintPOTypeSel==='Purchase' && it && it.marketPrice) row.rate = it.marketPrice;
  } else {
    row.itemId=''; row.itemDesc=''; row.uom='';
  }
  render();
}
function newMaintPOId(){ return 'mp'+Date.now()+Math.random().toString(36).slice(2,6); }
function nextMaintPONo(){ return nextSeqNo(DB.maintenancePO,'poNo','mpo'); }
function maintPOStatusClass(status){ return status==='Received' ? 'done' : 'open'; }
function maintPOItemRowLabel(row){
  if(row.itemId){ const it = DB.items.find(x=>x.id===row.itemId); if(it) return esc(it.code)+' — '+esc(it.name); }
  return esc(row.itemDesc)||'—';
}
function maintPOTotals(items){
  items = items||[];
  return { qty: items.reduce((a,r)=>a+(parseFloat(r.qty)||0),0), value: items.reduce((a,r)=>a+((parseFloat(r.qty)||0)*(parseFloat(r.rate)||0)),0) };
}
// Subtotal → Discount → Net → GST 18% → Grand Total — the single source of truth for these
// figures, used identically by the on-screen card summary, the live form preview, and the
// printed PO, so all three always agree.
function maintPONetTotals(p){
  const gross = maintPOTotals(p.items).value;
  const ct = p.commercialTerms||{};
  const discountPct = parseFloat(ct.discountPct)||0;
  const discountAmt = gross * (discountPct/100);
  const net = gross - discountAmt;
  const gstPct = (ct.gstPct===''||ct.gstPct===undefined||ct.gstPct===null||isNaN(parseFloat(ct.gstPct))) ? 18 : parseFloat(ct.gstPct);
  const gstAmt = net * (gstPct/100);
  const grandTotal = net + gstAmt;
  return { gross, discountPct, discountAmt, net, gstPct, gstAmt, grandTotal };
}
// Live Subtotal → Discount → GST 18% → Grand Total preview shown inside the open PO form —
// recomputed straight into the DOM (no full render) so typing Discount/GST% or item Qty/Rate
// never loses input focus.
function maintPOTermsPreviewHtml(subtotal, discountPct, gstPct){
  discountPct = parseFloat(discountPct)||0;
  gstPct = (gstPct===''||gstPct===undefined||gstPct===null||isNaN(parseFloat(gstPct))) ? 18 : parseFloat(gstPct);
  const discountAmt = subtotal * (discountPct/100);
  const net = subtotal - discountAmt;
  const gstAmt = net * (gstPct/100);
  const grandTotal = net + gstAmt;
  return `
    <div class="rc-row"><span class="k">Subtotal</span><span class="v">${fmtMoney(subtotal)}</span></div>
    ${discountPct>0?`<div class="rc-row"><span class="k">Discount @ ${discountPct}%</span><span class="v">− ${fmtMoney(discountAmt)}</span></div>
    <div class="rc-row"><span class="k">Net Value</span><span class="v">${fmtMoney(net)}</span></div>`:''}
    <div class="rc-row"><span class="k">GST @ ${gstPct}%</span><span class="v">+ ${fmtMoney(gstAmt)}</span></div>
    <div class="rc-row" style="font-weight:800; border-top:1px dashed var(--border); margin-top:4px; padding-top:4px;"><span class="k">Grand Total</span><span class="v">${fmtMoney(grandTotal)}</span></div>
  `;
}
function updateMaintPOTermsPreview(){
  const el = document.getElementById('maintPOTermsPreview');
  if(!el) return;
  const subtotal = maintPOTotals(maintPOItemsDraft).value;
  const discountEl = document.getElementById('mp_discountPct');
  const gstEl = document.getElementById('mp_gstPct');
  el.innerHTML = maintPOTermsPreviewHtml(subtotal, discountEl?discountEl.value:0, gstEl?gstEl.value:18);
}
function renderMaintenancePO(main){
  const list = (DB.maintenancePO||[]).filter(x=>reportUnitMatch(x.unit)).slice().reverse();
  const unitLocked = currentUnit==='Unit-1' || currentUnit==='Unit-2';
  if(unitLocked && !editingMaintPOId) maintPOUnitSel = currentUnit;
  const noUnitYet = !maintPOUnitSel;
  const machines = DB.machines.filter(x=>reportUnitMatch(x.unit)).slice().sort(machineCompare);
  const machOptsFor = (selected)=> `<option value="">${maintPOTypeSel==='Repair'?'— select machine —':'— General / Stock —'}</option>` +
    machines.map(m=>`<option value="${m.id}" ${selected===m.id?'selected':''}>${esc(m.code)} — ${esc(m.name)}</option>`).join('');
  const draftTotals = maintPOTotals(maintPOItemsDraft);
  const maintPOCT = Object.assign({discountPct:0, freight:'', packing:'', paymentTerms:'', validity:'', deliveryIn:'', insurance:'', commissioning:'', gstPct:18},
    (editingMaintPOId ? ((DB.maintenancePO.find(x=>x.id===editingMaintPOId)||{}).commercialTerms||{}) : {}));
  // Live Subtotal → Discount → Net → GST 18% → Grand Total preview while the form is open, so the
  // final payable amount is visible before saving (same figures the printed PO will show).
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <h3>${editingMaintPOId?'Edit Maintenance Purchase Order':'Maintenance Purchase Order'} <span class="hint">${list.length} orders</span></h3>
      <div class="frow" style="margin-bottom:10px;">
        <button class="btn amber" onclick="toggleMaintPOForm()">${maintPOFormOpen?'✕ Close Form':'➕ Raise Maintenance PO'}</button>
        <button class="btn ghost" onclick="printMaintenancePOList()">🖨 Print List</button>
      </div>
      ${maintPOFormOpen ? `
      <div class="frow g4">
        <div><label class="fl">Unit <span class="hint" style="position:static; color:var(--red);">*required</span></label>
          <select id="mpUnitSel" onchange="onMaintPOUnitChange(this)" ${unitLocked?'disabled':''}>
            <option value="">— select Unit —</option>
            <option value="Unit-1" ${maintPOUnitSel==='Unit-1'?'selected':''}>Unit 1 (G51-I)</option>
            <option value="Unit-2" ${maintPOUnitSel==='Unit-2'?'selected':''}>Unit 2 (S-48)</option>
          </select>
        </div>
        <div style="grid-column:2/-1;"><label class="fl">Requirement Type<span class="req">*</span></label>
          <div class="frow g2" style="margin:0;">
            <button type="button" class="btn ${maintPOTypeSel==='Purchase'?'amber':'ghost'}" ${noUnitYet?'disabled':''} onclick="setMaintPOType('Purchase')">🛒 Purchase New Item(s)</button>
            <button type="button" class="btn ${maintPOTypeSel==='Repair'?'amber':'ghost'}" ${noUnitYet?'disabled':''} onclick="setMaintPOType('Repair')">🔧 Send Existing Item(s) for Repair/Service</button>
          </div>
        </div>
      </div>
      <div class="frow g2">
        <div><label class="fl">Supplier <span class="hint" style="position:static; font-size:9px;">(from Maintenance Suppliers)</span></label><input id="mp_supplier" list="maintSupplierList" placeholder="Supplier name" value="${editingMaintPOId?esc((DB.maintenancePO.find(x=>x.id===editingMaintPOId)||{}).supplier):''}" ${noUnitYet?'disabled':''}><datalist id="maintSupplierList">${maintenanceSupplierOptionsHtml()}</datalist></div>
        <div><label class="fl">${maintPOTypeSel==='Repair'?'Expected Return Date':'Expected Delivery Date'}</label><input id="mp_expected" type="date" value="${editingMaintPOId?esc((DB.maintenancePO.find(x=>x.id===editingMaintPOId)||{}).expectedDate):''}" ${noUnitYet?'disabled':''}></div>
      </div>

      <div class="section-total"><h3>Item(s)</h3><span class="hint">${noUnitYet?'select the Unit above first':`${maintPOItemsDraft.length} item(s) — total ${fmtMoney(draftTotals.value)}`}</span></div>
      <div id="maintPOItemRows">
        ${maintPOItemsDraft.map((r,i)=>`
          <div class="po-row" data-row="${i}">
            <div class="po-row-head"><span class="po-row-num">Item ${i+1}</span></div>
            <div class="frow g4">
              <div><label class="fl">Machine ${maintPOTypeSel==='Repair'?'<span class="req">*</span>':'<span class="hint" style="position:static; font-size:9.5px;">(optional)</span>'}</label>
                <select onchange="onMaintPOItemRowMachineChange(${i},this.value)" ${noUnitYet?'disabled':''}>${machOptsFor(r.machineId)}</select>
              </div>
              <div style="grid-column:2/4;"><label class="fl">Item<span class="req">*</span> <span class="hint" style="position:static; font-size:9.5px;">(from Maintenance Items — or "Other")</span></label>
                <select onchange="onMaintPOItemRowItemChange(${i},this)" ${noUnitYet?'disabled':''}>
                  <option value="">— select item —</option>
                  ${maintenanceItemOptionsHtml(r.itemId)}
                  <option value="__other__" ${(!r.itemId && r.itemDesc)?'selected':''}>Other (type manually)</option>
                </select>
                ${(!r.itemId) ? `<input placeholder="Describe the item / part" value="${esc(r.itemDesc)}" oninput="updateMaintPOItemRow(${i},'itemDesc',this.value)" style="margin-top:6px;">` : ''}
              </div>
              <div><label class="fl">UOM</label><input value="${esc(r.uom)}" placeholder="Nos" oninput="updateMaintPOItemRow(${i},'uom',this.value)" ${noUnitYet?'disabled':''}></div>
            </div>
            <div class="frow g4">
              <div><label class="fl">Quantity<span class="req">*</span></label><input type="number" min="0" value="${r.qty}" oninput="updateMaintPOItemRow(${i},'qty',this.value)" ${noUnitYet?'disabled':''}></div>
              <div><label class="fl">${maintPOTypeSel==='Repair'?'Est. Repair Cost (₹)':'Rate (₹)'}</label><input type="number" min="0" value="${r.rate}" oninput="updateMaintPOItemRow(${i},'rate',this.value)" ${noUnitYet?'disabled':''}></div>
              <div><label class="fl">Value</label><input value="${fmtMoney((parseFloat(r.qty)||0)*(parseFloat(r.rate)||0))}" disabled></div>
              <div class="fl-actions"><button class="btn danger" style="width:100%;" onclick="removeMaintPOItemRow(${i})" ${noUnitYet?'disabled':''}>✕ Remove Row</button></div>
            </div>
          </div>`).join('')}
      </div>
      <button class="btn ghost" style="margin:8px 0 16px;" onclick="addMaintPOItemRow()" ${noUnitYet?'disabled':''}>+ Add Item</button>

      <div class="section-total"><h3>Commercial Terms</h3></div>
      <div class="frow g4">
        <div><label class="fl">GST (%)</label><input id="mp_gstPct" type="number" min="0" max="100" step="0.01" placeholder="18" value="${maintPOCT.gstPct===''||maintPOCT.gstPct===undefined?'':maintPOCT.gstPct}" oninput="updateMaintPOTermsPreview()" ${noUnitYet?'disabled':''}></div>
        <div><label class="fl">Discount (%)</label><input id="mp_discountPct" type="number" min="0" max="100" step="0.01" placeholder="0" value="${maintPOCT.discountPct||''}" oninput="updateMaintPOTermsPreview()" ${noUnitYet?'disabled':''}></div>
        <div><label class="fl">Freight</label><input id="mp_freight" placeholder="e.g. Extra as actual / Included" value="${esc(maintPOCT.freight)}" ${noUnitYet?'disabled':''}></div>
        <div><label class="fl">Packing &amp; Forwarding</label><input id="mp_packing" placeholder="e.g. Extra as actual / Included" value="${esc(maintPOCT.packing)}" ${noUnitYet?'disabled':''}></div>
      </div>
      <div class="frow g4">
        <div><label class="fl">Payment Terms</label><input id="mp_paymentTerms" placeholder="e.g. 60 Days from date of invoice" value="${esc(maintPOCT.paymentTerms)}" ${noUnitYet?'disabled':''}></div>
        <div><label class="fl">Validity</label><input id="mp_validity" placeholder="e.g. 30 Days from PO date" value="${esc(maintPOCT.validity)}" ${noUnitYet?'disabled':''}></div>
        <div><label class="fl">Delivery In</label><input id="mp_deliveryIn" placeholder="e.g. 2 Weeks" value="${esc(maintPOCT.deliveryIn)}" ${noUnitYet?'disabled':''}></div>
        <div><label class="fl">Insurance</label><input id="mp_insurance" placeholder="e.g. Extra as actual / Included" value="${esc(maintPOCT.insurance)}" ${noUnitYet?'disabled':''}></div>
      </div>
      <div class="frow g4">
        <div><label class="fl">Commissioning</label><input id="mp_commissioning" placeholder="e.g. By VIPL / By Supplier / Nil" value="${esc(maintPOCT.commissioning)}" ${noUnitYet?'disabled':''}></div>
      </div>
      <div class="panel" id="maintPOTermsPreview" style="margin:10px 0; background:color-mix(in srgb, var(--amber) 5%, transparent);">
        ${maintPOTermsPreviewHtml(draftTotals.value, maintPOCT.discountPct, maintPOCT.gstPct)}
      </div>

      <div class="frow g1">
        <div><label class="fl">${maintPOTypeSel==='Repair'?'Fault Description / Remarks':'Remarks'}</label><input id="mp_remarks" value="${editingMaintPOId?esc((DB.maintenancePO.find(x=>x.id===editingMaintPOId)||{}).remarks):''}" placeholder="${maintPOTypeSel==='Repair'?'What is wrong with the item(s)...':'Any notes for this PO...'}" ${noUnitYet?'disabled':''}></div>
      </div>
      <button class="btn amber" onclick="${editingMaintPOId?'saveEditMaintenancePO()':'saveMaintenancePO()'}" ${noUnitYet?'disabled':''}>💾 ${editingMaintPOId?'Save Changes':'Save Maintenance PO'}</button>
      ${editingMaintPOId?`<button class="btn ghost" onclick="toggleMaintPOForm()">Cancel</button>`:''}
      ` : ''}
    </div>

    <div class="panel">
      <div class="grid-box">
        ${list.map(p=>maintenancePOCardHtml(p)).join('') || '<div class="empty">No Maintenance Purchase Orders raised for this unit yet.</div>'}
      </div>
    </div>
  `;
}
function maintenancePOCardHtml(p){
  const actionOpen = maintPOActionId===p.id;
  const items = p.items||[];
  const totals = maintPOTotals(items);
  const net = maintPONetTotals(p);
  const machSummary = Array.from(new Set(items.map(r=>{ const m=r.machineId?DB.machines.find(x=>x.id===r.machineId):null; return m?m.code:'General/Stock'; }))).join(', ');
  return `<div class="rec-card">
    <div class="rc-title">${esc(p.poNo)}</div>
    <div class="rc-sub">${p.poType==='Repair'?'🔧 Repair / Service':'🛒 Purchase'} · ${items.length} item(s)</div>
    <div class="rc-row"><span class="k">Machine(s)</span><span class="v">${esc(machSummary)||'—'}</span></div>
    <div class="rc-row"><span class="k">Items</span><span class="v" title="${items.map(r=>maintPOItemRowLabel(r)).join(', ')}">${items.map(r=>maintPOItemRowLabel(r)).join(', ')}</span></div>
    <div class="rc-row"><span class="k">Total Qty</span><span class="v">${totals.qty}</span></div>
    <div class="rc-row"><span class="k">Supplier</span><span class="v">${esc(p.supplier)||'—'}</span></div>
    <div class="rc-row"><span class="k">Subtotal</span><span class="v">${fmtMoney(net.gross)}</span></div>
    ${net.discountPct>0 ? `<div class="rc-row"><span class="k">Discount</span><span class="v">${net.discountPct}% (−${fmtMoney(net.discountAmt)})</span></div>` : ''}
    <div class="rc-row"><span class="k">GST @ ${net.gstPct}%</span><span class="v">+ ${fmtMoney(net.gstAmt)}</span></div>
    <div class="rc-row"><span class="k">${p.poType==='Repair'?'Grand Total (Repair Cost)':'Grand Total'}</span><span class="v"><strong>${fmtMoney(net.grandTotal)}</strong></span></div>
    <div class="rc-row"><span class="k">${p.poType==='Repair'?'Expected Return':'Expected Delivery'}</span><span class="v">${fmtDate(p.expectedDate)||'—'}</span></div>
    ${p.remarks?`<div class="rc-row"><span class="k">Remarks</span><span class="v">${esc(p.remarks)}</span></div>`:''}
    ${p.status==='Sent' ? `<div class="rc-row"><span class="k">Sent</span><span class="v">${fmtDate(p.sentDate)}${p.dcNo?' · DC# '+esc(p.dcNo):''}</span></div>` : ''}
    ${p.status==='Received' ? `<div class="rc-row"><span class="k">Received</span><span class="v">${fmtDate(p.receivedDate)}${p.receivedCondition?' · '+esc(p.receivedCondition):''}</span></div>` : ''}
    ${p.status==='Received' && p.actualCost ? `<div class="rc-row"><span class="k">${p.poType==='Repair'?'Actual Repair Cost':'Actual Value'}</span><span class="v">${fmtMoney(p.actualCost)}</span></div>` : ''}
    <div class="rc-actions">
      ${p.status==='Open' ? `<button class="btn small ghost" onclick="editMaintenancePO('${p.id}')">Edit</button>` : ''}
      <button class="btn small ghost" onclick="printMaintenancePO('${p.id}')">🖨 Print</button>
      ${p.status==='Open' && p.poType==='Purchase' ? `<button class="btn ghost" onclick="toggleMaintPOAction('${p.id}')">📥 Receive</button>` : ''}
      ${p.status==='Open' && p.poType==='Repair' ? `<button class="btn ghost" onclick="toggleMaintPOAction('${p.id}')">🚚 Mark Sent</button>` : ''}
      ${p.status==='Sent' ? `<button class="btn ghost" onclick="toggleMaintPOAction('${p.id}')">📥 Receive Back</button>` : ''}
      <button class="btn danger" onclick="deleteMaintenancePO('${p.id}')">Del</button>
    </div>
    ${actionOpen ? maintenancePOActionFormHtml(p) : ''}
  </div>`;
}
function maintPOActionItemRowsHtml(p, kind){
  // kind: 'receive' (Purchase Open→Received), 'send' (Repair Open→Sent), 'receiveBack' (Repair Sent→Received)
  return (p.items||[]).map((r,i)=>{
    const defQty = kind==='send' ? r.qty : (kind==='receiveBack' ? (r.sentQty||r.qty) : r.qty);
    const fieldPrefix = kind==='send' ? 'mpa_sqty' : (kind==='receiveBack' ? 'mpa_rbqty' : 'mpa_rqty');
    return `<div class="frow g3" style="margin-bottom:4px;">
      <div style="grid-column:1/3; align-self:end; padding-bottom:6px; font-size:12px;">${maintPOItemRowLabel(r)} <span class="hint" style="position:static;">(ordered ${r.qty} ${esc(r.uom)||''})</span></div>
      <div><label class="fl">${kind==='send'?'Qty Sent':'Qty Received'}</label><input id="${fieldPrefix}_${p.id}_${i}" type="number" min="0" value="${defQty}"></div>
    </div>`;
  }).join('');
}
function maintenancePOActionFormHtml(p){
  if(p.status==='Open' && p.poType==='Purchase'){
    return `<div class="panel" style="margin-top:10px; background:color-mix(in srgb, var(--amber) 6%, transparent);">
      <h4 style="margin:0 0 8px;">Receive Item(s)</h4>
      ${maintPOActionItemRowsHtml(p,'receive')}
      <div class="frow g4">
        <div><label class="fl">Receipt Date</label><input id="mprv_date_${p.id}" type="date" value="${today()}"></div>
        <div><label class="fl">Invoice No.</label><input id="mprv_inv_${p.id}"></div>
        <div><label class="fl">Actual Value (₹)</label><input id="mprv_cost_${p.id}" type="number" min="0" value="${maintPOTotals(p.items).value}"></div>
        <div><label class="fl">Remarks</label><input id="mprv_remarks_${p.id}"></div>
      </div>
      <button class="btn amber" onclick="receiveMaintPOPurchase('${p.id}')">💾 Confirm Receipt</button>
      <button class="btn ghost" onclick="toggleMaintPOAction('${p.id}')">Cancel</button>
    </div>`;
  }
  if(p.status==='Open' && p.poType==='Repair'){
    return `<div class="panel" style="margin-top:10px; background:color-mix(in srgb, var(--amber) 6%, transparent);">
      <h4 style="margin:0 0 8px;">Send to Supplier for Repair/Service</h4>
      ${maintPOActionItemRowsHtml(p,'send')}
      <div class="frow g4">
        <div><label class="fl">Sent Date</label><input id="mpsnd_date_${p.id}" type="date" value="${today()}"></div>
        <div><label class="fl">DC / Challan No.</label><input id="mpsnd_dc_${p.id}"></div>
        <div><label class="fl">Supplier</label><input id="mpsnd_supplier_${p.id}" value="${esc(p.supplier)}"></div>
        <div><label class="fl">Remarks</label><input id="mpsnd_remarks_${p.id}"></div>
      </div>
      <button class="btn amber" onclick="markMaintPOSent('${p.id}')">💾 Confirm Dispatch</button>
      <button class="btn ghost" onclick="toggleMaintPOAction('${p.id}')">Cancel</button>
    </div>`;
  }
  if(p.status==='Sent'){
    return `<div class="panel" style="margin-top:10px; background:color-mix(in srgb, var(--amber) 6%, transparent);">
      <h4 style="margin:0 0 8px;">Receive Back from Supplier</h4>
      ${maintPOActionItemRowsHtml(p,'receiveBack')}
      <div class="frow g4">
        <div><label class="fl">Received Date</label><input id="mprb_date_${p.id}" type="date" value="${today()}"></div>
        <div><label class="fl">Condition</label><select id="mprb_cond_${p.id}"><option>OK — Repaired</option><option>Partially Repaired</option><option>Rejected / Beyond Repair</option></select></div>
        <div><label class="fl">Actual Repair Cost (₹)</label><input id="mprb_cost_${p.id}" type="number" min="0" value="${maintPOTotals(p.items).value}"></div>
        <div><label class="fl">Remarks</label><input id="mprb_remarks_${p.id}"></div>
      </div>
      <button class="btn amber" onclick="markMaintPOReceived('${p.id}')">💾 Confirm Receipt Back</button>
      <button class="btn ghost" onclick="toggleMaintPOAction('${p.id}')">Cancel</button>
    </div>`;
  }
  return '';
}
function toggleMaintPOAction(id){ maintPOActionId = maintPOActionId===id ? null : id; render(); }
function readMaintPOCommercialTerms(){
  const gstVal = document.getElementById('mp_gstPct').value;
  return {
    discountPct: parseFloat(document.getElementById('mp_discountPct').value)||0,
    freight: document.getElementById('mp_freight').value.trim(),
    packing: document.getElementById('mp_packing').value.trim(),
    paymentTerms: document.getElementById('mp_paymentTerms').value.trim(),
    validity: document.getElementById('mp_validity').value.trim(),
    deliveryIn: document.getElementById('mp_deliveryIn').value.trim(),
    insurance: document.getElementById('mp_insurance').value.trim(),
    commissioning: document.getElementById('mp_commissioning').value.trim(),
    gstPct: (gstVal===''||isNaN(parseFloat(gstVal))) ? 18 : parseFloat(gstVal)
  };
}
function validateMaintPOItems(){
  return maintPOItemsDraft.map(r=>{
      const itemId = r.itemId||'';
      const itemDesc = itemId ? '' : (r.itemDesc||'').trim();
      return { machineId:r.machineId||'', itemId, itemDesc, uom:(r.uom||'').trim(), qty:parseFloat(r.qty)||0, rate:parseFloat(r.rate)||0 };
    })
    .filter(r=>(r.itemId || r.itemDesc) && r.qty>0);
}
function saveMaintenancePO(){
  if(!requireWorkingUnit()) return;
  if(!maintPOUnitSel){ toast('Select the Unit (Unit 1 / Unit 2) first'); return; }
  const items = validateMaintPOItems();
  if(!items.length){ toast('Add at least one item, with a Qty greater than 0'); return; }
  if(maintPOTypeSel==='Repair' && items.some(r=>!r.machineId)){ toast('Select the machine for every item being sent for repair'); return; }
  const poNo = nextMaintPONo();
  const itemSummary = items.map(r=>maintPOItemRowLabel(r)).join(', ');
  DB.maintenancePO.push({
    id:newMaintPOId(), unit:maintPOUnitSel, poNo, poType:maintPOTypeSel, date:today(),
    items,
    supplier:document.getElementById('mp_supplier').value.trim(),
    expectedDate:document.getElementById('mp_expected').value,
    remarks:document.getElementById('mp_remarks').value.trim(),
    commercialTerms: readMaintPOCommercialTerms(),
    status:'Open', sentDate:'', dcNo:'', sentRemarks:'',
    receivedDate:'', receivedCondition:'', invoiceNo:'', actualCost:0, receivedRemarks:'',
    history:[{date:today(), action:'PO Raised', note:(maintPOTypeSel==='Repair'?'Sent for repair/service — ':'Purchase requirement — ')+itemSummary}]
  });
  maintPOFormOpen=false; maintPOItemsDraft=[]; editingMaintPOId=null;
  maintPOUnitSel = (currentUnit==='Unit-1'||currentUnit==='Unit-2') ? currentUnit : '';
  saveDB(); toast(poNo+' raised'); render();
}
function editMaintenancePO(id){
  const p = (DB.maintenancePO||[]).find(x=>x.id===id);
  if(!p) return;
  if(p.status!=='Open'){ toast('Only an Open PO can be edited — this one has already moved past Open'); return; }
  editingMaintPOId = id;
  maintPOTypeSel = p.poType;
  maintPOUnitSel = p.unit;
  maintPOItemsDraft = JSON.parse(JSON.stringify(p.items&&p.items.length ? p.items : [emptyMaintPOItemRow()]));
  maintPOFormOpen = true;
  render();
}
function saveEditMaintenancePO(){
  const p = (DB.maintenancePO||[]).find(x=>x.id===editingMaintPOId);
  if(!p) return;
  const items = validateMaintPOItems();
  if(!items.length){ toast('Add at least one item, with a Qty greater than 0'); return; }
  if(maintPOTypeSel==='Repair' && items.some(r=>!r.machineId)){ toast('Select the machine for every item being sent for repair'); return; }
  p.poType = maintPOTypeSel;
  p.items = items;
  p.supplier = document.getElementById('mp_supplier').value.trim();
  p.expectedDate = document.getElementById('mp_expected').value;
  p.remarks = document.getElementById('mp_remarks').value.trim();
  p.commercialTerms = readMaintPOCommercialTerms();
  p.history.push({date:today(), action:'PO Edited', note:`${items.length} item(s) — ${items.map(r=>maintPOItemRowLabel(r)).join(', ')}`});
  maintPOFormOpen=false; maintPOItemsDraft=[]; editingMaintPOId=null;
  maintPOUnitSel = (currentUnit==='Unit-1'||currentUnit==='Unit-2') ? currentUnit : '';
  saveDB(); toast(p.poNo+' updated'); render();
}
function receiveMaintPOPurchase(id){
  const p = (DB.maintenancePO||[]).find(x=>x.id===id);
  if(!p) return;
  let anyBad=false;
  (p.items||[]).forEach((r,i)=>{
    const el = document.getElementById(`mpa_rqty_${id}_${i}`);
    const qty = el ? parseFloat(el.value) : 0;
    if(!qty || qty<0) anyBad=true;
    r.receivedQty = qty||0;
  });
  if(anyBad){ toast('Enter a valid Qty Received for every item'); return; }
  p.receivedDate = document.getElementById(`mprv_date_${id}`).value || today();
  p.invoiceNo = document.getElementById(`mprv_inv_${id}`).value.trim();
  p.actualCost = parseFloat(document.getElementById(`mprv_cost_${id}`).value)||0;
  p.receivedRemarks = document.getElementById(`mprv_remarks_${id}`).value.trim();
  p.status = 'Received';
  p.history.push({date:p.receivedDate, action:'Received', note:`${p.items.length} item(s)${p.invoiceNo?' · Inv# '+p.invoiceNo:''}${p.receivedRemarks?' · '+p.receivedRemarks:''}`});
  maintPOActionId=null;
  saveDB(); toast('Maintenance PO received'); render();
}
function markMaintPOSent(id){
  const p = (DB.maintenancePO||[]).find(x=>x.id===id);
  if(!p) return;
  let anyBad=false;
  (p.items||[]).forEach((r,i)=>{
    const el = document.getElementById(`mpa_sqty_${id}_${i}`);
    const qty = el ? parseFloat(el.value) : 0;
    if(!qty || qty<=0) anyBad=true;
    r.sentQty = qty||0;
  });
  if(anyBad){ toast('Enter a valid Qty Sent for every item'); return; }
  p.sentDate = document.getElementById(`mpsnd_date_${id}`).value || today();
  p.dcNo = document.getElementById(`mpsnd_dc_${id}`).value.trim();
  const supplier = document.getElementById(`mpsnd_supplier_${id}`).value.trim();
  if(supplier) p.supplier = supplier;
  p.sentRemarks = document.getElementById(`mpsnd_remarks_${id}`).value.trim();
  p.status = 'Sent';
  p.history.push({date:p.sentDate, action:'Sent to Supplier', note:`${p.items.length} item(s) to ${p.supplier||'supplier'}${p.dcNo?' · DC# '+p.dcNo:''}${p.sentRemarks?' · '+p.sentRemarks:''}`});
  maintPOActionId=null;
  saveDB(); toast('Marked as sent to supplier'); render();
}
function markMaintPOReceived(id){
  const p = (DB.maintenancePO||[]).find(x=>x.id===id);
  if(!p) return;
  let anyBad=false;
  (p.items||[]).forEach((r,i)=>{
    const el = document.getElementById(`mpa_rbqty_${id}_${i}`);
    const qty = el ? parseFloat(el.value) : 0;
    if(!qty || qty<0) anyBad=true;
    r.receivedQty = qty||0;
  });
  if(anyBad){ toast('Enter a valid Qty Received for every item'); return; }
  p.receivedDate = document.getElementById(`mprb_date_${id}`).value || today();
  p.receivedCondition = document.getElementById(`mprb_cond_${id}`).value;
  p.actualCost = parseFloat(document.getElementById(`mprb_cost_${id}`).value)||0;
  p.receivedRemarks = document.getElementById(`mprb_remarks_${id}`).value.trim();
  p.status = 'Received';
  p.history.push({date:p.receivedDate, action:'Received Back from Supplier', note:`${p.items.length} item(s) · ${p.receivedCondition}${p.receivedRemarks?' · '+p.receivedRemarks:''}`});
  maintPOActionId=null;
  saveDB(); toast('Item(s) received back from supplier'); render();
}
function deleteMaintenancePO(id){
  if(!confirm('Delete this Maintenance PO record? This cannot be undone.')) return;
  DB.maintenancePO = (DB.maintenancePO||[]).filter(x=>x.id!==id);
  if(editingMaintPOId===id){ editingMaintPOId=null; maintPOFormOpen=false; maintPOItemsDraft=[]; }
  saveDB(); render();
}
/* ---- Print: complete, professional single-PO document — mirrors the Purchase Order printout
   (company/unit header, supplier block, PO meta, full item table with per-row Machine, UOM, Qty,
   Rate & Value, terms/remarks, status & history, and signatures) so it can be handed to / faxed to
   the supplier as-is. ---- */
function printMaintenancePO(id){
  const p = (DB.maintenancePO||[]).find(x=>x.id===id);
  if(!p) return;
  const items = p.items||[];
  const totals = maintPOTotals(items);
  const net = maintPONetTotals(p);
  const ct = p.commercialTerms||{};
  const rows = items.map((r,i)=>{
    const mach = r.machineId ? DB.machines.find(x=>x.id===r.machineId) : null;
    return [i+1, maintPOItemRowLabel(r), mach?esc(mach.code)+' — '+esc(mach.name):'General / Stock', esc(r.uom)||'—',
      `<span class="num">${r.qty}</span>`, `<span class="num">${fmtMoney(r.rate)}</span>`, `<span class="num">${fmtMoney((r.qty||0)*(r.rate||0))}</span>`];
  });
  // Item table ends at SUBTOTAL. Commercial Terms — printed as its own clearly labelled,
  // professionally formatted section, using only the fields the user actually filled in.
  // GST is kept as part of Commercial Terms but listed FIRST. Remarks/Fault Description and
  // Status/History are deliberately NOT printed — they stay in the system only.
  rows.push(['', '<strong>SUBTOTAL</strong>', '', '', `<span class="num"><strong>${totals.qty}</strong></span>`, '', `<span class="num"><strong>${fmtMoney(totals.value)}</strong></span>`]);
  let ctText = `GST: ${net.gstPct}% Extra\n`;
  if(net.discountPct>0) ctText += `DISCOUNT: ${net.discountPct}%\n`;
  if(ct.freight) ctText += `FREIGHT: ${ct.freight}\n`;
  if(ct.packing) ctText += `PACKING & FORWARDING: ${ct.packing}\n`;
  if(ct.insurance) ctText += `INSURANCE: ${ct.insurance}\n`;
  if(ct.commissioning) ctText += `COMMISSIONING: ${ct.commissioning}\n`;
  if(ct.paymentTerms) ctText += `PAYMENT TERMS: ${ct.paymentTerms}\n`;
  if(ct.validity) ctText += `VALIDITY: ${ct.validity}\n`;
  if(ct.deliveryIn) ctText += `DELIVERY IN: ${ct.deliveryIn}\n`;
  const commercialTermsHtml = formatTermsForPrint(ctText, 'Commercial Terms');
  const supRec = DB.suppliers.find(s=>s.name===p.supplier);
  const supAddr = supRec ? (supRec.address||'') : '';
  const supContactLine = supRec ? [
    supRec.contact ? `Contact Person: <strong>${esc(supRec.contact)}</strong>` : '',
    supRec.email ? `Email: <strong>${esc(supRec.email)}</strong>` : '',
    supRec.phone ? `Phone: <strong>${esc(supRec.phone)}</strong>` : ''
  ].filter(Boolean).join(' &nbsp;|&nbsp; ') : '';
  const barLeft = `
    <div>Supplier: <strong>${esc(p.supplier)||'—'}</strong></div>
    <div>GSTIN: <strong>${esc(supRec?supRec.gstin:'')||'—'}</strong></div>
    ${supContactLine ? `<div>${supContactLine}</div>` : ''}
  `;
  const poAddrSettings = (DB.settings.addresses||{});
  const poUnitAddr = (p.unit==='Unit-1' ? poAddrSettings.unit1 : p.unit==='Unit-2' ? poAddrSettings.unit2 : '') || poAddrSettings.office || '';
  const poHeaderAddrHtml = poUnitAddr ? `<div class="sub office">${printHeaderAddrHtml(poUnitAddr)}</div>` : '';
  // Status is a live workflow field (Open/Sent/Received) — kept in the system/UI, but deliberately
  // left OUT of the printed document, which is a fixed commercial record sent to the supplier.
  const poMetaRight = `<div class="poMetaRight">
      <div class="poMetaRow"><span class="poMetaK">PO Number</span><span class="poMetaV">${esc(p.poNo)}</span></div>
      <div class="poMetaRow"><span class="poMetaK">PO Date</span><span class="poMetaV">${fmtDate(p.date)}</span></div>
      <div class="poMetaRow"><span class="poMetaK">Type</span><span class="poMetaV">${p.poType==='Repair'?'Repair/Service':'Purchase'}</span></div>
    </div>`;
  // Column widths — Item (description) gets the lion's share of the page width; Sl/UOM/Qty and the
  // other narrow columns are trimmed down to only what they actually need, so the table reads
  // compact and professional instead of stretching every column evenly across the page.
  const colgroupHtml = '<colgroup>'+[4,32,20,8,8,12,16].map(w=>`<col style="width:${w}%;">`).join('')+'</colgroup>';
  const poExtraCss = `
    .prBar{ align-items:flex-start; }
    .prBar .prBarRow > span:first-child{ display:flex; flex-direction:column; gap:2px; line-height:1.6; }
    .poMetaRight{ display:flex; flex-direction:column; gap:3px; text-align:right; }
    .poMetaRow{ display:flex; justify-content:flex-end; align-items:baseline; gap:8px; line-height:1.6; }
    .poMetaK{ color:#3d4b58; min-width:76px; text-align:right; }
    .poMetaV{ font-weight:700; color:var(--accent-dark); min-width:96px; text-align:left; }
    body{ padding:3mm 3mm; font-size:10.8px; }
    .prHead{ padding-bottom:8px; margin-bottom:10px; }
    .prHead h1{ font-size:17px; margin:0 0 3px; }
    .prTitle{ margin:0 0 8px; padding:6px 12px; font-size:12.5px; }
    .prBar{ margin-bottom:10px; padding:7px 10px; gap:4px; }
    table{ table-layout:fixed; }
    th, td{ padding:4.5px 6px; font-size:10.2px; line-height:1.35; vertical-align:middle; }
    th:nth-child(1), td:nth-child(1){ text-align:center; }
    th:nth-child(4), td:nth-child(4){ text-align:center; }
    th:nth-child(5), td:nth-child(5),
    th:nth-child(6), td:nth-child(6),
    th:nth-child(7), td:nth-child(7){ text-align:right; }
    td:nth-child(2){ word-break:break-word; }
    .prNote{ margin-top:10px; }
    .prNote .ntBody{ padding:8px 11px 10px; }
    .amtSummary{ margin-top:12px; display:flex; justify-content:flex-end; }
    .amtSummary table{ width:auto; min-width:260px; table-layout:auto; }
    .amtSummary td{ padding:4px 10px; font-size:11px; border:none; }
    .amtSummary tr td:first-child{ color:#3d4b58; }
    .amtSummary tr td:last-child{ text-align:right; font-variant-numeric:tabular-nums; }
    .amtSummary tr.amtGrand td{ border-top:1.6px solid var(--accent); font-weight:800; font-size:13px; color:var(--accent-dark); padding-top:7px; }
    .prFoot{ margin-top:36px; }
    .prFoot .sign{ padding-top:8px; }
  `;
  // Amount Summary — Subtotal → Discount → GST 18% → Grand Total (Grand Total sits directly under
  // GST, with nothing in between, and includes the GST amount), then Commercial Terms prints
  // immediately below this whole block.
  const amtSummaryHtml = `<div class="amtSummary"><table>
    <tr><td>Subtotal</td><td>${fmtMoney(net.gross)}</td></tr>
    ${net.discountPct>0 ? `<tr><td>Discount @ ${net.discountPct}%</td><td>− ${fmtMoney(net.discountAmt)}</td></tr>
    <tr><td>Net Value</td><td>${fmtMoney(net.net)}</td></tr>` : ''}
    <tr><td>GST @ ${net.gstPct}%</td><td>+ ${fmtMoney(net.gstAmt)}</td></tr>
    <tr class="amtGrand"><td>Grand Total</td><td>${fmtMoney(net.grandTotal)}</td></tr>
  </table></div>`;
  const note = amtSummaryHtml + commercialTermsHtml;
  const poFooterHtml = `<div class="prFoot"><div class="sign">Prepared By</div><div class="sign">Authorized Signatory</div></div>`;
  printReport(`Maintenance ${p.poType==='Repair'?'Repair / Service':'Purchase'} Order — ${p.poNo}`,
    ['Sl','Item','Machine','UOM','Qty',p.poType==='Repair'?'Est. Cost (₹)':'Rate (₹)','Value (₹)'], rows,
    {barLeft, barRight:poMetaRight, barAddr:supAddr, note, extraCss:poExtraCss, colgroupHtml, unitAddrOverride:poUnitAddr, headerAddrHtml:poHeaderAddrHtml, pageMargin:'10mm', footerHtml:poFooterHtml, showSign:false,
     showGstin:true});
}
function printMaintenancePOList(){
  const list = (DB.maintenancePO||[]).filter(x=>reportUnitMatch(x.unit));
  const headers = ['PO No.','Type','Item(s)','Qty','Supplier','Status','Date'];
  const rows = list.map(p=>{
    const items = p.items||[];
    const totals = maintPOTotals(items);
    const itemSummary = items.map(r=>maintPOItemRowLabel(r)).join(', ') || '—';
    return [esc(p.poNo), p.poType==='Repair'?'Repair/Service':'Purchase', itemSummary, `<span class="num">${totals.qty}</span>`, esc(p.supplier)||'—', esc(p.status), fmtDate(p.date)||'—'];
  });
  printReport('Maintenance Purchase Orders', headers, rows, {barLeft:`Unit: ${esc(reportScopeLabel())}`, barRight:`Total Orders: ${list.length}`});
}
