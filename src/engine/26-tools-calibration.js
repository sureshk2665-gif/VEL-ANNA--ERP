/* ---------------- TOOL MANAGEMENT (Master: Tool Master + Fixture Master; + Tool Register + Tool Issue + Reports) ---------------- */
function setToolsSubTab(t){
  toolsSubTab = t; toolFormOpen=false; editingToolMasterId=null; fixtureFormOpen=false; editingFixtureId=null;
  toolRegFormOpen=false; toolIssueFormOpen=false; toolPOFormOpen=false; receivePOId=null;
  calGaugeFormOpen=false; editingGaugeId=null; editingToolSupplierId=null;
  render();
}
function setMasterInnerTab(t){ setToolsSubTab('master_'+t); }
function renderTools(main){
  if(!subOK('tools', toolsSubTab)) toolsSubTab = firstAllowedSub('tools') || toolsSubTab;
  const onMaster = toolsSubTab==='master' || (toolsSubTab||'').indexOf('master_')===0;
  main.innerHTML = `
    <div class="topbar"><div></div></div>
    <div class="subtabs" style="margin-top:12px;">
      <button class="${onMaster?'active':''}" onclick="setMasterInnerTab('tool')">🧰 Master</button>
      ${Object.keys(GAUGE_KINDS).filter(k=>subOK('tools','g_'+k)).map(k=>`<button class="${toolsSubTab==='g_'+k?'active':''}" onclick="setToolsSubTab('g_${k}')">${GAUGE_KINDS[k].icon} ${GAUGE_KINDS[k].label}</button>`).join('')}
      ${subOK('tools','toolSuppliers')?`<button class="${toolsSubTab==='toolSuppliers'?'active':''}" onclick="setToolsSubTab('toolSuppliers')">🚚 Tools Suppliers</button>`:''}
      ${subOK('tools','po')?`<button class="${toolsSubTab==='po'?'active':''}" onclick="setToolsSubTab('po')">🧾 Tools PO</button>`:''}
      ${subOK('tools','register')?`<button class="${toolsSubTab==='register'?'active':''}" onclick="setToolsSubTab('register')">📥 Tool Register</button>`:''}
      ${subOK('tools','issue')?`<button class="${toolsSubTab==='issue'?'active':''}" onclick="setToolsSubTab('issue')">📤 Tool Issue</button>`:''}
      ${subOK('tools','reports')?`<button class="${toolsSubTab==='reports'?'active':''}" onclick="setToolsSubTab('reports')">📊 Reports</button>`:''}
    </div>
    ${onMaster ? `
    <div class="subtabs" style="margin-top:10px;">
      <button class="${toolsSubTab==='master_fixture'?'':'active'}" onclick="setMasterInnerTab('tool')">🔧 Tool Master</button>
      <button class="${toolsSubTab==='master_fixture'?'active':''}" onclick="setMasterInnerTab('fixture')">🗜️ Fixture Master</button>
    </div>` : ''}
    <div id="toolsSub"></div>
  `;
  const sub = document.getElementById('toolsSub');
  if(toolsSubTab==='po') return renderToolsPO(sub);
  if(toolsSubTab==='register') return renderToolRegister(sub);
  if(toolsSubTab==='issue') return renderToolIssue(sub);
  if(toolsSubTab==='reports') return renderToolReports(sub);
  if(toolsSubTab==='toolSuppliers') return renderToolSuppliers(sub);
  if(toolsSubTab && toolsSubTab.indexOf('g_')===0){ return renderGaugeMaster(sub, toolsSubTab.slice(2)); }
  if(toolsSubTab==='master_fixture') return renderFixtureMaster(sub);
  return renderToolMaster(sub);
}

function toolMasterList(){ return DB.toolMaster||[]; }
function toolReceivedQty(toolId){ return (DB.toolRegister||[]).filter(r=>r.toolId===toolId && reportUnitMatch(r.unit)).reduce((s,r)=>s+(parseFloat(r.qtyReceived)||0),0); }
function toolIssuedQty(toolId){ return (DB.toolIssue||[]).filter(r=>r.toolId===toolId && reportUnitMatch(r.unit)).reduce((s,r)=>s+(parseFloat(r.qtyIssued)||0),0); }
function toolCurrentStock(toolId){ return toolReceivedQty(toolId) - toolIssuedQty(toolId); }
function toolMasterOptionsHtml(selected){
  return toolMasterList().map(t=>`<option value="${t.id}" ${selected===t.id?'selected':''}>${esc(t.code)} — ${esc(toolDisplayName(t))}</option>`).join('');
}
function newToolId(){ return 'tm'+Date.now()+Math.random().toString(36).slice(2,6); }
// Composed display name for a tool record (used anywhere the app previously showed a free-typed "Tool Name")
function toolDisplayName(t){
  if(!t) return '';
  const parts=[t.type, t.size, t.material].filter(Boolean);
  return parts.join(' ') || t.spec || t.code || 'Tool';
}
// Auto-generates the next running Tool Code, e.g. TL-0001, TL-0002 ...
function nextToolCode(){
  if(!DB.counters) DB.counters={};
  DB.counters.tl = (DB.counters.tl||0) + 1;
  return 'TL-' + String(DB.counters.tl).padStart(4,'0');
}
// ---- admin-extensible dropdown lists (Tool Type / Tool Material / Make) ----
function toolListOptionsHtml(listName, selected){
  return (DB.toolLists[listName]||[]).map(v=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(v)}</option>`).join('');
}
function addToolListValue(listName, label){
  const v = prompt(`Add new ${label} value:`);
  if(!v || !v.trim()) return;
  const val = v.trim();
  if(!DB.toolLists[listName]) DB.toolLists[listName]=[];
  if(DB.toolLists[listName].some(x=>x.toLowerCase()===val.toLowerCase())){ toast(`${label} "${val}" already exists`); return; }
  DB.toolLists[listName].push(val);
  saveDB();
  const sel = document.getElementById('tm_'+listName+'_select');
  if(sel){ sel.innerHTML = toolListOptionsHtml(listName, val); sel.value = val; }
  toast(`${label} added`);
}

/* ---- Master (Tool Master) ---- */
function toggleToolForm(){ toolFormOpen = !toolFormOpen; editingToolMasterId=null; render(); }
function startEditToolMaster(id){ toolFormOpen=true; editingToolMasterId=id; toolsSubTab='master_tool'; render(); }
function cancelToolForm(){ toolFormOpen=false; editingToolMasterId=null; render(); }
function renderToolMaster(main){
  const list = toolMasterList().slice().reverse();
  const editing = editingToolMasterId ? (DB.toolMaster||[]).find(x=>x.id===editingToolMasterId) : null;
  const displayCode = editing ? editing.code : nextToolCodePreview();
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <h3>Tool Master <span class="hint">${list.length} tools</span></h3>
      <div class="frow" style="margin-bottom:10px;">
        <button class="btn amber" onclick="toggleToolForm()">${toolFormOpen? '✕ Close Form' : (editing? '✎ Edit Tool' : '➕ Add Tool')}</button>
      </div>
      ${toolFormOpen ? `
      <div class="frow g4">
        <div><label class="fl">Tool Code</label><input id="tm_code" value="${esc(displayCode)}" disabled title="Auto-generated — not editable"></div>
        <div>
          <label class="fl">Tool Type<span class="req">*</span></label>
          <div class="frow" style="gap:6px;align-items:center;">
            <select id="tm_type_select" style="flex:1;">${toolListOptionsHtml('types', editing?editing.type:'')}</select>
            <button type="button" class="btn ghost" style="padding:4px 8px;" title="Add new Tool Type" onclick="addToolListValue('types','Tool Type')">➕</button>
          </div>
        </div>
        <div>
          <label class="fl">Tool Material<span class="req">*</span></label>
          <div class="frow" style="gap:6px;align-items:center;">
            <select id="tm_material_select" style="flex:1;">${toolListOptionsHtml('materials', editing?editing.material:'')}</select>
            <button type="button" class="btn ghost" style="padding:4px 8px;" title="Add new Tool Material" onclick="addToolListValue('materials','Tool Material')">➕</button>
          </div>
        </div>
        <div><label class="fl">Tool Size</label><input id="tm_size" placeholder="e.g. 12mm dia" value="${editing?esc(editing.size):''}"></div>
        <div><label class="fl">Make</label><input id="tm_make" placeholder="e.g. Yg, Kyocera, Taegutec" value="${editing?esc(editing.make):''}"></div>
        <div><label class="fl">Tool Specification</label><input id="tm_spec" placeholder="e.g. CNMG120408, Overall length 100mm" value="${editing?esc(editing.spec):''}"></div>
      </div>
      <button class="btn amber" onclick="saveToolMaster()">💾 ${editing?'Update':'Save'} Tool</button>
      ${editing?`<button class="btn ghost" onclick="cancelToolForm()">Cancel</button>`:''}
      ` : ''}
    </div>
    <div class="panel">
      <div class="grid-box">
        ${list.map(t=>{
          const stock = toolCurrentStock(t.id);
          return `<div class="rec-card">
            <div class="rc-title">${esc(t.code)}</div>
            <div class="rc-sub">${esc(toolDisplayName(t))}</div>
            <span class="pill rc-pill ${stock>0?'done':'fail'}">${stock>0?'In Stock':'Nil Stock'}</span>
            <div class="rc-row"><span class="k">Type</span><span class="v">${esc(t.type)||'—'}</span></div>
            <div class="rc-row"><span class="k">Material</span><span class="v">${esc(t.material)||'—'}</span></div>
            <div class="rc-row"><span class="k">Size</span><span class="v">${esc(t.size)||'—'}</span></div>
            <div class="rc-row"><span class="k">Make</span><span class="v">${esc(t.make)||'—'}</span></div>
            <div class="rc-row"><span class="k">Tool Spec</span><span class="v">${esc(t.spec)||'—'}</span></div>
            <div class="rc-row"><span class="k">Current Stock</span><span class="v">${stock}</span></div>
            <div class="rc-actions">
              <button class="btn ghost" onclick="startEditToolMaster('${t.id}')">✎ Edit</button>
              <button class="btn danger" onclick="deleteToolMaster('${t.id}')">Del</button>
            </div>
          </div>`;
        }).join('') || '<div class="empty">No tools registered yet.</div>'}
      </div>
    </div>
  `;
}
// Preview of the code that will be assigned to a new tool (does not consume the counter)
function nextToolCodePreview(){
  const n = (DB.counters && DB.counters.tl || 0) + 1;
  return 'TL-' + String(n).padStart(4,'0');
}
function saveToolMaster(){
  if(!requireAdminOffice()) return;
  const type = document.getElementById('tm_type_select').value.trim();
  const material = document.getElementById('tm_material_select').value.trim();
  if(!type||!material){ toast('Tool Type and Tool Material are required'); return; }
  const size = document.getElementById('tm_size').value.trim();
  const make = document.getElementById('tm_make').value.trim();
  const spec = document.getElementById('tm_spec').value.trim();
  if(editingToolMasterId){
    const t = (DB.toolMaster||[]).find(x=>x.id===editingToolMasterId);
    if(t){ t.type=type; t.material=material; t.size=size; t.make=make; t.spec=spec; t.name=toolDisplayName(t); }
    toast('Tool updated');
  } else {
    const code = nextToolCode();
    const rec = { id:newToolId(), code, type, material, size, make, spec };
    rec.name = toolDisplayName(rec);
    DB.toolMaster.push(rec);
    toast('Tool added — Code: '+code);
  }
  toolFormOpen=false; editingToolMasterId=null;
  saveDB(); render();
}
function deleteToolMaster(id){
  if(!requireAdminOffice()) return;
  if(!confirm('Delete this tool from the master? Its register/issue history will remain but will no longer show a tool name.')) return;
  DB.toolMaster = DB.toolMaster.filter(x=>x.id!==id);
  saveDB(); render();
}
function printToolMaster(){
  const list = toolMasterList();
  const headers = ['Code','Type','Material','Size','Make','Tool Spec','Current Stock'];
  const rows = list.map(t=>[esc(t.code), esc(t.type)||'—', esc(t.material)||'—', esc(t.size)||'—', esc(t.make)||'—', esc(t.spec)||'—', `<span class="num">${toolCurrentStock(t.id)}</span>`]);
  printReport('Tool Master', headers, rows, {barLeft:'Scope: Common Master (All Units)', barRight:`Total Tools: ${list.length}`});
}

/* ==================== FIXTURE MASTER ====================
   Every fixture is linked to a Part No (from Product Development / BOM) and an
   Operation No. The Operation No list for a part is drawn from that part's routing — i.e.
   the distinct Op Nos already used on that Part's Control Plan(s) — so the link is
   driven by real routing data as soon as a Control Plan exists for the part. Until then, the
   standard Op No sequence (10,20,30...) is offered so fixture entry is never blocked. */
function fixturePartOptionsHtml(selected){
  const seen = {}; const opts = [];
  DB.bom.forEach(b=>{
    const key = (b.finPartNo||'').trim();
    if(key && !seen[key]){ seen[key]=1; opts.push({no:key, name:b.finPartName||''}); }
  });
  opts.sort((a,b)=>a.no.localeCompare(b.no));
  return opts.map(o=>`<option value="${esc(o.no)}" data-name="${esc(o.name)}" ${selected===o.no?'selected':''}>${esc(o.no)}</option>`).join('');
}
function fixtureMasterList(){ return DB.fixtureMaster||[]; }
function newFixtureId(){ return 'fx'+Date.now()+Math.random().toString(36).slice(2,6); }
function nextFixtureCode(){
  if(!DB.counters) DB.counters={};
  DB.counters.fx = (DB.counters.fx||0) + 1;
  return 'FX-' + String(DB.counters.fx).padStart(4,'0');
}
function nextFixtureCodePreview(){
  const n = (DB.counters && DB.counters.fx || 0) + 1;
  return 'FX-' + String(n).padStart(4,'0');
}
// Operations ("routing") available for a given Finished Part No — drawn from that part's
// Control Plan(s) if any exist yet, else the standard Op No sequence as a safe fallback.
function operationsForFinPart(finPartNo){
  const key = (finPartNo||'').trim().toLowerCase();
  if(!key) return [];
  const fromCP = new Set();
  (DB.controlPlans||[]).filter(cp=>(cp.finPartNo||'').trim().toLowerCase()===key)
    .forEach(cp=>(cp.ops||[]).forEach(o=>{ if(o.opNo) fromCP.add(String(o.opNo).trim()); }));
  const list = fromCP.size ? Array.from(fromCP) : CP_OPNO_OPTIONS.slice();
  return list.sort((a,b)=>(parseFloat(a)||0)-(parseFloat(b)||0));
}
function fixtureOpNoOptionsHtml(finPartNo, selected){
  const ops = operationsForFinPart(finPartNo);
  if(!ops.length) return '<option value="">— select Part first —</option>';
  return '<option value="">— select —</option>' + ops.map(v=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(v)}</option>`).join('');
}
function onFixturePartChange(selEl){
  const finPartNo = selEl.value;
  const opSel = document.getElementById('fx_opNo_select');
  if(opSel) opSel.innerHTML = fixtureOpNoOptionsHtml(finPartNo, '');
}
function toggleFixtureForm(){ fixtureFormOpen = !fixtureFormOpen; editingFixtureId=null; render(); }
function startEditFixture(id){ fixtureFormOpen=true; editingFixtureId=id; toolsSubTab='master_fixture'; render(); }
function cancelFixtureForm(){ fixtureFormOpen=false; editingFixtureId=null; render(); }
function renderFixtureMaster(main){
  const list = fixtureMasterList().slice().reverse();
  const editing = editingFixtureId ? (DB.fixtureMaster||[]).find(x=>x.id===editingFixtureId) : null;
  const displayCode = editing ? editing.fixtureNo : nextFixtureCodePreview();
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <h3>Fixture Master <span class="hint">${list.length} fixtures</span></h3>
      <div class="frow" style="margin-bottom:10px;">
        <button class="btn amber" onclick="toggleFixtureForm()">${fixtureFormOpen? '✕ Close Form' : (editing? '✎ Edit Fixture' : '➕ Add Fixture')}</button>
      </div>
      ${fixtureFormOpen ? `
      <div class="frow g4">
        <div><label class="fl">Fixture Number</label><input id="fx_no" value="${esc(displayCode)}" disabled title="Auto-generated — not editable"></div>
        <div><label class="fl">Part Number<span class="req">*</span></label>
          <select id="fx_finPartNo_select" onchange="onFixturePartChange(this)">
            <option value="">— select —</option>${fixturePartOptionsHtml(editing?editing.finPartNo:'')}
          </select>
        </div>
        <div><label class="fl">Operation Number<span class="req">*</span> <span class="hint" style="position:static;font-size:9px;">(from that part's routing)</span></label>
          <select id="fx_opNo_select">${fixtureOpNoOptionsHtml(editing?editing.finPartNo:'', editing?editing.opNo:'')}</select>
        </div>
        <div><label class="fl">Fixture Name / Description<span class="req">*</span></label><input id="fx_name" placeholder="e.g. Drilling Fixture — Flange" value="${editing?esc(editing.name):''}"></div>
        <div style="grid-column:1/-1;"><label class="fl">Remarks</label><input id="fx_remarks" placeholder="Optional" value="${editing?esc(editing.remarks):''}"></div>
      </div>
      <button class="btn amber" onclick="saveFixtureMaster()">💾 ${editing?'Update':'Save'} Fixture</button>
      ${editing?`<button class="btn ghost" onclick="cancelFixtureForm()">Cancel</button>`:''}
      ` : ''}
    </div>
    <div class="panel">
      <div class="grid-box">
        ${list.map(f=>{
          return `<div class="rec-card">
            <div class="rc-title">${esc(f.fixtureNo)}</div>
            <div class="rc-sub">${esc(f.name)}</div>
            <div class="rc-row"><span class="k">Part</span><span class="v">${esc(f.finPartNo)}${f.finPartName?' — '+esc(f.finPartName):''}</span></div>
            <div class="rc-row"><span class="k">Op No</span><span class="v">${esc(f.opNo)||'—'}</span></div>
            <div class="rc-row"><span class="k">Remarks</span><span class="v">${esc(f.remarks)||'—'}</span></div>
            <div class="rc-actions">
              <button class="btn ghost" onclick="startEditFixture('${f.id}')">✎ Edit</button>
              <button class="btn danger" onclick="deleteFixtureMaster('${f.id}')">Del</button>
            </div>
          </div>`;
        }).join('') || '<div class="empty">No fixtures registered yet.</div>'}
      </div>
    </div>
  `;
}
function saveFixtureMaster(){
  if(!requireAdminOffice()) return;
  const partSel = document.getElementById('fx_finPartNo_select');
  const finPartNo = partSel.value.trim();
  if(!finPartNo){ toast('Part Number is required'); return; }
  const partOpt = partSel.options[partSel.selectedIndex];
  const finPartName = partOpt ? (partOpt.getAttribute('data-name')||'') : '';
  const opNo = document.getElementById('fx_opNo_select').value.trim();
  if(!opNo){ toast('Operation Number is required'); return; }
  const name = document.getElementById('fx_name').value.trim();
  if(!name){ toast('Fixture Name / Description is required'); return; }
  const remarks = document.getElementById('fx_remarks').value.trim();
  if(editingFixtureId){
    const f = (DB.fixtureMaster||[]).find(x=>x.id===editingFixtureId);
    if(f){ f.finPartNo=finPartNo; f.finPartName=finPartName; f.opNo=opNo; f.name=name; f.remarks=remarks; }
    toast('Fixture updated');
  } else {
    const fixtureNo = nextFixtureCode();
    DB.fixtureMaster.push({ id:newFixtureId(), fixtureNo, finPartNo, finPartName, opNo, name, remarks });
    toast('Fixture added — No: '+fixtureNo);
  }
  fixtureFormOpen=false; editingFixtureId=null;
  saveDB(); render();
}
function deleteFixtureMaster(id){
  if(!requireAdminOffice()) return;
  if(!confirm('Delete this fixture from the master? It will no longer be available for selection in Control Plans.')) return;
  DB.fixtureMaster = DB.fixtureMaster.filter(x=>x.id!==id);
  saveDB(); render();
}
function printFixtureMaster(){
  const list = fixtureMasterList();
  const headers = ['Fixture No.','Part No','Part Name','Op No','Fixture Name / Description','Remarks'];
  const rows = list.map(f=>[esc(f.fixtureNo), esc(f.finPartNo), esc(f.finPartName)||'—', esc(f.opNo)||'—', esc(f.name)||'—', esc(f.remarks)||'—']);
  printReport('Fixture Master', headers, rows, {barLeft:'Scope: Common Master (All Units)', barRight:`Total Fixtures: ${list.length}`});
}
// Fixtures linked to a given Finished Part + Operation No (used by Control Plan integration)
function fixturesForPartOp(finPartNo, opNo){
  const pKey = (finPartNo||'').trim().toLowerCase();
  const oKey = (opNo||'').trim();
  if(!pKey || !oKey) return [];
  return fixtureMasterList().filter(f=>(f.finPartNo||'').trim().toLowerCase()===pKey && (f.opNo||'').trim()===oKey);
}

/* ---- Tools PO (simple purchase order → receives into Tool Register) ---- */
function toggleToolPOForm(){
  toolPOFormOpen = !toolPOFormOpen;
  if(toolPOFormOpen) toolPOUnitSel = (currentUnit==='Unit-1'||currentUnit==='Unit-2') ? currentUnit : '';
  render();
}
// User picks the Unit (Unit-1/Unit-2) on the Tools PO form — mandatory first step, same pattern
// as onPOUnitChange / onSaleUnitChange.
function onToolPOUnitChange(selEl){
  toolPOUnitSel = selEl.value;
  render();
}
function newToolPOId(){ return 'tp'+Date.now()+Math.random().toString(36).slice(2,6); }
function nextToolPONo(){ return nextSeqNo(DB.toolsPO,'poNo','tpo'); }
/* ---- Tools Suppliers submodule (Tools Management) — a separate master list from the
   Purchase module's Raw Material Suppliers, for vendors who supply dies/fixtures/cutting
   tools/gauges rather than raw material. ---- */
function toolSupplierOptionsHtml(selected){
  return (DB.toolSuppliers||[]).map(s=>`<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('');
}
function renderToolSuppliers(main){
  const list = DB.toolSuppliers||[];
  const editing = editingToolSupplierId ? list.find(x=>x.id===editingToolSupplierId) : null;
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <h3>${editing?'Edit Tools Supplier':'New Tools Supplier'}</h3>
      <div class="frow g4">
        <div><label class="fl">Supplier Name</label><input id="tsName" placeholder="e.g. Precision Tools &amp; Dies Co." value="${editing?esc(editing.name):''}"></div>
        <div><label class="fl">GSTIN</label><input id="tsGstin" placeholder="33XXXXX..." value="${editing?esc(editing.gstin):''}"></div>
        <div><label class="fl">Phone</label><input id="tsPhone" placeholder="+91 ..." value="${editing?esc(editing.phone):''}"></div>
        <div><label class="fl">Contact Person</label><input id="tsContact" placeholder="Name" value="${editing?esc(editing.contact):''}"></div>
      </div>
      <div class="frow g2">
        <div><label class="fl">Email</label><input id="tsEmail" type="email" placeholder="e.g. sales@supplier.com" value="${editing?esc(editing.email):''}"></div>
        <div><label class="fl">Address</label><textarea id="tsAddress" class="addr-box" placeholder="Supplier address">${editing?esc(editing.address):''}</textarea></div>
      </div>
      <button class="btn amber" onclick="${editing?'saveEditToolSupplier()':'addToolSupplier()'}">${editing?'💾 Save Changes':'💾 Save Tools Supplier'}</button>
      ${editing?`<button class="btn ghost" onclick="cancelEditToolSupplier()">Cancel</button>`:''}
    </div>
    <div class="panel">
      <div class="section-total"><h3>Tools Suppliers <span class="hint">${list.length} total</span></h3>
      </div>
      <div class="grid-box">
        ${list.slice().reverse().map(s=>`
          <div class="rec-card">
            <div class="rc-title">${esc(s.name)}</div>
            <div class="rc-sub">🚚 Tools Supplier${s.gstin?' · '+esc(s.gstin):''}</div>
            <div class="rc-row"><span class="k">Phone</span><span class="v">${esc(s.phone)||'—'}</span></div>
            <div class="rc-row"><span class="k">Email</span><span class="v">${esc(s.email)||'—'}</span></div>
            <div class="rc-row"><span class="k">Contact</span><span class="v">${esc(s.contact)||'—'}</span></div>
            <div class="rc-row"><span class="k">Address</span><span class="v">${esc(s.address)||'—'}</span></div>
            <div class="rc-actions">
              <button class="btn small ghost" onclick="editToolSupplier('${s.id}')">Edit</button>
              <button class="btn danger" onclick="deleteToolSupplier('${s.id}')">Del</button>
            </div>
          </div>`).join('') || '<div class="empty">No tools suppliers added yet.</div>'}
      </div>
    </div>
  `;
}
function addToolSupplier(){
  const name = document.getElementById('tsName').value.trim();
  if(!name){ toast('Supplier name is required'); return; }
  DB.toolSuppliers.push({
    id:'ts'+Date.now(), name, type:'Tool Supplier',
    gstin:document.getElementById('tsGstin').value.trim(),
    phone:document.getElementById('tsPhone').value.trim(),
    email:document.getElementById('tsEmail').value.trim(),
    contact:document.getElementById('tsContact').value.trim(),
    address:document.getElementById('tsAddress').value.trim()
  });
  saveDB(); toast('Tools Supplier added'); render();
}
function editToolSupplier(id){ editingToolSupplierId = id; render(); }
function cancelEditToolSupplier(){ editingToolSupplierId = null; render(); }
function saveEditToolSupplier(){
  const s = (DB.toolSuppliers||[]).find(x=>x.id===editingToolSupplierId);
  if(!s) return;
  const name = document.getElementById('tsName').value.trim();
  if(!name){ toast('Supplier name is required'); return; }
  s.name=name; s.type = s.type||'Tool Supplier'; s.gstin=document.getElementById('tsGstin').value.trim();
  s.phone=document.getElementById('tsPhone').value.trim();
  s.email=document.getElementById('tsEmail').value.trim();
  s.contact=document.getElementById('tsContact').value.trim();
  s.address=document.getElementById('tsAddress').value.trim();
  editingToolSupplierId = null;
  saveDB(); toast('Tools Supplier updated'); render();
}
function deleteToolSupplier(id){
  if(!confirm('Delete this tool supplier?')) return;
  DB.toolSuppliers = (DB.toolSuppliers||[]).filter(x=>x.id!==id);
  saveDB(); render();
}
function printToolSuppliers(){
  const list = DB.toolSuppliers||[];
  const headers = ['Name','GSTIN','Phone','Email','Contact Person','Address'];
  const rows = list.map(s=>[esc(s.name), esc(s.gstin)||'—', esc(s.phone)||'—', esc(s.email)||'—', esc(s.contact)||'—', esc(s.address)||'—']);
  printReport('Tools Supplier Master List', headers, rows, {barRight:`Total Tools Suppliers: ${list.length}`});
}

function renderToolsPO(main){
  const list = (DB.toolsPO||[]).filter(x=>reportUnitMatch(x.unit)).slice().reverse();
  // Same mandatory-first-step Unit pattern as Purchase Order / Sales — locked to the Active Unit
  // whenever a production unit is active, otherwise Admin Office must explicitly pick one.
  const unitLocked = currentUnit==='Unit-1' || currentUnit==='Unit-2';
  if(unitLocked) toolPOUnitSel = currentUnit;
  const noUnitYet = !toolPOUnitSel;
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <h3>Tools Purchase Order <span class="hint">${list.length} orders</span></h3>
      <div class="frow" style="margin-bottom:10px;">
        <button class="btn amber" onclick="toggleToolPOForm()">${toolPOFormOpen?'✕ Close Form':'➕ Raise Tools PO'}</button>
      </div>
      ${toolPOFormOpen ? `
      <div class="frow g4">
        <div><label class="fl">Unit <span class="hint" style="position:static; color:var(--red);">*required</span></label>
          <select id="tpUnitSel" onchange="onToolPOUnitChange(this)" ${unitLocked?'disabled':''}>
            <option value="">— select Unit —</option>
            <option value="Unit-1" ${toolPOUnitSel==='Unit-1'?'selected':''}>Unit 1 (G51-I)</option>
            <option value="Unit-2" ${toolPOUnitSel==='Unit-2'?'selected':''}>Unit 2 (S-48)</option>
          </select>
          ${unitLocked?`<input type="hidden" id="tpUnitLocked" value="${esc(currentUnit)}">`:''}
        </div>
        <div style="grid-column:2/-1;"><label class="fl">Tool<span class="req">*</span></label>
          <select id="tp_tool" ${noUnitYet?'disabled':''}><option value="">${noUnitYet?'— select Unit above first —':'— select tool from Tool Master —'}</option>${noUnitYet?'':toolMasterOptionsHtml('')}</select>
        </div>
      </div>
      <div class="frow g4">
        <div><label class="fl">Quantity<span class="req">*</span></label><input id="tp_qty" type="number" min="0" ${noUnitYet?'disabled':''}></div>
        <div><label class="fl">Supplier <span class="hint" style="position:static; font-size:9px;">(from Tools Suppliers)</span></label><input id="tp_supplier" list="toolSupplierList" placeholder="Supplier name" ${noUnitYet?'disabled':''}><datalist id="toolSupplierList">${toolSupplierOptionsHtml()}</datalist></div>
        <div><label class="fl">Expected Date</label><input id="tp_expected" type="date" ${noUnitYet?'disabled':''}></div>
      </div>
      <button class="btn amber" onclick="saveToolsPO()" ${noUnitYet?'disabled':''}>💾 Save Tools PO</button>
      ` : ''}
    </div>
    <div class="panel">
      <div class="grid-box">
        ${list.map(p=>{
          const t = (DB.toolMaster||[]).find(x=>x.id===p.toolId);
          const recvOpen = receivePOId===p.id;
          return `<div class="rec-card">
            <div class="rc-title">${esc(p.poNo)}</div>
            <div class="rc-sub">${t?esc(t.code)+' — '+esc(t.name):'— deleted tool —'}</div>
            <span class="pill rc-pill ${p.status==='Received'?'done':'open'}">${p.status}</span>
            <div class="rc-row"><span class="k">Quantity</span><span class="v">${p.qty}</span></div>
            <div class="rc-row"><span class="k">Supplier</span><span class="v">${esc(p.supplier)||'—'}</span></div>
            <div class="rc-row"><span class="k">Expected Date</span><span class="v">${fmtDate(p.expectedDate)||'—'}</span></div>
            ${p.status==='Received' ? `<div class="rc-row"><span class="k">Received</span><span class="v">${p.receivedQty} on ${fmtDate(p.receivedDate)}</span></div>` : ''}
            <div class="rc-actions">
              ${p.status==='Open' ? `<button class="btn ghost" onclick="toggleReceivePO('${p.id}')">📥 Receive</button>` : ''}
              <button class="btn danger" onclick="deleteToolsPO('${p.id}')">Del</button>
            </div>
            ${recvOpen ? `
            <div class="panel" style="margin-top:10px; background:color-mix(in srgb, var(--amber) 6%, transparent);">
              <h4 style="margin:0 0 8px;">Receive Tools PO</h4>
              <div class="frow g3">
                <div><label class="fl">Receipt Date</label><input id="tprv_date_${p.id}" type="date" value="${today()}"></div>
                <div><label class="fl">Qty Received</label><input id="tprv_qty_${p.id}" type="number" min="0" value="${p.qty}"></div>
                <div><label class="fl">Supplier</label><input id="tprv_supplier_${p.id}" value="${esc(p.supplier)}"></div>
              </div>
              <button class="btn amber" onclick="receiveToolsPO('${p.id}')">💾 Confirm Receipt → Tool Register</button>
              <button class="btn ghost" onclick="toggleReceivePO('${p.id}')">Cancel</button>
            </div>` : ''}
          </div>`;
        }).join('') || '<div class="empty">No Tools Purchase Orders raised for this unit yet.</div>'}
      </div>
    </div>
  `;
}
function saveToolsPO(){
  if(!requireWorkingUnit()) return;
  if(!toolPOUnitSel){ toast('Select the Unit (Unit 1 / Unit 2) first'); return; }
  const toolId = document.getElementById('tp_tool').value;
  if(!toolId){ toast('Select a tool'); return; }
  const qty = parseFloat(document.getElementById('tp_qty').value);
  if(!qty || qty<=0){ toast('Quantity must be greater than 0'); return; }
  DB.toolsPO.push({
    id:newToolPOId(), unit:toolPOUnitSel, poNo:nextToolPONo(), toolId, qty,
    supplier: document.getElementById('tp_supplier').value.trim(),
    expectedDate: document.getElementById('tp_expected').value,
    createdDate: today(), status:'Open', receivedQty:0, receivedDate:'', receivedRegisterId:''
  });
  toolPOFormOpen=false;
  toolPOUnitSel = (currentUnit==='Unit-1'||currentUnit==='Unit-2') ? currentUnit : '';
  saveDB(); toast('Tools PO raised'); render();
}
function toggleReceivePO(id){ receivePOId = receivePOId===id ? null : id; render(); }
function receiveToolsPO(id){
  const p = (DB.toolsPO||[]).find(x=>x.id===id);
  if(!p) return;
  const qty = parseFloat(document.getElementById(`tprv_qty_${id}`).value);
  if(!qty || qty<=0){ toast('Qty Received must be greater than 0'); return; }
  const date = document.getElementById(`tprv_date_${id}`).value || today();
  const supplier = document.getElementById(`tprv_supplier_${id}`).value.trim();
  const regId = 'tr'+Date.now()+Math.random().toString(36).slice(2,6);
  DB.toolRegister.push({ id:regId, unit:p.unit, toolId:p.toolId, purchaseDate:date, supplier, qtyReceived:qty, poId:p.id });
  p.status='Received'; p.receivedQty=qty; p.receivedDate=date; p.receivedRegisterId=regId; if(supplier) p.supplier=supplier;
  receivePOId=null;
  saveDB(); toast('Tools PO received into Tool Register'); render();
}
function deleteToolsPO(id){
  if(!confirm('Delete this Tools PO record? (Any linked Tool Register receipt already made will stay in stock.)')) return;
  DB.toolsPO = DB.toolsPO.filter(x=>x.id!==id);
  saveDB(); render();
}
function printToolsPO(){
  const list = (DB.toolsPO||[]).filter(x=>reportUnitMatch(x.unit));
  const headers = ['PO No.','Tool Code','Tool Name','Qty','Supplier','Expected Date','Status'];
  const rows = list.map(p=>{
    const t = (DB.toolMaster||[]).find(x=>x.id===p.toolId);
    return [esc(p.poNo), t?esc(t.code):'—', t?esc(t.name):'—', `<span class="num">${p.qty}</span>`, esc(p.supplier)||'—', fmtDate(p.expectedDate)||'—', esc(p.status)];
  });
  printReport('Tools Purchase Orders', headers, rows, {barLeft:`Unit: ${esc(reportScopeLabel())}`, barRight:`Total Orders: ${list.length}`});
}

/* ---- Tool Register (receipts) ---- */
function toggleToolRegForm(){ toolRegFormOpen = !toolRegFormOpen; render(); }
function renderToolRegister(main){
  const list = (DB.toolRegister||[]).filter(x=>reportUnitMatch(x.unit)).slice().reverse();
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <h3>Tool Register <span class="hint">${list.length} receipts</span></h3>
      <div class="frow" style="margin-bottom:10px;">
        <button class="btn amber" onclick="toggleToolRegForm()">${toolRegFormOpen?'✕ Close Form':'➕ Add Receipt'}</button>
      </div>
      ${toolRegFormOpen ? `
      <div class="frow g4">
        <div style="grid-column:1/-1;"><label class="fl">Tool<span class="req">*</span></label>
          <select id="tr_tool"><option value="">— select tool from Tool Master —</option>${toolMasterOptionsHtml('')}</select>
        </div>
        <div><label class="fl">Purchase Date</label><input id="tr_date" type="date" value="${today()}"></div>
        <div><label class="fl">Supplier</label><input id="tr_supplier" placeholder="Supplier name"></div>
        <div><label class="fl">Quantity Received<span class="req">*</span></label><input id="tr_qty" type="number" min="0"></div>
      </div>
      <button class="btn amber" onclick="saveToolRegister()">💾 Save Receipt</button>
      ` : ''}
    </div>
    <div class="panel">
      <div class="grid-box">
        ${list.map(r=>{
          const t = (DB.toolMaster||[]).find(x=>x.id===r.toolId);
          return `<div class="rec-card">
            <div class="rc-title">${t?esc(t.code):'— deleted tool —'}</div>
            <div class="rc-sub">${t?esc(t.name):'—'}</div>
            <div class="rc-row"><span class="k">Purchase Date</span><span class="v">${fmtDate(r.purchaseDate)||'—'}</span></div>
            <div class="rc-row"><span class="k">Supplier</span><span class="v">${esc(r.supplier)||'—'}</span></div>
            <div class="rc-row"><span class="k">Qty Received</span><span class="v">${r.qtyReceived}</span></div>
            <div class="rc-row"><span class="k">Current Stock</span><span class="v">${t?toolCurrentStock(t.id):'—'}</span></div>
            <div class="rc-actions"><button class="btn danger" onclick="deleteRow('toolRegister','${r.id}')">Del</button></div>
          </div>`;
        }).join('') || '<div class="empty">No tool receipts recorded for this unit yet.</div>'}
      </div>
    </div>
  `;
}
function saveToolRegister(){
  if(!requireWorkingUnit()) return;
  const toolId = document.getElementById('tr_tool').value;
  if(!toolId){ toast('Select a tool'); return; }
  const qty = parseFloat(document.getElementById('tr_qty').value);
  if(!qty || qty<=0){ toast('Quantity Received must be greater than 0'); return; }
  DB.toolRegister.push({
    id:'tr'+Date.now()+Math.random().toString(36).slice(2,6), unit:currentUnit, toolId,
    purchaseDate: document.getElementById('tr_date').value, supplier: document.getElementById('tr_supplier').value.trim(),
    qtyReceived: qty
  });
  toolRegFormOpen=false;
  saveDB(); toast('Tool receipt saved'); render();
}
function printToolRegister(){
  const list = (DB.toolRegister||[]).filter(x=>reportUnitMatch(x.unit));
  const headers = ['Tool Code','Tool Name','Purchase Date','Supplier','Qty Received','Current Stock'];
  const rows = list.map(r=>{
    const t = (DB.toolMaster||[]).find(x=>x.id===r.toolId);
    return [t?esc(t.code):'—', t?esc(t.name):'—', fmtDate(r.purchaseDate)||'—', esc(r.supplier)||'—', `<span class="num">${r.qtyReceived}</span>`, t?`<span class="num">${toolCurrentStock(t.id)}</span>`:'—'];
  });
  printReport('Tool Register', headers, rows, {barLeft:`Unit: ${esc(reportScopeLabel())}`, barRight:`Total Receipts: ${list.length}`});
}

/* ---- Tool Issue ---- */
function toggleToolIssueForm(){ toolIssueFormOpen = !toolIssueFormOpen; render(); }
function renderToolIssue(main){
  const list = (DB.toolIssue||[]).filter(x=>reportUnitMatch(x.unit)).slice().reverse();
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <h3>Tool Issue <span class="hint">${list.length} issues</span></h3>
      <div class="frow" style="margin-bottom:10px;">
        <button class="btn amber" onclick="toggleToolIssueForm()">${toolIssueFormOpen?'✕ Close Form':'➕ Issue Tool'}</button>
      </div>
      ${toolIssueFormOpen ? `
      <div class="frow g4">
        <div style="grid-column:1/-1;"><label class="fl">Tool<span class="req">*</span></label>
          <select id="ti_tool" onchange="updateToolIssueStockHint(this)"><option value="">— select tool from Tool Master —</option>${toolMasterOptionsHtml('')}</select>
          <span class="hint" id="ti_stock_hint" style="position:static; display:block; margin-top:4px;"></span>
        </div>
        <div><label class="fl">Issue Date</label><input id="ti_date" type="date" value="${today()}"></div>
        <div><label class="fl">Machine / Operator</label><input id="ti_who" placeholder="Machine no. / Operator name"></div>
        <div><label class="fl">Quantity Issued<span class="req">*</span></label><input id="ti_qty" type="number" min="0"></div>
      </div>
      <button class="btn amber" onclick="saveToolIssue()">💾 Save Issue</button>
      ` : ''}
    </div>
    <div class="panel">
      <div class="grid-box">
        ${list.map(r=>{
          const t = (DB.toolMaster||[]).find(x=>x.id===r.toolId);
          return `<div class="rec-card">
            <div class="rc-title">${t?esc(t.code):'— deleted tool —'}</div>
            <div class="rc-sub">${t?esc(t.name):'—'}</div>
            <div class="rc-row"><span class="k">Issue Date</span><span class="v">${fmtDate(r.issueDate)||'—'}</span></div>
            <div class="rc-row"><span class="k">Machine / Operator</span><span class="v">${esc(r.machineOperator)||'—'}</span></div>
            <div class="rc-row"><span class="k">Qty Issued</span><span class="v">${r.qtyIssued}</span></div>
            <div class="rc-row"><span class="k">Balance Stock</span><span class="v">${r.balanceAfter}</span></div>
            <div class="rc-actions"><button class="btn danger" onclick="deleteRow('toolIssue','${r.id}')">Del</button></div>
          </div>`;
        }).join('') || '<div class="empty">No tool issues recorded for this unit yet.</div>'}
      </div>
    </div>
  `;
}
function updateToolIssueStockHint(sel){
  const hint = document.getElementById('ti_stock_hint');
  if(!hint) return;
  hint.textContent = sel.value ? `Current stock available: ${toolCurrentStock(sel.value)}` : '';
}
function saveToolIssue(){
  if(!requireWorkingUnit()) return;
  const toolId = document.getElementById('ti_tool').value;
  if(!toolId){ toast('Select a tool'); return; }
  const qty = parseFloat(document.getElementById('ti_qty').value);
  if(!qty || qty<=0){ toast('Quantity Issued must be greater than 0'); return; }
  const stockBefore = toolCurrentStock(toolId);
  if(qty > stockBefore){ if(!confirm(`Only ${stockBefore} in stock — issue ${qty} anyway and go negative?`)) return; }
  DB.toolIssue.push({
    id:'ti'+Date.now()+Math.random().toString(36).slice(2,6), unit:currentUnit, toolId,
    issueDate: document.getElementById('ti_date').value, machineOperator: document.getElementById('ti_who').value.trim(),
    qtyIssued: qty, balanceAfter: stockBefore - qty
  });
  toolIssueFormOpen=false;
  saveDB(); toast('Tool issue saved'); render();
}
function printToolIssue(){
  const list = (DB.toolIssue||[]).filter(x=>reportUnitMatch(x.unit));
  const headers = ['Tool Code','Tool Name','Issue Date','Machine / Operator','Qty Issued','Balance Stock'];
  const rows = list.map(r=>{
    const t = (DB.toolMaster||[]).find(x=>x.id===r.toolId);
    return [t?esc(t.code):'—', t?esc(t.name):'—', fmtDate(r.issueDate)||'—', esc(r.machineOperator)||'—', `<span class="num">${r.qtyIssued}</span>`, `<span class="num">${r.balanceAfter}</span>`];
  });
  printReport('Tool Issue History', headers, rows, {barLeft:`Unit: ${esc(reportScopeLabel())}`, barRight:`Total Issues: ${list.length}`});
}

/* ---- Reports (Current Stock + Tool Issue History) ---- */
function setToolReportView(v){ toolReportView = v; render(); }
function renderToolReports(main){
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <div class="frow" style="margin-bottom:14px;">
        <button class="btn ${toolReportView==='stock'?'amber':'ghost'}" onclick="setToolReportView('stock')">📦 Current Stock</button>
        <button class="btn ${toolReportView==='history'?'amber':'ghost'}" onclick="setToolReportView('history')">🕘 Tool Issue History</button>
      </div>
      <div id="toolReportSub"></div>
    </div>
  `;
  const sub = document.getElementById('toolReportSub');
  if(toolReportView==='history') return renderToolIssueHistoryReport(sub);
  return renderToolStockReport(sub);
}
function renderToolStockReport(sub){
  const list = toolMasterList();
  sub.innerHTML = `
    <h3>Current Stock <span class="hint">${list.length} tool(s)</span></h3>
    <div class="frow" style="margin-bottom:10px;"><button class="btn ghost" onclick="printToolMaster()">🖨 Print</button></div>
    <div class="report-table-wrap">
      <table class="report-table">
        <thead><tr><th>Tool Code</th><th>Tool Name</th><th>Type</th><th>Size / Spec</th><th>Received</th><th>Issued</th><th>Current Stock</th></tr></thead>
        <tbody>${list.length ? list.map(t=>`<tr>
          <td>${esc(t.code)}</td><td class="rt-truncate" title="${esc(t.name)}">${esc(t.name)}</td><td>${esc(t.type)||'—'}</td><td>${esc(t.spec)||'—'}</td>
          <td>${toolReceivedQty(t.id)}</td><td>${toolIssuedQty(t.id)}</td><td>${toolCurrentStock(t.id)}</td>
        </tr>`).join('') : `<tr><td colspan="7"><div class="empty">No tools registered for this unit yet.</div></td></tr>`}</tbody>
      </table>
    </div>
  `;
}
function renderToolIssueHistoryReport(sub){
  const list = (DB.toolIssue||[]).filter(x=>reportUnitMatch(x.unit)).slice().reverse();
  sub.innerHTML = `
    <h3>Tool Issue History <span class="hint">${list.length} record(s)</span></h3>
    <div class="frow" style="margin-bottom:10px;"><button class="btn ghost" onclick="printToolIssue()">🖨 Print</button></div>
    <div class="report-table-wrap">
      <table class="report-table">
        <thead><tr><th>Tool Code</th><th>Tool Name</th><th>Issue Date</th><th>Machine / Operator</th><th>Qty Issued</th><th>Balance Stock</th></tr></thead>
        <tbody>${list.length ? list.map(r=>{
          const t = (DB.toolMaster||[]).find(x=>x.id===r.toolId);
          return `<tr><td>${t?esc(t.code):'—'}</td><td class="rt-truncate" title="${t?esc(t.name):''}">${t?esc(t.name):'—'}</td><td>${fmtDate(r.issueDate)||'—'}</td><td>${esc(r.machineOperator)||'—'}</td><td>${r.qtyIssued}</td><td>${r.balanceAfter}</td></tr>`;
        }).join('') : `<tr><td colspan="6"><div class="empty">No tool issues recorded for this unit yet.</div></td></tr>`}</tbody>
      </table>
    </div>
  `;
}

/* ---------------- CALIBRATION (VIPL Gauges + Customer Gauges + Measuring Instruments) ---------------- */
const GAUGE_KINDS = {
  vipl:       { listName:'gaugesVipl',        label:'VIPL Gauges',          icon:'🏭', certAllowed:true },
  customer:   { listName:'gaugesCustomer',     label:'Customer Gauges',      icon:'🤝', certAllowed:false },
  instrument: { listName:'measuringInstruments', label:'Measuring Instruments', icon:'📏', certAllowed:true }
};
function setCalibrationSubTab(t){
  calibrationSubTab = t; calFormOpenId = null; calHistoryOpenId = null;
  render();
}
function goToToolsGaugeMaster(kind){
  previousPage = currentPage;
  currentPage='tools'; toolsSubTab='g_'+kind; toolFormOpen=false; editingToolMasterId=null; calGaugeFormOpen=false; editingGaugeId=null; render();
}
function renderCalibration(main){
  if(!subOK('calibration', calibrationSubTab)) calibrationSubTab = firstAllowedSub('calibration') || calibrationSubTab;
  main.innerHTML = `
    <div class="topbar"><div></div></div>
    <div class="subtabs" style="margin-top:12px;">
      ${Object.keys(GAUGE_KINDS).filter(k=>subOK('calibration',k)).map(k=>`<button class="${calibrationSubTab===k?'active':''}" onclick="setCalibrationSubTab('${k}')">${GAUGE_KINDS[k].icon} ${GAUGE_KINDS[k].label}</button>`).join('')}
    </div>
    <div id="calSub"></div>
  `;
  const sub = document.getElementById('calSub');
  return renderGaugeModule(sub, calibrationSubTab);
}

function gaugeList(listName){ return DB[listName]||[]; }
function latestCalibration(g){
  const cals = (g.calibrations||[]).slice().sort((a,b)=> (a.date||'') < (b.date||'') ? 1 : -1);
  return cals[0] || null;
}
function gaugeDueStatus(g){
  const last = latestCalibration(g);
  if(!last || !last.nextDue) return {label:'Not Scheduled', cls:'open'};
  if(last.nextDue < today()) return {label:'Overdue', cls:'fail'};
  const days = Math.floor((new Date(last.nextDue) - new Date(today())) / 86400000);
  if(days <= 30) return {label:`Due in ${days}d`, cls:'open'};
  return {label:'Valid', cls:'done'};
}
function newGaugeId(){ return 'gg'+Date.now()+Math.random().toString(36).slice(2,6); }
function newCalId(){ return 'gc'+Date.now()+Math.random().toString(36).slice(2,6); }
/* Instrument Name dropdown: a plain <select> (matching the same clean look as the Control Plan's
   Measuring Instrument field), with an "Other" option that reveals a manual text field. */
function gaugeNameOptionsHtml(selected){
  const opts = calibrationInstrumentNames();
  const known = opts.includes(selected);
  return opts.map(v=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(v)}</option>`).join('')
    + `<option value="__other__" ${selected&&!known?'selected':''}>Other (type manually)</option>`;
}
function toggleGaugeNameManual(sel){
  const wrap = sel.closest('.cp-char-wrap');
  const manual = wrap ? wrap.querySelector('.cpo_charNameManual') : null;
  if(!manual) return;
  if(sel.value==='__other__'){ manual.style.display='block'; manual.value=''; manual.focus(); }
  else{ manual.style.display='none'; }
}
const CAL_DEPARTMENTS = ['Quality','Production','Stores','Maintenance','Tool Room'];
function gaugeDeptOptionsHtml(selected){
  const known = CAL_DEPARTMENTS.includes(selected);
  return CAL_DEPARTMENTS.map(v=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(v)}</option>`).join('')
    + `<option value="__other__" ${selected&&!known?'selected':''}>Other (type manually)</option>`;
}
function toggleGaugeDeptManual(sel){
  const wrap = sel.closest('.cp-char-wrap');
  const manual = wrap ? wrap.querySelector('.cpo_deptManual') : null;
  if(!manual) return;
  if(sel.value==='__other__'){ manual.style.display='block'; manual.value=''; manual.focus(); }
  else{ manual.style.display='none'; }
}
const CAL_RANGES = ['0 to 25 mm','25 to 50 mm','50 to 75 mm','75 to 100 mm','0 to 150 mm','0 to 0.80mm','1 to 7mm','0.02 to 1.00mm','3" inch','0 to 300mm','1000x630mm','0 to 180°'];
function gaugeRangeOptionsHtml(selected){
  const known = CAL_RANGES.includes(selected);
  return CAL_RANGES.map(v=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(v)}</option>`).join('')
    + `<option value="__other__" ${selected&&!known?'selected':''}>Other (type manually)</option>`;
}
function toggleGaugeRangeManual(sel){
  const wrap = sel.closest('.cp-char-wrap');
  const manual = wrap ? wrap.querySelector('.cpo_rangeManual') : null;
  if(!manual) return;
  if(sel.value==='__other__'){ manual.style.display='block'; manual.value=''; manual.focus(); }
  else{ manual.style.display='none'; }
}
const CAL_MAKES = ['Mitutoyo','Baker','Gmt','Radium'];
function gaugeMakeOptionsHtml(selected){
  const known = CAL_MAKES.includes(selected);
  return CAL_MAKES.map(v=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(v)}</option>`).join('')
    + `<option value="__other__" ${selected&&!known?'selected':''}>Other (type manually)</option>`;
}
function toggleGaugeMakeManual(sel){
  const wrap = sel.closest('.cp-char-wrap');
  const manual = wrap ? wrap.querySelector('.cpo_makeManual') : null;
  if(!manual) return;
  if(sel.value==='__other__'){ manual.style.display='block'; manual.value=''; manual.focus(); }
  else{ manual.style.display='none'; }
}

const CAL_STATUSES = ['Active','Out for Calibration','Under Repair','Withdrawn/Scrapped'];
function toggleGaugeForm(){ calGaugeFormOpen = !calGaugeFormOpen; editingGaugeId = null; custGaugeRows = [emptyCustGaugeRow()]; render(); }
function startEditGauge(listName, id){
  calGaugeFormOpen = true; editingGaugeId = id;
  custGaugeRows = [emptyCustGaugeRow()];
  const kind = Object.keys(GAUGE_KINDS).find(k=>GAUGE_KINDS[k].listName===listName);
  previousPage = currentPage;
  currentPage='tools'; toolsSubTab = 'g_'+(kind||'vipl');
  render();
}
function cancelGaugeForm(){ calGaugeFormOpen = false; editingGaugeId = null; custGaugeRows = [emptyCustGaugeRow()]; render(); }
// ---- Customer Gauges multi-row entry (Add/Remove rows under one shared DC No./Date) ----
function addCustGaugeRow(){
  custGaugeRows.push(emptyCustGaugeRow());
  renderCustGaugeRowsOnly();
}
function removeCustGaugeRow(i){
  if(custGaugeRows.length<=1) return;
  custGaugeRows.splice(i,1);
  renderCustGaugeRowsOnly();
}
function renderCustGaugeRowsOnly(){
  const host = document.getElementById('custGaugeRowsBody');
  if(host) host.innerHTML = custGaugeRowsHtml();
}
function custGaugeRowsHtml(){
  return custGaugeRows.map((r,i)=>`
    <div class="frow g4" data-idx="${i}" style="align-items:flex-end; margin-bottom:6px;">
      <div><label class="fl">Customer Gauge Number${i===0?' <span class="req">*</span>':''}</label><input class="cgRowCode" placeholder="e.g. CG-014" value="${esc(r.code)}" oninput="custGaugeRows[${i}].code=this.value"></div>
      <div>${custGaugeRows.length>1?`<button class="btn danger small" type="button" onclick="removeCustGaugeRow(${i})">✕ Remove</button>`:''}</div>
    </div>`).join('');
}

/* ---- Master data form (Tool Management ONLY) — Instrument ID, Name, Type, Customer, Range,
   Least Count, Location, Department, Status, Manufacturer, Serial Number. One shared form
   works for all three registers (VIPL Gauges / Customer Gauges / Measuring Instruments). ---- */
function renderGaugeMaster(main, kind){
  const cfg = GAUGE_KINDS[kind];
  const listName = cfg.listName;
  const list = gaugeList(listName).slice().reverse();
  const editing = editingGaugeId ? (DB[listName]||[]).find(x=>x.id===editingGaugeId) : null;
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <h3>${cfg.label} — Master Data <span class="hint">${list.length} record(s)</span></h3>
      <div class="frow" style="margin-bottom:10px;">
        <button class="btn amber" onclick="toggleGaugeForm()">${calGaugeFormOpen? '✕ Close Form' : (editing? '✎ Edit Record' : '➕ Add '+cfg.label.replace(/s$/,''))}</button>
        <button class="btn ghost" onclick="printGaugeRegister('${kind}')">🖨 Print Master List</button>
      </div>
      ${calGaugeFormOpen ? (kind==='customer' ? `
      ${editing ? `
      <div class="frow g4">
        <div><label class="fl">Customer Gauge Number<span class="req">*</span></label><input id="gg_code" placeholder="e.g. CG-014" value="${esc(editing.code)}"></div>
        <div><label class="fl">DC No.</label><input id="gg_dcNo" placeholder="Delivery Challan No." value="${esc(editing.dcNo)}"></div>
        <div><label class="fl">DC Date</label><input id="gg_dcDate" type="date" value="${esc(editing.dcDate)}"></div>
      </div>
      <button class="btn amber" onclick="saveGauge('${kind}')">💾 Update Record</button>
      <button class="btn ghost" onclick="cancelGaugeForm()">Cancel</button>
      ` : `
      <div class="hint" style="position:static; margin-bottom:8px;">Enter the DC No. &amp; DC Date once, then list every Customer Gauge Number received on that same Delivery Challan below — all rows are saved together as separate gauge records sharing this DC No./Date.</div>
      <div class="frow g4">
        <div><label class="fl">DC No.</label><input id="gg_dcNo" placeholder="Delivery Challan No." value=""></div>
        <div><label class="fl">DC Date</label><input id="gg_dcDate" type="date" value="${today()}"></div>
      </div>
      <h4 style="margin:14px 0 8px;">Customer Gauge Numbers</h4>
      <div id="custGaugeRowsBody">${custGaugeRowsHtml()}</div>
      <button class="btn ghost small" style="margin-top:4px;" onclick="addCustGaugeRow()">➕ Add Another Gauge Number</button>
      <div style="margin-top:14px;">
        <button class="btn amber" onclick="saveGauge('${kind}')">💾 Save All Gauges</button>
      </div>
      `}
      ` : `
      <div class="frow g4">
        <div class="cp-char-wrap"><label class="fl">Name<span class="req">*</span></label>
          <select id="gg_name_sel" onchange="toggleGaugeNameManual(this)">
            <option value="">— select —</option>${gaugeNameOptionsHtml(editing?editing.name:'')}
          </select>
          <input id="gg_name" class="cpo_charNameManual" style="margin-top:6px; display:${(editing && editing.name && !calibrationInstrumentNames().includes(editing.name))?'block':'none'};" value="${(editing && editing.name && !calibrationInstrumentNames().includes(editing.name))?esc(editing.name):''}" placeholder="Type instrument name">
        </div>
        <div><label class="fl">Instrument ID <span class="hint" style="position:static; font-size:9.5px;">(code)</span></label><input id="gg_code" placeholder="e.g. INS-012" value="${editing?esc(editing.code):''}"></div>
        <div><label class="fl">Type</label><input id="gg_type" placeholder="e.g. Length / Hardness" value="${editing?esc(editing.type):''}"></div>
        <div><label class="fl">Serial Number</label><input id="gg_serial" placeholder="Manufacturer serial no." value="${editing?esc(editing.serialNo):''}"></div>
        <div class="cp-char-wrap"><label class="fl">Department</label>
          <select id="gg_department_sel" onchange="toggleGaugeDeptManual(this)">
            <option value="">— select —</option>${gaugeDeptOptionsHtml(editing?editing.department:'')}
          </select>
          <input id="gg_department" class="cpo_deptManual" style="margin-top:6px; display:${(editing && editing.department && !CAL_DEPARTMENTS.includes(editing.department))?'block':'none'};" value="${(editing && editing.department && !CAL_DEPARTMENTS.includes(editing.department))?esc(editing.department):''}" placeholder="Type department">
        </div>
        <div><label class="fl">Location <span class="hint" style="position:static; font-size:9.5px;">(from Machine Master)</span></label>${machineLocationPickerHtml('gg_loc_sel_'+kind,'gg_location',editing?editing.location:'','e.g. QC Lab, Shop Floor')}</div>
        <div><label class="fl">Status</label>
          <select id="gg_status">${CAL_STATUSES.map(s=>`<option ${(editing?editing.status:'Active')===s?'selected':''}>${s}</option>`).join('')}</select>
        </div>
      </div>
      <div class="frow g3">
        <div><label class="fl">Date of Purchase</label><input id="gg_purchasedate" type="date" value="${editing?esc(editing.purchaseDate):''}"></div>
        <div class="cp-char-wrap"><label class="fl">Range</label>
          <select id="gg_range_sel" onchange="toggleGaugeRangeManual(this)">
            <option value="">— select —</option>${gaugeRangeOptionsHtml(editing?editing.range:'')}
          </select>
          <input id="gg_range" class="cpo_rangeManual" style="margin-top:6px; display:${(editing && editing.range && !CAL_RANGES.includes(editing.range))?'block':'none'};" value="${(editing && editing.range && !CAL_RANGES.includes(editing.range))?esc(editing.range):''}" placeholder="Type range">
        </div>
        <div><label class="fl">Least Count</label><input id="gg_leastcount" placeholder="e.g. 0.01mm" value="${editing?esc(editing.leastCount):''}"></div>
      </div>
      <div class="frow g3">
        <div class="cp-char-wrap"><label class="fl">Manufacturer</label>
          <select id="gg_make_sel" onchange="toggleGaugeMakeManual(this)">
            <option value="">— select —</option>${gaugeMakeOptionsHtml(editing?editing.make:'')}
          </select>
          <input id="gg_make" class="cpo_makeManual" style="margin-top:6px; display:${(editing && editing.make && !CAL_MAKES.includes(editing.make))?'block':'none'};" value="${(editing && editing.make && !CAL_MAKES.includes(editing.make))?esc(editing.make):''}" placeholder="Type manufacturer">
        </div>
      </div>
      <button class="btn amber" onclick="saveGauge('${kind}')">💾 ${editing?'Update':'Save'} Record</button>
      ${editing?`<button class="btn ghost" onclick="cancelGaugeForm()">Cancel</button>`:''}
      `) : ''}
    </div>
    <div class="panel">
      <div class="grid-box">
        ${list.map(g=>renderGaugeMasterCard(g, kind)).join('') || `<div class="empty">No ${cfg.label.toLowerCase()} registered yet.</div>`}
      </div>
    </div>
  `;
}

/* ---- Characteristic ⇄ Measuring Instrument Mapping — small sub-model living under Product
   Development (its own subtab). Each Product Characteristic (from the same master list used on
   the Control Plan) can be mapped to one or more instruments from the Measuring Instruments
   master (Tools Management). Once a characteristic has a mapping here, only those instrument(s)
   appear for selection wherever that characteristic is picked on a Control Plan row (see
   cpInstrumentMasterOptions / cpInstrumentSelectHtml). ---- */
function charInstMapInstrumentChoices(){
  // Registered instruments first, then the legacy generic technique list, de-duplicated —
  // same source the Control Plan's own Measuring Instrument dropdown draws from.
  const fromMaster = (DB.measuringInstruments||[]).map(x=>(x.name||'').trim()).filter(Boolean);
  const extra = MEASURING_INSTRUMENTS.filter(n=>!fromMaster.includes(n));
  return Array.from(new Set([...fromMaster, ...extra]));
}
function toggleCharInstMapForm(){
  charInstMapFormOpen = !charInstMapFormOpen; editingCharInstMapId = null; cimCharDraft = ''; render();
}
function startEditCharInstMap(id){
  charInstMapFormOpen = true; editingCharInstMapId = id; cimCharDraft = ''; render();
}
function cancelCharInstMapForm(){ charInstMapFormOpen = false; editingCharInstMapId = null; cimCharDraft = ''; render(); }
function deleteCharInstMap(id){
  if(!confirm('Delete this Characteristic ⇄ Instrument mapping?')) return;
  DB.charInstrumentMap = (DB.charInstrumentMap||[]).filter(m=>m.id!==id);
  saveDB(); toast('Mapping deleted'); render();
}
function saveCharInstMap(){
  const charSel = document.getElementById('cim_char_sel');
  const charManual = document.getElementById('cim_char_manual');
  const charName = (charSel.value==='__other__' ? charManual.value.trim() : charSel.value.trim());
  if(!charName){ toast('Select (or type) the Product Characteristic'); return; }
  const instrumentNames = Array.from(document.querySelectorAll('.cim_inst_cb:checked')).map(cb=>cb.value);
  if(!instrumentNames.length){ toast('Select at least one Measuring Instrument to map'); return; }
  if(!DB.charInstrumentMap) DB.charInstrumentMap = [];
  const dupe = DB.charInstrumentMap.find(m=>m.id!==editingCharInstMapId && (m.charName||'').trim().toLowerCase()===charName.toLowerCase());
  if(dupe){ toast('This characteristic is already mapped — edit that entry instead'); return; }
  if(editingCharInstMapId){
    const m = DB.charInstrumentMap.find(x=>x.id===editingCharInstMapId);
    if(m){ m.charName = charName; m.instrumentNames = instrumentNames; }
    toast('Mapping updated');
  } else {
    DB.charInstrumentMap.push({id:newCharInstMapId(), charName, instrumentNames});
    toast('Mapping saved');
  }
  charInstMapFormOpen = false; editingCharInstMapId = null; cimCharDraft = '';
  saveDB(); render();
}
/* Delete a user-added Product Characteristic from the master list. Built-in (CP_CHAR_GROUPS)
   characteristics aren't stored here at all, so only custom ones can ever reach this. */
function deleteProductCharacteristic(name){
  if(!confirm('Remove "'+name+'" from Product Characteristics? Existing rows that already use it keep the name, but it will stop appearing in the dropdown.')) return;
  DB.productCharacteristics = (DB.productCharacteristics||[]).filter(n=>n!==name);
  saveDB(); toast('Removed from Product Characteristics'); render();
}
function renderCharInstMapPanel(){
  const list = (DB.charInstrumentMap||[]).slice().sort((a,b)=>(a.charName||'').localeCompare(b.charName||''));
  const editing = editingCharInstMapId ? list.find(x=>x.id===editingCharInstMapId) : null;
  const instChoices = charInstMapInstrumentChoices();
  const customChars = (DB.productCharacteristics||[]).slice().sort((a,b)=>a.localeCompare(b));
  return `
    <div class="panel">
      <h3>🏷️ Product Characteristics <span class="hint">${CP_CHAR_OPTIONS.length} built-in + ${customChars.length} custom</span></h3>
      <div class="desc" style="margin-bottom:10px;">Every characteristic typed via "Other (type manually)" on a Characteristic dropdown is auto-saved here and instantly available everywhere that dropdown appears — no refresh needed.</div>
      <div class="grid-box">
        ${customChars.length ? customChars.map(n=>`
          <div class="rec-card" style="min-width:200px;">
            <div class="rc-title">${esc(n)}</div>
            <div class="rc-sub">Custom — added by user</div>
            <div class="rc-actions">
              <button class="btn danger" onclick="deleteProductCharacteristic('${esc(n).replace(/'/g,"\\'")}')">Del</button>
            </div>
          </div>`).join('') : `<div class="empty">No custom characteristics added yet — type a new one via "Other (type manually)" on any Characteristic dropdown and it'll show up here automatically.</div>`}
      </div>
    </div>
    <div class="panel" style="margin-top:12px;">
      <h3>📐 Characteristic ⇄ Measuring Instrument Mapping <span class="hint">${list.length} mapping(s)</span></h3>
      <div class="desc" style="margin-bottom:10px;">Map each Product Characteristic to the instrument(s) allowed to measure it. Once mapped, the Control Plan's Measuring Instrument field for that characteristic will only offer the mapped instrument(s); unmapped characteristics keep showing the full instrument list.</div>
      <div class="frow" style="margin-bottom:10px;">
        <button class="btn amber" onclick="toggleCharInstMapForm()">${charInstMapFormOpen? '✕ Close Form' : (editing? '✎ Edit Mapping' : '➕ Add Mapping')}</button>
      </div>
      ${charInstMapFormOpen ? `
      <div class="frow g4">
        <div class="cp-char-wrap"><label class="fl">Product Characteristic<span class="req">*</span></label>
          <select id="cim_char_sel" onchange="cimCharSelChange(this)">
            <option value="">— select —</option>${charOptionsHtml(editing?editing.charName:cimCharDraft)}
          </select>
          <input id="cim_char_manual" class="cpo_charNameManual" style="margin-top:6px; display:${((editing?editing.charName:cimCharDraft) && !charAllOptionsFlat().includes(editing?editing.charName:cimCharDraft))?'block':'none'};" value="${((editing?editing.charName:cimCharDraft) && !charAllOptionsFlat().includes(editing?editing.charName:cimCharDraft))?esc(editing?editing.charName:cimCharDraft):''}" placeholder="Type characteristic name, then click away to save it" onblur="commitCustomCharacteristic(this)">
        </div>
      </div>
      <div style="margin-top:8px;">
        <label class="fl">Measuring Instrument(s)<span class="req">*</span> <span class="hint" style="position:static; font-size:9.5px;">(select all that apply)</span></label>
        <div class="cim-inst-toolbar">
          <span class="cim-inst-count" id="cimInstCount">${(editing?(editing.instrumentNames||[]).length:0)} selected</span>
          <button type="button" class="btn ghost" onclick="cimInstSelectAll(true)">Select All</button>
          <button type="button" class="btn ghost" onclick="cimInstSelectAll(false)">Clear</button>
        </div>
        <div class="cim-inst-grid" id="cimInstGrid">
          ${instChoices.length ? instChoices.map(n=>{ const on=(editing && (editing.instrumentNames||[]).includes(n)); return `
            <label class="cim-inst-chip ${on?'checked':''}">
              <input type="checkbox" class="cim_inst_cb" value="${esc(n)}" ${on?'checked':''} onchange="cimInstToggle(this)">
              <span class="cim-chip-check">✓</span>
              <span class="cim-chip-label">${esc(n)}</span>
            </label>`; }).join('') : `<div class="empty cim-inst-empty">No instruments registered yet — add one above first.</div>`}
        </div>
      </div>
      <button class="btn amber" style="margin-top:10px;" onclick="saveCharInstMap()">💾 ${editing?'Update':'Save'} Mapping</button>
      ${editing?`<button class="btn ghost" onclick="cancelCharInstMapForm()">Cancel</button>`:''}
      ` : ''}
    </div>
    <div class="panel">
      <div class="grid-box">
        ${list.length ? list.map(m=>`
          <div class="rec-card" style="min-width:280px;">
            <div class="rc-title">${esc(m.charName)}</div>
            <div class="rc-sub">📏 ${(m.instrumentNames||[]).map(esc).join(', ') || '—'}</div>
            <div class="rc-actions">
              <button class="btn ghost" onclick="startEditCharInstMap('${m.id}')">✎ Edit</button>
              <button class="btn danger" onclick="deleteCharInstMap('${m.id}')">Del</button>
            </div>
          </div>`).join('') : `<div class="empty">No characteristic ⇄ instrument mappings yet — unmapped characteristics show the full instrument list on the Control Plan.</div>`}
      </div>
    </div>
  `;
}
function toggleCharInstMapManual(sel){
  const wrap = sel.closest('.cp-char-wrap');
  const manual = wrap ? wrap.querySelector('.cpo_charNameManual') : null;
  if(!manual) return;
  if(sel.value==='__other__'){ manual.style.display='block'; manual.value=''; manual.focus(); }
  else{ manual.style.display='none'; }
}
/* Keeps cimCharDraft (the in-progress Product Characteristic choice for a NEW mapping) in sync
   as the user picks a normal option — so it survives the re-render that commitCustomCharacteristic
   triggers when they instead type a brand-new one via "Other". */
function cimCharSelChange(sel){
  cimCharDraft = (sel.value==='__other__') ? '' : sel.value;
  toggleCharInstMapManual(sel);
}
/* Fast-pick chip grid for Measuring Instrument(s): clicking anywhere on a chip toggles its
   checkbox (via the <label> wrap), this just syncs the visual "checked" state + live count. */
function cimInstToggle(cb){
  const chip = cb.closest('.cim-inst-chip');
  if(chip) chip.classList.toggle('checked', cb.checked);
  cimInstUpdateCount();
}
function cimInstSelectAll(on){
  document.querySelectorAll('.cim_inst_cb').forEach(cb=>{
    cb.checked = on;
    const chip = cb.closest('.cim-inst-chip');
    if(chip) chip.classList.toggle('checked', on);
  });
  cimInstUpdateCount();
}
function cimInstUpdateCount(){
  const el = document.getElementById('cimInstCount');
  if(!el) return;
  const n = document.querySelectorAll('.cim_inst_cb:checked').length;
  el.textContent = n+' selected';
}

/* Tool Management master card: full master fields + Edit/Delete. Calibration itself happens in
   the Calibration module — this just links across so nobody edits master data from there. */
function renderGaugeMasterCard(g, kind){
  const cfg = GAUGE_KINDS[kind];
  const listName = cfg.listName;
  if(kind==='customer'){
    // Simplified card for the minimal Customer Gauge model — gauge number, DC No/Date + actions.
    return `<div class="rec-card" style="min-width:280px;">
    <div class="rc-title">🆔 ${esc(g.code)||'—'}</div>
    ${(g.dcNo||g.dcDate) ? `<div class="rc-sub">📄 DC No: ${esc(g.dcNo)||'—'}${g.dcDate?' · '+fmtDate(g.dcDate):''}</div>` : ''}
    <div class="rc-actions">
      <button class="btn ghost" onclick="startEditGauge('${listName}','${g.id}')">✎ Edit</button>
      <button class="btn danger" onclick="deleteGauge('${listName}','${g.id}')">Del</button>
    </div>
  </div>`;
  }
  const last = latestCalibration(g);
  const due = gaugeDueStatus(g);
  return `<div class="rec-card" style="min-width:280px;">
    <div class="rc-title">${esc(g.name)||'—'}</div>
    <div class="rc-sub">🆔 ${esc(g.code)||'—'}${g.type?' · '+esc(g.type):''}</div>
    ${g.serialNo ? `<div class="rc-sub">🔢 S/N ${esc(g.serialNo)}</div>` : ''}
    ${(g.department||g.location) ? `<div class="rc-sub">${g.department?'🏷 '+esc(g.department):''}${g.location?' · 📍 '+esc(g.location):''}</div>` : ''}
    ${(g.range||g.leastCount||g.make) ? `<div class="rc-sub">📏 ${[g.range,g.leastCount&&('LC '+g.leastCount),g.make].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
    ${g.purchaseDate ? `<div class="rc-sub">🧾 Purchased ${fmtDate(g.purchaseDate)}</div>` : ''}
    <span class="pill rc-pill ${g.status==='Active'?'done':'open'}">${esc(g.status)||'Active'}</span>
    <span class="pill rc-pill ${due.cls}">${due.label}</span>
    <div class="rc-row"><span class="k">Last Cal.</span><span class="v">${last?fmtDate(last.date)||'—':'—'}</span></div>
    <div class="rc-row"><span class="k">Next Due</span><span class="v">${last?fmtDate(last.nextDue)||'—':'—'}</span></div>
    <div class="rc-actions">
      <button class="btn ghost" onclick="startEditGauge('${listName}','${g.id}')">✎ Edit</button>
      <button class="btn ghost" onclick="goToCalibrationFor('${kind}')">📅 Calibration →</button>
      <button class="btn danger" onclick="deleteGauge('${listName}','${g.id}')">Del</button>
    </div>
  </div>`;
}

function goToCalibrationFor(kind){
  previousPage = currentPage;
  currentPage='calibration'; calibrationSubTab=kind; render();
}

/* ---- Calibration module: read-only master info + calibration actions only. No add/edit/delete
   of the master record here — that only happens in Tool Management. ---- */
function renderGaugeModule(main, kind){
  const cfg = GAUGE_KINDS[kind];
  const listName = cfg.listName;
  const list = gaugeList(listName).slice().reverse();
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <h3 style="justify-content:space-between; text-align:left;">
        <span>${cfg.icon} ${cfg.label} <span class="hint">${list.length} ${kind==='instrument'?'instruments':'gauges'}</span></span>
      </h3>
      <div class="frow" style="text-align:left; justify-content:flex-start;">
        <button class="btn ghost" onclick="goToToolsGaugeMaster('${kind}')">🧰 Manage Master Data</button>
        <button class="btn ghost" onclick="printGaugeRegister('${kind}')">🖨 Print Register</button>
      </div>
    </div>
    <div class="gauge-grid">
      ${list.map(g=>renderGaugeCard(g, kind)).join('') || `<div class="empty">No ${cfg.label.toLowerCase()} registered yet. Add them in <a href="javascript:void(0)" onclick="goToToolsGaugeMaster('${kind}')">Tool Management</a>.</div>`}
    </div>
  `;
}

function renderGaugeCard(g, kind){
  const cfg = GAUGE_KINDS[kind];
  const listName = cfg.listName;
  const last = latestCalibration(g);
  const due = gaugeDueStatus(g);
  const histOpen = calHistoryOpenId===g.id;
  const formOpen = calFormOpenId===g.id;
  const hist = (g.calibrations||[]).slice().sort((a,b)=> (a.date||'') < (b.date||'') ? 1 : -1);
  return `<div class="gauge-card">
    <div class="gauge-card-head">
      <div>
        <div class="gc-name">${esc(g.name)||'—'}</div>
        <div class="gc-id">🆔 ${esc(g.code)||'—'}${g.type?' · '+esc(g.type):''}</div>
      </div>
      <div class="gc-pills">
        <span class="pill rc-pill ${due.cls}">${due.label}</span>
        ${last ? `<span class="pill rc-pill ${last.result==='Pass'?'pass':'fail'}">${esc(last.result)}</span>` : ''}
      </div>
    </div>
    <div class="gauge-meta">
      ${g.status ? `<span>${g.status==='Active'?'🟢':'🟠'} ${esc(g.status)}</span>` : ''}
      ${g.location ? `<span>📍 ${esc(g.location)}</span>` : ''}
    </div>
    <div class="gauge-stats">
      <div class="gs-item"><span class="gs-k">Last Cal.</span><span class="gs-v">${last?fmtDate(last.date)||'—':'—'}</span></div>
      <div class="gs-item"><span class="gs-k">Next Due</span><span class="gs-v">${last?fmtDate(last.nextDue)||'—':'—'}</span></div>
      <div class="gs-item"><span class="gs-k">Agency</span><span class="gs-v">${last?esc(last.agency)||'—':'—'}</span></div>
      <div class="gs-item"><span class="gs-k">Cert No.</span><span class="gs-v">${last?esc(last.certNo)||'—':'—'}</span></div>
    </div>
    <div class="gauge-card-actions">
      <button class="btn ${formOpen?'amber':'ghost'}" onclick="toggleCalForm('${g.id}')">📅 Calibrate</button>
      <button class="btn ${histOpen?'amber':'ghost'}" onclick="toggleHistory('${g.id}')">🕘 History (${hist.length})</button>
      <button class="btn ghost" onclick="goToToolsGaugeMaster('${kind}')">🧰 Master →</button>
    </div>
    ${formOpen ? `
    <div class="cal-form-card">
      <h4>📅 Log New Calibration</h4>
      <div class="cal-form-section">
        <div class="cfs-label">Schedule</div>
        <div class="cal-form-grid">
          <div class="ff"><label>Calibration Date</label><input id="gc_date_${g.id}" type="date" value="${today()}"></div>
          <div class="ff"><label>Due Date</label><input id="gc_next_${g.id}" type="date"></div>
          <div class="ff"><label>Result</label><select id="gc_result_${g.id}"><option>Pass</option><option>Fail</option></select></div>
        </div>
      </div>
      <div class="cal-form-section">
        <div class="cfs-label">Documentation</div>
        <div class="cal-form-grid${cfg.certAllowed?'':' g2'}">
          <div class="ff"><label>Calibration Agency</label><input id="gc_agency_${g.id}" placeholder="NABL lab / vendor"></div>
          <div class="ff"><label>Certificate No.</label><input id="gc_cert_${g.id}" placeholder="Cert reference"></div>
          ${cfg.certAllowed ? `<div class="ff"><label>Certificate File</label><input id="gc_certfile_${g.id}" type="file" accept="application/pdf,image/*" onchange="handleCertFileSelect(this)"></div>` : ''}
        </div>
      </div>
      <div class="cal-form-section">
        <div class="cfs-label">Remarks</div>
        <div class="cal-form-grid g2" style="grid-template-columns:1fr;">
          <div class="ff"><input id="gc_remarks_${g.id}" placeholder="Any remarks"></div>
        </div>
      </div>
      <div class="cal-form-actions">
        <button class="btn amber" onclick="addCalibrationEvent('${listName}','${g.id}', ${cfg.certAllowed})">💾 Save Calibration</button>
        <button class="btn ghost" onclick="toggleCalForm('${g.id}')">Cancel</button>
      </div>
    </div>` : ''}
    ${histOpen ? `
    <div class="cal-form-card" style="border-color:var(--line); background:var(--bg);">
      <h4 style="color:var(--steel);">🕘 Calibration History</h4>
      <div class="gauge-history-list">
        ${hist.length ? hist.map(c=>`
          <div class="gauge-history-item">
            <span class="gauge-history-main">
              <span class="gh-dates">${fmtDate(c.date)||'—'} → ${fmtDate(c.nextDue)||'—'}</span>
              <span class="pill rc-pill ${c.result==='Pass'?'pass':'fail'}">${esc(c.result)}</span>
              <span class="gh-agency">${esc(c.agency)||'—'}${c.certNo?' · Cert# '+esc(c.certNo):''}</span>
              ${c.remarks?`<span class="gh-remarks">"${esc(c.remarks)}"</span>`:''}
              ${c.certData?` <a href="javascript:void(0)" onclick="downloadCert('${listName}','${g.id}','${c.id}')">⬇ Cert</a>`:''}
            </span>
            <button class="btn danger" onclick="deleteCalibrationEvent('${listName}','${g.id}','${c.id}')">Del</button>
          </div>`).join('') : '<div class="empty">No calibration history yet.</div>'}
      </div>
    </div>` : ''}
  </div>`;
}

function saveGauge(kind){
  if(!requireAdminOffice()) return;
  const cfg = GAUGE_KINDS[kind];
  const listName = cfg.listName;
  // Customer Gauges are a deliberately minimal model — only a Customer Gauge Number is
  // captured and saved per record. New entries support multiple gauge numbers at once, all
  // sharing one DC No./DC Date (see custGaugeRows); editing an existing record stays single-row.
  if(kind==='customer'){
    const dcNo = document.getElementById('gg_dcNo').value.trim();
    const dcDate = document.getElementById('gg_dcDate').value.trim();
    if(editingGaugeId){
      const code = document.getElementById('gg_code').value.trim();
      if(!code){ toast('Customer Gauge Number is required'); return; }
      const g = (DB[listName]||[]).find(x=>x.id===editingGaugeId);
      if(g){ g.code = code; g.name = code; g.dcNo = dcNo; g.dcDate = dcDate; }
      toast('Record updated');
      calGaugeFormOpen=false; editingGaugeId=null;
      saveDB(); render();
      return;
    }
    // New entry: save every non-blank row as a separate gauge record, all sharing the same
    // DC No./DC Date entered once at the top of the form.
    const codes = custGaugeRows.map(r=>(r.code||'').trim()).filter(Boolean);
    if(!codes.length){ toast('Enter at least one Customer Gauge Number'); return; }
    const seen = new Set();
    const dupes = codes.filter(c=>{ const k=c.toLowerCase(); if(seen.has(k)) return true; seen.add(k); return false; });
    if(dupes.length){ toast('Duplicate Customer Gauge Number(s) in this entry: '+[...new Set(dupes)].join(', ')); return; }
    codes.forEach(code=>{
      DB[listName].push({ id:newGaugeId(), name:code, code, dcNo, dcDate, calibrations:[] });
    });
    toast(`${codes.length} gauge${codes.length>1?'s':''} added${dcNo?' under DC No. '+dcNo:''}`);
    calGaugeFormOpen=false; editingGaugeId=null; custGaugeRows=[emptyCustGaugeRow()];
    saveDB(); render();
    return;
  }
  const nameSel = document.getElementById('gg_name_sel');
  const nameManual = document.getElementById('gg_name');
  const name = (nameSel && nameSel.value==='__other__') ? nameManual.value.trim() : (nameSel ? nameSel.value : '');
  if(!name){ toast('Name is required'); return; }
  const deptSel = document.getElementById('gg_department_sel');
  const deptManual = document.getElementById('gg_department');
  const department = (deptSel && deptSel.value==='__other__') ? deptManual.value.trim() : (deptSel ? deptSel.value : '');
  const purchaseDate = document.getElementById('gg_purchasedate').value.trim();
  const rangeSel = document.getElementById('gg_range_sel');
  const rangeManual = document.getElementById('gg_range');
  const range = (rangeSel && rangeSel.value==='__other__') ? rangeManual.value.trim() : (rangeSel ? rangeSel.value : '');
  const makeSel = document.getElementById('gg_make_sel');
  const makeManual = document.getElementById('gg_make');
  const make = (makeSel && makeSel.value==='__other__') ? makeManual.value.trim() : (makeSel ? makeSel.value : '');
  const leastCount = document.getElementById('gg_leastcount').value.trim();
  const serialNo = document.getElementById('gg_serial').value.trim();
  const status = document.getElementById('gg_status').value;
  const code = document.getElementById('gg_code').value.trim();
  const typeEl = document.getElementById('gg_type');
  const type = typeEl ? typeEl.value.trim() : '';
  const location = normalizeUnitLocation(document.getElementById('gg_location').value.trim());
  if(editingGaugeId){
    const g = (DB[listName]||[]).find(x=>x.id===editingGaugeId);
    if(g){
      g.name=name; g.code=code; g.type=type; g.location=location; g.department=department;
      g.purchaseDate=purchaseDate; g.range=range; g.leastCount=leastCount; g.make=make;
      g.serialNo=serialNo; g.status=status;
    }
    toast('Record updated');
  } else {
    DB[listName].push({ id:newGaugeId(), name, code, type, location, department, purchaseDate, range, leastCount, make, serialNo, status, calibrations:[] });
    toast('Record added');
  }
  calGaugeFormOpen=false; editingGaugeId=null;
  saveDB(); render();
}
function deleteGauge(listName, id){
  if(!requireAdminOffice()) return;
  if(!confirm('Delete this record and its full calibration history?')) return;
  DB[listName] = DB[listName].filter(x=>x.id!==id);
  saveDB(); render();
}

function toggleCalForm(id){ calFormOpenId = calFormOpenId===id ? null : id; calHistoryOpenId=null; render(); }
function toggleHistory(id){ calHistoryOpenId = calHistoryOpenId===id ? null : id; calFormOpenId=null; render(); }

function handleCertFileSelect(input){
  const file = input.files && input.files[0];
  if(!file) return;
  if(file.size > 3*1024*1024){ toast('Certificate file too large — please use a file under 3MB'); input.value=''; return; }
  const reader = new FileReader();
  reader.onload = (e)=>{ input.dataset.pendingCert = e.target.result; input.dataset.pendingCertName = file.name; };
  reader.readAsDataURL(file);
}
function addCalibrationEvent(listName, gaugeId, allowCert){
  const g = (DB[listName]||[]).find(x=>x.id===gaugeId);
  if(!g) return;
  const date = document.getElementById(`gc_date_${gaugeId}`).value;
  const nextDue = document.getElementById(`gc_next_${gaugeId}`).value;
  if(!date){ toast('Calibration date required'); return; }
  const remarksEl = document.getElementById(`gc_remarks_${gaugeId}`);
  const rec = {
    id:newCalId(), date, nextDue,
    agency: document.getElementById(`gc_agency_${gaugeId}`).value.trim(),
    certNo: document.getElementById(`gc_cert_${gaugeId}`).value.trim(),
    result: document.getElementById(`gc_result_${gaugeId}`).value,
    remarks: remarksEl ? remarksEl.value.trim() : '',
    certName:'', certData:''
  };
  if(allowCert){
    const fileInput = document.getElementById(`gc_certfile_${gaugeId}`);
    if(fileInput && fileInput.dataset.pendingCert){ rec.certData = fileInput.dataset.pendingCert; rec.certName = fileInput.dataset.pendingCertName||'certificate'; }
  }
  if(!g.calibrations) g.calibrations = [];
  g.calibrations.push(rec);
  calFormOpenId = null;
  saveDB(); toast('Calibration record saved'); render();
}
function deleteCalibrationEvent(listName, gaugeId, calId){
  const g = (DB[listName]||[]).find(x=>x.id===gaugeId);
  if(!g) return;
  g.calibrations = (g.calibrations||[]).filter(c=>c.id!==calId);
  saveDB(); render();
}
function downloadCert(listName, gaugeId, calId){
  const g = (DB[listName]||[]).find(x=>x.id===gaugeId);
  const c = g && (g.calibrations||[]).find(x=>x.id===calId);
  if(!c || !c.certData){ toast('No certificate on file for this record'); return; }
  const a = document.createElement('a');
  a.href = c.certData; a.download = c.certName || ('certificate_'+calId);
  document.body.appendChild(a); a.click(); a.remove();
}
function printGaugeRegister(kind){
  const cfg = GAUGE_KINDS[kind];
  const list = gaugeList(cfg.listName);
  if(kind==='customer'){
    const headers = ['Customer Gauge Number','DC No.','DC Date'];
    const rows = list.map(g=>[esc(g.code)||'—', esc(g.dcNo)||'—', g.dcDate?fmtDate(g.dcDate):'—']);
    printReport(cfg.label+' Register', headers, rows, {barLeft:'Scope: Common Master (All Units)', barRight:`Total: ${list.length}`});
    return;
  }
  const headers = ['Instrument ID','Name','Type','Range','Least Count',
    'Location','Department','Manufacturer','Serial No.','Status','Last Cal.','Next Due','Agency','Cert No.','Result','Due Status'];
  const rows = list.map(g=>{
    const last = latestCalibration(g);
    const due = gaugeDueStatus(g);
    const base = [esc(g.code)||'—', esc(g.name)||'—', esc(g.type)||'—',
      esc(g.range)||'—', esc(g.leastCount)||'—', esc(g.location)||'—', esc(g.department)||'—', esc(g.make)||'—', esc(g.serialNo)||'—', esc(g.status)||'—'];
    return [...base, last?fmtDate(last.date)||'—':'—', last?fmtDate(last.nextDue)||'—':'—', last?esc(last.agency)||'—':'—',
      last?esc(last.certNo)||'—':'—', last?esc(last.result)||'—':'—', due.label];
  });
  printReport(cfg.label+' Calibration Register', headers, rows, {barLeft:'Scope: Common Master (All Units)', barRight:`Total: ${list.length}`});
}
