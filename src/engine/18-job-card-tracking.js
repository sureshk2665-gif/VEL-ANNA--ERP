/* ================= JOB CARD TRACKING MODULE — Subcontract Details / Part History ================= */
function setJobTrackingSubTab(t){ jobTrackingSubTab = t; routingDraft=null; editingRoutingId=null; routingCustomerId=''; render(); }
function renderJobTracking(main){
  if(!subOK('jobTracking', jobTrackingSubTab)) jobTrackingSubTab = firstAllowedSub('jobTracking') || jobTrackingSubTab;
  main.innerHTML = `
    <div class="topbar"><div></div></div>
    <div class="subtabs" style="margin-top:12px;">
      ${subOK('jobTracking','subcontract')?`<button class="${jobTrackingSubTab==='subcontract'?'active':''}" onclick="setJobTrackingSubTab('subcontract')">🏗️ Subcontract Jobs</button>`:''}
      ${subOK('jobTracking','tracking')?`<button class="${jobTrackingSubTab==='tracking'?'active':''}" onclick="setJobTrackingSubTab('tracking')">🔎 Part Tracking / Job Card History</button>`:''}
      ${subOK('jobTracking','p360')?`<button class="${jobTrackingSubTab==='p360'?'active':''}" onclick="setJobTrackingSubTab('p360')">🧭 Part 360° Flow View</button>`:''}
    </div>
    <div id="jtSub"></div>
  `;
  const sub = document.getElementById('jtSub');
  if(jobTrackingSubTab==='tracking') return renderPartTracking(sub);
  if(jobTrackingSubTab==='p360') return renderPart360(sub);
  return renderSubcontractJobs(sub);
}

/* ---- Part Routing (Next-Stage Memory) ---- */
const ROUTING_STAGE_CHOICES = ['Production','Subcontract','Receiving Inspection'];
function newRoutingDraft(){ return {partNo:'', partName:'', steps:['Production']}; }
function openNewRouting(){ editingRoutingId=null; routingCustomerId=''; routingDraft=newRoutingDraft(); render(); }
function openEditRouting(id){
  const r = DB.partRouting.find(x=>x.id===id); if(!r) return;
  editingRoutingId=id;
  // strip the implicit 'Stores' holding points back down to just the actionable steps for editing
  routingDraft = {partNo:r.partNo, partName:r.partName, steps:(r.stages||[]).filter(s=>s && s!=='Stores' && s!=='Inventory')};
  if(!routingDraft.steps.length) routingDraft.steps=['Production'];
  routingCustomerId = customerIdForPlanningPartNo(r.partNo);
  render();
}
function cancelRouting(){ editingRoutingId=null; routingDraft=null; routingCustomerId=''; render(); }
function addRoutingStep(){ if(!routingDraft) return; routingDraft.steps.push('Production'); render(); }
function removeRoutingStep(idx){ if(!routingDraft) return; routingDraft.steps.splice(idx,1); if(!routingDraft.steps.length) routingDraft.steps=['Production']; render(); }
function setRoutingStep(idx, val){ if(!routingDraft) return; routingDraft.steps[idx]=val; }
function captureRoutingDraftFields(){
  if(!routingDraft) return;
  routingDraft.partNo = (document.getElementById('rtPartNo')||{}).value?.trim() || routingDraft.partNo;
  routingDraft.partName = (document.getElementById('rtPartName')||{}).value?.trim() || routingDraft.partName;
}
// Step 1 of the new flow: pick the Customer first — this narrows the Part No list below to just
// that customer's parts, so you're never hunting through every planned part in the system.
function setRoutingCustomer(v){
  routingCustomerId = v;
  if(routingDraft){ routingDraft.partNo=''; routingDraft.partName=''; }
  render();
}
// Which customer a given (already-routed) Part No belongs to — used to pre-select the Customer
// dropdown when editing an existing routing, so the part list is still narrowed correctly.
function customerIdForPlanningPartNo(partNo){
  const rec = DB.custPO.find(p=>p.finPartNo===partNo) || DB.labourPO.find(p=>p.finPartNo===partNo);
  return rec ? planRecCustomerKey(rec) : '';
}
// Selecting a Part No from the Planning-sourced dropdown auto-fills its Part Name (read-only).
function setRoutingPartNo(v){
  if(!routingDraft) return;
  routingDraft.partNo = v;
  const found = planningPartNumbersForCustomer(routingCustomerId).find(p=>p.partNo===v);
  routingDraft.partName = found ? found.partName : '';
  render();
}
function saveRouting(){
  if(!routingDraft) return;
  captureRoutingDraftFields();
  if(!routingDraft.partNo){ toast('Part No is required'); return; }
  // Rebuild the full sequence with 'Stores' inserted before every actionable step, and
  // 'Final Inspection' → 'Inventory' (Finished Goods) always closing the sequence — however many
  // Production/Subcontract stages the Part goes through first.
  const stages = [];
  routingDraft.steps.forEach(s=>{ stages.push('Stores'); stages.push(s); });
  stages.push('Stores'); stages.push('Final Inspection'); stages.push('Inventory');
  const rec = {partNo:routingDraft.partNo, partName:routingDraft.partName, stages};
  if(editingRoutingId){
    const idx = DB.partRouting.findIndex(x=>x.id===editingRoutingId);
    DB.partRouting[idx] = {...DB.partRouting[idx], ...rec};
    toast('Part routing updated');
  } else {
    if(getPartRouting(routingDraft.partNo)){ toast('A routing already exists for this Part No — edit it instead'); return; }
    DB.partRouting.push({id:'rt'+Date.now(), ...rec});
    toast('Part routing saved');
  }
  editingRoutingId=null; routingDraft=null; routingCustomerId='';
  saveDB(); render();
}
function deleteRouting(id){ if(!confirm('Delete this Part Routing?')) return; DB.partRouting = DB.partRouting.filter(x=>x.id!==id); saveDB(); render(); }
function setRoutingSearchQuery(v){
  routingSearchQuery = v;
  const rows = document.querySelectorAll('#routingTableBody tr[data-partno]');
  const q = (v||'').trim().toLowerCase();
  let visibleCount = 0;
  rows.forEach(row=>{
    const match = row.getAttribute('data-partno').includes(q) || row.getAttribute('data-partname').includes(q);
    row.style.display = match ? '' : 'none';
    if(match) visibleCount++;
  });
  const emptyRow = document.getElementById('routingNoMatch');
  if(emptyRow) emptyRow.style.display = visibleCount ? 'none' : '';
  const countEl = document.getElementById('routingCount');
  if(countEl) countEl.textContent = q ? `${visibleCount} of ${rows.length}` : rows.length;
}
function renderPartRouting(main){
  const list = DB.partRouting.slice().sort((a,b)=>(a.partNo||'').localeCompare(b.partNo||''));
  main.innerHTML = `
    <div class="panel" style="margin-top:16px;">
      <h3>Part Number → Stage Sequence <span class="hint">Defines and remembers the full journey each Part No takes — Stores is inserted automatically between every actionable stage, and Final Inspection → Finished Goods always closes the sequence, however many Production/Subcontractor stages come before it.</span></h3>
      ${!routingDraft ? `<button class="btn amber" onclick="openNewRouting()">➕ Define Routing for a Part</button>` : `
      <div class="frow g2" style="margin-top:12px;">
        <div><label class="fl">Customer Name</label>
          ${editingRoutingId ? `<input value="${esc(custDispByName((([...DB.custPO, ...DB.labourPO].find(p=>planRecCustomerKey(p)===routingCustomerId))||{}).customer || routingCustomerId))}" disabled>` :
            `<select onchange="setRoutingCustomer(this.value)">${planCustomerOptionsHtml([...DB.custPO, ...DB.labourPO], routingCustomerId)}</select>`}
        </div>
        <div><label class="fl">Part No <span class="hint" style="position:static; font-size:9px;">(only this customer's parts)</span></label>
          ${editingRoutingId ? `<input id="rtPartNo" value="${esc(routingDraft.partNo)}" disabled>` :
            genericPickerHtml('rtPartNoDD','rtPartNoHidden',
              planningPartNumbersForCustomer(routingCustomerId).map(p=>({value:p.partNo, label:p.partNo})),
              routingDraft.partNo,
              !routingCustomerId ? '— Select a Customer first —' : (planningPartNumbersForCustomer(routingCustomerId).length ? '— Select a Part No —' : 'No Part Numbers found for this Customer in Planning yet'),
              `setRoutingPartNo(document.getElementById('rtPartNoHidden').value)`)}
        </div>
      </div>
      <div class="frow g2" style="margin-top:8px;">
        <div><label class="fl">Part Name (Auto)</label><input id="rtPartName" value="${esc(routingDraft.partName)}" disabled placeholder="Auto-filled from Planning"></div>
      </div>
      <div class="hint" style="position:static; margin:10px 0 6px;">Example: Production → Stores → Subcontract → Stores → Production → Stores → Final Inspection → Finished Goods</div>
      ${routingDraft.steps.map((s,idx)=>`
        <div class="frow" style="grid-template-columns: 24px 1fr 32px; align-items:center; gap:8px; margin-bottom:6px;">
          <div class="hint" style="position:static;">${idx+1}.</div>
          <select onchange="setRoutingStep(${idx}, this.value)">
            ${ROUTING_STAGE_CHOICES.map(c=>`<option value="${c}" ${s===c?'selected':''}>${c}</option>`).join('')}
          </select>
          <button class="btn small danger" onclick="removeRoutingStep(${idx})">✕</button>
        </div>`).join('')}
      <button class="btn ghost small" onclick="addRoutingStep()">➕ Add Stage</button>
      <div style="margin-top:14px;">
        <button class="btn amber" onclick="saveRouting()">💾 Save Routing</button>
        <button class="btn ghost" onclick="cancelRouting()">Cancel</button>
      </div>`}
    </div>
    <div class="panel">
      <h3>Saved Routings <span class="hint" id="routingCount">${list.length}</span></h3>
      ${list.length ? `
      <div class="frow" style="grid-template-columns: 280px; margin-bottom:10px;">
        <div>
          <label class="fl">Search Part No</label>
          <input id="routingSearchInput" type="text" placeholder="Type a Part No or Part Name…" value="${esc(routingSearchQuery)}" oninput="setRoutingSearchQuery(this.value)" autocomplete="off">
        </div>
      </div>` : ''}
      <div class="tw"><table>
        <thead><tr><th>S.No</th><th>Part No</th><th>Part Name</th><th>Sequence</th><th></th></tr></thead>
        <tbody id="routingTableBody">
        ${list.length ? list.map((r,idx)=>`
          <tr data-partno="${esc((r.partNo||'').toLowerCase())}" data-partname="${esc((r.partName||'').toLowerCase())}">
            <td>${idx+1}</td><td>${esc(r.partNo)}</td><td>${esc(r.partName)||'—'}</td>
            <td>${(r.stages||[]).map(s=>esc(s==='Inventory'?'Finished Goods':s)).join(' → ')}</td>
            <td><button class="btn small ghost" onclick="openEditRouting('${r.id}')">✎ Edit</button> <button class="btn small danger" onclick="deleteRouting('${r.id}')">🗑</button></td>
          </tr>`).join('') : `<tr><td colspan="5" class="empty">No routings defined yet — Parts without a routing fall back to the simple default flow (Stores → Production → Final Inspection → Finished Goods).</td></tr>`}
        ${list.length ? `<tr id="routingNoMatch" style="display:none;"><td colspan="5" class="empty">No Part Numbers match your search.</td></tr>` : ''}
        </tbody>
      </table></div>
    </div>`;
  if(routingSearchQuery) setRoutingSearchQuery(routingSearchQuery);
}

/* ---- Subcontractor Master (Purchase → Subcontractor) ----
   Add-only master list, same pattern as Raw Material Suppliers: an "Add Subcontractor" form
   that reveals on click, and a card below for every subcontractor on file. This is intentionally
   just the master — the detailed Subcontract Jobs ledger (issue/receive tracking) stays under
   Job Card Tracking and is NOT duplicated here. */
function addSubcontractor(){
  const nameEl = document.getElementById('scNewName');
  const name = nameEl.value.trim();
  if(!name){ toast('Subcontractor Name is required'); return; }
  const process = (document.getElementById('scNewProcess')||{}).value.trim();
  if(!process){ toast('Process is required'); return; }
  DB.subcontractors.push({id:'scv'+Date.now(), name, process, contact:(document.getElementById('scNewContact')||{}).value||'', phone:(document.getElementById('scNewPhone')||{}).value||'', address:(document.getElementById('scNewAddr')||{}).value||''});
  saveDB(); toast('Subcontractor added'); scForm=null; render();
}
function renderSubcontractorMaster(main){
  const list = DB.subcontractors.slice().reverse();
  main.innerHTML = `
    <div class="panel">
      <h3>Subcontractor Master <span class="hint">${DB.subcontractors.length} on file</span></h3>
      ${!scForm ? `<button class="btn ghost small" onclick="scForm=true; render();">➕ Add Subcontractor</button>` : `
      <div class="frow g4">
        <div><label class="fl">Name</label><input id="scNewName" placeholder="Subcontractor / Vendor name"></div>
        <div><label class="fl">Process <span style="color:var(--red);">*</span></label><input id="scNewProcess" placeholder="e.g. Heat Treatment, Plating"></div>
        <div><label class="fl">Contact Person</label><input id="scNewContact" placeholder="Contact person"></div>
        <div><label class="fl">Phone</label><input id="scNewPhone" placeholder="Phone"></div>
      </div>
      <div class="frow g4">
        <div><label class="fl">Address</label><input id="scNewAddr" placeholder="Address"></div>
      </div>
      <div style="margin-top:8px;"><button class="btn amber small" onclick="addSubcontractor()">💾 Save Subcontractor</button> <button class="btn ghost small" onclick="scForm=null; render();">Cancel</button></div>`}
    </div>
    <div class="panel">
      <div class="section-total"><h3>Subcontractors <span class="hint">${list.length} total</span></h3></div>
      <div class="grid-box">
        ${list.length? list.map(s=>`
          <div class="rec-card">
            <div class="rc-title">${esc(s.name)}</div>
            <div class="rc-sub">🏗️ Subcontractor${s.process?' · '+esc(s.process):''}</div>
            <div class="rc-row"><span class="k">Process</span><span class="v">${esc(s.process)||'—'}</span></div>
            <div class="rc-row"><span class="k">Phone</span><span class="v">${esc(s.phone)||'—'}</span></div>
            <div class="rc-row"><span class="k">Contact</span><span class="v">${esc(s.contact)||'—'}</span></div>
            <div class="rc-row"><span class="k">Address</span><span class="v">${esc(s.address)||'—'}</span></div>
            <div class="rc-actions">
              <button class="btn danger" onclick="deleteRow('subcontractors','${s.id}')">Del</button>
            </div>
          </div>`).join('') : '<div class="empty">No subcontractors added yet.</div>'}
      </div>
    </div>
    <div id="scPOPanel"></div>
  `;
  renderSubcontractorPO(document.getElementById('scPOPanel'));
}

/* ---- Subcontractor PO (Purchase → Subcontractor) ----
   Mirrors the Materials Purchase Order pattern: a PO carries the Part, Process, Qty and Rate
   (Rs.) agreed with a Subcontractor. Stores → Material Issue (Subcontract) then links every
   issued job to one of these POs, so the Rate is always pulled from the PO — never re-typed. */
let scPOForm = null;      // new-PO form draft toggle
let scPOSubSel = '';      // subcontractor chosen on the open PO form (drives the Process read-out)
function subcontractPOBalance(po){
  const issued = DB.subcontract.filter(x=>x.poId===po.id).reduce((a,x)=>a+(x.qty||0),0);
  return Math.round(((po.qty||0)-issued)*10000)/10000;
}
function scPOOnSubChange(){
  scPOSubSel = (document.getElementById('scpoSubSel')||{}).value || '';
  const p = DB.subcontractors.find(x=>x.id===scPOSubSel);
  const procEl = document.getElementById('scpoProcess');
  if(procEl) procEl.value = p ? (p.process||'') : '';
}
function addSubcontractPO(){
  if(!requireWorkingUnit()) return;
  const subId = (document.getElementById('scpoSubSel')||{}).value || '';
  const sub = DB.subcontractors.find(x=>x.id===subId);
  if(!sub){ toast('Select a Subcontractor'); return; }
  const partNo = (document.getElementById('scpoPartNo')||{}).value.trim();
  const partName = (document.getElementById('scpoPartName')||{}).value.trim();
  const qty = parseFloat((document.getElementById('scpoQty')||{}).value)||0;
  const rate = parseFloat((document.getElementById('scpoRate')||{}).value)||0;
  const remarks = (document.getElementById('scpoRemarks')||{}).value.trim();
  if(!partNo){ toast('Part No is required'); return; }
  if(qty<=0){ toast('Enter a valid PO Qty'); return; }
  if(rate<=0){ toast('Enter the PO Price / Rate (Rs.)'); return; }
  DB.counters.scpo = (DB.counters.scpo||0)+1;
  DB.subcontractPOs.push({
    id:'scpo'+Date.now(), poNo:'SCPO-'+String(DB.counters.scpo).padStart(4,'0'), poDate:today(), unit:currentUnit,
    subcontractorId:sub.id, subcontractorName:sub.name, process:sub.process||'',
    partNo, partName, qty, rate, remarks, status:'Open'
  });
  saveDB(); toast('Subcontractor PO created'); scPOForm=null; scPOSubSel=''; render();
}
function renderSubcontractorPO(main){
  if(!main) return;
  const list = DB.subcontractPOs.filter(x=>reportUnitMatch(x.unit)).slice().reverse();
  main.innerHTML = `
    <div class="panel">
      <h3>Subcontractor PO <span class="hint">Part, Process, Qty and PO Price (Rs.) agreed with the Subcontractor — Stores links every issued job to one of these.</span></h3>
      ${!scPOForm ? `<button class="btn ghost small" onclick="scPOForm=true; render();">➕ Add Subcontractor PO</button>` : `
      <div class="frow g4">
        <div><label class="fl">Subcontractor</label><select id="scpoSubSel" onchange="scPOOnSubChange()">${subcontractorOptionsHtml(scPOSubSel)}</select></div>
        <div><label class="fl">Process</label><input id="scpoProcess" disabled value="${esc((DB.subcontractors.find(x=>x.id===scPOSubSel)||{}).process||'')}"></div>
        <div><label class="fl">Part No</label><input id="scpoPartNo" placeholder="Part No"></div>
        <div><label class="fl">Part Name</label><input id="scpoPartName" placeholder="Part Name"></div>
      </div>
      <div class="frow g4">
        <div><label class="fl">PO Qty</label><input id="scpoQty" type="number" step="any" placeholder="Qty"></div>
        <div><label class="fl">PO Price / Rate (Rs.)</label><input id="scpoRate" type="number" step="any" placeholder="Rate per unit"></div>
        <div><label class="fl">Remarks</label><input id="scpoRemarks" placeholder="Optional"></div>
      </div>
      <div style="margin-top:8px;"><button class="btn amber small" onclick="addSubcontractPO()">💾 Save Subcontractor PO</button> <button class="btn ghost small" onclick="scPOForm=null; render();">Cancel</button></div>`}
    </div>
    <div class="panel">
      <div class="section-total"><h3>Subcontractor POs <span class="hint">${list.length} total</span></h3></div>
      <div class="tw"><table>
        <thead><tr><th>PO No</th><th>PO Date</th><th>Subcontractor</th><th>Process</th><th>Part No</th><th>Part Name</th><th>PO Qty</th><th>Issued</th><th>Balance</th><th>PO Price / Rate (Rs.)</th><th>Status</th><th>Print</th></tr></thead>
        <tbody>
        ${list.length ? list.map(po=>{
          const bal = subcontractPOBalance(po);
          const status = bal<=0.0001 ? 'Closed' : 'Open';
          return `<tr>
            <td>${esc(po.poNo)}</td><td>${fmtDate(po.poDate)}</td><td>${esc(po.subcontractorName)}</td><td>${esc(po.process)||'—'}</td>
            <td>${esc(po.partNo)}</td><td>${esc(po.partName)||'—'}</td>
            <td class="num">${po.qty}</td><td class="num">${Math.round((po.qty-bal)*10000)/10000}</td><td class="num">${bal}</td>
            <td class="num">₹${(po.rate||0).toFixed(2)}</td>
            <td><span class="pill ${status==='Closed'?'pass':'open'}">${status}</span></td>
            <td><button class="btn small ghost" onclick="printSubcontractorPO('${po.id}')">🖨 Print</button></td>
          </tr>`;
        }).join('') : `<tr><td colspan="12" class="empty">No Subcontractor POs created yet.</td></tr>`}
        </tbody>
      </table></div>
    </div>
  `;
}
// Prints a single Subcontractor PO using the same existing data shown in the Subcontractor PO
// list/table above — no new fields, nothing re-typed. Mirrors the Materials Purchase Order print
// (printPO) layout/format for a consistent look across both kinds of Purchase Orders.
function printSubcontractorPO(id){
  const po = DB.subcontractPOs.find(x=>x.id===id);
  if(!po) return;
  const bal = subcontractPOBalance(po);
  const issued = Math.round((po.qty-bal)*10000)/10000;
  const status = bal<=0.0001 ? 'Closed' : 'Open';
  const amount = Math.round((po.qty||0)*(po.rate||0)*100)/100;
  const rows = [[1, esc(po.partNo), esc(po.partName)||'—', esc(po.process)||'—', `<span class="num">${po.qty}</span>`, `<span class="num">${fmtMoney(po.rate)}</span>`, `<span class="num">${fmtMoney(amount)}</span>`]];
  rows.push(['', '<strong>TOTAL</strong>', '', '', `<span class="num"><strong>${po.qty}</strong></span>`, '', `<span class="num"><strong>${fmtMoney(amount)}</strong></span>`]);
  const subRec = DB.subcontractors.find(x=>x.id===po.subcontractorId);
  const subAddr = subRec ? (subRec.address||'') : '';
  const subContact = subRec ? (subRec.contact||'') : '';
  const subPhone = subRec ? (subRec.phone||'') : '';
  const subContactLine = [
    subContact ? `Contact Person: <strong>${esc(subContact)}</strong>` : '',
    subPhone ? `Phone: <strong>${esc(subPhone)}</strong>` : ''
  ].filter(Boolean).join(' &nbsp;|&nbsp; ');
  const barLeft = `
    <div>Subcontractor: <strong>${esc(po.subcontractorName)||'—'}</strong></div>
    <div>Process: <strong>${esc(po.process)||'—'}</strong></div>
    ${subContactLine ? `<div>${subContactLine}</div>` : ''}
  `;
  const scpoMetaRight = `<div class="poMetaRight">
      <div class="poMetaRow"><span class="poMetaK">PO Number</span><span class="poMetaV">${esc(po.poNo)}</span></div>
      <div class="poMetaRow"><span class="poMetaK">PO Date</span><span class="poMetaV">${fmtDate(po.poDate)}</span></div>
      <div class="poMetaRow"><span class="poMetaK">Status</span><span class="poMetaV">${esc(status)}</span></div>
    </div>`;
  const scpoExtraCss = `
    .prBar{ align-items:flex-start; }
    .prBar .prBarRow > span:first-child{ display:flex; flex-direction:column; gap:2px; line-height:1.6; }
    .poMetaRight{ display:flex; flex-direction:column; gap:3px; text-align:right; }
    .poMetaRow{ display:flex; justify-content:flex-end; align-items:baseline; gap:8px; line-height:1.6; }
    .poMetaK{ color:#3d4b58; min-width:76px; text-align:right; }
    .poMetaV{ font-weight:700; color:var(--accent-dark); min-width:96px; text-align:left; }
  `;
  const scpoFooterHtml = `<div class="prFoot"><div class="sign">Prepared By</div><div class="sign">Authorized Signatory</div></div>`;
  const note = po.remarks ? 'Remarks: '+po.remarks : '';
  printReport(`Subcontractor PO — ${po.poNo}`, ['Sl','Part No','Part Name','Process','Qty','Rate (₹)','Value (₹)'], rows,
    {barLeft, barRight:scpoMetaRight, barAddr:subAddr, note, extraCss:scpoExtraCss, pageMargin:'10mm', footerHtml:scpoFooterHtml, showSign:false,
     copies:['ORIGINAL COPY FOR SUBCONTRACTOR','OFFICE COPY']});
}

/* ---- Subcontract Details sub-module (Job Card Tracking → Subcontract Jobs) ---- */
function markSubcontractReceived(id){
  if(!requireWorkingUnit()) return;
  const sc = DB.subcontract.find(x=>x.id===id); if(!sc) return;
  const qtyEl = document.getElementById('scRecvQty_'+id);
  const qty = parseFloat(qtyEl?qtyEl.value:'')||0;
  if(qty<=0){ toast('Enter the Received Qty'); return; }
  if(qty > (sc.qty - (sc.receivedQty||0)) + 0.0001){ toast('Received Qty exceeds outstanding Subcontract Qty'); return; }
  sc.receivedQty = Math.round(((sc.receivedQty||0)+qty)*10000)/10000;
  sc.receivedDate = today();
  const fullyReceived = sc.receivedQty >= sc.qty - 0.0001;
  sc.status = fullyReceived ? 'Received' : 'Partially Received';
  // Material no longer goes straight to Stores (WIP) on physical receipt — it first lands in
  // Receiving Inspection → Subcontract Inspection as 'Pending', exactly like inward raw material
  // against a Purchase PO. Only a Pass result there returns it to Stores (see routeSubInspToStores).
  const inspId = 'si'+Date.now()+'_'+Math.floor(Math.random()*10000);
  DB.subInspection.push({
    id:inspId, unit:currentUnit,
    subcontractId:sc.id, jobNo:sc.jobNo, cardNo:sc.cardNo, dcNo:sc.dcNo, dcDate:sc.dcDate,
    partNo:sc.partNo, partName:sc.partName, subcontractorName:sc.subcontractorName, operation:sc.operation,
    qtyReceived:qty, date:today(), inspector:'', result:'Pending', remarks:'',
    pushedToStores:false, routeIndex:sc.routeIndex
  });
  if(fullyReceived) markJobCardComplete('subcontract', sc.id, today());
  // Logs the part's dwell in Receiving Inspection on the shared Job Card ledger (Stores ⇄
  // Production/Subcontract ⇄ Final Insp. ⇄ Inventory), so Part Tracking / Job Card History and the
  // Part 360° Flow View both show "Receiving Inspection" as the Current Stage while it awaits a
  // Pass/Hold/Fail result — closed out by routeSubInspToStores() the moment it Passes onward.
  logJobCard({cardNo:sc.cardNo, partNo:sc.partNo, partName:sc.partName, qty, prevStage:'Subcontract', stage:'Receiving Inspection', nextStage:'Stores',
    issueType:'', refType:'subInspection', refId:inspId, status:'Open'});
  saveDB();
  toast(`Received ${qty} from ${sc.subcontractorName} — sent to Receiving Inspection → Subcontract Inspection for quality check before Stores`);
  render();
}
function renderSubcontractJobs(main){
  const list = DB.subcontract.filter(x=>reportUnitMatch(x.unit)).slice().reverse();
  main.innerHTML = `
    <div class="panel" style="margin-top:16px;">
      <h3>Subcontract Jobs <span class="hint">Linked to Part No, Qty, Operation/Stage, Subcontractor and Issue Details — issued from Stores → Material Issue (In-House / Subcontract)</span></h3>
      <div class="tw"><table>
        <thead><tr><th>Job No</th><th>Card No</th><th>DC No.</th><th>Part No</th><th>Part Name</th><th>Operation/Stage</th><th>Subcontractor</th><th>Qty Issued</th><th>Qty Received</th><th>Issue Date</th><th>Status</th><th>Receive</th><th>Print DC</th></tr></thead>
        <tbody>
        ${list.length ? list.map(sc=>`
          <tr>
            <td>${esc(sc.jobNo)}</td><td style="color:var(--amber);">${esc(sc.cardNo)}</td>
            <td><b>${esc(sc.dcNo)||'—'}</b>${sc.dcDate?`<br><span class="hint" style="position:static; font-size:9px;">${fmtDate(sc.dcDate)}</span>`:''}</td>
            <td>${esc(sc.partNo)}</td><td>${esc(sc.partName)||'—'}</td>
            <td>${esc(sc.operation)}</td><td>${esc(sc.subcontractorName)}</td>
            <td class="num">${sc.qty}</td><td class="num">${sc.receivedQty||0}</td>
            <td>${fmtDate(sc.issueDate)}</td>
            <td><span class="pill ${sc.status==='Received'?'pass':sc.status==='Partially Received'?'hold':'open'}">${esc(sc.status)}</span></td>
            <td>${sc.status!=='Received' ? `<input id="scRecvQty_${sc.id}" type="number" step="any" placeholder="Qty" style="width:70px; display:inline-block; margin-right:4px;" value="${Math.round(((sc.qty-(sc.receivedQty||0)))*10000)/10000}"><button class="btn small amber" onclick="markSubcontractReceived('${sc.id}')">✅ Received</button>` : '—'}</td>
            <td><button class="btn small ghost" onclick="printSubcontractDC('${sc.id}')">🖨 Print DC</button></td>
          </tr>`).join('') : `<tr><td colspan="13" class="empty">No Subcontract jobs yet — select "Subcontract" as the Issue Type when issuing material from Stores.</td></tr>`}
        </tbody>
      </table></div>
    </div>`;
}
// Prints the Delivery Challan for a single Stores → Subcontractor material issue, using exactly
// the data already captured on that Subcontract Job record (Card No, DC No/Date, Part, Operation,
// Subcontractor, Qty, Rate, PO reference) — nothing re-typed or re-entered.
function printSubcontractDC(id){
  const sc = DB.subcontract.find(x=>x.id===id);
  if(!sc) return;
  const rows = [[1, esc(sc.partNo), esc(sc.partName)||'—', esc(sc.operation)||'—', `<span class="num">${sc.qty}</span>`, `<span class="num">${fmtMoney(sc.rate)}</span>`, `<span class="num">${fmtMoney(sc.amount)}</span>`]];
  rows.push(['', '<strong>TOTAL</strong>', '', '', `<span class="num"><strong>${sc.qty}</strong></span>`, '', `<span class="num"><strong>${fmtMoney(sc.amount)}</strong></span>`]);
  const subRec = DB.subcontractors.find(x=>x.id===sc.subcontractorId);
  const subAddr = subRec ? (subRec.address||'') : '';
  const subContact = subRec ? (subRec.contact||'') : '';
  const subPhone = subRec ? (subRec.phone||'') : '';
  const subContactLine = [
    subContact ? `Contact Person: <strong>${esc(subContact)}</strong>` : '',
    subPhone ? `Phone: <strong>${esc(subPhone)}</strong>` : ''
  ].filter(Boolean).join(' &nbsp;|&nbsp; ');
  const barLeft = `
    <div>Subcontractor: <strong>${esc(sc.subcontractorName)||'—'}</strong></div>
    <div>Subcontractor PO: <strong>${esc(sc.poNo)||'—'}</strong></div>
    ${subContactLine ? `<div>${subContactLine}</div>` : ''}
  `;
  const dcMetaRight = `<div class="poMetaRight">
      <div class="poMetaRow"><span class="poMetaK">DC Number</span><span class="poMetaV">${esc(sc.dcNo)||'—'}</span></div>
      <div class="poMetaRow"><span class="poMetaK">DC Date</span><span class="poMetaV">${fmtDate(sc.dcDate)}</span></div>
      <div class="poMetaRow"><span class="poMetaK">Card No</span><span class="poMetaV">${esc(sc.cardNo)}</span></div>
      <div class="poMetaRow"><span class="poMetaK">Job Tracking No</span><span class="poMetaV">${esc(sc.jobTrackingNo)||'—'}</span></div>
    </div>`;
  const dcExtraCss = `
    .prBar{ align-items:flex-start; }
    .prBar .prBarRow > span:first-child{ display:flex; flex-direction:column; gap:2px; line-height:1.6; }
    .poMetaRight{ display:flex; flex-direction:column; gap:3px; text-align:right; }
    .poMetaRow{ display:flex; justify-content:flex-end; align-items:baseline; gap:8px; line-height:1.6; }
    .poMetaK{ color:#3d4b58; min-width:96px; text-align:right; }
    .poMetaV{ font-weight:700; color:var(--accent-dark); min-width:96px; text-align:left; }
  `;
  const dcFooterHtml = `<div class="prFoot"><div class="sign">Issued By</div><div class="sign">Received By (Subcontractor)</div></div>`;
  const note = sc.dueDate ? 'Due Date: '+fmtDate(sc.dueDate) : '';
  printReport(`Delivery Challan — ${sc.dcNo||sc.cardNo}`, ['Sl','Part No','Part Name','Operation/Stage','Qty','Rate (₹)','Value (₹)'], rows,
    {barLeft, barRight:dcMetaRight, barAddr:subAddr, note, extraCss:dcExtraCss, pageMargin:'10mm', footerHtml:dcFooterHtml, showSign:false,
     copies:['ORIGINAL COPY FOR SUBCONTRACTOR','OFFICE COPY']});
}

/* ---- Part Number Tracking / Job Card History ---- */
// Part Numbers for the Job Card Tracking dropdown are pulled automatically from the Planning
// module (Sales Plan → DB.custPO and Job Work Plan → DB.labourPO) — every Finished Part Number
// that has been planned is available here to pick; nothing is manually typed or created.
function planningPartNumbers(){
  const map = new Map();
  DB.custPO.forEach(p=>{ if(p.finPartNo && !map.has(p.finPartNo)) map.set(p.finPartNo, p.finPartName||''); });
  DB.labourPO.forEach(p=>{ if(p.finPartNo && !map.has(p.finPartNo)) map.set(p.finPartNo, p.finPartName||''); });
  return Array.from(map.entries()).map(([partNo,partName])=>({partNo,partName})).sort((a,b)=>a.partNo.localeCompare(b.partNo));
}
// Same as planningPartNumbers(), but narrowed to just one Customer's Part Numbers — used by Part
// Routing's "select Customer first" flow so the Part No list only ever shows that customer's parts.
function planningPartNumbersForCustomer(customerId){
  if(!customerId) return [];
  const map = new Map();
  DB.custPO.forEach(p=>{ if(p.finPartNo && planRecCustomerKey(p)===customerId && !map.has(p.finPartNo)) map.set(p.finPartNo, p.finPartName||''); });
  DB.labourPO.forEach(p=>{ if(p.finPartNo && planRecCustomerKey(p)===customerId && !map.has(p.finPartNo)) map.set(p.finPartNo, p.finPartName||''); });
  return Array.from(map.entries()).map(([partNo,partName])=>({partNo,partName})).sort((a,b)=>a.partNo.localeCompare(b.partNo));
}
function setJTSearch(v){ jtSearchPart=v; renderPartTracking(document.getElementById('jtSub')); }
function renderPartTracking(main){
  const status = jtSearchPart ? partCurrentStatus(jtSearchPart) : null;
  const allParts = planningPartNumbers();
  main.innerHTML = `
    <div class="panel" style="margin-top:16px;">
      <h3>Part Number Tracking <span class="hint">Pick any Part No (auto-populated from Planning) for its complete history and current status across Stores, Production, Subcontract, Final Inspection and Finished Goods</span></h3>
      <div class="frow g2">
        <div><label class="fl">Part No</label>
          ${genericPickerHtml('jtSearchDD','jtSearchHidden',
            allParts.map(p=>({value:p.partNo, label:p.partNo})),
            jtSearchPart,
            allParts.length ? '— Select a Part No —' : 'No Part Numbers found in Planning yet',
            `setJTSearch(document.getElementById('jtSearchHidden').value)`)}
        </div>
      </div>
      ${!allParts.length ? `<div class="hint" style="position:static; display:block; margin-top:8px;">No Part Numbers have been planned yet — add Parts in Planning → Sales Plan or Job Work Plan first.</div>` : ''}
    </div>
    ${jtSearchPart ? (status ? `
    <div class="panel">
      <h3>${esc(jtSearchPart)} — ${esc((status.history[0]||{}).partName)||''} <span class="pill ${status.completed?'pass':'open'}">${status.completed?'Completed — in Inventory':'In Progress'}</span></h3>
      <div class="frow g4">
        <div><label class="fl">Current Stage</label><input disabled value="${esc(status.current)}"></div>
        <div><label class="fl">Previous Stage</label><input disabled value="${esc(status.previous)}"></div>
        <div><label class="fl">Next Stage</label><input disabled value="${esc(status.next)}"></div>
        <div><label class="fl">Total Job Card Rows</label><input disabled value="${status.history.length}"></div>
      </div>
    </div>
    <div class="panel">
      <h3>Complete Movement History</h3>
      <div class="tw"><table>
        <thead><tr><th>Card No</th><th>DC No</th><th>Qty</th><th>Prev Stage</th><th>Stage</th><th>Next Stage</th><th>In-House/Subcontract</th><th>Subcontractor</th><th>Issue Date</th><th>Completion Date</th><th>Status</th></tr></thead>
        <tbody>
        ${status.history.map(j=>`
          <tr>
            <td style="color:var(--amber);">${esc(j.cardNo)||'—'}</td>
            <td>${esc(j.dcNo)||'—'}</td>
            <td class="num">${j.qty}</td>
            <td>${esc(j.prevStage)||'—'}</td>
            <td><b>${esc(j.stage)}</b></td>
            <td>${esc(j.nextStage)||'—'}</td>
            <td>${esc(j.issueType)||'—'}</td>
            <td>${esc(j.subcontractorName)||'—'}</td>
            <td>${fmtDate(j.issueDate)}</td>
            <td>${j.completionDate?fmtDate(j.completionDate):'—'}</td>
            <td><span class="pill ${j.status==='Completed'?'pass':'open'}">${esc(j.status)}</span></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>` : `<div class="panel"><div class="empty">No Job Card history found for "${esc(jtSearchPart)}" — this Part hasn't been issued from Stores yet.</div></div>`) : ''}
  `;
}

/* ---- Part Number 360-Degree Flow View ---- */
// One Part No's complete journey — Stores → Subcontract → Receiving Inspection → Production →
// Final Inspection → Finished Goods — as a single glance-able summary: how much moved through
// each stage, and how much was rejected/held/failed at each stage, pulled live from every module's
// own records (Stores WIP, Subcontract Jobs, Subcontract Inspection, Production output entries,
// Final Inspection Cards/Reports, Finished Goods Stock). Read-only — never edits any data.
function setP360Search(v){ p360SearchPart=v; p360SelectedCard=''; renderPart360(document.getElementById('jtSub')); }
function setP360Card(cardNo){ p360SelectedCard = (p360SelectedCard===cardNo) ? '' : cardNo; renderPart360(document.getElementById('jtSub')); }
// Every distinct Job Card No that has ever moved this Part No, one row per card, drawn from the
// shared Job Card ledger (the same source Part Tracking's "Complete Movement History" uses) —
// grouped so the 360° view can offer a Job Card No column next to the Part No and let the user
// drill into one specific card's own stage-wise history and rejection detail.
function part360CardsList(partNo){
  const hist = jobCardHistoryForPart(partNo);
  const map = new Map();
  hist.forEach(j=>{
    if(!j.cardNo) return;
    if(!map.has(j.cardNo)) map.set(j.cardNo, {cardNo:j.cardNo, rows:[], firstDate:j.issueDate||''});
    const g = map.get(j.cardNo);
    g.rows.push(j);
    if(j.issueDate && (!g.firstDate || j.issueDate<g.firstDate)) g.firstDate = j.issueDate;
  });
  return Array.from(map.values()).map(g=>{
    const rows = g.rows.slice().sort((a,b)=>(a.issueDate||'').localeCompare(b.issueDate||'')||(''+a.id).localeCompare(''+b.id));
    const last = rows[rows.length-1];
    const openRow = rows.slice().reverse().find(r=>r.status==='Open');
    return {cardNo:g.cardNo, firstDate:g.firstDate, rows, lastStage:last.stage, status: openRow?'Open':'Completed', currentStage: openRow?openRow.stage:last.stage};
  }).sort((a,b)=>(a.firstDate||'').localeCompare(b.firstDate||'')||a.cardNo.localeCompare(b.cardNo));
}
// One Job Card's own stage-wise movement + rejection detail — matches this cardNo against every
// module that records it (Subcontract Job, Subcontract Inspection, Production Job, Final Inspection
// Card/Reports), so the drill-down shows exactly what happened to THIS card, not the whole Part No.
function part360CardDetail(cardNo){
  const rows = DB.jobCards.filter(j=>j.cardNo===cardNo).sort((a,b)=>(a.issueDate||'').localeCompare(b.issueDate||'')||(''+a.id).localeCompare(''+b.id));
  const sc = DB.subcontract.find(x=>x.cardNo===cardNo) || null;
  const subInsp = sc ? DB.subInspection.filter(x=>x.subcontractId===sc.id) : DB.subInspection.filter(x=>x.cardNo===cardNo);
  const prod = DB.production.find(x=>x.cardNo===cardNo) || null;
  const fic = DB.finalInspCards.find(c=>c.cardNo===cardNo) || null;
  const fiReports = DB.finalInsp.filter(f=>f.card===cardNo || (fic && f.fiCardId===fic.id));
  return {cardNo, rows, sc, subInsp, prod, fic, fiReports};
}
// Same six-stage shape as part360Data(), but scoped to ONE Job Card No only — used to swap the
// 360° summary itself into "single card" mode once the user picks a card from the list below it.
function part360CardFlowData(partNo, cardNo){
  const cd = part360CardDetail(cardNo);
  const sum = (arr,fn)=>Math.round(arr.reduce((a,x)=>a+(fn(x)||0),0)*10000)/10000;
  const storesQty = sum(DB.stores.filter(s=>reportUnitMatch(s.unit) && s.wip && s.cardNo===cardNo), s=>s.qty);
  const fgQty = sum(DB.inventory.filter(x=>reportUnitMatch(x.unit) && x.cardNo===cardNo), x=>x.qty);
  const subInsp = cd.subInsp||[];
  const fiFailQty = sum((cd.fiReports||[]).filter(f=>f.result==='Fail'), f=>f.qty);
  const openRow = cd.rows.slice().reverse().find(r=>r.status==='Open');
  const last = cd.rows[cd.rows.length-1];
  const currentStage = openRow ? openRow.stage : (last ? last.stage : '');
  const completed = !openRow;
  const partName = cd.sc ? cd.sc.partName : (cd.prod ? cd.prod.partName : (cd.fic ? cd.fic.partName : ''));
  return {
    partNo, partName, cardNo, cd,
    status:{ current: currentStage, completed, history: cd.rows },
    stores:{ wipQty: storesQty },
    subcontract:{ issuedQty: cd.sc?(cd.sc.qty||0):0, receivedQty: cd.sc?(cd.sc.receivedQty||0):0, pendingQty: cd.sc?Math.max(0,(cd.sc.qty||0)-(cd.sc.receivedQty||0)):0 },
    subInsp:{ passQty: sum(subInsp.filter(x=>x.result==='Pass'),x=>x.qtyReceived), holdQty: sum(subInsp.filter(x=>x.result==='Hold'),x=>x.qtyReceived), failQty: sum(subInsp.filter(x=>x.result==='Fail'),x=>x.qtyReceived), pendingQty: sum(subInsp.filter(x=>x.result==='Pending'),x=>x.qtyReceived) },
    production:{ issuedQty: cd.prod?(cd.prod.issuedQty||cd.prod.qty||0):0, goodQty: cd.prod?(cd.prod.goodQty||0):0, rejectQty: cd.prod?(cd.prod.rejectionQty||0):0, reworkQty: cd.prod?(cd.prod.reworkQty||0):0 },
    finalInsp:{ prodQty: cd.fic?(cd.fic.prodQty||0):0, okQty: cd.fic?(cd.fic.okQty||0):0, pendingQty: cd.fic?(cd.fic.pendingQty||0):0, failQty: fiFailQty, failCount:(cd.fiReports||[]).filter(f=>f.result==='Fail').length },
    finishedGoods:{ qty: fgQty },
    hasAnyData: cd.rows.length>0
  };
}
function part360Data(partNo){
  const key = (partNo||'').trim().toLowerCase();
  if(!key) return null;
  const mpn = p => (p||'').trim().toLowerCase()===key;

  const storesWIP = DB.stores.filter(s=>reportUnitMatch(s.unit) && s.wip && mpn(s.partNo));
  const scJobs = DB.subcontract.filter(x=>reportUnitMatch(x.unit) && mpn(x.partNo));
  const subInsp = DB.subInspection.filter(x=>reportUnitMatch(x.unit) && mpn(x.partNo));
  const prodJobs = DB.production.filter(x=>reportUnitMatch(x.unit) && (mpn(x.partNo)||mpn(x.finPartNo)));
  const ficCards = DB.finalInspCards.filter(c=>reportUnitMatch(c.unit) && mpn(c.partNo));
  const fiReports = DB.finalInsp.filter(f=>reportUnitMatch(f.unit) && mpn(f.partNo));
  const fg = DB.inventory.filter(x=>reportUnitMatch(x.unit) && mpn(x.partNo));

  const sum = (arr,fn)=>Math.round(arr.reduce((a,x)=>a+(fn(x)||0),0)*10000)/10000;
  const status = partCurrentStatus(partNo);
  const partName = (storesWIP[0]||scJobs[0]||subInsp[0]||prodJobs[0]||ficCards[0]||fg[0]||{}).partName
    || (status && status.history[0] ? status.history[0].partName : '') || '';

  return {
    partNo, partName, status,
    stores:{ wipQty: sum(storesWIP,s=>s.qty), lots: storesWIP.length },
    subcontract:{ issuedQty: sum(scJobs,x=>x.qty), receivedQty: sum(scJobs,x=>x.receivedQty), pendingQty: Math.max(0, sum(scJobs,x=>x.qty)-sum(scJobs,x=>x.receivedQty)), jobs: scJobs.length },
    subInsp:{ passQty: sum(subInsp.filter(x=>x.result==='Pass'),x=>x.qtyReceived), holdQty: sum(subInsp.filter(x=>x.result==='Hold'),x=>x.qtyReceived), failQty: sum(subInsp.filter(x=>x.result==='Fail'),x=>x.qtyReceived), pendingQty: sum(subInsp.filter(x=>x.result==='Pending'),x=>x.qtyReceived), entries: subInsp.length },
    production:{ issuedQty: sum(prodJobs,x=>x.issuedQty||x.qty), goodQty: sum(prodJobs,x=>x.goodQty), rejectQty: sum(prodJobs,x=>x.rejectionQty), reworkQty: sum(prodJobs,x=>x.reworkQty), shortageQty: sum(prodJobs,x=>x.shortageQty), jobs: prodJobs.length },
    finalInsp:{ prodQty: sum(ficCards,c=>c.prodQty), okQty: sum(ficCards,c=>c.okQty), reworkQty: sum(ficCards,c=>c.reworkQty), pendingQty: sum(ficCards,c=>c.pendingQty), failQty: sum(fiReports.filter(f=>f.result==='Fail'),f=>f.qty), cards: ficCards.length },
    finishedGoods:{ qty: sum(fg,x=>x.qty), lots: fg.length },
    hasAnyData: !!(storesWIP.length||scJobs.length||subInsp.length||prodJobs.length||ficCards.length||fg.length||(status&&status.history.length))
  };
}
// Maps partCurrentStatus()'s free-text "current stage" onto one of the six flow-card keys, so
// the matching card can be highlighted as the Part's live position in the flow.
function p360CurrentStageKey(status){
  if(!status || status.completed) return 'finishedGoods';
  const c = (status.current||'').toLowerCase();
  if(c.includes('subcontract')) return 'subcontract';
  if(c.includes('receiving inspection')) return 'subInsp';
  if(c.includes('production')) return 'production';
  if(c.includes('final inspection')) return 'finalInsp';
  if(c.includes('finished goods')||c.includes('inventory')) return 'finishedGoods';
  if(c.includes('stores')) return 'stores';
  return '';
}
function p360StageCardHtml(stage, currentKey){
  const isCurrent = stage.key===currentKey;
  return `<div class="p360-stage${isCurrent?' current':''}">
    <div class="p360-label">${stage.icon} ${esc(stage.label)}${isCurrent?' <span class="pill open" style="margin-left:4px;">HERE</span>':''}</div>
    ${stage.rows.map(r=>`<div class="p360-row ${r[2]||''}"><span class="k">${esc(r[0])}</span><span class="v">${r[1]}</span></div>`).join('')}
  </div>`;
}
function renderPart360(main){
  const allParts = planningPartNumbers();
  const d = p360SearchPart ? part360Data(p360SearchPart) : null;
  const cardsList = p360SearchPart ? part360CardsList(p360SearchPart) : [];
  // Whichever dataset should drive the 360° flow panel right now: the selected Job Card's own
  // data exclusively (once one is picked from the list below), or the Part No's consolidated
  // totals across every card, by default.
  const cardData = (p360SelectedCard && cardsList.some(c=>c.cardNo===p360SelectedCard)) ? part360CardFlowData(p360SearchPart, p360SelectedCard) : null;
  const active = cardData || d;

  main.innerHTML = `
    <div class="panel" style="margin-top:16px;">
      <h3>Part Number 360° Flow View <span class="hint">Pick any Part No for its consolidated end-to-end summary — Stores → Subcontract → Receiving Inspection → Production → Final Inspection → Finished Goods — then click a Job Card below to switch this view to that card exclusively.</span></h3>
      <div class="frow g2">
        <div><label class="fl">Part No</label>
          ${genericPickerHtml('p360SearchDD','p360SearchHidden',
            allParts.map(p=>({value:p.partNo, label:p.partNo})),
            p360SearchPart,
            allParts.length ? '— Select a Part No —' : 'No Part Numbers found in Planning yet',
            `setP360Search(document.getElementById('p360SearchHidden').value)`)}
        </div>
      </div>
      ${!allParts.length ? `<div class="hint" style="position:static; display:block; margin-top:8px;">No Part Numbers have been planned yet — add Parts in Planning → Sales Plan or Job Work Plan first.</div>` : ''}
    </div>
    ${p360SearchPart ? (active && active.hasAnyData ? (()=>{
        const currentKey = p360CurrentStageKey(active.status);
        const stages = [
          {key:'stores', icon:'🏬', label:'Stores', rows:[['WIP Qty in Stores', active.stores.wipQty]]},
          {key:'subcontract', icon:'🏗️', label:'Subcontract', rows:[['Issued Qty', active.subcontract.issuedQty],['Received Qty', active.subcontract.receivedQty],['Pending Return', active.subcontract.pendingQty]]},
          {key:'subInsp', icon:'🔬', label:'Receiving Inspection', rows:[['Pending', active.subInsp.pendingQty],['Pass Qty', active.subInsp.passQty,'ok'],['Rejected (Fail)', active.subInsp.failQty,'rej'],['On Hold', active.subInsp.holdQty]]},
          {key:'production', icon:'⚙️', label:'Production', rows:[['Issued Qty', active.production.issuedQty],['Good Qty', active.production.goodQty,'ok'],['Rejection Qty', active.production.rejectQty,'rej'],['Rework Qty', active.production.reworkQty]]},
          {key:'finalInsp', icon:'✅', label:'Final Inspection', rows:[['Production Qty', active.finalInsp.prodQty],['OK Qty', active.finalInsp.okQty,'ok'],['Rejected (Fail)', active.finalInsp.failQty,'rej'],['Pending', active.finalInsp.pendingQty]]},
          {key:'finishedGoods', icon:'📦', label:'Finished Goods', rows:[['Stock Qty', active.finishedGoods.qty,'ok']]}
        ];
        const totalProduced = Math.round((active.production.goodQty + active.finalInsp.okQty)*10000)/10000;
        const totalRejected = Math.round((active.subInsp.failQty + active.production.rejectQty + active.finalInsp.failQty)*10000)/10000;
        const isCardMode = !!cardData;
        // Production/Final Inspection rejection-reason breakdown — only meaningful in single-card
        // mode, since a consolidated view would be mixing reasons from unrelated batches together.
        const rejBreakdownHtml = isCardMode ? `
          <div class="frow g4" style="margin-top:14px;">
            ${cardData.cd.sc ? `<div class="mini-card"><div class="mc-row"><span class="mc-k">Subcontractor</span><span class="mc-v">${esc(cardData.cd.sc.subcontractorName)||'—'}</span></div><div class="mc-row"><span class="mc-k">Issued Qty</span><span class="mc-v">${cardData.cd.sc.qty||0}</span></div><div class="mc-row"><span class="mc-k">Received Qty</span><span class="mc-v">${cardData.cd.sc.receivedQty||0}</span></div><div class="mc-row"><span class="mc-k">Status</span><span class="mc-v">${esc(cardData.cd.sc.status)||'—'}</span></div></div>` : ''}
            ${cardData.cd.prod && (cardData.cd.prod.rejectionRows||[]).length ? `<div class="mini-card"><div class="mc-row"><span class="mc-k" style="font-weight:700;">Production Rejection Reasons</span><span class="mc-v"></span></div>${cardData.cd.prod.rejectionRows.map(r=>`<div class="mc-row"><span class="mc-k">↳ ${esc(r.reason)}</span><span class="mc-v" style="color:var(--red);">${r.qty}</span></div>`).join('')}</div>` : ''}
            ${cardData.finalInsp.failCount ? `<div class="mini-card"><div class="mc-row"><span class="mc-k">Final Insp. Fail Reports</span><span class="mc-v" style="color:var(--red);">${cardData.finalInsp.failCount} report${cardData.finalInsp.failCount===1?'':'s'} — ${cardData.finalInsp.failQty} Qty</span></div></div>` : ''}
          </div>` : '';
        return `
    <div class="panel" ${isCardMode?'style="border-left:3px solid var(--amber);"':''}>
      <h3>
        ${isCardMode ? `Job Card ${esc(active.cardNo)} — 360° Flow View <span class="hint">(exclusive to this card)</span>` : `${esc(active.partNo)}${active.partName?' — '+esc(active.partName):''} <span class="hint">(Consolidated — all Job Cards)</span>`}
        <span class="pill ${active.status&&active.status.completed?'pass':'open'}">${active.status?(active.status.completed?'Completed — in Inventory':'In Progress — '+esc(active.status.current)):'No Job Card movement yet'}</span>
        ${isCardMode ? `<button class="btn small ghost" style="margin-left:8px;" onclick="setP360Card('${esc(active.cardNo)}')">✕ Clear — Back to Consolidated</button>` : ''}
      </h3>
      <div class="mini-card" style="margin-bottom:14px;">
        <div class="mc-row"><span class="mc-k">Total Good/OK Qty across Production + Final Inspection</span><span class="mc-v" style="color:var(--green); font-weight:700;">${totalProduced}</span></div>
        <div class="mc-row"><span class="mc-k">Total Rejected Qty (Receiving Insp. + Production + Final Insp.)</span><span class="mc-v" style="color:var(--red); font-weight:700;">${totalRejected}</span></div>
        <div class="mc-row"><span class="mc-k">Finished Goods Stock Now</span><span class="mc-v" style="font-weight:700;">${active.finishedGoods.qty}</span></div>
      </div>
      <div class="p360-flow">
        ${stages.map(s=>p360StageCardHtml(s,currentKey)).join('')}
      </div>
      ${rejBreakdownHtml}
      ${isCardMode ? `
      <h3 style="margin-top:18px;">Job Card ${esc(active.cardNo)} — Stage-wise Movement History</h3>
      <div class="tw"><table>
        <thead><tr><th>Prev Stage</th><th>Stage</th><th>Next Stage</th><th>Qty</th><th>In-House/Subcontract</th><th>Subcontractor</th><th>Issue Date</th><th>Completion Date</th><th>Status</th></tr></thead>
        <tbody>
        ${cardData.cd.rows.map(j=>`
          <tr>
            <td>${esc(j.prevStage)||'—'}</td>
            <td><b>${esc(j.stage)}</b></td>
            <td>${esc(j.nextStage)||'—'}</td>
            <td class="num">${j.qty}</td>
            <td>${esc(j.issueType)||'—'}</td>
            <td>${esc(j.subcontractorName)||'—'}</td>
            <td>${fmtDate(j.issueDate)}</td>
            <td>${j.completionDate?fmtDate(j.completionDate):'—'}</td>
            <td><span class="pill ${j.status==='Completed'?'pass':'open'}">${esc(j.status)}</span></td>
          </tr>`).join('')}
        </tbody>
      </table></div>` : `<div class="hint" style="position:static; margin-top:6px;">HERE marks the Part's current live position, per its Job Card ledger. Click a Job Card below to see this same view exclusively for that card, with its own rejection breakdown.</div>`}
    </div>
    <div class="panel">
      <h3>Job Cards for ${esc(p360SearchPart)} <span class="hint">${cardsList.length} card(s) — click a row to switch the 360° view above to that card exclusively</span></h3>
      <div class="tw"><table>
        <thead><tr><th>Job Card No.</th><th>First Issue Date</th><th>Current Stage</th><th>Status</th><th>Movement Rows</th><th></th></tr></thead>
        <tbody>
        ${cardsList.length ? cardsList.map(c=>`
          <tr style="cursor:pointer; ${p360SelectedCard===c.cardNo?'background:color-mix(in srgb, var(--amber) 12%, transparent);':''}" onclick="setP360Card('${esc(c.cardNo)}')">
            <td style="color:var(--amber); font-weight:700;">${esc(c.cardNo)}</td>
            <td>${fmtDate(c.firstDate)||'—'}</td>
            <td><b>${esc(c.currentStage)}</b></td>
            <td><span class="pill ${c.status==='Completed'?'pass':'open'}">${c.status}</span></td>
            <td class="num">${c.rows.length}</td>
            <td><button class="btn small ${p360SelectedCard===c.cardNo?'amber':'ghost'}" onclick="event.stopPropagation(); setP360Card('${esc(c.cardNo)}')">${p360SelectedCard===c.cardNo?'✕ Close':'🔎 View'}</button></td>
          </tr>`).join('') : `<tr><td colspan="6" class="empty">No Job Card ledger rows found for this Part No yet.</td></tr>`}
        </tbody>
      </table></div>
    </div>`;
      })() : `<div class="panel"><div class="empty">No records found anywhere for "${esc(p360SearchPart)}" yet — this Part hasn't moved through Stores, Subcontract, Production, Final Inspection or Finished Goods.</div></div>`) : ''}
  `;
}
