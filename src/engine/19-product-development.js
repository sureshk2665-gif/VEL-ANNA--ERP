/* ---------------- PRODUCT DEVELOPMENT ---------------- */
function setProductDevSubTab(t){ productDevSubTab = t; editingBOMId=null; editingCPId=null; cpDraft=null; cpViewId=null; editingLabourMappingId=null; charInstMapFormOpen=false; editingCharInstMapId=null; routingDraft=null; editingRoutingId=null; routingCustomerId=''; routingSearchQuery=''; render(); }
function renderProductDevelopment(main){
  if(!subOK('productDev', productDevSubTab)) productDevSubTab = firstAllowedSub('productDev') || productDevSubTab;
  main.innerHTML = `
    <div class="topbar"><div></div></div>
    <div class="subtabs" style="margin-top:12px;">
      ${subOK('productDev','bombar')?`<button class="${productDevSubTab==='bombar'?'active':''}" onclick="setProductDevSubTab('bombar')">📐 Bar Mapping</button>`:''}
      ${subOK('productDev','bomforging')?`<button class="${productDevSubTab==='bomforging'?'active':''}" onclick="setProductDevSubTab('bomforging')">📐 Forging Mapping</button>`:''}
      ${subOK('productDev','labourmap')?`<button class="${productDevSubTab==='labourmap'?'active':''}" onclick="setProductDevSubTab('labourmap')">🧰 Job Work Mapping</button>`:''}
      ${subOK('productDev','controlplan')?`<button class="${productDevSubTab==='controlplan'?'active':''}" onclick="setProductDevSubTab('controlplan')">📋 Control Plan</button>`:''}
      ${subOK('productDev','instMapping')?`<button class="${productDevSubTab==='instMapping'?'active':''}" onclick="setProductDevSubTab('instMapping')">📐 Characteristic ⇄ Instrument Mapping</button>`:''}
      ${subOK('productDev','routing')?`<button class="${productDevSubTab==='routing'?'active':''}" onclick="setProductDevSubTab('routing')">🗺️ Part Routing (Next-Stage Memory)</button>`:''}
    </div>
    <div id="productDevSub"></div>
  `;
  const sub = document.getElementById('productDevSub');
  if(productDevSubTab==='bomforging') return renderBOMMapping(sub,'FORGING');
  if(productDevSubTab==='labourmap') return renderLabourMapping(sub);
  if(productDevSubTab==='controlplan') return renderControlPlan(sub);
  if(productDevSubTab==='instMapping'){ sub.innerHTML = renderCharInstMapPanel(); return; }
  if(productDevSubTab==='routing') return renderPartRouting(sub);
  return renderBOMMapping(sub,'BAR');
}

/* ---------------- LABOUR MAPPING (submodule of Product Development) ----------------
   A single, minimal Customer + Part → Production Location mapping shared by both
   the Job Work Quotation and Job Work PO modules — no duplicate data entry. Only three fields:
   Customer Name, Part Number (filtered to that customer), Production Location. */
function labourMappingCustomerOptionsHtml(selectedCustomerId){ return custPOCustomerOptionsHtml(selectedCustomerId); }
// Finished Part list scoped to the selected customer, built ONLY from Finished Part No's
// already entered in Job Work Quotation line items (the same source used to filter Job Work PO),
// so this mapping always stays aligned with what those two modules actually use.
function labourMappingPartOptionsHtml(customerId, selectedPartNo){
  if(!customerId) return '<option value="">— select a Customer first —</option>';
  const cust = DB.customers.find(x=>x.id===customerId);
  const custKey = cust ? (cust.name||'').trim().toLowerCase() : '';
  const seen = {}; const opts = [];
  DB.labourQuotation.filter(x=>reportUnitMatch(x.unit) &&
    (x.customerId===customerId || (custKey && (x.customer||'').trim().toLowerCase()===custKey))
  ).forEach(q=>{
    (q.items||[]).forEach(it=>{
      const pn = (it.partNo||'').trim();
      if(!pn || seen[pn]) return;
      seen[pn]=1;
      opts.push(`<option value="${esc(pn)}" data-partname="${esc(it.partName)}" ${pn===selectedPartNo?'selected':''}>${esc(pn)} — ${esc(it.partName)||'—'}</option>`);
    });
  });
  if(!opts.length) return '<option value="">— no Job Work Quotation parts found for this customer —</option>';
  return '<option value="">— select part —</option>' + opts.join('');
}
function onLabourMappingCustomerChange(){
  const sel = document.getElementById('lmCustomerSel');
  const partSel = document.getElementById('lmPartSel');
  if(partSel) partSel.innerHTML = labourMappingPartOptionsHtml(sel.value, '');
}
function addLabourMapping(){
  if(!requireAdminOffice()) return;
  const custSel = document.getElementById('lmCustomerSel');
  const customerId = custSel.value;
  const customerOpt = custSel.selectedIndex>=0 ? custSel.options[custSel.selectedIndex] : null;
  const customer = customerOpt ? customerOpt.textContent : '';
  const partSel = document.getElementById('lmPartSel');
  const partOpt = partSel.selectedIndex>=0 ? partSel.options[partSel.selectedIndex] : null;
  const finPartNo = partSel.value;
  const finPartName = partOpt ? (partOpt.dataset.partname||'') : '';
  const prodLocSel = document.getElementById('lmProdLocSel');
  const prodLocInp = document.getElementById('lmProdLoc');
  const prodLocation = (prodLocSel.value==='__other__' ? prodLocInp.value : prodLocSel.value).trim();
  if(!customerId){ toast('Select a Customer Name'); return; }
  if(!finPartNo){ toast('Select the Part Number'); return; }
  if(!prodLocation){ toast('Select the Production Location'); return; }
  const dup = DB.labourMapping.find(x=>x.customerId===customerId && x.finPartNo===finPartNo);
  if(dup){ toast('A Job Work Mapping already exists for this Customer + Part — edit it instead'); return; }
  DB.labourMapping.push({ id:'lm'+Date.now(), customerId, customer, finPartNo, finPartName, prodLocation });
  saveDB(); toast('Job Work Mapping saved'); render();
}
function editLabourMapping(id){ editingLabourMappingId = id; render(); }
function cancelEditLabourMapping(){ editingLabourMappingId = null; render(); }
function saveEditLabourMapping(){
  if(!requireAdminOffice()) return;
  const rec = DB.labourMapping.find(x=>x.id===editingLabourMappingId);
  if(!rec) return;
  const custSel = document.getElementById('lmCustomerSel');
  const customerId = custSel.value;
  const customerOpt = custSel.selectedIndex>=0 ? custSel.options[custSel.selectedIndex] : null;
  const customer = customerOpt ? customerOpt.textContent : '';
  const partSel = document.getElementById('lmPartSel');
  const partOpt = partSel.selectedIndex>=0 ? partSel.options[partSel.selectedIndex] : null;
  const finPartNo = partSel.value;
  const finPartName = partOpt ? (partOpt.dataset.partname||'') : '';
  const prodLocSel = document.getElementById('lmProdLocSel');
  const prodLocInp = document.getElementById('lmProdLoc');
  const prodLocation = (prodLocSel.value==='__other__' ? prodLocInp.value : prodLocSel.value).trim();
  if(!customerId){ toast('Select a Customer Name'); return; }
  if(!finPartNo){ toast('Select the Part Number'); return; }
  if(!prodLocation){ toast('Select the Production Location'); return; }
  const dup = DB.labourMapping.find(x=>x.id!==rec.id && x.customerId===customerId && x.finPartNo===finPartNo);
  if(dup){ toast('A Job Work Mapping already exists for this Customer + Part'); return; }
  Object.assign(rec, {customerId, customer, finPartNo, finPartName, prodLocation});
  editingLabourMappingId = null;
  saveDB(); toast('Job Work Mapping updated'); render();
}
// Filters the Job Work Mapping list by Part No / Part Name (case-insensitive substring match).
function labourMappingFilteredList(){
  const key = labourMappingPartFilter.trim().toLowerCase();
  if(!key) return DB.labourMapping;
  return DB.labourMapping.filter(r=>(r.finPartNo||'').toLowerCase().includes(key) || (r.finPartName||'').toLowerCase().includes(key));
}
// Updates only the list box + count as the user types, so the search input never loses focus.
function renderLabourMappingListOnly(){
  const list = labourMappingFilteredList();
  const box = document.getElementById('labourMappingListBox'); if(box) box.innerHTML = labourMappingCardsHtml(list);
  const countEl = document.getElementById('labourMappingListCount');
  if(countEl) countEl.textContent = `${list.length} total`;
  const clearWrap = document.getElementById('labourMappingFilterClearWrap'); if(clearWrap) clearWrap.style.display = labourMappingPartFilter ? 'inline-flex' : 'none';
}
function onLabourMappingPartFilterChange(inputEl){
  labourMappingPartFilter = inputEl.value;
  renderLabourMappingListOnly();
}
function clearLabourMappingPartFilter(){
  labourMappingPartFilter = '';
  const inp = document.getElementById('labourMappingPartFilterInp'); if(inp) inp.value = '';
  renderLabourMappingListOnly();
}
function labourMappingCardsHtml(list){
  return `<div class="grid-box">
        ${list.slice().reverse().map(r=>`
          <div class="rec-card">
            <div class="rc-title">${esc(r.finPartNo)||'—'}</div>
            <div class="rc-sub">${esc(r.finPartName)||'—'}</div>
            <div class="rc-row"><span class="k">Customer</span><span class="v">${esc(custDispByName(r.customer))||'—'}</span></div>
            <div class="rc-row"><span class="k">Production Location</span><span class="v">${esc(r.prodLocation)||'—'}</span></div>
            <div class="rc-actions">
              <button class="btn small ghost" onclick="editLabourMapping('${r.id}')">Edit</button>
              <button class="btn danger" onclick="deleteRow('labourMapping','${r.id}')">Del</button>
            </div>
          </div>`).join('') || '<div class="empty">No Job Work Mappings yet — create one above.</div>'}
      </div>`;
}
function renderLabourMapping(main){
  const list = labourMappingFilteredList(); // common data — shared across all units, like Bar/Forging Mapping
  const editing = editingLabourMappingId ? DB.labourMapping.find(x=>x.id===editingLabourMappingId) : null;
  const customerVal = editing ? editing.customerId : '';
  main.innerHTML = `
    <div class="panel">
      <h3>${editing?'Edit Job Work Mapping':'New Job Work Mapping'}</h3>
      <div class="frow g3">
        <div><label class="fl">Customer Name</label>
          <select id="lmCustomerSel" onchange="onLabourMappingCustomerChange()">${labourMappingCustomerOptionsHtml(customerVal)}</select>
        </div>
        <div><label class="fl">Part Number <span class="hint" style="position:static; font-size:9.5px;">(filtered to this customer)</span></label>
          <select id="lmPartSel">${labourMappingPartOptionsHtml(customerVal, editing?editing.finPartNo:'')}</select>
        </div>
        <div><label class="fl">Production Location</label>${prodLocationPickerHtml('lmProdLocSel','lmProdLoc', editing?editing.prodLocation:'')}</div>
      </div>
      <button class="btn amber" onclick="${editing?'saveEditLabourMapping()':'addLabourMapping()'}">${editing?'💾 Save Changes':'💾 Save Job Work Mapping'}</button>
      ${editing?`<button class="btn ghost" onclick="cancelEditLabourMapping()">Cancel</button>`:''}
    </div>
    <div class="panel">
      <div class="section-total">
        <h3>Job Work Mappings <span class="hint" id="labourMappingListCount">${list.length} total</span></h3>
        <input id="labourMappingPartFilterInp" value="${esc(labourMappingPartFilter)}" placeholder="🔍 Search by Part No" oninput="onLabourMappingPartFilterChange(this)" style="max-width:200px;">
        <span id="labourMappingFilterClearWrap" style="display:${labourMappingPartFilter?'inline-flex':'none'};"><button class="btn ghost small" onclick="clearLabourMappingPartFilter()">✕ Clear</button></span>
      </div>
      <div id="labourMappingListBox">${labourMappingCardsHtml(list)}</div>
    </div>
  `;
}

/* ===== INSPECTION PARAMETERS MASTER — define characteristics once per Part No, auto-loaded into Final Inspection ===== */
function blankIPChar(){ return {name:'',spec:'',usl:'',lsl:'',method:''}; }
function getInspParamsForPart(partNo){
  const key = (partNo||'').trim().toLowerCase();
  if(!key) return null;
  return DB.inspectionParams.find(x=>(x.partNo||'').trim().toLowerCase()===key) || null;
}
/* Returns a fresh characteristics array (blank observations) ready to drop into a Final Inspection record. */
function charsFromInspParams(partNo){
  const ip = getInspParamsForPart(partNo);
  if(!ip || !ip.chars || !ip.chars.length) return null;
  return ip.chars.map(c=>({name:c.name||'',spec:c.spec||'',usl:c.usl||'',lsl:c.lsl||'',method:c.method||'',obs:['','','','',''],remark:'',auto:true}));
}

/* ===== CONTROL PLAN (APQP / IATF 16949 style) — Product Development sub-module ===== */
function blankCPOp(){
  return {opNo:'', process:'', machine:'', toolFixGauge:'', fixtureId:null, charName:'', lcl:'', ucl:'',
    measInst:'', gaugeRef:null, gaugeCardNo:'', sampleSize:'', freq:'Each Lot', controlMethod:'FOIR', reactionPlan:'', responsibility:'', sameAsPrev:false};
}
const CP_DEFAULT_REMARKS = 'Supervisor Instruction: All dimensions specified in the Listening Process must be inspected and recorded in the FOIR (First Off Inspection Report).';
function blankCPHeader(){
  return {
    id:null, cpNo:'', finPartNo:'', finPartName:'', customerId:null, customerName:'',
    materialGrade:'', drawingNo:'', revisionNo:'', pdRecordRef:'',
    effectiveDate: today(), revNo:'0', status:'Draft',
    preparedBy:'', checkedBy:'', approvedBy:'', remarks: CP_DEFAULT_REMARKS, history:[]
  };
}
/* Pull whatever is already known about a Finished Part No from the Product Development
   records (BOM mapping + Inspection Parameters) so the user only has to pick the Finished
   Part No and everything else auto-populates. */
function cpAutoLinkFromPart(partNo){
  const key = (partNo||'').trim().toLowerCase();
  if(!key) return null;
  const bom = DB.bom.find(b=>(b.finPartNo||'').trim().toLowerCase()===key);
  const ip = getInspParamsForPart(partNo);
  let lq = null, lqItem = null;
  if(!bom){
    for(const q of DB.labourQuotation){
      const it = (q.items||[]).find(x=>(x.partNo||'').trim().toLowerCase()===key);
      if(it){ lq=q; lqItem=it; break; }
    }
  }
  if(!bom && !ip && !lq) return null;
  return {
    finPartName: (bom && bom.finPartName) || (ip && ip.partName) || (lqItem && lqItem.partName) || '',
    customerId: bom ? (bom.customerId||null) : (lq ? (lq.customerId||null) : null),
    customerName: bom ? (bom.customerName||'') : (lq ? (lq.customer||'') : ''),
    pdRecordRef: bom ? bom.id : (ip ? ip.id : (lq ? lq.id : '')),
    materialGrade: materialGradeForPart(partNo)
  };
}
function openNewCP(){ editingCPId=null; cpViewId=null; cpDraft = {header:blankCPHeader(), ops:[blankCPOp()]}; render(); }
// Copy Structure — lets the user pick an already-saved Control Plan (from any Finished Part)
// and load its complete operation table (Op No, Process, Machine, Characteristics, Methods,
// Reaction Plan etc.) into the plan currently being created/edited, so a new part with the
// same or similar routing doesn't have to be built row-by-row from scratch — the user just
// reviews and tweaks whatever differs for the new part.
function cpCopyStructureOptionsHtml(excludeId){
  return DB.controlPlans
    .filter(cp=>cp.id!==excludeId && (cp.ops||[]).length)
    .map(cp=>`<option value="${cp.id}">${esc(cp.finPartNo)||'—'} — ${esc(cp.finPartName)||'—'} (${esc(cp.customerName)||'—'})</option>`)
    .join('');
}
function applyCPCopyStructure(){
  const sel = document.getElementById('cp_copyStructureSel');
  const srcId = sel ? sel.value : '';
  if(!srcId){ toast('Pick an existing Control Plan to copy first'); return; }
  const src = DB.controlPlans.find(x=>x.id===srcId);
  if(!src || !src.ops || !src.ops.length){ toast('That Control Plan has no operations to copy'); return; }
  if(!cpDraft) return;
  captureCPForm();
  cpDraft.ops = JSON.parse(JSON.stringify(src.ops));
  render();
  toast('Structure copied from '+(src.finPartNo||'selected part')+' — '+cpDraft.ops.length+' row(s). Review and adjust for the new part.');
}
function openEditCP(id){
  const cp = DB.controlPlans.find(x=>x.id===id); if(!cp) return;
  editingCPId=id; cpViewId=null;
  cpDraft = {header:JSON.parse(JSON.stringify(cp)), ops:JSON.parse(JSON.stringify(cp.ops&&cp.ops.length?cp.ops:[blankCPOp()]))};
  delete cpDraft.header.ops;
  if(cpDraft.header.remarks===undefined || cpDraft.header.remarks===null) cpDraft.header.remarks = CP_DEFAULT_REMARKS;
  render();
}
function viewCP(id){ cpViewId=id; editingCPId=null; cpDraft=null; render(); }
function closeCPView(){ cpViewId=null; render(); }
function cancelCP(){ editingCPId=null; cpDraft=null; render(); }
/* Customer picked first — filters the Finished Part No list to that customer's parts only,
   and resets any previously chosen part / material grade so stale data doesn't linger. */
function selectCPCustomer(selEl){
  if(!cpDraft) return;
  captureCPForm();
  const custId = selEl.value || null;
  const opt = selEl.options[selEl.selectedIndex];
  cpDraft.header.customerId = custId;
  cpDraft.header.customerName = custId ? (opt.textContent||'') : '';
  cpDraft.header.finPartNo = '';
  cpDraft.header.finPartName = '';
  cpDraft.header.materialGrade = '';
  cpDraft.header.pdRecordRef = '';
  render();
}
function captureCPForm(){
  if(!cpDraft) return;
  const h = cpDraft.header;
  const g = id=>{ const el=document.getElementById(id); return el ? el.value.trim() : undefined; };
  ['finPartNo','finPartName','materialGrade','drawingNo','revisionNo','pdRecordRef',
   'effectiveDate','revNo','preparedBy','checkedBy','approvedBy','remarks'].forEach(f=>{
    const v = g('cp_'+f); if(v!==undefined) h[f]=v;
  });
  const st = document.getElementById('cp_status'); if(st) h.status = st.value;
  document.querySelectorAll('.cpoprow').forEach((row,idx)=>{
    if(!cpDraft.ops[idx]) return;
    const o = cpDraft.ops[idx];
    o.opNo = row.querySelector('.cpo_opNo').value.trim();
    o.process = row.querySelector('.cpo_process').value.trim();
    const machineSel = row.querySelector('.cpo_machine');
    const machineManual = row.querySelector('.cpo_machineManual');
    o.machine = (machineSel.value==='__other__') ? (machineManual?machineManual.value.trim():'') : machineSel.value;
    o.toolFixGauge = row.querySelector('.cpo_toolFixGauge').value.trim();
    const charSel = row.querySelector('.cpo_charName');
    const charManual = row.querySelector('.cpo_charNameManual');
    o.charName = (charSel.value==='__other__') ? (charManual?charManual.value.trim():'') : charSel.value.trim();
    o.lcl = row.querySelector('.cpo_lcl').value.trim();
    o.ucl = row.querySelector('.cpo_ucl').value.trim();
    // measInst / gaugeRef are set directly on cpDraft.ops by the Gauges picker modal (selectCPGaugeModal),
    // not read from a form field here, since the Gauges cell is a search/select trigger, not an <input>.
    o.sampleSize = row.querySelector('.cpo_sampleSize').value.trim();
    o.freq = row.querySelector('.cpo_freq').value;
    o.controlMethod = row.querySelector('.cpo_controlMethod').value;
    o.reactionPlan = row.querySelector('.cpo_reactionPlan').value;
    o.responsibility = row.querySelector('.cpo_responsibility').value;
  });
}
/* + Add Inspection Row — adds another characteristic under the SAME operation. Carries over
   Op No / Process / Machine / Tool / Frequency / Control Method / Reaction Plan / Responsibility
   from the previous row, since only the characteristic itself changes. */
function cpInspectionRowFrom(prev){
  const row = blankCPOp();
  if(prev){
    row.opNo = prev.opNo;
    row.process = prev.process;
    row.machine = prev.machine;
    row.toolFixGauge = prev.toolFixGauge;
    row.fixtureId = prev.fixtureId;
    row.sampleSize = prev.sampleSize;
    row.freq = prev.freq;
    row.controlMethod = prev.controlMethod;
    row.reactionPlan = prev.reactionPlan;
    row.responsibility = prev.responsibility;
    row.sameAsPrev = true; // Op/Process/Machine/Tool/Sample Size/Freq/Method/Reaction/Responsibility
                            // unchanged — these fields stay hidden on screen for this row (see cp-card render).
  }
  return row;
}
function addCPInspectionRow(){
  captureCPForm();
  const prev = cpDraft.ops[cpDraft.ops.length-1];
  cpDraft.ops.push(cpInspectionRowFrom(prev));
  render();
}
// Insert a new characteristic/detail row right after row `idx`, within the same operation — for
// slotting a detail in mid-sequence (e.g. between S.No 2 and S.No 3) instead of only being able
// to append one at the very end of the whole Control Plan. The Serial No of every following
// detail in that operation shifts down automatically since it's computed fresh on every render.
function insertInspectionAfter(idx){
  captureCPForm();
  const prev = cpDraft.ops[idx];
  cpDraft.ops.splice(idx+1, 0, cpInspectionRowFrom(prev));
  render();
  toast('Detail inserted — Serial No renumbered automatically');
}
/* ---- Product Characteristic dropdown: a plain grouped <select> (optgroups), matching the
   same clean look as Measuring Instrument, with an "Other" option that reveals a manual field.
   Any name typed into that manual field is auto-saved to DB.productCharacteristics (see
   commitCustomCharacteristic) and shows up here immediately, under its own "Custom (Added by
   You)" group — no page refresh, no separate master-list screen needed. ---- */
function charAllGroups(){
  const customs = (DB.productCharacteristics||[]).slice().sort((a,b)=>a.localeCompare(b));
  return customs.length ? CP_CHAR_GROUPS.concat([{label:'Custom (Added by You)', items:customs}]) : CP_CHAR_GROUPS;
}
function charAllOptionsFlat(){
  return CP_CHAR_OPTIONS.concat(DB.productCharacteristics||[]);
}
function charOptionsHtml(selected){
  const known = charAllOptionsFlat().includes(selected);
  return charAllGroups().map(g=>`<optgroup label="${esc(g.label)}">${g.items.map(v=>
    `<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(v)}</option>`
  ).join('')}</optgroup>`).join('') + `<option value="__other__" ${selected&&!known?'selected':''}>Other (type manually)</option>`;
}
function toggleCharManual(sel){
  const wrap = sel.closest('.cp-char-wrap');
  const manual = wrap ? wrap.querySelector('.cpo_charNameManual') : null;
  if(!manual) return;
  if(sel.value==='__other__'){ manual.style.display='block'; manual.value=''; manual.focus(); }
  else{ manual.style.display='none'; }
}
/* Auto-save a newly typed Product Characteristic the moment the user finishes typing it
   (on blur), so it's persisted to DB.productCharacteristics and instantly available as a
   normal dropdown option — for this row and every other Characteristic dropdown in the app —
   without needing a page refresh or a separate "add to master list" step. */
function commitCustomCharacteristic(input){
  const name = (input.value||'').trim();
  if(!name) return;
  const isNew = !charAllOptionsFlat().some(v=>v.toLowerCase()===name.toLowerCase());
  if(isNew){
    if(!DB.productCharacteristics) DB.productCharacteristics = [];
    DB.productCharacteristics.push(name);
    saveDB();
    toast('"'+name+'" added to Product Characteristics');
  }
  // On the (new-mapping) Characteristic ⇄ Instrument form there's no draft record to hold this
  // typed value across a re-render, so remember it explicitly — otherwise the field the user
  // just filled in would appear to blank itself out the moment it gets auto-saved.
  if(input.id==='cim_char_manual' && !editingCharInstMapId) cimCharDraft = name;
  // Deferred so a click landing on another button right after this blur (e.g. "Save Mapping")
  // still fires against the DOM that's on-screen right now, instead of it being swapped out
  // mid-click by this re-render.
  setTimeout(()=>{ captureCPForm(); render(); }, 0);
}
/* ---- Operation Number auto-sequencing ----
   Op groups are runs of consecutive rows sharing one operation (a lead row with
   sameAsPrev=false, followed by zero or more sameAsPrev=true "same operation" rows for
   extra characteristics). These helpers let a new operation be inserted anywhere in that
   sequence — between OP20 and OP40, say — while automatically keeping every Op No in
   correct ascending order, renumbering later operations only if there's no room otherwise. */
function cpGroupBounds(anyIdxInGroup){
  let s = anyIdxInGroup;
  while(s>0 && cpDraft.ops[s].sameAsPrev) s--;
  let e = s;
  while(e+1 < cpDraft.ops.length && cpDraft.ops[e+1].sameAsPrev) e++;
  return {start:s, end:e};
}
function cpOperationGroups(){
  const groups = [];
  let i = 0;
  while(i < cpDraft.ops.length){
    const b = cpGroupBounds(i);
    groups.push(b);
    i = b.end+1;
  }
  return groups;
}
// Shift the Op No of the group starting at rowIdx, and every group after it, up by `amount` —
// used when inserting a new operation leaves no numeric gap to fit into.
function cpShiftOpNosFrom(rowIdx, amount){
  let i = rowIdx;
  while(i < cpDraft.ops.length){
    const b = cpGroupBounds(i);
    const newNo = (parseInt(cpDraft.ops[b.start].opNo,10)||0) + amount;
    for(let k=b.start;k<=b.end;k++) cpDraft.ops[k].opNo = String(newNo);
    i = b.end+1;
  }
}
// Insert a brand-new, blank operation immediately after the operation group that row `idx`
// belongs to. Its Op No is auto-assigned as "previous Op No + 1"; if that collides with (or
// exceeds) the next operation's Op No, every operation from there onward is shifted up by 1
// first, so the whole sequence stays strictly ascending automatically — e.g. 1, 2, 4 →
// inserting after OP2 gives OP3 with no shift needed; 1, 2, 3 → inserting after OP2
// shifts the old OP3 to OP4 and the new operation becomes OP3.
function insertOperationAfter(idx){
  captureCPForm();
  const b = cpGroupBounds(idx);
  const prevNo = parseInt(cpDraft.ops[b.start].opNo,10) || 0;
  let newOpNo = prevNo + 1;
  if(b.end+1 < cpDraft.ops.length){
    const nb = cpGroupBounds(b.end+1);
    const nextNo = parseInt(cpDraft.ops[nb.start].opNo,10) || 0;
    if(nextNo && newOpNo >= nextNo) cpShiftOpNosFrom(nb.start, 1);
  }
  const row = blankCPOp();
  row.opNo = String(newOpNo);
  cpDraft.ops.splice(b.end+1, 0, row);
  render();
  toast('Operation '+newOpNo+' inserted — sequence renumbered to stay in order');
}
/* + Add Operation Row — starts a brand-new operation: a fully blank row with no carried-over
   values, for when the next row is a different process/operation altogether. Its Op No is
   auto-assigned as the next number after the last existing operation (1,2,3...). */
function addCPOpRow(){
  captureCPForm();
  const groups = cpOperationGroups();
  const lastNo = groups.length ? (parseInt(cpDraft.ops[groups[groups.length-1].start].opNo,10)||0) : 0;
  const row = blankCPOp();
  row.opNo = String(lastNo + 1);
  cpDraft.ops.push(row);
  render();
}
function cpToggleRowFields(idx){
  captureCPForm();
  if(cpDraft.ops[idx]) cpDraft.ops[idx].sameAsPrev = false;
  render();
}
function removeCPOpRow(idx){ captureCPForm(); if(cpDraft.ops.length>1) cpDraft.ops.splice(idx,1); render(); }
function machineTypeKnown(val){
  const seen = {};
  DB.machines.forEach(m=>{ const t=(m.type||'').trim(); if(t) seen[t]=1; });
  if(!Object.keys(seen).length){ ['CNC','VMC'].forEach(t=>seen[t]=1); }
  return !!seen[val];
}
function machineTypeOptionsHtml(selected){
  const seen = {}; const types = [];
  DB.machines.forEach(m=>{ const t=(m.type||'').trim(); if(t && !seen[t]){ seen[t]=1; types.push(t); } });
  if(!types.length) ['CNC','VMC'].forEach(t=>types.push(t));
  const known = types.includes(selected);
  return types.map(t=>`<option value="${esc(t)}" ${selected===t?'selected':''}>${esc(t)}</option>`).join('')
    + `<option value="__other__" ${selected&&!known?'selected':''}>Others (type manually)</option>`;
}
function toggleMachineManual(sel){
  const wrap = sel.closest('.cp-machine-wrap');
  const manual = wrap ? wrap.querySelector('.cpo_machineManual') : null;
  if(!manual) return;
  if(sel.value==='__other__'){ manual.style.display='block'; manual.value=''; manual.focus(); }
  else{ manual.style.display='none'; }
}
const CP_STANDARD_FIXTURES = ['2 Jaw Chuck','3 Jaw Chuck','Collet Chuck'];
function toolOptionsHtml(){
  const fromMaster = (DB.toolMaster||[]).map(t=>t.name).filter(Boolean);
  const names = CP_STANDARD_FIXTURES.concat(fromMaster.filter(n=>!CP_STANDARD_FIXTURES.includes(n)));
  return names.map(n=>`<option value="${esc(n)}">`).join('');
}
const CP_PROCESS_OPTIONS = ['Receiving Inspection','Machining Process','Final Inspection','Packing'];
function processOptionsHtml(selected){
  return CP_PROCESS_OPTIONS.map(v=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(v)}</option>`).join('');
}
const CP_OPNO_OPTIONS = Array.from({length:30},(_,i)=>String(i+1)); // 1,2,3...30
function opNoOptionsHtml(selected){
  // Merge in any Op No values already in use on the current draft (auto-sequencing can push a
  // value past 200 after repeated inserts) so the dropdown always has the row's real value.
  const used = (cpDraft && cpDraft.ops) ? cpDraft.ops.map(o=>o.opNo).filter(Boolean) : [];
  const all = Array.from(new Set(CP_OPNO_OPTIONS.concat(used))).sort((a,b)=>(parseInt(a,10)||0)-(parseInt(b,10)||0));
  return all.map(v=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(v)}</option>`).join('');
}
/* Control Plan ⇄ Fixture Master link: for the Finished Part No on the Control Plan header and
   the Op No picked on this row, list only the Fixture Master entries registered against that
   exact Part + Operation — eliminating duplicate/free-typed fixture entry and keeping fixture
   selection traceable back to Product Development → Routing → Fixture Master. */
function cpFixtureSelectHtml(finPartNo, opNo, selectedFixtureId){
  const opts = (typeof fixturesForPartOp==='function') ? fixturesForPartOp(finPartNo, opNo) : [];
  if(!finPartNo || !opNo) return '<option value="">— select Op No first —</option>';
  if(!opts.length) return '<option value="">— no fixture registered for this Op —</option>';
  return '<option value="">— none —</option>' + opts.map(f=>`<option value="${f.id}" ${selectedFixtureId===f.id?'selected':''}>${esc(f.fixtureNo)} — ${esc(f.name)}</option>`).join('');
}
function cpSelectFixture(idx, selEl){
  if(!cpDraft || !cpDraft.ops[idx]) return;
  captureCPForm();
  const o = cpDraft.ops[idx];
  const fid = selEl.value || null;
  o.fixtureId = fid;
  if(fid){
    const f = (DB.fixtureMaster||[]).find(x=>x.id===fid);
    if(f) o.toolFixGauge = f.fixtureNo + ' — ' + f.name;
  }
  render();
}
// Re-populate the Fixture dropdown for a row when its Op No changes (keeps the fixture list
// scoped to the Finished Part + Operation actually selected on that row).
function cpRefreshFixtureOptions(idx){
  captureCPForm();
  const row = document.querySelectorAll('.cpoprow')[idx];
  if(!row || !cpDraft) return;
  const opNo = row.querySelector('.cpo_opNo').value.trim();
  if(cpDraft.ops[idx]) cpDraft.ops[idx].opNo = opNo;
  const fixSel = row.querySelector('.cpo_fixtureSel');
  if(fixSel) fixSel.innerHTML = cpFixtureSelectHtml(cpDraft.header.finPartNo, opNo, cpDraft.ops[idx]?cpDraft.ops[idx].fixtureId:null);
}
const MEASURING_INSTRUMENTS = [
  'Vernier Caliper','Digital Height Gauge','Depth Gauge','Depth Micrometer','Micrometer',
  'Dial Indicator','Lever Dial Gauge','Plain Plug Gauge (GO)','Plain Plug Gauge (NO GO)',
  'Thread Plug Gauge','Thread Ring Gauge','Ring Gauge','Air Plug Gauge','Air Ring Gauge',
  'Feeler Gauge','Radius Gauge','Taper Gauge','Gap Gauge','Surface Plate','Bevel Protractor',
  'Try Square','Profile Projector','CMM (Coordinate Measuring Machine)',
  'Surface Roughness Tester (Ra Tester)','Contour Measuring Instrument','Rockwell Hardness Tester',
  'Brinell Hardness Tester','Vickers Hardness Tester','Coating Thickness Gauge','Visual Check'
];
function calibrationInstrumentNames(){
  // Pull instrument/gauge names registered in the Calibration module (VIPL + Customer gauges +
  // Measuring Instruments, current unit), de-duplicated, calibration-register ones first.
  const fromVipl = (DB.gaugesVipl||[]).map(x=>(x.name||'').trim()).filter(Boolean);
  const fromCust = (DB.gaugesCustomer||[]).map(x=>(x.name||'').trim()).filter(Boolean);
  const fromInst = (DB.measuringInstruments||[]).map(x=>(x.name||'').trim()).filter(Boolean);
  const merged = Array.from(new Set([...fromVipl, ...fromCust, ...fromInst, ...MEASURING_INSTRUMENTS]));
  return merged;
}
function goToCalibrationModule(){
  previousPage = currentPage;
  currentPage='tools'; toolsSubTab='g_vipl'; reportModuleOpen=null; render();
}

/* ---- Control Plan "Measuring Instrument" / "Gauge" fields ----
   Two separate master lists, two separate dropdowns:
     • Measuring Instruments (Tools Management measuringInstruments master, + legacy generic
       techniques for old data) — only the Instrument Name is shown/printed.
     • Gauges (VIPL Gauges + Customer Gauges, combined) — the Gauge Name AND its Gauge Card
       Number (Gauge ID) are auto-linked from the master and shown/printed; nothing is typed.
   Picking one clears the other, since a characteristic is measured with either an instrument
   or a gauge, never entered as free text. */
// ---- Characteristic ⇄ Measuring Instrument mapping (sub-model under Tools Management →
//      Measuring Instruments). Once a Product Characteristic is mapped to one or more
//      instruments there, the Control Plan's Measuring Instrument field for a row using that
//      characteristic is restricted to only those mapped instruments. Characteristics with no
//      mapping saved yet fall back to the full instrument master, so nothing already in use
//      breaks. ----
function newCharInstMapId(){ return 'cim'+Date.now()+Math.random().toString(36).slice(2,6); }
function charInstMapFor(charName){
  const c = (charName||'').trim();
  if(!c) return null;
  return (DB.charInstrumentMap||[]).find(m=>(m.charName||'').trim().toLowerCase()===c.toLowerCase()) || null;
}
function instrumentNamesForChar(charName){
  const m = charInstMapFor(charName);
  return m ? (m.instrumentNames||[]).filter(Boolean) : null; // null = no mapping, i.e. show everything
}
function cpInstrumentMasterOptions(charName){
  // Registered Measuring Instruments first, then legacy generic techniques (for old rows /
  // instruments not yet in the master) not already covered by name.
  const fromMaster = (DB.measuringInstruments||[]).map(x=>(x.name||'').trim()).filter(Boolean);
  const extra = MEASURING_INSTRUMENTS.filter(n=>!fromMaster.includes(n));
  const mapped = instrumentNamesForChar(charName);
  if(mapped && mapped.length){
    // Restrict to the instruments mapped against this characteristic only.
    return { master: Array.from(new Set(fromMaster.filter(n=>mapped.includes(n)))), other: extra.filter(n=>mapped.includes(n)) };
  }
  return { master: Array.from(new Set(fromMaster)), other: extra };
}
function cpGaugeMasterOptions(){
  const vipl = (DB.gaugesVipl||[]).map(x=>({listName:'gaugesVipl', id:x.id, name:x.name||'(unnamed)', code:x.code||''}));
  const cust = (DB.gaugesCustomer||[]).map(x=>({listName:'gaugesCustomer', id:x.id, name:x.name||'(unnamed)', code:x.code||''}));
  return { vipl, cust };
}
function cpInstrumentSelectHtml(o){
  const opts = cpInstrumentMasterOptions(o.charName);
  const selected = (!o.gaugeRef && o.measInst) ? o.measInst : '';
  const known = [...opts.master, ...opts.other];
  const legacyExtra = selected && !known.includes(selected) ? `<option value="${esc(selected)}" selected>${esc(selected)}</option>` : '';
  return `<option value="">— none —</option>
    ${legacyExtra}
    ${opts.master.length ? `<optgroup label="Measuring Instruments (master)">${opts.master.map(n=>`<option value="${esc(n)}" ${selected===n?'selected':''}>${esc(n)}</option>`).join('')}</optgroup>` : ''}
    ${opts.other.length ? `<optgroup label="Other Techniques">${opts.other.map(n=>`<option value="${esc(n)}" ${selected===n?'selected':''}>${esc(n)}</option>`).join('')}</optgroup>` : ''}
    ${(!opts.master.length && !opts.other.length) ? `<option value="" disabled>— no instrument mapped for this characteristic —</option>` : ''}`;
}
// Re-populate the Measuring Instrument dropdown for a row when its Product Characteristic
// changes, so the options list is immediately scoped to whatever is mapped for the newly
// picked characteristic (mirrors cpRefreshFixtureOptions for the Fixture field).
function cpRefreshInstrumentOptions(idx){
  captureCPForm();
  const row = document.querySelectorAll('.cpoprow')[idx];
  if(!row || !cpDraft || !cpDraft.ops[idx]) return;
  const o = cpDraft.ops[idx];
  const instSel = row.querySelector('.cpo_measInstSel');
  if(!instSel) return;
  // If the currently selected instrument is no longer valid for this characteristic, clear it.
  const mapped = instrumentNamesForChar(o.charName);
  if(mapped && mapped.length && o.measInst && !mapped.includes(o.measInst) && !o.gaugeRef){
    o.measInst = '';
  }
  instSel.innerHTML = cpInstrumentSelectHtml(o);
}
function cpGaugeSelectHtml(o){
  const opts = cpGaugeMasterOptions();
  const selectedKey = o.gaugeRef ? (o.gaugeRef.listName+'|'+o.gaugeRef.id) : '';
  return `<option value="">— none —</option>
    ${opts.vipl.length ? `<optgroup label="VIPL Gauges">${opts.vipl.map(g=>`<option value="${g.listName}|${g.id}" ${selectedKey===g.listName+'|'+g.id?'selected':''}>${esc(g.name)}${g.code?' — '+esc(g.code):''}</option>`).join('')}</optgroup>` : ''}
    ${opts.cust.length ? `<optgroup label="Customer Gauges">${opts.cust.map(g=>`<option value="${g.listName}|${g.id}" ${selectedKey===g.listName+'|'+g.id?'selected':''}>${esc(g.name)}${g.code?' — '+esc(g.code):''}</option>`).join('')}</optgroup>` : ''}`;
}
function cpSelectInstrument(idx, sel){
  captureCPForm();
  const o = cpDraft.ops[idx]; if(!o) return;
  o.measInst = sel.value;
  o.gaugeRef = null; o.gaugeCardNo = '';
  render();
}
function cpSelectGauge(idx, sel){
  captureCPForm();
  const o = cpDraft.ops[idx]; if(!o) return;
  if(!sel.value){ o.gaugeRef = null; o.gaugeCardNo = ''; render(); return; }
  const [listName, id] = sel.value.split('|');
  const rec = (DB[listName]||[]).find(x=>x.id===id);
  if(rec){
    o.measInst = rec.name;
    o.gaugeRef = {listName, id};
    o.gaugeCardNo = rec.code||'';
  }
  render();
}
const REACTION_PLANS = [
  'Segregate & Inform QA','Stop Process & Inform Supervisor','100% Inspection',
  'Rework Part','Reject & Replace','Adjust Process Parameters','Recalibrate Gauge / Instrument',
  'Containment & Root Cause Analysis','Hold Lot for Disposition'
];
function reactionPlanOptionsHtml(selected){
  return REACTION_PLANS.map(v=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(v)}</option>`).join('');
}
const RESPONSIBILITY_ROLES = [
  'Operator','Quality Inspector','QA Engineer','Production Supervisor','Shift Incharge',
  'Process Engineer','Quality Manager','Setter'
];
function responsibilityOptionsHtml(selected){
  return RESPONSIBILITY_ROLES.map(v=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(v)}</option>`).join('');
}
/* Control Plan sign-off names — Prepared By / Checked By / Approved By are picked from this
   fixed list rather than typed freehand. */
const CP_APPROVER_NAMES = [
  'R.DINAKARAN','A.PRAVEENKUMAR','T.NAGALAKSHMI','C.VELMURUGAN'
];
function cpApproverOptionsHtml(selected){
  const opts = CP_APPROVER_NAMES.slice();
  if(selected && !opts.includes(selected)) opts.push(selected); // preserve legacy/free-typed values already saved
  return opts.map(v=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(v)}</option>`).join('');
}
function saveCP(){
  if(!requireAdminOffice()) return;
  captureCPForm();
  const h = cpDraft.header;
  if(!h.customerId && !h.customerName){ toast('Select the Customer first'); return; }
  if(!h.finPartNo){ toast('Pick the Part Number first'); return; }
  const ops = cpDraft.ops.filter(o=>o.process.trim()!=='' || o.charName.trim()!=='');
  if(!ops.length){ toast('Add at least one operation / characteristic row'); return; }
  for(const o of ops){
    if(!o.charName.trim()){ toast('Enter the Product Characteristic for every row'); return; }
    if(!o.lcl.trim()){ toast('Enter LCL for every row'); return; }
    if(!o.ucl.trim()){ toast('Enter UCL for every row'); return; }
    if(!o.measInst){ toast('Select a Gauge / Measuring Instrument for every operation row'); return; }
    if(!o.sampleSize.trim()){ toast('Enter Sample Size for every operation row'); return; }
    if(!o.freq){ toast('Select an Inspection Frequency for every operation row'); return; }
    if(!o.controlMethod){ toast('Select a Control Method for every operation row'); return; }
  }
  ops.forEach((o,i)=>{ if(!o.opNo) o.opNo = String(i+1); });
  const byName = currentUser ? currentUser.name : '';
  if(editingCPId){
    const cp = DB.controlPlans.find(x=>x.id===editingCPId);
    const revChanged = cp.revNo!==h.revNo || cp.status!==h.status;
    Object.assign(cp, h, {ops});
    if(revChanged) cp.history.push({date:today(), revNo:cp.revNo, status:cp.status, by:byName, note:'Revised / status updated'});
    toast('Control Plan updated');
  }else{
    const cpNo = h.cpNo || nextSeqNo(DB.controlPlans,'cpNo','cp');
    const rec = Object.assign({}, h, {id:'cp'+Date.now(), cpNo, ops,
      history:[{date:today(), revNo:h.revNo, status:h.status, by:byName, note:'Created'}]});
    DB.controlPlans.push(rec);
    toast('Control Plan saved');
  }
  editingCPId=null; cpDraft=null;
  saveDB(); render();
}
function setCPFieldStatusOnly(id, status){
  if(!requireAdminOffice()) return;
  const cp = DB.controlPlans.find(x=>x.id===id); if(!cp) return;
  cp.status = status;
  cp.history.push({date:today(), revNo:cp.revNo, status, by:currentUser?currentUser.name:'', note:'Status changed to '+status});
  saveDB(); toast('Status set to '+status); render();
}
const CP_CHAR_GROUPS = [
  {label:'Dimensional', items:['Length','Outside Diameter (OD)','Inside Diameter (ID)','Bore Diameter','Thickness','Width','Height','Thread Size','Pitch Diameter','Chamfer','Radius','Groove Width','Groove Depth','Hole Diameter','Hole Position','Centre Distance (PCD)','Slot Width','Slot Length','Angle']},
  {label:'Surface & Material', items:['Surface Finish (Ra)','Hardness (HRC/HB)','Heat Treatment','Coating / Plating']},
  {label:'Geometric (GD&T)', items:['Flatness','Parallelism','Perpendicularity','Concentricity','Circular Runout','Total Runout','Position','Straightness','Roundness','Cylindricity']},
  {label:'Visual / Other', items:['Weight','Burr Free','Crack Free','Visual Appearance','Part Marking','Cleanliness','Packing Requirement']}
];
const CP_CHAR_OPTIONS = CP_CHAR_GROUPS.flatMap(g=>g.items);
const CP_HEADERS = ['Op No','Process','Machine Type','Tool / Fixture / Gauge','S.No','Product Characteristic','LCL','UCL',
  'Measuring Instrument','Gauge Card No.','Sample Size','Inspection Frequency','Control Method','Reaction Plan','Responsibility'];
// Per-operation Serial No for print only — restarts at 1 for every operation (Op No/Process/
// Machine/Tool block) and increments for each characteristic/detail row underneath it, giving
// a simple, stable reference like "OP20, S.No 3" to point to on the printed sheet.
function cpPrintSerials(ops){
  ops = ops||[];
  const opKey = o=>[o.opNo,o.process,o.machine,o.toolFixGauge].join('\u0001');
  let n = 0, prevKey = null;
  return ops.map(o=>{
    const k = opKey(o);
    n = (k===prevKey) ? n+1 : 1;
    prevKey = k;
    return n;
  });
}
function cpRowsForPrint(cp){
  const serials = cpPrintSerials(cp.ops||[]);
  return (cp.ops||[]).map((o,i)=>[o.opNo,o.process,o.machine,o.toolFixGauge,serials[i],o.charName,o.lcl,o.ucl,
    o.measInst,o.gaugeCardNo,o.sampleSize,o.freq,o.controlMethod,o.reactionPlan,o.responsibility]
    .map(v=>esc(v||'—')));
}
/* Returns a rowspan array: consecutive ops sharing the same keyFn(op) result are merged into
   one span, so repeating "common" values (e.g. whole Operation block, or Reaction Plan within
   an operation) render as a single merged cell instead of repeating on every characteristic row. */
function cpGroupSpans(ops, keyFn){
  const spans = ops.map(()=>1);
  for(let i=ops.length-2;i>=0;i--){
    if(keyFn(ops[i])===keyFn(ops[i+1])){ spans[i]+=spans[i+1]; spans[i+1]=0; }
  }
  return spans;
}
const CP_PRINT_CSS = `
  table{ table-layout:fixed; }
  table th, table td{ text-align:center; vertical-align:middle; padding:5px 5px; font-size:9.5px; line-height:1.35; }
  thead tr.grp th{ font-size:9px; letter-spacing:0.5px; padding:5px; }
  thead tr.fld th{ font-size:8px; padding:5px 4px; }
  thead tr.grp th.g-op{ background:#8a5a12; color:#fff; }
  thead tr.grp th.g-ch{ background:#2e7d4f; color:#fff; }
  thead tr.grp th.g-me{ background:#2f6690; color:#fff; }
  thead tr.grp th.g-re{ background:#555; color:#fff; }
  thead tr.fld th{ background:var(--ink); }
  td.opCell{ font-weight:600; background:#faf6ee; }
  td.reactCell{ background:#f5f5f5; }
  td.sno{ font-weight:700; background:#f0f4f7; color:#1f5673; }
  td.char{ font-weight:600; text-align:left; }
  /* Explicit column widths (sum 100%) so all 15 columns fit cleanly on A4 landscape
     without overlapping or being cut off. */
  col.c-opno{ width:3.5%; } col.c-process{ width:7.5%; } col.c-machine{ width:6.5%; }
  col.c-tool{ width:8.5%; } col.c-sno{ width:3%; } col.c-char{ width:9.5%; } col.c-lcl{ width:4.5%; } col.c-ucl{ width:4.5%; }
  col.c-instr{ width:8.5%; } col.c-card{ width:5.5%; } col.c-sample{ width:4.5%; } col.c-freq{ width:7%; }
  col.c-method{ width:5.5%; } col.c-react{ width:9.5%; } col.c-resp{ width:8.5%; }
`;
const CP_PRINT_COLGROUP = `<colgroup>
  <col class="c-opno"><col class="c-process"><col class="c-machine"><col class="c-tool">
  <col class="c-sno"><col class="c-char"><col class="c-lcl"><col class="c-ucl">
  <col class="c-instr"><col class="c-card"><col class="c-sample"><col class="c-freq"><col class="c-method">
  <col class="c-react"><col class="c-resp">
</colgroup>`;
/* Two-tier grouped header for the printed Control Plan. */
function cpPrintTheadHtml(){
  return `<tr class="grp">
      <th class="g-op" colspan="4">Operation</th>
      <th class="g-ch" colspan="4">Product Characteristic</th>
      <th class="g-me" colspan="5">Methods</th>
      <th class="g-re" colspan="2">Reaction</th>
    </tr>
    <tr class="fld">
      <th>Op No</th><th>Process</th><th>Machine Type</th><th>Tool / Fixture / Gauge</th>
      <th>S.No</th><th>Characteristic</th><th>LCL</th><th>UCL</th>
      <th>Measuring Instrument</th><th>Gauge Card No.</th><th>Sample Size</th><th>Inspection Frequency</th><th>Control Method</th>
      <th>Reaction Plan</th><th>Responsibility</th>
    </tr>`;
}
/* Print tbody: Operation (Op No/Process/Machine/Tool), Reaction Plan and Responsibility are all
   shown once per group via rowspan — they don't repeat for every characteristic row underneath.
   Reaction Plan merges as long as its value stays the same within the operation block; Responsibility
   merges as long as its value stays the same within that Reaction Plan block (same grouping style). */
function cpPrintTbodyHtml(ops){
  ops = ops||[];
  const opKey = o=>[o.opNo,o.process,o.machine,o.toolFixGauge].join('\u0001');
  const opSpans = cpGroupSpans(ops, opKey);
  const reactKey = o=>opKey(o)+'\u0001'+(o.reactionPlan||'');
  const reactSpans = cpGroupSpans(ops, reactKey);
  const respKey = o=>reactKey(o)+'\u0001'+(o.responsibility||'');
  const respSpans = cpGroupSpans(ops, respKey);
  const serials = cpPrintSerials(ops);
  return ops.map((o,i)=>{
    const opCells = opSpans[i]>0 ? `
      <td class="opCell" rowspan="${opSpans[i]}">${esc(o.opNo)||'—'}</td>
      <td class="opCell" rowspan="${opSpans[i]}">${esc(o.process)||'—'}</td>
      <td class="opCell" rowspan="${opSpans[i]}">${esc(o.machine)||'—'}</td>
      <td class="opCell" rowspan="${opSpans[i]}">${esc(o.toolFixGauge)||'—'}</td>` : '';
    const reactCell = reactSpans[i]>0 ? `<td class="reactCell" rowspan="${reactSpans[i]}">${esc(o.reactionPlan)||'—'}</td>` : '';
    const respCell = respSpans[i]>0 ? `<td class="reactCell" rowspan="${respSpans[i]}">${esc(o.responsibility)||'—'}</td>` : '';
    return `<tr>${opCells}
      <td class="sno">${serials[i]}</td>
      <td class="char">${esc(o.charName)||'—'}</td>
      <td>${esc(o.lcl)||'—'}</td>
      <td>${esc(o.ucl)||'—'}</td>
      <td>${esc(o.measInst)||'—'}</td>
      <td>${esc(o.gaugeCardNo)||'—'}</td>
      <td>${esc(o.sampleSize)||'—'}</td>
      <td>${esc(o.freq)||'—'}</td>
      <td>${esc(o.controlMethod)||'—'}</td>
      ${reactCell}
      ${respCell}
    </tr>`;
  }).join('') || `<tr><td colspan="15" style="text-align:center; padding:12px; color:#888;">No records</td></tr>`;
}
function printControlPlanRec(id){
  const cp = DB.controlPlans.find(x=>x.id===id); if(!cp) return;
  const note = `<div class="ntTitle">Control Plan Header</div><div class="ntBody"><table>
    <tr><td class="k">Customer</td><td class="v">${esc(cp.customerName)||'—'}</td><td class="k">Part No</td><td class="v">${esc(cp.finPartNo)}</td></tr>
    <tr><td class="k">Part Name</td><td class="v">${esc(cp.finPartName)||'—'}</td><td class="k">Material Grade</td><td class="v">${esc(cp.materialGrade)||'—'}</td></tr>
    <tr><td class="k">Drawing No</td><td class="v">${esc(cp.drawingNo)||'—'}</td><td class="k">Revision No</td><td class="v">${esc(cp.revNo)||'—'}</td></tr>
    <tr><td class="k">Effective Date</td><td class="v">${fmtDate(cp.effectiveDate)}</td><td class="k">Status</td><td class="v">${esc(cp.status)}</td></tr>
    <tr><td class="k">Prepared By</td><td class="v">${esc(cp.preparedBy)||'—'}</td><td class="k">Checked By</td><td class="v">${esc(cp.checkedBy)||'—'}</td></tr>
    <tr><td class="k">Approved By</td><td class="v">${esc(cp.approvedBy)||'—'}</td><td class="k">Control Plan No</td><td class="v">${esc(cp.cpNo)}</td></tr>
  </table></div>`;
  const remarksText = (cp.remarks!==undefined && cp.remarks!==null && cp.remarks!=='') ? cp.remarks : CP_DEFAULT_REMARKS;
  const footerHtml = `<div class="prRemarks"><div class="rmTitle">Remarks</div><div class="rmBody">${esc(remarksText)}</div></div>`;
  printReport('Control Plan — '+cp.cpNo, CP_HEADERS, cpRowsForPrint(cp), {
    note, extraCss:CP_PRINT_CSS,
    theadHtml: cpPrintTheadHtml(),
    bodyHtml: cpPrintTbodyHtml(cp.ops),
    colgroupHtml: CP_PRINT_COLGROUP,
    orientation: 'landscape',
    notePosition: 'before',
    pageMargin: '10mm',
    footerHtml,
  });
}
function cpStatusBadgeClass(s){ return s==='Approved' ? 'ok' : s==='Obsolete' ? 'bad' : 'dev'; }
/* Two-tier AIAG/IATF-style grouped header: S.No | Operation | Product Characteristic | Methods | Reaction.
   `editable` adds a trailing blank header cell for the row-remove button column. */
function cpGroupHeaderHtml(editable){
  return `<thead>
    <tr class="cp-grp">
      <th class="g-sn" rowspan="2">#</th>
      <th class="g-op" colspan="4">Operation <span class="hint" style="position:static; color:inherit; opacity:.8; font-size:9px; text-transform:none;">(common)</span></th>
      <th class="g-ch" colspan="3">Product Characteristic</th>
      <th class="g-me" colspan="5">Methods</th>
      <th class="g-re" colspan="2">Reaction</th>
      ${editable ? '<th class="g-sn" rowspan="2"></th>' : ''}
    </tr>
    <tr class="cp-fld">
      <th>Op No</th><th>Process Name</th><th>Machine Type</th><th class="grp-end">Tool / Fixture / Gauge</th>
      <th>Characteristic<span class="req">*</span></th><th>LCL<span class="req">*</span></th><th class="grp-end">UCL<span class="req">*</span></th>
      <th>Measuring Instrument<span class="req">*</span></th><th>Gauge Card No.</th><th>Sample Size<span class="req">*</span></th><th>Inspection Frequency<span class="req">*</span></th><th class="grp-end">Control Method<span class="req">*</span></th>
      <th>Reaction Plan</th><th>Responsibility</th>
    </tr>
  </thead>`;
}
/* Builds tbody rows for the read-only view, merging (rowspan) the Operation-group cells
   (Op No / Process / Machine / Tool) across consecutive characteristic rows that belong
   to the same operation — matching the standard AIAG Control Plan look. */
function cpViewBodyHtml(ops){
  ops = ops||[];
  const spans = ops.map(()=>1);
  for(let i=ops.length-2;i>=0;i--){
    const a=ops[i], b=ops[i+1];
    if((a.opNo||'')===(b.opNo||'') && (a.process||'')===(b.process||'') && (a.machine||'')===(b.machine||'') && (a.toolFixGauge||'')===(b.toolFixGauge||'')){
      spans[i]+=spans[i+1]; spans[i+1]=0;
    }
  }
  return ops.map((o,i)=>{
    const opCells = spans[i]>0 ? `
      <td class="cp-view" rowspan="${spans[i]}">${esc(o.opNo)||'—'}</td>
      <td class="cp-view" rowspan="${spans[i]}">${esc(o.process)||'—'}</td>
      <td class="cp-view" rowspan="${spans[i]}">${esc(o.machine)||'—'}</td>
      <td class="cp-view grp-end" rowspan="${spans[i]}">${esc(o.toolFixGauge)||'—'}</td>` : '';
    return `<tr>
      <td class="cp-sn">${i+1}</td>${opCells}
      <td class="cp-view">${esc(o.charName)||'—'}</td>
      <td class="cp-view">${esc(o.lcl)||'—'}</td>
      <td class="cp-view grp-end">${esc(o.ucl)||'—'}</td>
      <td class="cp-view">${esc(o.measInst)||'—'}</td>
      <td class="cp-view">${o.gaugeCardNo ? `<span class="pill rc-pill" style="font-size:9px; font-family:var(--mono);">🆔 ${esc(o.gaugeCardNo)}</span>` : '—'}</td>
      <td class="cp-view">${esc(o.sampleSize)||'—'}</td>
      <td class="cp-view">${esc(o.freq)||'—'}</td>
      <td class="cp-view grp-end">${esc(o.controlMethod)||'—'}</td>
      <td class="cp-view">${esc(o.reactionPlan)||'—'}</td>
      <td class="cp-view">${esc(o.responsibility)||'—'}</td>
    </tr>`;
  }).join('');
}
function renderControlPlan(main){
  const list = DB.controlPlans;
  const viewing = cpViewId ? DB.controlPlans.find(x=>x.id===cpViewId) : null;
  const formOpen = !!cpDraft;

  if(viewing){
    main.innerHTML = `
    <div class="panel">
      <h3>📋 Control Plan — ${esc(viewing.cpNo)} <span class="badge ${cpStatusBadgeClass(viewing.status)}">${esc(viewing.status)}</span></h3>
      <div class="frow g4">
        <div><span class="hint">Customer</span><div>${esc(custDispByName(viewing.customerName))||'—'}</div></div>
        <div><span class="hint">Part No</span><div>${esc(viewing.finPartNo)}</div></div>
        <div><span class="hint">Part Name</span><div>${esc(viewing.finPartName)||'—'}</div></div>
        <div><span class="hint">Material Grade</span><div>${esc(viewing.materialGrade)||'—'}</div></div>
        <div><span class="hint">Drawing No</span><div>${esc(viewing.drawingNo)||'—'}</div></div>
        <div><span class="hint">Revision No</span><div>${esc(viewing.revNo)||'—'}</div></div>
        <div><span class="hint">Effective Date</span><div>${fmtDate(viewing.effectiveDate)}</div></div>
        <div><span class="hint">PD Record Ref</span><div>${esc(viewing.pdRecordRef)||'—'}</div></div>
      </div>
      <div class="frow g4" style="margin-top:10px;">
        <div><span class="hint">Prepared By</span><div>${esc(viewing.preparedBy)||'—'}</div></div>
        <div><span class="hint">Checked By</span><div>${esc(viewing.checkedBy)||'—'}</div></div>
        <div><span class="hint">Approved By</span><div>${esc(viewing.approvedBy)||'—'}</div></div>
      </div>
      <div class="frow" style="margin-top:10px;">
        <div style="grid-column:1/-1; text-align:left;">
          <span class="hint" style="position:static;">Remarks</span>
          <div style="white-space:pre-wrap;">${esc(viewing.remarks!==undefined && viewing.remarks!==null ? viewing.remarks : CP_DEFAULT_REMARKS)||'—'}</div>
        </div>
      </div>
      <div style="margin-top:14px;">
        <button class="btn amber" onclick="printControlPlanRec('${viewing.id}')">🖨 Print (A4)</button>
        <button class="btn ghost" onclick="printControlPlanRec('${viewing.id}')">📄 Export PDF</button>
        <button class="btn ghost" onclick="openEditCP('${viewing.id}')">✎ Edit</button>
        ${viewing.status!=='Approved' ? `<button class="btn ghost" onclick="setCPFieldStatusOnly('${viewing.id}','Approved')">✔ Mark Approved</button>` : ''}
        ${viewing.status!=='Obsolete' ? `<button class="btn ghost" onclick="setCPFieldStatusOnly('${viewing.id}','Obsolete')">🗄 Mark Obsolete</button>` : ''}
        <button class="btn ghost" onclick="closeCPView()">← Back</button>
      </div>
    </div>
    <div class="panel">
      <h3>Control Plan Table <span class="hint">AIAG / IATF 16949 format — Operation → Product Characteristic → Methods → Reaction</span></h3>
      <div class="cp-legend">
        <span><i class="op"></i>Operation (common)</span>
        <span><i class="ch"></i>Product Characteristic</span>
        <span><i class="me"></i>Methods</span>
        <span><i class="re"></i>Reaction / Responsibility</span>
      </div>
      <div class="cp-wrap">
        <table class="cp-table">
          ${cpGroupHeaderHtml(false)}
          <tbody>${cpViewBodyHtml(viewing.ops)}</tbody>
        </table>
      </div>
    </div>
    <div class="panel">
      <h3>Revision History <span class="hint">${(viewing.history||[]).length} entries</span></h3>
      ${(viewing.history||[]).slice().reverse().map(h=>`<div class="hint" style="font-size:10.5px; margin-bottom:4px;">${fmtDate(h.date)} — Rev ${esc(h.revNo)} — <strong>${esc(h.status)}</strong>${h.by?' by '+esc(h.by):''}${h.note?' — '+esc(h.note):''}</div>`).join('') || '<div class="empty">No history yet.</div>'}
    </div>`;
    return;
  }

  main.innerHTML = `
    <div class="panel">
      <h3>📋 Control Plan <span class="hint">Automotive APQP / IATF 16949 style — auto-linked from Product Development</span></h3>
      ${formOpen ? '' : `<button class="btn amber" onclick="openNewCP()">+ New Control Plan</button>`}
    </div>
    ${formOpen ? `
    <div class="cp-form">
    <div class="panel">
      <h3>${editingCPId?'Edit':'New'} Control Plan — Header</h3>
      <div class="frow g4">
        <div style="grid-column:1/-1;"><label class="fl">Customer</label>
          <select id="cp_customer" onchange="selectCPCustomer(this)">
            <option value="">— select customer —</option>
            ${DB.customers.map(c=>`<option value="${c.id}" ${cpDraft.header.customerId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div style="grid-column:1/-1;"><label class="fl">Pick Part No <span class="hint" style="position:static; font-size:9.5px;">${(cpDraft.header.customerId||cpDraft.header.customerName)?'(showing parts for '+esc(cpDraft.header.customerName)+' only)':'(select a customer above to filter this list)'}</span></label>
          ${cpFinishedPartPickerHtml(cpDraft.header.customerId, cpDraft.header.customerName)}
        </div>
        <div><label class="fl">Part No <span class="hint" style="position:static; color:var(--red);">*required</span></label><input id="cp_finPartNo" value="${esc(cpDraft.header.finPartNo)}" placeholder="e.g. AH CL 26 D920"></div>
        <div><label class="fl">Part Name</label><input id="cp_finPartName" value="${esc(cpDraft.header.finPartName)}" placeholder="e.g. ROD END"></div>
        <div><label class="fl">Customer (resolved)</label><input value="${esc(cpDraft.header.customerName)}" placeholder="Pick customer above" disabled></div>
        <div><label class="fl">PD Record Ref</label><input id="cp_pdRecordRef" value="${esc(cpDraft.header.pdRecordRef)}" placeholder="Auto-linked BOM/Insp. id"></div>
        <div><label class="fl">Material Grade <span class="hint" style="position:static; font-size:9.5px;">(auto from Part No — editable)</span></label><input id="cp_materialGrade" value="${esc(cpDraft.header.materialGrade)}" placeholder="e.g. EN8D"></div>
        <div><label class="fl">Drawing Number</label><input id="cp_drawingNo" value="${esc(cpDraft.header.drawingNo)}" placeholder="e.g. DWG-1023"></div>
        <div><label class="fl">Revision Number</label><input id="cp_revisionNo" value="${esc(cpDraft.header.revisionNo)}" placeholder="e.g. Rev-02"></div>
        <div><label class="fl">Control Plan No</label><input id="cp_cpNo" value="${esc(cpDraft.header.cpNo)}" placeholder="auto-generated if blank"></div>
        <div><label class="fl">Effective Date</label><input id="cp_effectiveDate" type="date" value="${esc(cpDraft.header.effectiveDate)}"></div>
        <div><label class="fl">Revision No (Control Plan)</label><input id="cp_revNo" value="${esc(cpDraft.header.revNo)}" placeholder="0"></div>
        <div><label class="fl">Status</label>
          <select id="cp_status">
            ${['Draft','Approved','Obsolete'].map(s=>`<option value="${s}" ${cpDraft.header.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="frow g4" style="margin-top:10px;">
        <div><label class="fl">Prepared By</label><select id="cp_preparedBy"><option value="">— select —</option>${cpApproverOptionsHtml(cpDraft.header.preparedBy)}</select></div>
        <div><label class="fl">Checked By</label><select id="cp_checkedBy"><option value="">— select —</option>${cpApproverOptionsHtml(cpDraft.header.checkedBy)}</select></div>
        <div><label class="fl">Approved By</label><select id="cp_approvedBy"><option value="">— select —</option>${cpApproverOptionsHtml(cpDraft.header.approvedBy)}</select></div>
      </div>
      <div class="frow" style="margin-top:10px;">
        <div style="grid-column:1/-1; text-align:left;">
          <label class="fl" style="text-align:left;">Remarks <span class="hint" style="position:static; font-size:9.5px;">(printed at the bottom of the Control Plan — editable)</span></label>
          <textarea id="cp_remarks" rows="2" placeholder="${esc(CP_DEFAULT_REMARKS)}" style="width:100%; resize:vertical;">${esc(cpDraft.header.remarks!==undefined?cpDraft.header.remarks:CP_DEFAULT_REMARKS)}</textarea>
        </div>
      </div>
    </div>
    <div class="panel">
      <h3>Control Plan Table</h3>
      <div class="frow g4" style="align-items:end; margin-bottom:14px; padding-bottom:12px; border-bottom:1px dashed var(--line);">
        <div style="grid-column:1/3;">
          <label class="fl">📋 Copy Structure From Existing Part <span class="hint" style="position:static; font-size:9.5px;">(same/similar part — loads its full operation table below, ready to edit)</span></label>
          <select id="cp_copyStructureSel">
            <option value="">— select an existing Control Plan to copy —</option>
            ${cpCopyStructureOptionsHtml(editingCPId)}
          </select>
        </div>
        <div><button type="button" class="btn ghost" onclick="applyCPCopyStructure()">📋 Copy Structure</button></div>
      </div>
      <datalist id="cpToolList">${toolOptionsHtml()}</datalist>
      <div class="cp-cardlist">
      ${(()=>{ let __opSeq=0; let __charSeq=0; return cpDraft.ops.map((o,idx)=>{ if(!o.sameAsPrev){ __opSeq++; __charSeq=1; } else { __charSeq++; } return `
      <div class="cpoprow cp-card ${o.sameAsPrev?'cp-card-compact':''}" data-idx="${idx}">
        <div class="cp-card-head">
          <div class="cp-card-common" style="${o.sameAsPrev?'display:none;':''}">
            <div class="cp-f"><label>Op No</label>
              <select class="cpo_opNo" onchange="cpRefreshFixtureOptions(${idx})">
                <option value="">— select —</option>${opNoOptionsHtml(o.opNo)}
              </select>
            </div>
            <div class="cp-f"><label>Process</label>
              <select class="cpo_process">
                <option value="">— select —</option>${processOptionsHtml(o.process)}
              </select>
            </div>
            <div class="cp-f cp-machine-wrap"><label>Machine Type</label>
              <select class="cpo_machine" onchange="toggleMachineManual(this)">
                <option value="">— select —</option>${machineTypeOptionsHtml(o.machine)}
              </select>
              <input class="cpo_machineManual" style="margin-top:4px; display:${(o.machine && !machineTypeKnown(o.machine))?'block':'none'};" value="${esc((o.machine && !machineTypeKnown(o.machine))?o.machine:'')}" placeholder="Type machine type">
            </div>
            <div class="cp-f"><label>Fixture <span class="hint" style="position:static;font-size:9px;">(from Fixture Master)</span></label>
              <select class="cpo_fixtureSel" onchange="cpSelectFixture(${idx}, this)">${cpFixtureSelectHtml(cpDraft.header.finPartNo, o.opNo, o.fixtureId)}</select>
            </div>
            <div class="cp-f"><label>Tool / Fixture / Gauge</label><input class="cpo_toolFixGauge" list="cpToolList" value="${esc(o.toolFixGauge)}" placeholder="Tool / Fixture / Gauge"></div>
          </div>
          ${o.sameAsPrev? `<div class="cp-card-samehint">Same operation — new characteristic <a href="javascript:void(0)" onclick="cpToggleRowFields(${idx})">show operation &amp; reaction fields</a></div>` : ''}
          <button type="button" class="cp-card-rm" title="Remove row" onclick="removeCPOpRow(${idx})">✕</button>
        </div>
        <div class="cp-card-body">
          <div class="cp-grp">
            <div class="cp-seq-badge" title="Sequence Number — auto-generated, resets for each operation">Seq No: ${__charSeq}</div>
            <div class="cp-grp-title">Product Characteristic &amp; Specification <span class="req">*</span></div>
            <div class="cp-grp-row spec">
              <div class="cp-f cp-char-wrap">
                <label>Characteristic</label>
                <select class="cpo_charName" onchange="toggleCharManual(this); cpRefreshInstrumentOptions(${idx})">
                  <option value="">— select —</option>
                  ${charOptionsHtml(o.charName)}
                </select>
                <input class="cpo_charNameManual" style="margin-top:6px; display:${(o.charName && !charAllOptionsFlat().includes(o.charName))?'block':'none'};" value="${esc((o.charName && !charAllOptionsFlat().includes(o.charName))?o.charName:'')}" placeholder="Type characteristic name, then click away to save it" oninput="cpRefreshInstrumentOptions(${idx})" onblur="commitCustomCharacteristic(this)">
              </div>
              <div class="cp-f"><label>LCL</label><input class="cpo_lcl" value="${esc(o.lcl)}" placeholder="LCL" required></div>
              <div class="cp-f"><label>UCL</label><input class="cpo_ucl" value="${esc(o.ucl)}" placeholder="UCL" required></div>
              <div class="cp-f"><label>Measuring Instrument <span class="req">*</span></label>
                <select class="cpo_measInstSel" onchange="cpSelectInstrument(${idx}, this)" required>${cpInstrumentSelectHtml(o)}</select>
              </div>
              <div class="cp-f"><label>Gauge</label>
                <select class="cpo_gaugeSel" onchange="cpSelectGauge(${idx}, this)">${cpGaugeSelectHtml(o)}</select>
              </div>
              <div class="cp-f"><label>Gauge Card No. <span class="hint" style="position:static; font-size:9px;">(auto)</span></label>
                <input class="cpo_gaugeCardNo" value="${esc(o.gaugeCardNo)}" placeholder="—" disabled>
              </div>
            </div>
          </div>
          <div class="cp-grp">
            <div class="cp-grp-row methods" style="${o.sameAsPrev?'display:none;':''}">
              <div class="cp-f"><label>Sample Size</label><input class="cpo_sampleSize" value="${esc(o.sampleSize)}" placeholder="5" required></div>
              <div class="cp-f"><label>Inspection Frequency</label>
                <select class="cpo_freq" required>
                  <option value="">— select —</option>${['Each Hour','Each Shift','Each Lot'].map(v=>`<option value="${v}" ${o.freq===v?'selected':''}>${v}</option>`).join('')}
                </select>
              </div>
              <div class="cp-f"><label>Control Method</label>
                <select class="cpo_controlMethod" required>
                  <option value="">— select —</option>${['FOIR','LIR','FIR','RIR'].map(v=>`<option value="${v}" ${o.controlMethod===v?'selected':''}>${v}</option>`).join('')}
                </select>
              </div>
              <div class="cp-f"><label>Reaction Plan</label>
                <select class="cpo_reactionPlan">
                  <option value="">— select —</option>${reactionPlanOptionsHtml(o.reactionPlan)}
                </select>
              </div>
              <div class="cp-f"><label>Responsibility</label>
                <select class="cpo_responsibility">
                  <option value="">— select —</option>${responsibilityOptionsHtml(o.responsibility)}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>${(idx<cpDraft.ops.length-1 && cpDraft.ops[idx+1].sameAsPrev) ? `
      <div class="cp-insert-bar cp-insert-bar-detail" onclick="insertInspectionAfter(${idx})" title="Insert a new characteristic/detail row here, within this operation — Serial No renumbers automatically">
        <span>+ Insert Detail Here</span>
      </div>` : ''}${(idx===cpDraft.ops.length-1 || !cpDraft.ops[idx+1].sameAsPrev) && idx<cpDraft.ops.length-1 ? `
      <div class="cp-insert-bar" onclick="insertOperationAfter(${idx})" title="Insert a new operation here — Op No is auto-assigned to keep the sequence in order">
        <span>+ Insert Operation Here</span>
      </div>` : ''}`; }).join(''); })()}
      </div>
      <div class="cp-actions-row">
        <button class="btn amber" onclick="addCPInspectionRow()">+ Add Inspection Row <span class="hint" style="position:static; font-size:9.5px;">(same operation — new characteristic, added at the end)</span></button>
        <button class="btn ghost" onclick="addCPOpRow()">+ Add Operation Row <span class="hint" style="position:static; font-size:9.5px;">(new operation — restarts numbering from 1)</span></button>
      </div>
      <div class="cp-savebar">
        <button class="btn amber" onclick="saveCP()">💾 Save Control Plan</button>
        <button class="btn ghost" onclick="cancelCP()">Cancel</button>
        <span class="hint">${cpDraft.ops.length} row${cpDraft.ops.length===1?'':'s'}</span>
      </div>
    </div>
    </div>
    ` : `
    <div class="panel">
      <h3>Saved Control Plans <span class="hint">${list.length} total</span> <button class="btn ghost small" style="float:right;" onclick="openModuleReports('controlPlans')">📊 Reports</button></h3>
      <div class="grid-box">
        ${list.slice().reverse().map(cp=>`
          <div class="rec-card">
            <div class="rc-title">${esc(cp.cpNo)} <span class="badge ${cpStatusBadgeClass(cp.status)}">${esc(cp.status)}</span></div>
            <div class="rc-sub">${esc(cp.finPartNo)} — ${esc(cp.finPartName)||'—'}</div>
            <div class="rc-row"><span class="k">Customer</span><span class="v">${esc(custDispByName(cp.customerName))||'—'}</span></div>
            <div class="rc-row"><span class="k">Rev No</span><span class="v">${esc(cp.revNo)||'—'}</span></div>
            <div class="rc-row"><span class="k">Operations</span><span class="v">${(cp.ops||[]).length}</span></div>
            <div class="rc-actions">
              <button class="btn small ghost" onclick="viewCP('${cp.id}')">View</button>
              <button class="btn small ghost" onclick="openEditCP('${cp.id}')">Edit</button>
              <button class="btn small ghost" onclick="printControlPlanRec('${cp.id}')">Print</button>
              <button class="btn danger" onclick="deleteRow('controlPlans','${cp.id}')">Del</button>
            </div>
          </div>`).join('') || '<div class="empty">No Control Plans defined yet. Create one — pick a Part No and the Customer / Part Name / PD Record link fill in automatically.</div>'}
      </div>
    </div>
    `}
  `;
}
