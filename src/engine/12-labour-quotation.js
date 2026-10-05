/* ---------------- LABOUR QUOTATION ---------------- */
function blankLqOpRow(){ return {q:'', a:''}; } // q = Quotation Cycle Time (sec), a = Actual Cycle Time (sec)
function blankLabourItem(){
  return {id:'li'+Math.random().toString(36).slice(2,9), partNo:'', partName:'',
    // CNC / VMC Cycle Time Working rows — dynamic list, same design as the Sales Quotation's
    // Machining Cost Working table. Only ONE row is shown by default when the table first
    // opens for a new item; use "Add Operation Row" to add as many more as needed. Each row
    // carries BOTH a Quotation Cycle Time and an Actual (shop-floor) Cycle Time.
    lqCncOps:[blankLqOpRow()], lqVmcOps:[blankLqOpRow()], negoPct:''};
}
// Back-compat: older saved Job Work Quotations only have flat cnc1..5 / vmc1..5 fields (single
// Quotation-only cycle time, no Actual). This migrates any such item in-place to the new
// dynamic lqCncOps/lqVmcOps row model — keeping only the operation slots that actually had a
// value, and mirroring that existing Quotation cycle time into the Actual column too, so an
// already-created part never shows blank Quotation/Actual fields. Newly added rows afterwards
// still start fully blank in both columns, as normal. This backfill runs at most once per item
// (tracked via _lqActualSeeded). Always call before reading lq ops.
function ensureLqOps(it){
  // Same defensive migration as ensureMcwOps: treat a single all-blank row as "not yet
  // migrated" too, in case this item was ever merged with blankLabourItem()'s trivial
  // one-row default before its real legacy cnc1..5/vmc1..5 data got a chance to be read.
  const isTrivialBlank = arr => Array.isArray(arr) && arr.length===1 && !(arr[0].q===0||!!arr[0].q) && !(arr[0].a===0||!!arr[0].a);
  if(!Array.isArray(it.lqCncOps) || isTrivialBlank(it.lqCncOps)){
    const filled = [1,2,3,4,5].map(n=>it['cnc'+n]).filter(v=>v===0||!!v);
    if(filled.length) it.lqCncOps = filled.map(v=>({q:v, a:v}));
    else if(!Array.isArray(it.lqCncOps)) it.lqCncOps = [blankLqOpRow()];
  }
  if(!Array.isArray(it.lqVmcOps) || isTrivialBlank(it.lqVmcOps)){
    const filled = [1,2,3,4,5].map(n=>it['vmc'+n]).filter(v=>v===0||!!v);
    if(filled.length) it.lqVmcOps = filled.map(v=>({q:v, a:v}));
    else if(!Array.isArray(it.lqVmcOps)) it.lqVmcOps = [blankLqOpRow()];
  }
  if(!it.lqCncOps.length) it.lqCncOps.push(blankLqOpRow());
  if(!it.lqVmcOps.length) it.lqVmcOps.push(blankLqOpRow());
  if(!it._lqActualSeeded){
    it.lqCncOps.forEach(r=>{ if((r.q===0||!!r.q) && !(r.a===0||!!r.a)) r.a = r.q; });
    it.lqVmcOps.forEach(r=>{ if((r.q===0||!!r.q) && !(r.a===0||!!r.a)) r.a = r.q; });
    it._lqActualSeeded = true;
  }
  return it;
}
function calcLabourItem(it, cncRate, vmcRate, profitPct){
  ensureLqOps(it);
  // Quotation Cycle Time totals drive the Quotation cost math, exactly as CNC/VMC time did
  // before. Actual (shop-floor) Cycle Time totals are computed alongside for display/
  // comparison and to feed the Production module — they never affect the Quotation cost.
  const cncTime = it.lqCncOps.reduce((a,r)=>a+(parseFloat(r.q)||0),0); // seconds — Quotation
  const vmcTime = it.lqVmcOps.reduce((a,r)=>a+(parseFloat(r.q)||0),0); // seconds — Quotation
  const cncTimeActual = it.lqCncOps.reduce((a,r)=>a+(parseFloat(r.a)||0),0); // seconds — Actual
  const vmcTimeActual = it.lqVmcOps.reduce((a,r)=>a+(parseFloat(r.a)||0),0); // seconds — Actual
  const cncCost = (cncTime/60) * (parseFloat(cncRate)||0);
  const vmcCost = (vmcTime/60) * (parseFloat(vmcRate)||0);
  const totalCost = cncCost + vmcCost;
  const negoAdj = totalCost * (parseFloat(it.negoPct)||0) / 100;
  const profit = (totalCost + negoAdj) * (parseFloat(profitPct)||0) / 100;
  const total = totalCost + negoAdj + profit;
  return {cncTime, vmcTime, cncTimeActual, vmcTimeActual, cncCost, vmcCost, totalCost, negoAdj, profit, total};
}
// Updates a single Quotation ('q') or Actual ('a') cycle-time cell for one CNC/VMC operation
// row, then refreshes the Job Work Cost calculations (driven by Quotation time only).
function updateLqOpCell(i, kind, idx, part, val){
  if(!labourItemsDraft[i]) return;
  ensureLqOps(labourItemsDraft[i]);
  const arr = kind==='cnc' ? labourItemsDraft[i].lqCncOps : labourItemsDraft[i].lqVmcOps;
  if(!arr[idx]) return;
  arr[idx][part] = val===''?'':Math.round(parseFloat(val))||0;
  refreshLabourCalcs();
}
// Adding/removing an operation row changes the row COUNT, so this needs a full re-render of
// the item row (unlike a plain value edit, handled by refreshLabourCalcs). Both CNC and VMC
// arrays are always kept the same length so every OPN-n row shows all 4 columns together.
function addLqOpRow(i){
  if(!labourItemsDraft[i]) return;
  const it = labourItemsDraft[i];
  ensureLqOps(it);
  it.lqCncOps.push(blankLqOpRow());
  it.lqVmcOps.push(blankLqOpRow());
  renderLabourItemRows();
}
function removeLqOpRow(i, idx){
  if(!labourItemsDraft[i]) return;
  const it = labourItemsDraft[i];
  ensureLqOps(it);
  if(it.lqCncOps.length<=1) return; // always keep at least one operation row
  it.lqCncOps.splice(idx,1);
  if(it.lqVmcOps[idx]!==undefined) it.lqVmcOps.splice(idx,1);
  renderLabourItemRows();
}
// Renders the dynamic CNC/VMC Cycle Time Working table for a Job Work Quotation item — same
// 4-column layout and CNC/VMC color differentiation as the Sales Quotation's Machining Cost
// Working table: one row per operation (OPN No. is the one common field per row), with CNC
// Quotation, CNC Actual, VMC Quotation, VMC Actual side by side. Any number of rows can be
// added; both CNC and VMC columns always stay in sync on row count so OPN-n lines up.
function lqOpsTableHtml(i, it){
  ensureLqOps(it);
  const rows = Math.max(it.lqCncOps.length, it.lqVmcOps.length);
  while(it.lqCncOps.length<rows) it.lqCncOps.push(blankLqOpRow());
  while(it.lqVmcOps.length<rows) it.lqVmcOps.push(blankLqOpRow());
  const cell = (kind, idx, part, val) => `<input type="number" step="1" placeholder="sec" value="${val===0||val?Math.round(val):''}" style="width:100%;" oninput="updateLqOpCell(${i},'${kind}',${idx},'${part}',this.value)">`;
  const rowsHtml = Array.from({length:rows}).map((_,idx)=>{
    const c = it.lqCncOps[idx], v = it.lqVmcOps[idx];
    return `<tr>
      <td class="pt-text ct-opn-col" style="font-weight:700; white-space:nowrap;">OPN-${idx+1}</td>
      <td class="ct-cnc-col">${cell('cnc',idx,'q',c.q)}</td>
      <td class="ct-cnc-col">${cell('cnc',idx,'a',c.a)}</td>
      <td class="ct-vmc-col">${cell('vmc',idx,'q',v.q)}</td>
      <td class="ct-vmc-col">${cell('vmc',idx,'a',v.a)}</td>
      <td style="text-align:center;">${rows>1?`<button type="button" class="btn small ghost" title="Remove this operation row" onclick="removeLqOpRow(${i},${idx})">✕</button>`:''}</td>
    </tr>`;
  }).join('');
  return `
  <table class="plan-table mc-detail-table mcw-ops-table" style="margin-bottom:8px;">
    <thead>
      <tr>
        <th rowspan="2" class="ct-opn-col" style="vertical-align:middle;">Operation<br><span class="hint" style="position:static; font-weight:400;">(OPN No.)</span></th>
        <th colspan="2" class="ct-cnc-col ct-head">CNC Operation Cost</th>
        <th colspan="2" class="ct-vmc-col ct-head">VMC Operation Cost</th>
        <th rowspan="2" style="vertical-align:middle;"></th>
      </tr>
      <tr>
        <th class="pt-num-h ct-cnc-col">Quotation (sec)</th>
        <th class="pt-num-h ct-cnc-col">Actual (sec)</th>
        <th class="pt-num-h ct-vmc-col">Quotation (sec)</th>
        <th class="pt-num-h ct-vmc-col">Actual (sec)</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <button type="button" class="btn small ghost" onclick="addLqOpRow(${i})">➕ Add Operation Row</button>`;
}
function addLabourItemRow(){ labourItemsDraft.push(blankLabourItem()); render(); }
function removeLabourItemRow(i){ labourItemsDraft.splice(i,1); render(); }
function setLabourRowPartFromMasterCustom(i, partNo, name, el){
  setLabourRowPartFromMaster(i, partNo, name);
  const dispEl = document.getElementById('liFinPartDisplay'+i);
  if(dispEl) dispEl.value = partNo==='__other__' ? '' : partNo;
  const list = document.getElementById('liFinPartList'+i);
  if(list) list.style.display = 'none';
}
function setLabourRowPartFromMaster(i, partNoVal, explicitName){
  if(!labourItemsDraft[i]) return;
  if(partNoVal==='__other__'){ labourItemsDraft[i].partNo=''; labourItemsDraft[i].partName=''; }
  else if(partNoVal){
    let name = explicitName;
    if(name===undefined){
      let found = null;
      DB.labourQuotation.forEach(q=>(q.items||[]).forEach(it=>{
        if(!found && (it.partNo||'').trim()===partNoVal) found = it;
      }));
      name = found ? (found.partName||'') : '';
    }
    labourItemsDraft[i].partNo = partNoVal;
    labourItemsDraft[i].partName = name;
  } else { return; }
  const pnEl = document.getElementById('liFinPartDisplay'+i);
  const pmEl = document.getElementById('liPartName'+i);
  if(pnEl) pnEl.value = labourItemsDraft[i].partNo;
  if(pmEl) pmEl.value = labourItemsDraft[i].partName;
  if(partNoVal==='__other__' && pnEl) pnEl.focus();
}
function updateLabourItemRow(i, field, val){
  if(!labourItemsDraft[i]) return;
  labourItemsDraft[i][field] = val;
  refreshLabourCalcs();
}
function labourRates(){
  const cncRate = document.getElementById('lqCncRate') ? document.getElementById('lqCncRate').value : 5;
  const vmcRate = document.getElementById('lqVmcRate') ? document.getElementById('lqVmcRate').value : 7;
  const profitPct = document.getElementById('lqProfitPct') ? document.getElementById('lqProfitPct').value : 12;
  return {cncRate, vmcRate, profitPct};
}
function refreshLabourCalcs(){
  const {cncRate, vmcRate, profitPct} = labourRates();
  labourItemsDraft.forEach((it,i)=>{
    const row = document.querySelector(`#lqItemRows [data-lrow="${i}"]`);
    if(!row) return;
    const c = calcLabourItem(it, cncRate, vmcRate, profitPct);
    const cncEl = row.querySelector('[data-lcalc="cncTime"]');
    const vmcEl = row.querySelector('[data-lcalc="vmcTime"]');
    const cncActEl = row.querySelector('[data-lcalc="cncTimeActual"]');
    const vmcActEl = row.querySelector('[data-lcalc="vmcTimeActual"]');
    const totCostEl = row.querySelector('[data-lcalc="totalCost"]');
    const negoEl = row.querySelector('[data-lcalc="negoAdj"]');
    const profitEl = row.querySelector('[data-lcalc="profit"]');
    const totalEl = row.querySelector('[data-lcalc="total"]');
    if(cncEl) cncEl.value = c.cncTime;
    if(vmcEl) vmcEl.value = c.vmcTime;
    if(cncActEl) cncActEl.value = c.cncTimeActual;
    if(vmcActEl) vmcActEl.value = c.vmcTimeActual;
    if(totCostEl) totCostEl.value = c.totalCost.toFixed(2);
    if(negoEl) negoEl.value = c.negoAdj.toFixed(2);
    if(profitEl) profitEl.value = c.profit.toFixed(2);
    if(totalEl) totalEl.value = c.total.toFixed(2);
  });
  const grandEl = document.getElementById('lqGrandTotal');
  if(grandEl){
    const grand = labourItemsDraft.reduce((a,it)=>a+calcLabourItem(it, cncRate, vmcRate, profitPct).total,0);
    grandEl.textContent = fmtMoney(grand);
  }
}
function labourItemRowHtml(it,i,cncRate,vmcRate,profitPct){
  const c = calcLabourItem(it, cncRate, vmcRate, profitPct);
  return `
  <div class="qi-row" data-lrow="${i}">
    <div class="qi-row-head">
      <span class="qi-row-num">Item ${i+1}</span>
      <button class="btn danger small" onclick="removeLabourItemRow(${i})">✕ Remove Item</button>
    </div>
    <div class="frow g4">
      <div><label class="fl">Part No</label>
        <div class="fdd" id="liFinPartDD${i}">
          <input type="text" id="liFinPartDisplay${i}" value="${esc(it.partNo)}" placeholder="e.g. 2488982" onclick="toggleFddList('liFinPartList${i}')" oninput="updateLabourItemRow(${i},'partNo',this.value); autoFillFinPartName(${i},'labour')">
          <div class="fdd-list" id="liFinPartList${i}" style="display:none;">
            <div class="fdd-item" onclick="setLabourRowPartFromMasterCustom(${i},'','',this)">— pick part from list —</div>
            ${labourFinPartPickerItemsHtml(i)}
            <div class="fdd-item" onclick="setLabourRowPartFromMasterCustom(${i},'__other__','',this)">Other (type manually)</div>
          </div>
        </div>
      </div>
      <div><label class="fl">Part Name</label><input id="liPartName${i}" value="${esc(it.partName)}" placeholder="e.g. Valve" oninput="updateLabourItemRow(${i},'partName',this.value)"></div>
      <div><label class="fl">CNC Time — Quotation (sec) <span class="hint" style="position:static; font-size:9.5px;">(auto = sum of CNC Quotation column)</span></label><input data-lcalc="cncTime" value="${c.cncTime}" disabled></div>
      <div><label class="fl">VMC Time — Quotation (sec) <span class="hint" style="position:static; font-size:9.5px;">(auto = sum of VMC Quotation column)</span></label><input data-lcalc="vmcTime" value="${c.vmcTime}" disabled></div>
    </div>
    <div class="frow g4" style="margin-top:6px;">
      <div><label class="fl">CNC Time — Actual (sec) <span class="hint" style="position:static; font-size:9.5px;">(→ feeds Production)</span></label><input data-lcalc="cncTimeActual" value="${c.cncTimeActual}" disabled style="font-weight:700; color:#1f6b3b;"></div>
      <div><label class="fl">VMC Time — Actual (sec) <span class="hint" style="position:static; font-size:9.5px;">(→ feeds Production)</span></label><input data-lcalc="vmcTimeActual" value="${c.vmcTimeActual}" disabled style="font-weight:700; color:#1f6b3b;"></div>
    </div>
    <div class="mcw-ops-wrap" style="margin-top:10px;">
      ${lqOpsTableHtml(i, it)}
    </div>
    <div class="frow g5" style="margin-top:10px;">
      <div><label class="fl">Total Cost (₹)</label><input data-lcalc="totalCost" value="${c.totalCost.toFixed(2)}" disabled></div>
      <div><label class="fl">Negotiation Markup (%) <span class="hint" style="position:static; font-size:9.5px;">(on Total Cost)</span></label><input type="number" step="0.01" value="${it.negoPct===0||it.negoPct?it.negoPct:''}" oninput="updateLabourItemRow(${i},'negoPct',this.value)"></div>
      <div><label class="fl">Negotiation Adj. (₹)</label><input data-lcalc="negoAdj" value="${c.negoAdj.toFixed(2)}" disabled></div>
      <div><label class="fl">Profit (₹)</label><input data-lcalc="profit" value="${c.profit.toFixed(2)}" disabled></div>
      <div><label class="fl">Total (₹)</label><input data-lcalc="total" value="${c.total.toFixed(2)}" disabled></div>
    </div>
  </div>`;
}
function renderLabourItemRows(){
  const wrap = document.getElementById('lqItemRows');
  if(!wrap) return;
  const {cncRate, vmcRate, profitPct} = labourRates();
  wrap.innerHTML = labourItemsDraft.map((it,i)=>labourItemRowHtml(it,i,cncRate,vmcRate,profitPct)).join('') || '<div class="empty">No line items yet — click "Add Item" below.</div>';
  refreshLabourCalcs();
}
function validateLabourItems(){
  return labourItemsDraft.filter(it=>(it.partNo||'').trim()!=='' && (it.partName||'').trim()!=='')
    .map(it=>({...it, partNo:(it.partNo||'').trim(), partName:(it.partName||'').trim()}));
}
function setLabourCustChange(){
  const sel = document.getElementById('lqCustSel');
  const manual = document.getElementById('lqCust');
  const gstin = document.getElementById('lqGstin');
  const hsn = document.getElementById('lqHsn');
  if(!sel) return;
  if(sel.value==='__other__'){ manual.style.display='block'; manual.value=''; manual.focus(); gstin.value=''; if(hsn) hsn.value=''; }
  else if(sel.value===''){ manual.style.display = DB.customers.length? 'none':'block'; }
  else{
    const c = DB.customers.find(x=>x.id===sel.value);
    manual.style.display='none'; manual.value = c?c.name:'';
    gstin.value = c?(c.gstin||''):'';
    if(hsn) hsn.value = c?(c.hsn||''):'';
  }
  labourDraftCustomerId = sel.value && sel.value!=='__other__' ? sel.value : '';
  labourDraftCustomerName = manual ? manual.value : '';
  render();
}
function renderLabourQuotation(sub){
  const list = DB.labourQuotation.filter(x=>reportUnitMatch(x.unit));
  const custOpts = DB.customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const editing = editingLabourQuoteId ? DB.labourQuotation.find(x=>x.id===editingLabourQuoteId) : null;
  if(labourQuoteViewId) return renderLabourQuoteReport(sub);
  // Once a Customer is selected in the form above (New/Edit Job Work Quotation), the
  // "Job Work Quotations" list below is scoped to that customer only.
  const activeCustId = editing ? null : labourDraftCustomerId;
  const activeCustName = (editing ? '' : (labourDraftCustomerName||'')).trim().toLowerCase();
  const cncRate = editing? (editing.cncRate!==undefined?editing.cncRate:5) : 5;
  const vmcRate = editing? (editing.vmcRate!==undefined?editing.vmcRate:7) : 7;
  const profitPct = editing? (editing.profitPct!==undefined?editing.profitPct:12) : 12;
  const grand = labourItemsDraft.reduce((a,it)=>a+calcLabourItem(it,cncRate,vmcRate,profitPct).total,0);
  sub.innerHTML = `
    <div class="panel">
      <h3>${editing?'Edit Job Work Quotation':'New Job Work Quotation'} ${editing?`<span class="hint">${esc(editing.quoteNo)}</span>`:''}</h3>
      ${labourFinPartDatalistHtml(editing?editing.customerId:labourDraftCustomerId, editing?editing.customer:labourDraftCustomerName)}
      <div class="frow g4">
        <div><label class="fl">Qut No</label><input id="lqNo" value="${editing?esc(editing.quoteNo):(nextSeqNo(DB.labourQuotation,'quoteNo','lq')+'-'+new Date().getFullYear())}"></div>
        <div><label class="fl">Date</label><input id="lqDate" type="date" value="${editing?editing.quoteDate:today()}"></div>
        <div><label class="fl">Customer</label>
          ${customerPickerHtml('lqCustSelDD','lqCustSel', editing?editing.customerId:labourDraftCustomerId, !!(editing&&!editing.customerId), 'setLabourCustChange()')}
          <input id="lqCust" placeholder="Customer name" value="${editing?esc(editing.customer):esc(labourDraftCustomerName)}" style="margin-top:6px; display:${editing || DB.customers.length===0 ?'block':'none'};" oninput="labourDraftCustomerName=this.value; updateLabourFinPartDatalist(); refreshAllLabourRowPartPickers(); refreshLabourQuoteListPanelOnly()">
        </div>
        <div><label class="fl">Customer GSTIN</label><input id="lqGstin" placeholder="33XXXXX..." value="${editing?esc(editing.gstin):esc((DB.customers.find(c=>c.id===labourDraftCustomerId)||{}).gstin||'')}"></div>
      </div>
      <div class="frow g4">
        <div><label class="fl">Customer HSN Code</label><input id="lqHsn" placeholder="e.g. 998898" value="${editing?esc(editing.hsn):esc((DB.customers.find(c=>c.id===labourDraftCustomerId)||{}).hsn||'')}"></div>
        <div><label class="fl">CNC Rate (₹ / min)</label><input id="lqCncRate" type="number" step="0.01" value="${cncRate}" oninput="refreshLabourCalcs()"></div>
        <div><label class="fl">VMC Rate (₹ / min)</label><input id="lqVmcRate" type="number" step="0.01" value="${vmcRate}" oninput="refreshLabourCalcs()"></div>
        <div><label class="fl">Profit %</label><input id="lqProfitPct" type="number" step="0.01" value="${profitPct}" oninput="refreshLabourCalcs()"></div>
        <div><label class="fl">Status</label><select id="lqStatus"><option ${editing&&editing.status==='Draft'?'selected':''}>Draft</option><option ${editing&&editing.status==='Sent'?'selected':''}>Sent</option><option ${editing&&editing.status==='Accepted'?'selected':''}>Accepted</option><option ${editing&&editing.status==='Rejected'?'selected':''}>Rejected</option></select></div>
      </div>

      <div class="section-total"><h3>Cycle Time &amp; Cost — Line Items</h3><span class="hint">${labourItemsDraft.length} item(s) — total <b id="lqGrandTotal">${fmtMoney(grand)}</b></span></div>
      <div id="lqItemRows">${labourItemsDraft.map((it,i)=>labourItemRowHtml(it,i,cncRate,vmcRate,profitPct)).join('') || '<div class="empty">No line items yet — click "Add Item" below.</div>'}</div>
      <button class="btn ghost" style="margin:8px 0 16px;" onclick="addLabourItemRow()">+ Add Item</button>

      <button class="btn amber" onclick="${editing?'saveEditLabourQuote()':'addLabourQuote()'}">💾 ${editing?'Save Changes':'Save Job Work Quotation'}</button>
      ${editing?`<button class="btn ghost" onclick="cancelEditLabourQuote()">Cancel</button>`:''}
    </div>
    <div class="panel" id="lqListPanel">
      ${buildLabourQuotationsListPanelHtml(list, activeCustId, activeCustName)}
    </div>
  `;
}
function buildLabourQuotationsListPanelHtml(list, activeCustId, activeCustName){
  const custScopedList = (activeCustId || activeCustName) ? list.filter(q=>{
    if(activeCustId) return q.customerId===activeCustId;
    return (q.customer||'').trim().toLowerCase()===activeCustName;
  }) : list;
  const filteredList = custScopedList.filter(q=>{
    if(!lqFilterPartNo) return true;
    const needle = lqFilterPartNo.trim().toLowerCase();
    return (q.items||[]).some(it=>(it.partNo||'').toLowerCase().includes(needle));
  });
  return `
      <div class="section-total"><h3>Job Work Quotations <span class="hint">${filteredList.length} of ${list.length} total${(activeCustId||activeCustName)?' — filtered by customer':''}</span></h3>
      </div>
      <div class="frow g4" style="margin-bottom:14px;">
        <div><label class="fl">Filter — Part No <span class="hint" style="position:static; font-size:9.5px;">(type to search)</span></label>
          <input type="text" id="lqPartNoFilterInput" placeholder="e.g. NE121279" value="${esc(lqFilterPartNo)}" oninput="setLQFilter('partNo', this.value)"></div>
        <div style="align-self:end;">${lqFilterPartNo?`<button class="btn ghost" onclick="setLQFilter('clear')">✕ Clear Filter</button>`:''}</div>
      </div>
      <div class="grid-box">
        ${filteredList.slice().reverse().map(q=>{
          const items = q.items||[];
          const itemCalcs = items.map(it=>({partNo: esc(it.partNo)||'—', c: calcLabourItem(it,q.cncRate,q.vmcRate,q.profitPct)}));
          const totVal = itemCalcs.reduce((a,x)=>a+x.c.total,0);
          const cColor = customerColor(q.customer);
          const partsBlock = itemCalcs.length ? `
            <div class="rc-parts">
              ${itemCalcs.map(x=>`
                <div class="rc-part-row">
                  <div class="rc-part-no">${x.partNo}</div>
                  <div class="rc-part-prices">
                    <span class="rc-part-price"><span class="k">Price</span><span class="v">${fmtMoney(x.c.totalCost)}</span></span>
                    <span class="rc-part-price"><span class="k">Total Price</span><span class="v">${fmtMoney(x.c.total)}</span></span>
                  </div>
                </div>`).join('')}
            </div>` : '<div class="empty">No line items.</div>';
          return `
          <div class="rec-card" style="border-top-color:${cColor};">
            <div class="rc-title">${esc(q.quoteNo)}</div>
            <span class="pill rc-pill ${q.status==='Accepted'?'done':q.status==='Rejected'?'fail':q.status==='Sent'?'progress':'open'}">${q.status}</span>
            <div class="rc-row"><span class="k">Customer</span><span class="v"><span class="cust-chip"><span class="cust-dot" style="background:${cColor};"></span>${esc(custDispByName(q.customer))||'—'}</span></span></div>
            <div class="rc-row"><span class="k">Date</span><span class="v">${fmtDMY(q.quoteDate)}</span></div>
            <div class="rc-row"><span class="k">Items</span><span class="v">${items.length} item(s)</span></div>
            ${partsBlock}
            <div class="rc-row" style="margin-top:6px;"><span class="k" style="font-weight:700;">Grand Total</span><span class="v" style="font-weight:700;">${fmtMoney(totVal)}</span></div>
            <div class="rc-actions">
              <button class="btn small ghost" onclick="viewLabourQuote('${q.id}')">View</button>
              <button class="btn small ghost" onclick="editLabourQuote('${q.id}')">Edit</button>
              <button class="btn small ghost" onclick="printLabourQuotation('${q.id}')">🖨 Print</button>
              ${q.status!=='Accepted' && q.status!=='Rejected' ? `<button class="btn small" onclick="setLabourQuoteStatus('${q.id}','Accepted')">✓ Accept</button><button class="btn small ghost" onclick="setLabourQuoteStatus('${q.id}','Rejected')">✕ Reject</button>` : ''}
              <button class="btn danger" onclick="deleteRow('labourQuotation','${q.id}')">Del</button>
            </div>
          </div>`;}).join('') || (activeCustId||activeCustName ? '<div class="empty">No labour quotations found for this customer.</div>' : '<div class="empty">No labour quotations match this filter.</div>')}
      </div>`;
}
function refreshLabourQuoteListPanelOnly(preserveFocus){
  const panel = document.getElementById('lqListPanel');
  if(!panel) return;
  let caret = null;
  if(preserveFocus){
    const active = document.activeElement;
    if(active && active.id==='lqPartNoFilterInput') caret = active.selectionStart;
  }
  const list = DB.labourQuotation.filter(x=>reportUnitMatch(x.unit));
  const editing = editingLabourQuoteId ? DB.labourQuotation.find(x=>x.id===editingLabourQuoteId) : null;
  const activeCustId = editing ? null : labourDraftCustomerId;
  const activeCustName = (editing ? '' : (labourDraftCustomerName||'')).trim().toLowerCase();
  panel.innerHTML = buildLabourQuotationsListPanelHtml(list, activeCustId, activeCustName);
  if(caret!=null){
    const inp = document.getElementById('lqPartNoFilterInput');
    if(inp){ inp.focus(); inp.setSelectionRange(caret, caret); }
  }
}
function setLQFilter(kind, val){
  if(kind==='clear'){ lqFilterPartNo=''; render(); return; }
  else if(kind==='partNo') lqFilterPartNo = val;
  refreshLabourQuoteListPanelOnly(true);
}
function addLabourQuote(){
  const quoteNo=document.getElementById('lqNo').value.trim();
  const items = validateLabourItems();
  if(!quoteNo){ toast('Qut No is required'); return; }
  if(!items.length){ toast('Add at least one line item with Part No &amp; Part Name'); return; }
  const custSel = document.getElementById('lqCustSel').value;
  DB.labourQuotation.push({
    id:'lq'+Date.now(), quoteNo, quoteDate:document.getElementById('lqDate').value, unit:currentUnit,
    customerId: (custSel && custSel!=='__other__') ? custSel : null,
    customer:document.getElementById('lqCust').value.trim(),
    gstin:document.getElementById('lqGstin').value.trim(),
    hsn:document.getElementById('lqHsn').value.trim(),
    cncRate: parseFloat(document.getElementById('lqCncRate').value)||0,
    vmcRate: parseFloat(document.getElementById('lqVmcRate').value)||0,
    profitPct: parseFloat(document.getElementById('lqProfitPct').value)||0,
    items, notes:'',
    status:document.getElementById('lqStatus').value
  });
  syncQuoteItemsToProductDev(items, (custSel && custSel!=='__other__') ? custSel : null, document.getElementById('lqCust').value.trim());
  labourItemsDraft = [];
  labourDraftCustomerId = ''; labourDraftCustomerName = '';
  saveDB(); toast('Job Work Quotation saved'); render();
}
function editLabourQuote(id){
  editingLabourQuoteId = id; labourQuoteViewId = null;
  const q = DB.labourQuotation.find(x=>x.id===id);
  labourItemsDraft = q ? JSON.parse(JSON.stringify(q.items||[])) : [];
  labourDraftCustomerId = q ? (q.customerId||'') : '';
  labourDraftCustomerName = q ? (q.customer||'') : '';
  render();
}
function cancelEditLabourQuote(){ editingLabourQuoteId=null; labourItemsDraft=[]; labourDraftCustomerId=''; labourDraftCustomerName=''; render(); }
function saveEditLabourQuote(){
  const q = DB.labourQuotation.find(x=>x.id===editingLabourQuoteId);
  if(!q) return;
  const quoteNo=document.getElementById('lqNo').value.trim();
  const items = validateLabourItems();
  if(!quoteNo){ toast('Qut No is required'); return; }
  if(!items.length){ toast('Add at least one line item with Part No & Part Name'); return; }
  const custSel = document.getElementById('lqCustSel').value;
  q.quoteNo=quoteNo; q.quoteDate=document.getElementById('lqDate').value;
  q.customerId = (custSel && custSel!=='__other__') ? custSel : q.customerId;
  q.customer=document.getElementById('lqCust').value.trim();
  q.gstin=document.getElementById('lqGstin').value.trim();
  q.hsn=document.getElementById('lqHsn').value.trim();
  q.cncRate=parseFloat(document.getElementById('lqCncRate').value)||0;
  q.vmcRate=parseFloat(document.getElementById('lqVmcRate').value)||0;
  q.profitPct=parseFloat(document.getElementById('lqProfitPct').value)||0;
  q.items=items;
  q.status=document.getElementById('lqStatus').value;
  syncQuoteItemsToProductDev(items, q.customerId, q.customer);
  editingLabourQuoteId=null; labourItemsDraft=[];
  labourDraftCustomerId=''; labourDraftCustomerName='';
  saveDB(); toast('Job Work Quotation saved'); render();
}
function setLabourQuoteStatus(id, status){
  const q = DB.labourQuotation.find(x=>x.id===id);
  if(!q) return;
  q.status = status;
  saveDB(); toast('Job Work Quotation marked '+status); render();
}
function viewLabourQuote(id){ labourQuoteViewId=id; editingLabourQuoteId=null; labourItemsDraft=[]; render(); }
function closeViewLabourQuote(){ labourQuoteViewId=null; render(); }
function renderLabourQuoteReport(sub){
  const q = DB.labourQuotation.find(x=>x.id===labourQuoteViewId);
  if(!q){ labourQuoteViewId=null; return renderLabourQuotation(sub); }
  const items = q.items||[];
  const totVal = items.reduce((a,it)=>a+calcLabourItem(it,q.cncRate,q.vmcRate,q.profitPct).total,0);
  sub.innerHTML = `
    <div class="panel">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
        <div><h3 style="margin:0;">${esc(q.quoteNo)} <span class="hint">${esc(custDispByName(q.customer))}</span></h3></div>
        <div>
          <span class="badge ${q.status==='Accepted'?'ok':q.status==='Rejected'?'bad':'dev'}">${esc(q.status).toUpperCase()}</span>
          <button class="btn ghost small" onclick="printLabourQuotation('${q.id}')">🖨 Print</button>
          <button class="btn ghost small" onclick="closeViewLabourQuote()">← Back</button>
        </div>
      </div>
      <div class="info-grid" style="margin-top:14px;">
        <div class="info-cell"><label>Date</label><div class="val">${fmtDMY(q.quoteDate)}</div></div>
        <div class="info-cell"><label>Customer GSTIN</label><div class="val">${esc(q.gstin)||'—'}</div></div>
        <div class="info-cell"><label>Customer HSN Code</label><div class="val">${esc(q.hsn)||'—'}</div></div>
        <div class="info-cell"><label>CNC Rate</label><div class="val">₹${q.cncRate}/min</div></div>
        <div class="info-cell"><label>VMC Rate</label><div class="val">₹${q.vmcRate}/min</div></div>
      </div>
      <div class="tw"><table class="insp">
        <tr><th>SL</th><th>Part No</th><th>Part Name</th><th>CNC Time (Qtn)</th><th>CNC Time (Actual)</th><th>VMC Time (Qtn)</th><th>VMC Time (Actual)</th><th>Total Cost</th><th>Profit</th><th>Total</th></tr>
        ${items.map((it,i)=>{ const c=calcLabourItem(it,q.cncRate,q.vmcRate,q.profitPct); return `<tr><td>${i+1}</td><td class="char">${esc(it.partNo)}</td><td class="char">${esc(it.partName)}</td><td>${c.cncTime}</td><td>${c.cncTimeActual}</td><td>${c.vmcTime}</td><td>${c.vmcTimeActual}</td><td>${fmtMoney(c.totalCost)}</td><td>${fmtMoney(c.profit)}</td><td>${fmtMoney(c.total)}</td></tr>`; }).join('') || '<tr><td colspan="10"><div class="empty">No line items.</div></td></tr>'}
      </table></div>
      <div class="cards" style="margin-top:16px;">
        <div class="card"><div class="v">${items.length}</div><div class="l">Line Items</div></div>
        <div class="card"><div class="v">${fmtMoney(totVal)}</div><div class="l">Quotation Value</div></div>
      </div>
    </div>
  `;
}
function printLabourQuotationsList(){
  const list = DB.labourQuotation.filter(x=>reportUnitMatch(x.unit));
  const headers = ['Qut No','Date','Customer','Items','Value (₹)','Status'];
  const rows = list.map(q=>{
    const items = q.items||[];
    const totVal = items.reduce((a,it)=>a+calcLabourItem(it,q.cncRate,q.vmcRate,q.profitPct).total,0);
    return [esc(q.quoteNo), fmtDMY(q.quoteDate), esc(q.customer)||'—', `<span class="num">${items.length}</span>`, `<span class="num">${fmtMoney(totVal)}</span>`, esc(q.status)];
  });
  printReport('Job Work Quotations List', headers, rows, {barLeft:`Unit: ${esc(reportScopeLabel())}`, barRight:`Total Quotations: ${list.length}`});
}
// Printed Job Work Quotation layout: shows each operation's Quotation Cycle Time (CNC/VMC)
// as its own row — exactly as many operation rows as the part actually has (3 ops → 3 rows,
// 5 ops → 5 rows). No combined "Total Cycle Time" and no Actual Time values are printed —
// only Quotation-side figures, which are what the customer is quoted on. This only changes
// the print/export output; the data-entry screen (renderLabourQuotationForm / per-operation
// row editing) and calcLabourItem's cost math are untouched.
function printLabourQuotation(id){
  const q = DB.labourQuotation.find(x=>x.id===id);
  if(!q) return;
  const items = q.items||[];
  const headers = ['Sl.No','Part No / Part Name','Operation','CNC Time (sec)','VMC Time (sec)','Total Cost (₹)','Profit '+(q.profitPct||0)+'% (₹)','Total (₹)'];
  let bodyRows = '';
  items.forEach((it,i)=>{
    const c = calcLabourItem(it, q.cncRate, q.vmcRate, q.profitPct); // internally calls ensureLqOps — same calc used on-screen
    const opCount = Math.max(it.lqCncOps.length, it.lqVmcOps.length, 1);
    for(let k=0;k<opCount;k++){
      const cncVal = it.lqCncOps[k] ? (it.lqCncOps[k].q||0) : 0;
      const vmcVal = it.lqVmcOps[k] ? (it.lqVmcOps[k].q||0) : 0;
      bodyRows += '<tr>';
      if(k===0){
        bodyRows += `<td rowspan="${opCount}" style="text-align:center; font-weight:700; vertical-align:middle;">${i+1}</td>`;
        bodyRows += `<td rowspan="${opCount}" style="vertical-align:middle;"><div style="font-weight:700;">${esc(it.partNo)||'—'}</div>${it.partName?`<div style="color:#5b6b7a; font-size:10.5px; margin-top:2px;">${esc(it.partName)}</div>`:''}</td>`;
      }
      bodyRows += `<td style="text-align:center; font-weight:600; white-space:nowrap;">OPN-${k+1}</td>`;
      bodyRows += `<td class="num">${cncVal||'—'}</td>`;
      bodyRows += `<td class="num">${vmcVal||'—'}</td>`;
      if(k===0){
        bodyRows += `<td rowspan="${opCount}" class="num" style="vertical-align:middle;">${fmtMoney(c.totalCost)}</td>`;
        bodyRows += `<td rowspan="${opCount}" class="num" style="vertical-align:middle;">${fmtMoney(c.profit)}</td>`;
        bodyRows += `<td rowspan="${opCount}" class="num" style="vertical-align:middle;"><strong>${fmtMoney(c.total)}</strong></td>`;
      }
      bodyRows += '</tr>';
    }
  });
  const theadHtml = `<tr>
    <th style="width:6%;">Sl.No</th>
    <th style="width:22%; text-align:left;">Part No / Part Name</th>
    <th style="width:10%;">Operation</th>
    <th style="width:12%;">CNC Time (sec)</th>
    <th style="width:12%;">VMC Time (sec)</th>
    <th style="width:12%;">Total Cost (₹)</th>
    <th style="width:13%;">Profit ${q.profitPct||0}% (₹)</th>
    <th style="width:13%;">Total (₹)</th>
  </tr>`;
  const note = `<div class="ntTitle">Rate Basis</div><div class="ntBody"><div class="ntPara">CNC @ ${q.cncRate||0}.0 PER MIN</div><div class="ntPara">VMC @ ${q.vmcRate||0}.0 PER MIN</div>${q.notes?`<div class="ntPara">${esc(q.notes)}</div>`:''}</div>`;
  // Full address fetched from the Customer Master record matched by name, same pattern used
  // by other printed documents — so the complete address always prints without retyping.
  const custRec = DB.customers.find(c=>c.name===q.customer);
  const custAddr = custRec ? (custRec.address||'') : '';
  const barLeft = `Customer: ${esc(q.customer)||'—'}<br>GSTIN: ${esc(q.gstin)||'—'} &nbsp; HSN: ${esc(q.hsn)||'—'}`;
  printReport(`Job Work Quotation — ${q.quoteNo}`, headers, [], {
    theadHtml, bodyHtml: bodyRows,
    barLeft,
    barRight:`Qut No: ${esc(q.quoteNo)}<br>Date: ${fmtDMY(q.quoteDate)}`,
    barAddr: custAddr || '', note,
    footerHtml:`<div class="prFoot"><div class="sign">Prepared By</div><div class="sign">Approved By</div></div>`,
    showSign:false
  });
}
