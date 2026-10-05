/* ---------------- PRODUCTION ---------------- */
/* Every DB.production record is a "Job" carrying an Issued Qty (from Stores, or manually
   created). Output is recorded against the job in one or more passes until fully reconciled:
   issuedQty = goodQty + rejectionQty + reworkQty + shortageQty. Balance = remaining unaccounted qty. */
function prodNormalizeJobs(list){
  list.forEach(p=>{
    if(p.issuedQty===undefined){
      if(p.stage==='Issued'){
        // Store-issued job created before this field existed — issuedQty is simply qty.
        p.issuedQty = p.qty||0; p.goodQty=0; p.rejectionQty=p.rejectionQty||0; p.rejectionRows=p.rejectionRows||[];
        p.reworkQty=0; p.reworkRows=[]; p.shortageQty=p.shortageQty||0; p.outputEntries=p.outputEntries||[];
      } else {
        // Legacy manual entry (old "New Production Entry" form) — qty was the produced Good Qty,
        // recorded together with its own rejection/shortage in one shot, so treat it as already
        // fully reconciled: issuedQty = good + rejection + shortage (rework didn't exist yet).
        p.goodQty = p.qty||0; p.rejectionQty = p.rejectionQty||0; p.rejectionRows = p.rejectionRows||[];
        p.reworkQty = 0; p.reworkRows = [];
        p.shortageQty = p.shortageQty||0; p.outputEntries = p.outputEntries||[];
        p.issuedQty = Math.round((p.goodQty+p.rejectionQty+p.reworkQty+p.shortageQty)*10000)/10000;
      }
    }
  });
}
function prodJobBalance(p){
  const acct = (p.goodQty||0)+(p.rejectionQty||0)+(p.reworkQty||0)+(p.shortageQty||0);
  return Math.round(((p.issuedQty||0)-acct)*10000)/10000;
}
let prodSelectedJobId = '';
let prodJobSearchTerm = ''; // Production Jobs list — Part No search filter (case-insensitive, partial match)
let prodJobCardSearchTerm = ''; // Production Jobs list — Card No search filter (case-insensitive, partial match)
let pendingPartSearchTerm = ''; // Pending Parts list — Part No search filter (case-insensitive, partial match)
let pendingCardSearchTerm = ''; // Pending Parts list — Card No search filter (case-insensitive, partial match)
/* ==== MACHINE CAPACITY REPORT (Production Model) ====
   Read-only capacity-vs-plan report — it does not change any Planning, Quotation, Production
   or Machine Master data or logic. It only READS from existing records:
     - DB.custPO         -> Sales PO Quantity (p.orderedQty) + its linked Quotation item's
                             CNC/VMC cycle time, via the exact same calcMachiningWorking()
                             already used by the Quotation module.
     - DB.labourPO       -> Scheduled Quantity for the selected month, via the exact same
                             labourPOMonthTotals() already used by the Planning module, plus
                             its linked Job Work Quotation item's cycle time via calcLabourItem()
                             (called with 0 rates/profit — those args don't affect the returned
                             cncTime/vmcTime, so this cannot alter any cost calculation).
     - DB.machines       -> count of CNC / VMC type machines for the active unit (Breakdown
                             machines are not counted as available capacity). Individual
                             machine numbers are never used for the hours math, only the count.
   Working capacity assumption: 2 shifts x 8 hours = 16 hours/machine/day. Setting Time is a
   fixed 2 hours per operation (CNC / VMC) for every distinct Part that needs that
   operation this month — i.e. one machine changeover per part, not per piece. */
const MC_SHIFT_HOURS = 16;   // 2 shifts x 8 hours
const MC_SETTING_HOURS = 2;  // fixed setting time per operation (CNC / VMC), per Part
const MC_EFFICIENCY = 0.85;  // 85% machine efficiency applied to Required (production) Machine Hours only — Available Machine Hours is unaffected
const MC_OPERATOR_HOURS = 8; // one operator works 8 hours per day — used to convert Total Required Hrs into manpower (operator) count
function mcDaysInMonth(mk){ const [y,m]=mk.split('-').map(Number); return new Date(y,m,0).getDate(); }
function mcSundaysInMonth(mk){
  const [y,m]=mk.split('-').map(Number); const total=mcDaysInMonth(mk); let c=0;
  for(let d=1; d<=total; d++){ if(new Date(y,m-1,d).getDay()===0) c++; }
  return c;
}
function mcDefaultWorkingDays(mk){ return mcDaysInMonth(mk) - mcSundaysInMonth(mk); }
function mcWorkingDays(){ return machineCapWorkingDaysOverride!==null ? machineCapWorkingDaysOverride : mcDefaultWorkingDays(machineCapMonth); }
function setProdModuleSubTab(t){ prodModuleSubTab = t; render(); }
function setMachineCapMonth(v){ machineCapMonth = v; machineCapWorkingDaysOverride = null; renderMachineCapacityReportOnly(); }
function setMachineCapWorkingDays(v){ const n=parseFloat(v); machineCapWorkingDaysOverride = isNaN(n) ? null : n; renderMachineCapacityReportOnly(); }
function renderMachineCapacityReportOnly(){
  const box = document.getElementById('machineCapBox');
  if(box) box.innerHTML = machineCapacityReportHtml();
  const wdInput = document.getElementById('machineCapWorkingDaysInput');
  if(wdInput) wdInput.value = mcWorkingDays();
}
// ===================== Production Norms =====================
// Single source of truth for the CNC/VMC cycle time actually used on the shop floor —
// tracked OPERATION-WISE (dynamic OPN-1..N for both CNC and VMC), never as a combined total.
// Data flow: Quotation's ACTUAL Cycle Time (the "a" column in Machining Cost Working — a
// dynamic number of operation rows, kept fully separate from the Quotation Cycle Time used
// for costing) → Production Norms (editable, per operation, still overridable here if the
// shop floor genuinely differs) → Machine Capacity Report (consumer only — sums the
// Production Norms operations itself). The Production module NEVER reads the Quotation
// Cycle Time directly — only the Actual Cycle Time feeds it, and any edit to Actual on the
// Quotation flows through automatically (see the self-heal remap below).
// One record per (source, quotationId, partNo). The "quote*Ops" arrays below are named for
// legacy compatibility but for Sales items now hold the Quotation's ACTUAL Cycle Time per
// operation (labour quotations, which have no separate Actual column, still use their own
// single cycle time as before). Production CT per operation defaults to that Actual value
// the first time a part is seen, then persists whatever the user sets on this page — nothing
// else overwrites a user-entered Production value unless the underlying Actual changes.
let _prodNormsDirty = false;
function salesOpsFromItem(it){
  ensureMcwOps(it);
  return { cnc:it.mcwCncOps.map(r=>parseFloat(r.a)||0), vmc:it.mcwVmcOps.map(r=>parseFloat(r.a)||0) };
}
function labourOpsFromItem(it){
  ensureLqOps(it);
  return { cnc:it.lqCncOps.map(r=>parseFloat(r.a)||0), vmc:it.lqVmcOps.map(r=>parseFloat(r.a)||0) };
}
function getOrCreateProdNorm(source, qId, quoteNo, partNo, partName, customer, unit, quoteCncOps, quoteVmcOps){
  if(!qId || !partNo) return null;
  quoteCncOps = quoteCncOps||[]; quoteVmcOps = quoteVmcOps||[];
  let norm = DB.productionNorms.find(n=>n.source===source && n.quotationId===qId && n.partNo===partNo);
  if(!norm){
    norm = { id:'pn'+Date.now()+Math.random().toString(36).slice(2,6), source, quotationId:qId, quoteNo, partNo, partName, customer, unit,
      quoteCncOps:quoteCncOps.slice(), quoteVmcOps:quoteVmcOps.slice(), prodCncOps:quoteCncOps.slice(), prodVmcOps:quoteVmcOps.slice(), updatedAt:'' };
    DB.productionNorms.push(norm);
    _prodNormsDirty = true;
  } else {
    if(!Array.isArray(norm.quoteCncOps)) norm.quoteCncOps = quoteCncOps.slice();
    if(!Array.isArray(norm.quoteVmcOps)) norm.quoteVmcOps = quoteVmcOps.slice();
    // Self-heal records saved before per-operation tracking existed (or where the Production
    // cycle time was never set): default the Production CT straight from the CURRENT Quotation
    // values being passed in now, never from a stale/blank cached array — this is what prevents
    // Production Cycle Time from showing as 0.00 instead of the quoted default.
    if(!Array.isArray(norm.prodCncOps)) norm.prodCncOps = quoteCncOps.slice();
    if(!Array.isArray(norm.prodVmcOps)) norm.prodVmcOps = quoteVmcOps.slice();
    if(JSON.stringify(norm.quoteCncOps)!==JSON.stringify(quoteCncOps) || JSON.stringify(norm.quoteVmcOps)!==JSON.stringify(quoteVmcOps) || norm.partName!==partName || norm.customer!==customer || norm.quoteNo!==quoteNo || norm.unit!==unit){
      // The Quotation's cycle time changed since this norm was last synced (e.g. cycle time
      // was entered/edited on the Quotation AFTER the Production Norms record was first created,
      // which previously could leave Production CT stuck at an old 0 default). As long as the
      // Production CT for an operation still matches the OLD quoted value — i.e. the user hasn't
      // manually overridden it — re-map it to the NEW quoted value too, per operation, so the
      // Quotation → Production Norms default mapping keeps working for every Part No, not just
      // at first creation. A Production CT the user has actually edited away from the quote is
      // never touched.
      norm.prodCncOps = (norm.prodCncOps||[]).map((v,idx)=> v===(norm.quoteCncOps||[])[idx] ? quoteCncOps[idx] : v);
      norm.prodVmcOps = (norm.prodVmcOps||[]).map((v,idx)=> v===(norm.quoteVmcOps||[])[idx] ? quoteVmcOps[idx] : v);
      norm.quoteCncOps=quoteCncOps.slice(); norm.quoteVmcOps=quoteVmcOps.slice(); norm.partName=partName; norm.customer=customer; norm.quoteNo=quoteNo; norm.unit=unit;
      _prodNormsDirty = true;
    }
  }
  // Unconditional final guarantee (covers any saved-data edge case the change-detection above
  // might miss, e.g. records from an earlier app version): for every operation, if the
  // Quotation has a cycle time greater than 0 but the Production Cycle Time is currently 0,
  // pull the Quotation value in as the default right now. This never touches an operation
  // where the Production Cycle Time has already been given a real (non-zero) value.
  const opCount = Math.max(quoteCncOps.length, quoteVmcOps.length, norm.prodCncOps.length, norm.prodVmcOps.length);
  for(let i=0;i<opCount;i++){
    if((norm.prodCncOps[i]||0)===0 && (quoteCncOps[i]||0)>0){ norm.prodCncOps[i] = quoteCncOps[i]; _prodNormsDirty = true; }
    if((norm.prodVmcOps[i]||0)===0 && (quoteVmcOps[i]||0)>0){ norm.prodVmcOps[i] = quoteVmcOps[i]; _prodNormsDirty = true; }
  }
  return norm;
}
function flushProdNormsDirty(){ if(_prodNormsDirty){ _prodNormsDirty=false; saveDB(); } }
// One row per unique (source, quotation, part) linked from an approved Customer PO / Job Work PO —
// this is the full universe of parts Production Norms should track, independent of any month filter.
function prodNormsRows(){
  const rows = []; const seen = new Set();
  DB.custPO.filter(p=>reportUnitMatch(p.unit)).forEach(p=>{
    if(!p.quotationId || !p.finPartNo) return;
    const key = 'Sales::'+p.quotationId+'::'+p.finPartNo;
    if(seen.has(key)) return; seen.add(key);
    const q = DB.quotation.find(x=>x.id===p.quotationId);
    const item = q ? (q.items||[]).find(it=>it.partNo===p.finPartNo) : null;
    if(!q || !item) return;
    const ops = salesOpsFromItem(item);
    const norm = getOrCreateProdNorm('Sales', p.quotationId, q.quoteNo, p.finPartNo, p.finPartName, p.customer||planRecCustomerKey(p), p.unit, ops.cnc, ops.vmc);
    if(norm) rows.push({ norm, source:'Sales Plan', customer:p.customer||planRecCustomerKey(p), partNo:p.finPartNo, partName:p.finPartName });
  });
  DB.labourPO.filter(p=>reportUnitMatch(p.unit)).forEach(p=>{
    if(!p.labourQuoteId || !p.finPartNo) return;
    const key = 'Job Work::'+p.labourQuoteId+'::'+p.finPartNo;
    if(seen.has(key)) return; seen.add(key);
    const q = DB.labourQuotation.find(x=>x.id===p.labourQuoteId);
    const item = q ? (q.items||[]).find(it=>it.partNo===p.finPartNo) : null;
    if(!q || !item) return;
    const ops = labourOpsFromItem(item);
    const norm = getOrCreateProdNorm('Labour', p.labourQuoteId, q.quoteNo, p.finPartNo, p.finPartName, p.customer||planRecCustomerKey(p), p.unit, ops.cnc, ops.vmc);
    if(norm) rows.push({ norm, source:'Job Work Plan', customer:p.customer||planRecCustomerKey(p), partNo:p.finPartNo, partName:p.finPartName });
  });
  flushProdNormsDirty();
  return rows.sort((a,b)=> (a.customer||'').localeCompare(b.customer||'') || (a.partNo||'').localeCompare(b.partNo||''));
}
function updateProdNormOpField(id, kind, idx, val){
  const norm = DB.productionNorms.find(n=>n.id===id);
  if(!norm) return;
  const arrKey = kind==='cnc' ? 'prodCncOps' : 'prodVmcOps';
  if(!Array.isArray(norm[arrKey])) norm[arrKey] = [0,0,0,0,0];
  const n = parseFloat(val);
  norm[arrKey][idx] = (isNaN(n) || n<0) ? 0 : Math.round(n);
  norm.updatedAt = today();
  saveDB();
  renderProductionNormsOnly();
}
// Renders one CNC or VMC operation-cycle-time table for a single part: one row per operation
// that carries a Production CT (defaulted automatically from the Quotation's ACTUAL Cycle
// Time, editable), each individually editable — never a combined/total cycle time. The
// number of rows is dynamic, matching however many operation rows exist on the Quotation.
// The Quotation's Actual CT itself isn't shown as a separate column here; it's only used
// internally to detect/flag a Production CT that has been pushed above it.
function pnOpTableHtml(norm, kind){
  const quoteOps = kind==='cnc' ? (norm.quoteCncOps||[]) : (norm.quoteVmcOps||[]);
  const prodOps = kind==='cnc' ? (norm.prodCncOps||[]) : (norm.prodVmcOps||[]);
  const opLabel = kind==='cnc' ? 'CNC OPN' : 'VMC OPN';
  const warnStyle = 'border-color:var(--red); background:color-mix(in srgb, var(--red) 12%, transparent); color:var(--red); font-weight:700;';
  const opCount = Math.max(quoteOps.length, prodOps.length);
  const idxList = Array.from({length:opCount}).map((_,i)=>i).filter(i=> (quoteOps[i]||0)>0 || (prodOps[i]||0)>0 );
  if(!idxList.length) return `<div class="hint" style="position:static;">No ${kind==='cnc'?'CNC':'VMC'} operations on this part.</div>`;
  return `
  <table class="plan-table mc-detail-table" style="margin-bottom:0;">
    <thead><tr><th>Operation</th><th class="pt-num-h">Production Cycle Time (sec)</th><th class="pt-num-h">Production Norms / Hour</th></tr></thead>
    <tbody>
    ${idxList.map(i=>{
      const qv = quoteOps[i]||0, pv = prodOps[i]||0;
      const over = pv>qv;
      const perHrId = `pnHr_${norm.id}_${kind}_${i}`;
      return `<tr class="plan-row">
        <td class="pt-text">${opLabel}-${i+1}</td>
        <td class="pt-text pt-num">
          <input type="number" min="0" step="1" value="${Math.round(pv)}" oninput="pnUpdatePerHourDisplay('${perHrId}',this.value)" onchange="updateProdNormOpField('${norm.id}','${kind}',${i},this.value)" style="width:90px; text-align:right; ${over?warnStyle:''}">
          ${over?`<div class="hint" style="position:static; display:block; color:var(--red); margin-top:2px; white-space:nowrap;">⚠ +${Math.round(pv-qv)}s over Quotation Actual CT</div>`:''}
        </td>
        <td class="pt-text pt-num"><span id="${perHrId}" style="font-weight:700;">${pnPerHour(pv)}</span></td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>`;
}
// Production Norms per Hour = 3600 ÷ Production Cycle Time (sec), rounded to a whole number.
// Undefined (0 or blank cycle time) shows as '—' rather than a divide-by-zero result.
function pnPerHour(sec){
  const s = parseFloat(sec)||0;
  if(s<=0) return '—';
  return Math.round(3600/s);
}
// Live-updates the Production Norms / Hour figure as the Production Cycle Time is typed,
// before the onchange handler commits/re-renders — keeps the two fields visibly in sync.
function pnUpdatePerHourDisplay(spanId, val){
  const el = document.getElementById(spanId);
  if(el) el.textContent = pnPerHour(val);
}
function prodNormsReportHtml(){
  let rows = prodNormsRows();
  if(!rows.length) return '<div class="empty">No parts found. Production Norms are created automatically once a part has both an approved Quotation / Job Work Quotation cycle time and a Customer PO / Job Work PO raised against it.</div>';
  if(prodNormsSelectedPart) rows = rows.filter(r=>r.partNo===prodNormsSelectedPart);
  if(!rows.length) return '<div class="empty">No Production Norms found for the selected Part Number.</div>';
  return rows.map(r=>{
    const n = r.norm;
    return `
    <div class="panel" style="margin-top:14px; border:1px solid var(--line);">
      <div class="mc-summary-head" style="margin-bottom:10px;">
        <h3 style="display:flex; align-items:center; gap:8px; font-size:13px;">
          <span class="pill ${r.source==='Sales Plan'?'unit1':'unit2'}">${r.source}</span>
          <label style="display:flex; align-items:center; gap:6px; font-weight:400;">Part Number: ${prodNormsPartSelectHtml(r.partNo, 'setProdNormsSelectedPart')}</label>
          <span class="hint" style="position:static;">${esc(r.partName)||''}</span>
        </h3>
        <span class="hint" style="position:static;">${esc(custDispByName(r.customer))||'—'} &nbsp;|&nbsp; Quote ${esc(n.quoteNo)||'—'}</span>
      </div>
      <div class="frow g2 mcw-cols" style="align-items:start; gap:18px;">
        <div class="mcw-col">
          <div class="mcw-col-title" style="font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; color:var(--steel); margin-bottom:6px;">CNC Operations</div>
          ${pnOpTableHtml(n,'cnc')}
        </div>
        <div class="mcw-col">
          <div class="mcw-col-title" style="font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; color:var(--steel); margin-bottom:6px;">VMC Operations</div>
          ${pnOpTableHtml(n,'vmc')}
        </div>
      </div>
    </div>`;
  }).join('');
}
function prodNormsAllPartNos(){
  const set = new Set();
  prodNormsRows().forEach(r=>{ if(r.partNo) set.add(r.partNo); });
  return Array.from(set).sort((a,b)=>a.localeCompare(b));
}
// Renders a <select> listing every Part Number tracked by Production Norms (List Type dropdown).
function prodNormsPartSelectHtml(selectedVal, onchangeFn){
  const parts = prodNormsAllPartNos();
  return `<select onchange="${onchangeFn}(this.value)" style="min-width:180px;">
    <option value="">-- All Part Numbers --</option>
    ${parts.map(p=>`<option value="${esc(p)}" ${p===selectedVal?'selected':''}>${esc(p)}</option>`).join('')}
  </select>`;
}
// Top-of-screen Part Number selector — choosing a part here filters the report below and
// auto-populates the Part Number dropdown on that part's card to match.
function setProdNormsSelectedPart(val){
  prodNormsSelectedPart = val||'';
  renderProductionNormsOnly();
}
function renderProductionNormsOnly(){
  const box = document.getElementById('prodNormsBox');
  if(box) box.innerHTML = prodNormsReportHtml();
}
/* ---------------- DAILY PRODUCTION (quick daily entry) ---------------- */
let editingDailyProdId = null;
function dpMachineOptionsHtml(selected){
  const list = DB.machines.filter(m=>reportUnitMatch(m.unit) && ['CNC','VMC'].includes((m.type||'').trim().toUpperCase()));
  list.sort(machineCompare);
  return `<option value="">— select machine —</option>` +
    list.map(m=>`<option value="${m.id}" ${selected===m.id?'selected':''}>${esc(dwMachineShortLabel(m))}</option>`).join('');
}
function dpIssuedPartsList(){
  // Distinct parts issued from Stores to Production (DB.production jobs) — covers both the
  // Sales route (Bar/Forging Issue Material) and the Job Work route (Issue Job Work Stock to
  // Production), since both push records into DB.production with finPartNo/finPartName.
  const list = DB.production.filter(p=>reportUnitMatch(p.unit));
  prodNormalizeJobs(list);
  const seen = {};
  const parts = [];
  list.forEach(p=>{
    const no = (p.finPartNo || p.item || '').trim();
    if(!no || seen[no]) return;
    seen[no] = 1;
    parts.push({no, name: p.finPartName || p.partName || ''});
  });
  parts.sort((a,b)=>a.no.localeCompare(b.no));
  return parts;
}
function dpPartOptionsHtml(selected){
  const list = dpIssuedPartsList();
  return `<option value="">— select part number —</option>` +
    list.map(x=>`<option value="${esc(x.no)}" data-name="${esc(x.name)}" ${selected===x.no?'selected':''}>${esc(x.no)}</option>`).join('');
}
function dpOperatorOptionsHtml(selected){
  const list = DB.employees.filter(e=>reportUnitMatch(e.unit) && e.status!=='Resigned').slice().sort((a,b)=>(a.empName||'').localeCompare(b.empName||''));
  return `<option value="">— select operator —</option>` +
    list.map(e=>`<option value="${e.id}" ${selected===e.id?'selected':''}>${esc(e.empName)}${e.empCode?' ('+esc(e.empCode)+')':''}</option>`).join('');
}
// Operator Name dropdown sourced from Human Resources (DB.employees) but valued by employee
// NAME (not id) — used wherever the operator has historically been stored as a plain text name
// (e.g. Production → Record Production Output), so no data-migration is needed.
function hrOperatorNameOptionsHtml(selectedName){
  const list = DB.employees.filter(e=>reportUnitMatch(e.unit) && e.status!=='Resigned').slice().sort((a,b)=>(a.empName||'').localeCompare(b.empName||''));
  return `<option value="">— select operator —</option>` +
    list.map(e=>`<option value="${esc(e.empName)}" ${selectedName===e.empName?'selected':''}>${esc(e.empName)}${e.empCode?' ('+esc(e.empCode)+')':''}</option>`).join('');
}
// Inspector Name dropdown sourced from Human Resources (DB.employees), valued by employee NAME
// (not id) — mirrors hrOperatorNameOptionsHtml above. Used wherever "Inspector" was previously a
// free-typed Name field (e.g. Purchase → Receiving Inspection), so it becomes a proper List/
// Dropdown field pulling live from HR instead of a typed text entry.
function hrInspectorNameOptionsHtml(selectedName){
  const list = DB.employees.filter(e=>reportUnitMatch(e.unit) && e.status!=='Resigned').slice().sort((a,b)=>(a.empName||'').localeCompare(b.empName||''));
  return `<option value="">— select inspector —</option>` +
    list.map(e=>`<option value="${esc(e.empName)}" ${selectedName===e.empName?'selected':''}>${esc(e.empName)}${e.empCode?' ('+esc(e.empCode)+')':''}${e.designation?' — '+esc(e.designation):''}</option>`).join('');
}
function dpOnPartChange(){
  const sel = document.getElementById('dpPart');
  const opt = sel && sel.selectedOptions[0];
  const nameBox = document.getElementById('dpPartName');
  if(nameBox) nameBox.value = opt ? (opt.getAttribute('data-name')||'') : '';
  dpRefreshOperationBox('');
}
// ---- Operation / Production Norms helpers (Daily Production → Machine) ----
// Production Norms are tracked per Part Number (DB.productionNorms), with a separate
// cycle-time array for CNC operations and VMC operations. These helpers surface, for the
// Machine + Part Number currently selected on the Daily Production entry, exactly the
// operations that exist in Production Norms for that machine's type (CNC/VMC), and the
// matching Production Cycle Time so it can be shown automatically once an Operation is picked.
function dpMachineTypeById(machineId){
  const m = DB.machines.find(x=>x.id===machineId);
  return m ? (m.type||'').trim().toUpperCase() : '';
}
function dpNormForPart(partNo){
  if(!partNo) return null;
  return DB.productionNorms.find(n=>reportUnitMatch(n.unit) && n.partNo===partNo) || null;
}
function dpOperationOptionsHtml(partNo, machineType, selected){
  const kind = machineType==='CNC' ? 'cnc' : (machineType==='VMC' ? 'vmc' : '');
  if(!partNo || !kind) return `<option value="">— select Machine &amp; Part first —</option>`;
  const norm = dpNormForPart(partNo);
  if(!norm) return `<option value="">— no Production Norms for this part —</option>`;
  const quoteOps = kind==='cnc' ? (norm.quoteCncOps||[]) : (norm.quoteVmcOps||[]);
  const prodOps = kind==='cnc' ? (norm.prodCncOps||[]) : (norm.prodVmcOps||[]);
  const opLabel = kind==='cnc' ? 'CNC OPN' : 'VMC OPN';
  const opCount = Math.max(quoteOps.length, prodOps.length);
  const idxList = Array.from({length:opCount}).map((_,i)=>i).filter(i=>(quoteOps[i]||0)>0 || (prodOps[i]||0)>0);
  if(!idxList.length) return `<option value="">— no operations found for this part —</option>`;
  return `<option value="">— select operation —</option>` +
    idxList.map(i=>{
      const label = `${opLabel}-${i+1}`;
      const sec = prodOps[i]||0;
      return `<option value="${esc(label)}" data-sec="${sec}" ${selected===label?'selected':''}>${esc(label)}</option>`;
    }).join('');
}
function dpNormDisplay(sec){
  const s = Number(sec)||0;
  if(s<=0) return '';
  return `${s} sec/pc (≈ ${pnPerHour(s)}/hr)`;
}
// Production Hours / Setting Hours — list-type dropdown, 1 Hour up to 8 Hours in half-hour
// steps. `defaultHours` sets which option is preselected when no value has been saved yet
// (8 Hours for Production Hours, 1 Hour for Daily Setting's hours).
function dpHoursOptionsHtml(selected, defaultHours){
  const sel = selected ? Number(selected) : (defaultHours||8);
  let html = '';
  for(let h=1; h<=8; h+=0.5){
    const label = h===1 ? '1 Hour' : `${h} Hours`;
    html += `<option value="${h}" ${Math.abs(sel-h)<0.001?'selected':''}>${label}</option>`;
  }
  return html;
}
// Refreshes the Operation dropdown whenever Machine or Part Number changes (both are needed
// to know which Production Norms operations apply), and clears the Production Norms box —
// picking a fresh Operation is what re-populates it (see dpOnOperationChange).
function dpRefreshOperationBox(selectedOperation){
  const opSel = document.getElementById('dpOperation');
  if(!opSel) return;
  const machineId = document.getElementById('dpMachine').value;
  const partId = document.getElementById('dpPart').value;
  const machineType = dpMachineTypeById(machineId);
  opSel.innerHTML = dpOperationOptionsHtml(partId, machineType, selectedOperation||'');
  dpOnOperationChange();
}
function dpOnMachineChange(){ dpRefreshOperationBox(''); }
// Selecting an Operation immediately shows its Production Norms (Production Cycle Time) as
// the default value — read-only, sourced directly from Production Norms for that operation.
function dpOnOperationChange(){
  const sel = document.getElementById('dpOperation');
  const opt = sel && sel.selectedOptions[0];
  const normBox = document.getElementById('dpNormValue');
  if(normBox) normBox.value = opt ? dpNormDisplay(opt.getAttribute('data-sec')) : '';
}
// Scrolls a given element into view (used to jump to the Edit form when "E" is clicked, and
// back to the same record's row after Save Changes) without disturbing any other behaviour.
function dwScrollToId(id){
  const el = document.getElementById(id);
  if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
}
function setEditingDailyProd(id){ editingDailyProdId = id; render(); dwScrollToId('dpEntryForm'); }
function cancelEditDailyProd(){ editingDailyProdId = null; render(); }
function saveDailyProduction(){
  const date = document.getElementById('dpDate').value;
  const shift = document.getElementById('dpShift').value;
  const machineId = document.getElementById('dpMachine').value;
  const partId = document.getElementById('dpPart').value;
  const operatorId = document.getElementById('dpOperator').value;
  const hoursVal = document.getElementById('dpHours').value;
  const qty = document.getElementById('dpQty').value;
  if(!date){ toast('Select the Date'); return; }
  if(!shift){ toast('Select the Shift'); return; }
  if(!machineId){ toast('Select the Machine'); return; }
  if(!partId){ toast('Select the Part Number'); return; }
  if(!operatorId){ toast('Select the Operator Name'); return; }
  if(qty===''||qty===null||isNaN(qty)||Number(qty)<=0){ toast('Enter a valid Production Quantity'); return; }
  // Production Hours — additive, optional reference field; leaving it blank does not block
  // saving, so the existing entry process/validation above is unchanged.
  const hours = (hoursVal===''||hoursVal===null||isNaN(hoursVal)||Number(hoursVal)<0) ? 0 : Number(hoursVal);
  // Operation / Production Norms — additive, optional reference fields; selecting them is
  // not required to save, so the existing entry process/validation above is unchanged.
  const opSel = document.getElementById('dpOperation');
  const operation = opSel ? opSel.value : '';
  const opOpt = opSel ? opSel.selectedOptions[0] : null;
  const normSec = opOpt ? (Number(opOpt.getAttribute('data-sec'))||0) : 0;
  const wasEditingId = editingDailyProdId; // remember, so we can jump back to this exact row
  if(editingDailyProdId){
    const r = DB.dailyProduction.find(x=>x.id===editingDailyProdId);
    if(r) Object.assign(r, {date, shift, machineId, partId, operatorId, hours, qty:Number(qty), operation, normSec});
    editingDailyProdId = null;
    toast('Daily Production entry updated');
  } else {
    DB.dailyProduction.push({id:uid('dp'), unit:currentUnit, date, shift, machineId, partId, operatorId, hours, qty:Number(qty), operation, normSec});
    toast('Daily Production entry saved');
  }
  saveDB(); render();
  if(wasEditingId) dwScrollToId('dwrow_dp_'+wasEditingId);
}
/* ---------------- DAILY WORKSHEET (parent of Daily Production + Daily Setting) ---------------- */
function setDailyWorksheetSubTab(t){ dailyWorksheetSubTab = t; render(); }
function dailyWorksheetSubtabsHtml(){
  return `<div class="subtabs" style="margin-top:8px;">
    <button class="${dailyWorksheetSubTab==='production'?'active':''}" onclick="setDailyWorksheetSubTab('production')">📋 Daily Production</button>
    <button class="${dailyWorksheetSubTab==='setting'?'active':''}" onclick="setDailyWorksheetSubTab('setting')">🛠️ Daily Setting</button>
  </div>`;
}
function renderDailyWorksheet(main){
  main.innerHTML = `
    ${dailyWorksheetSubtabsHtml()}
    <div id="dwSub"></div>
  `;
  const box = document.getElementById('dwSub');
  if(dailyWorksheetSubTab==='setting') renderDailySetting(box);
  else renderDailyProduction(box);
}
/* ---- Date-wise / Shift-wise CARD DISPLAY for the entries recorded above ----
   This only changes how already-saved entries are DISPLAYED — grouped into
   exactly 2 cards per day (1st Shift, 2nd Shift), each in a clearly different
   colour, with every CNC machine listed first (in sequence) followed by every
   VMC machine (in sequence), one line per machine. The OT Entry section always
   stays at the very bottom of the card. Editing/deleting an entry from these
   cards still uses the exact same Edit/Del actions as the original list. */
function dsFmtMinutes(mins){
  const m = Number(mins)||0;
  const h = Math.floor(m/60), r = m%60;
  return h>0 ? `${h}h ${r}m` : `${r}m`;
}
// Shared machine sort order — CNC machines first (CNC-1, CNC-2, CNC-3…), then VMC machines
// (VMC-1, VMC-2, VMC-3…), then any other machine type, each group numeric-ascending by the
// number found in its Code/Name rather than plain string order (so "CNC-10" correctly sorts
// after "CNC-9", not between "CNC-1" and "CNC-2"). This is the one comparator every machine
// dropdown/list in the app should sort with, so the order is identical everywhere.
function machineTypeRank(type){
  const t = (type||'').trim().toUpperCase();
  if(t==='CNC') return 0;
  if(t==='VMC') return 1;
  return 2; // any other machine type — grouped after CNC/VMC, alphabetical by type
}
function machineNumberOf(s){ const mm=(s||'').match(/(\d+)/); return mm?parseInt(mm[1],10):9999; }
function machineCompare(a,b){
  const ta=machineTypeRank(a.type), tb=machineTypeRank(b.type);
  if(ta!==tb) return ta-tb;
  if(ta===2){ const typeCmp=(a.type||'').localeCompare(b.type||''); if(typeCmp!==0) return typeCmp; }
  const na=machineNumberOf(a.code||a.name), nb=machineNumberOf(b.code||b.name);
  if(na!==nb) return na-nb;
  return (a.code||'').localeCompare(b.code||'');
}
// CNC machines first (in sequence), then VMC machines (in sequence) — same order
// used consistently for both the 1st Shift and 2nd Shift cards.
function dwSortedMachines(){
  const list = DB.machines.filter(m=>reportUnitMatch(m.unit) && ['CNC','VMC'].includes((m.type||'').trim().toUpperCase()));
  return list.slice().sort(machineCompare);
}
// Short Machine Number label for the worksheet table — "CNC-1", "VMC-2" etc, built from the
// machine's Type + the number found in its Code/Name. Falls back to the raw Code if no
// number is found, so every machine still gets a sensible label.
function dwMachineShortLabel(m){
  const type = (m.type||'').trim().toUpperCase();
  const mm = (m.code||m.name||'').match(/(\d+)/);
  return mm ? `${type}-${parseInt(mm[1],10)}` : (m.code||type||'—');
}
// Efficiency % for a single Production entry — Standard Hours (Qty × Production Norms cycle
// time) ÷ Production Hours actually taken × 100. Blank whenever Production Hours or
// Production Norms aren't available, since efficiency can't be computed without both.
function dwEfficiencyPct(r){
  const qty = Number(r.qty)||0, normSec = Number(r.normSec)||0, hours = Number(r.hours)||0;
  if(!qty || !normSec || !hours) return '';
  const stdHours = (qty*normSec)/3600;
  return Math.round((stdHours/hours)*1000)/10; // one decimal place
}
// Spreadsheet-style grid rows for a set of machines — Machine Number, Part Number, Part Name,
// Operation Number, Operator Name, Production Quantity, Efficiency (production entries) — or
// the equivalent Setting columns (Machine Number, Part Number, Part Name, Operation Number,
// Operator Name, Setting Time). Built with CSS Grid (not a <table>) so columns always fit the
// card's width and wrap instead of triggering horizontal scrolling. One row per entry; a
// machine with no entries for that date/shift still gets a single placeholder row.
// Light-gray spreadsheet palette — used for the whole Daily Worksheet card, independent of
// the app's active theme, so it always reads as a bright, paper-like worksheet.
const DW_BG = '#f2f2f2';
const DW_HEAD_BG = '#e2e2e2';
const DW_LINE = '#c9c9c9';
const DW_TEXT = '#1f2430';
const DW_TEXT_DIM = '#5b6270';
const DW_GRID_COLS_PROD = 'minmax(56px,0.8fr) minmax(70px,1fr) minmax(80px,1.3fr) minmax(56px,0.8fr) minmax(70px,1fr) minmax(40px,0.55fr) minmax(48px,0.6fr) minmax(60px,0.9fr)';
const DW_GRID_COLS_SET  = 'minmax(56px,0.8fr) minmax(70px,1fr) minmax(80px,1.3fr) minmax(56px,0.8fr) minmax(70px,1fr) minmax(56px,0.8fr) minmax(60px,0.9fr)';
// Every cell gets a right-hand divider (vertical column line) in addition to the row's bottom
// line, so the grid reads as a properly ruled spreadsheet; every header and value is centered
// within its column.
function dwGridCell(content, extraStyle){
  return `<div style="padding:5px 7px; border-bottom:1px solid ${DW_LINE}; border-right:1px solid ${DW_LINE}; background:${DW_BG}; color:${DW_TEXT}; font-size:11px; word-break:break-word; display:flex; align-items:center; justify-content:center; text-align:center; ${extraStyle||''}">${content}</div>`;
}
function dwGridHeaderCell(label){
  return `<div style="padding:6px 7px; background:${DW_HEAD_BG}; color:${DW_TEXT}; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; font-size:9px; border-bottom:2px solid ${DW_LINE}; border-right:1px solid ${DW_LINE}; text-align:center;">${label}</div>`;
}
// Efficiency colour tiers: 90%+ green, 80%–<90% orange, below 80% red.
function dwEffColor(eff){
  if(eff==='') return '';
  if(eff>=90) return '#278449';
  if(eff>=80) return '#c07a12';
  return '#b03a2c';
}
// Small round "E"/"D" action buttons (space-constrained card) — same Edit/Delete behaviour as
// before, just a more compact shape.
const DW_ROUND_BTN = 'width:20px; height:20px; min-width:20px; padding:0; border-radius:5px; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; line-height:1;';
function dwActionButtons(editOnclick, delBucket, id){
  return `<button class="btn small ghost" style="${DW_ROUND_BTN}" onclick="${editOnclick}" title="Edit">E</button> <button class="btn danger" style="${DW_ROUND_BTN}" onclick="deleteRow('${delBucket}','${id}')" title="Delete">D</button>`;
}
function dwMachineRowCells(m, entries, type){
  const machineLabel = esc(dwMachineShortLabel(m));
  if(!entries.length){
    const dashCount = type==='production' ? 6 : 5;
    return dwGridCell(`<b>${machineLabel}</b>`) + Array.from({length:dashCount}).map(()=>dwGridCell('—')).join('') + dwGridCell('');
  }
  return entries.map(r=>{
    const partInfo = dpIssuedPartsList().find(x=>x.no===r.partId);
    const op = DB.employees.find(x=>x.id===r.operatorId);
    if(type==='production'){
      const eff = dwEfficiencyPct(r);
      const effColor = dwEffColor(eff);
      const cells = dwGridCell(`<b>${machineLabel}</b>`)
        + dwGridCell(esc(r.partId)||'—')
        + dwGridCell(partInfo&&partInfo.name?esc(partInfo.name):'—')
        + dwGridCell(esc(r.operation)||'—')
        + dwGridCell(op?esc(op.empName):'—')
        + dwGridCell(r.qty, 'color:#278449; font-weight:700;')
        + dwGridCell(eff!==''?eff+'%':'—', `${effColor?`color:${effColor}; font-weight:700;`:''}`)
        + dwGridCell(dwActionButtons(`setEditingDailyProd('${r.id}')`, 'dailyProduction', r.id));
      return `<div id="dwrow_dp_${r.id}" style="display:contents;">${cells}</div>`;
    }
    const cells = dwGridCell(`<b>${machineLabel}</b>`)
      + dwGridCell(esc(r.partId)||'—')
      + dwGridCell(partInfo&&partInfo.name?esc(partInfo.name):'—')
      + dwGridCell(esc(r.operation)||'—')
      + dwGridCell(op?esc(op.empName):'—')
      + dwGridCell(dsFmtMinutes(r.settingMinutes), 'color:#a1700f; font-weight:700;')
      + dwGridCell(dwActionButtons(`setEditingDailySetting('${r.id}')`, 'dailySetting', r.id));
    return `<div id="dwrow_ds_${r.id}" style="display:contents;">${cells}</div>`;
  }).join('');
}
function dwWorksheetGridHtml(machines, entries, type){
  if(!machines.length) return `<div class="empty" style="background:${DW_BG}; color:${DW_TEXT_DIM};">No CNC/VMC machines registered for this unit yet.</div>`;
  const cols = type==='production' ? DW_GRID_COLS_PROD : DW_GRID_COLS_SET;
  const headers = type==='production'
    ? ['Machine No.','Part Number','Part Name','Op. No.','Operator','Qty','Eff. %','']
    : ['Machine No.','Part Number','Part Name','Op. No.','Operator','Setting',''];
  return `<div style="display:grid; grid-template-columns:${cols}; border:1px solid ${DW_LINE}; border-radius:8px; overflow:hidden;">
    ${headers.map(h=>dwGridHeaderCell(h)).join('')}
    ${machines.map(m=>dwMachineRowCells(m, entries.filter(r=>r.machineId===m.id), type)).join('')}
  </div>`;
}
// One flattened card per DATE — both shifts and the OT Entry section live inside this single
// card (as clearly-labelled sub-sections, not separate panel cards), so the whole worksheet
// for a day stays compact and never needs horizontal scrolling. 1st Shift sits on the left,
// 2nd Shift on the right, side by side; the whole card uses a light-gray background.
function dwDateCardHtml(date, allEntries, type, machines){
  const shift1Entries = allEntries.filter(r=>r.date===date && r.shift==='Shift 1');
  const shift2Entries = allEntries.filter(r=>r.date===date && r.shift==='Shift 2');
  const ot1Entries = allEntries.filter(r=>r.date===date && r.shift==='Shift 1 OT');
  const ot2Entries = allEntries.filter(r=>r.date===date && r.shift==='Shift 2 OT');
  const otMachines1 = machines.filter(m=>ot1Entries.some(r=>r.machineId===m.id));
  const otMachines2 = machines.filter(m=>ot2Entries.some(r=>r.machineId===m.id));
  return `
  <div class="panel" style="border:1px solid ${DW_LINE}; background:${DW_BG};">
    <h3 style="margin-bottom:12px; text-align:center; color:${DW_TEXT};">📅 ${fmtDate(date)}</h3>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start;">
      <div style="border-right:1px solid ${DW_LINE}; padding-right:14px;">
        <div style="font-weight:800; font-size:12px; color:#2f6690; text-align:center; margin-bottom:6px;">🌞 1st Shift</div>
        ${dwWorksheetGridHtml(machines, shift1Entries, type)}
      </div>
      <div>
        <div style="font-weight:800; font-size:12px; color:#a56a10; text-align:center; margin-bottom:6px;">🌙 2nd Shift</div>
        ${dwWorksheetGridHtml(machines, shift2Entries, type)}
      </div>
    </div>
    <div style="margin:16px 0 2px; border-top:2px dashed #b03a2c; padding-top:8px;">
      <div style="color:#b03a2c; font-weight:700; font-size:12px; text-align:center; margin-bottom:8px;">🕒 OT Entry</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start;">
        <div style="border-right:1px solid ${DW_LINE}; padding-right:14px;">
          <div style="font-size:10.5px; color:${DW_TEXT_DIM}; text-align:center; margin-bottom:4px;">1st Shift OT</div>
          ${otMachines1.length ? dwWorksheetGridHtml(otMachines1, ot1Entries, type) : `<div class="hint" style="position:static; font-size:11.5px; text-align:center; color:${DW_TEXT_DIM};">No OT entries.</div>`}
        </div>
        <div>
          <div style="font-size:10.5px; color:${DW_TEXT_DIM}; text-align:center; margin-bottom:4px;">2nd Shift OT</div>
          ${otMachines2.length ? dwWorksheetGridHtml(otMachines2, ot2Entries, type) : `<div class="hint" style="position:static; font-size:11.5px; text-align:center; color:${DW_TEXT_DIM};">No OT entries.</div>`}
        </div>
      </div>
    </div>
  </div>`;
}
// Groups a flat list of entries (Daily Production or Daily Setting) into date-wise sections,
// each a single compact, full-width card — most recent date first. No splitting into multiple
// cards per day and no horizontal-scrolling table; everything is one flattened CSS Grid.
function dwGroupedCardsHtml(list, type, emptyMsg){
  if(!list.length) return `<div class="empty">${emptyMsg}</div>`;
  const dates = [...new Set(list.map(x=>x.date))].sort((a,b)=>b.localeCompare(a));
  const machines = dwSortedMachines();
  return `<div style="display:flex; flex-direction:column; gap:16px; margin-top:8px;">
    ${dates.map(date=>dwDateCardHtml(date, list, type, machines)).join('')}
  </div>`;
}
/* ---------------- DAILY SETTING (machine setting time — quick daily entry) ---------------- */
let editingDailySettingId = null;
function setEditingDailySetting(id){ editingDailySettingId = id; render(); dwScrollToId('dsEntryForm'); }
function cancelEditDailySetting(){ editingDailySettingId = null; render(); }
// Part Number → Part Name (auto) + Operation list (from Production Norms), mirroring the
// same behaviour as the Daily Production entry form above.
function dsOnPartChange(){
  const sel = document.getElementById('dsPart');
  const opt = sel && sel.selectedOptions[0];
  const nameBox = document.getElementById('dsPartName');
  if(nameBox) nameBox.value = opt ? (opt.getAttribute('data-name')||'') : '';
  dsRefreshOperationBox('');
}
function dsOnMachineChange(){ dsRefreshOperationBox(''); }
function dsRefreshOperationBox(selectedOperation){
  const opSel = document.getElementById('dsOperation');
  if(!opSel) return;
  const machineId = document.getElementById('dsMachine').value;
  const partId = document.getElementById('dsPart').value;
  const machineType = dpMachineTypeById(machineId);
  opSel.innerHTML = dpOperationOptionsHtml(partId, machineType, selectedOperation||'');
}
function saveDailySetting(){
  const date = document.getElementById('dsDate').value;
  const shift = document.getElementById('dsShift').value;
  const machineId = document.getElementById('dsMachine').value;
  const partId = document.getElementById('dsPart').value;
  const operatorId = document.getElementById('dsOperator').value;
  const hoursVal = document.getElementById('dsHours').value;
  if(!date){ toast('Select the Date'); return; }
  if(!shift){ toast('Select the Shift'); return; }
  if(!machineId){ toast('Select the Machine'); return; }
  if(!partId){ toast('Select the Part Number'); return; }
  if(!operatorId){ toast('Select the Operator Name'); return; }
  if(hoursVal===''||hoursVal===null||isNaN(hoursVal)||Number(hoursVal)<=0){ toast('Select a valid Setting Time'); return; }
  const mins = Number(hoursVal)*60;
  const opSel = document.getElementById('dsOperation');
  const operation = opSel ? opSel.value : '';
  const wasEditingId = editingDailySettingId; // remember, so we can jump back to this exact row
  if(editingDailySettingId){
    const r = DB.dailySetting.find(x=>x.id===editingDailySettingId);
    if(r) Object.assign(r, {date, shift, machineId, partId, operatorId, settingMinutes:Number(mins), operation});
    editingDailySettingId = null;
    toast('Daily Setting entry updated');
  } else {
    DB.dailySetting.push({id:uid('ds'), unit:currentUnit, date, shift, machineId, partId, operatorId, settingMinutes:Number(mins), operation});
    toast('Daily Setting entry saved');
  }
  saveDB(); render();
  if(wasEditingId) dwScrollToId('dwrow_ds_'+wasEditingId);
}
function renderDailySetting(main){
  const list = DB.dailySetting.filter(x=>reportUnitMatch(x.unit));
  const editing = editingDailySettingId ? DB.dailySetting.find(x=>x.id===editingDailySettingId) : null;
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;" id="dsEntryForm">
      <h3>${editing?'Edit':'New'} Daily Setting Entry</h3>
      <div class="hint" style="position:static; margin-bottom:10px;">Date → Shift → Machine → Operator Name → Setting Time Taken → Save. Only the total time the operator took for machine setting is captured — no start/end time.</div>
      <div class="frow g5">
        <div><label class="fl">Date</label><input id="dsDate" type="date" value="${editing?esc(editing.date):today()}"></div>
        <div><label class="fl">Shift</label><select id="dsShift">
          <option value="">— select shift —</option>
          <option value="Shift 1" ${editing&&editing.shift==='Shift 1'?'selected':''}>Shift 1</option>
          <option value="Shift 2" ${editing&&editing.shift==='Shift 2'?'selected':''}>Shift 2</option>
          <option value="Shift 1 OT" ${editing&&editing.shift==='Shift 1 OT'?'selected':''}>Shift 1 OT</option>
          <option value="Shift 2 OT" ${editing&&editing.shift==='Shift 2 OT'?'selected':''}>Shift 2 OT</option>
        </select></div>
        <div><label class="fl">Machine</label><select id="dsMachine" onchange="dsOnMachineChange()">${dpMachineOptionsHtml(editing?editing.machineId:'')}</select></div>
        <div><label class="fl">Part Number</label><select id="dsPart" onchange="dsOnPartChange()">${dpPartOptionsHtml(editing?editing.partId:'')}</select></div>
        <div><label class="fl">Operation <span class="hint" style="position:static; font-size:9.5px;">(from Production Norms)</span></label><select id="dsOperation">${dpOperationOptionsHtml(editing?editing.partId:'', dpMachineTypeById(editing?editing.machineId:''), editing?editing.operation:'')}</select></div>
      </div>
      <div class="frow g4">
        <div><label class="fl">Part Name <span class="hint" style="position:static; font-size:9.5px;">(auto)</span></label><input id="dsPartName" disabled value="${(()=>{ if(!editing) return ''; const p=dpIssuedPartsList().find(x=>x.no===editing.partId); return p?esc(p.name):''; })()}"></div>
        <div><label class="fl">Operator Name</label><select id="dsOperator">${dpOperatorOptionsHtml(editing?editing.operatorId:'')}</select></div>
        <div><label class="fl">Setting Time Taken</label><select id="dsHours">${dpHoursOptionsHtml(editing&&editing.settingMinutes?editing.settingMinutes/60:'', 1)}</select></div>
        <div style="display:flex; align-items:flex-end; gap:8px;">
          <button class="btn amber" onclick="saveDailySetting()">💾 ${editing?'Save Changes':'Save'}</button>
          ${editing?`<button class="btn ghost" onclick="cancelEditDailySetting()">Cancel</button>`:''}
        </div>
      </div>
    </div>
    <div class="panel">
      <h3>Daily Setting Entries <span class="hint">${list.length} recorded</span></h3>
      ${dwGroupedCardsHtml(list, 'setting', 'No Daily Setting entries yet.')}
    </div>
  `;
}
function renderDailyProduction(main){
  const list = DB.dailyProduction.filter(x=>reportUnitMatch(x.unit));
  const editing = editingDailyProdId ? DB.dailyProduction.find(x=>x.id===editingDailyProdId) : null;
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;" id="dpEntryForm">
      <h3>${editing?'Edit':'New'} Daily Production Entry</h3>
      <div class="hint" style="position:static; margin-bottom:10px;">Date → Shift → Machine → Part Number → Part Name (Auto) → Operator Name → Production Quantity → Save. Every field except Production Quantity is picked from a list — nothing is typed manually.</div>
      <div class="frow g6">
        <div><label class="fl">Date</label><input id="dpDate" type="date" value="${editing?esc(editing.date):today()}"></div>
        <div><label class="fl">Shift</label><select id="dpShift">
          <option value="">— select shift —</option>
          <option value="Shift 1" ${editing&&editing.shift==='Shift 1'?'selected':''}>Shift 1</option>
          <option value="Shift 2" ${editing&&editing.shift==='Shift 2'?'selected':''}>Shift 2</option>
          <option value="Shift 1 OT" ${editing&&editing.shift==='Shift 1 OT'?'selected':''}>Shift 1 OT</option>
          <option value="Shift 2 OT" ${editing&&editing.shift==='Shift 2 OT'?'selected':''}>Shift 2 OT</option>
        </select></div>
        <div><label class="fl">Machine</label><select id="dpMachine" onchange="dpOnMachineChange()">${dpMachineOptionsHtml(editing?editing.machineId:'')}</select></div>
        <div><label class="fl">Part Number</label><select id="dpPart" onchange="dpOnPartChange()">${dpPartOptionsHtml(editing?editing.partId:'')}</select></div>
        <div><label class="fl">Operation <span class="hint" style="position:static; font-size:9.5px;">(from Production Norms)</span></label><select id="dpOperation" onchange="dpOnOperationChange()">${dpOperationOptionsHtml(editing?editing.partId:'', dpMachineTypeById(editing?editing.machineId:''), editing?editing.operation:'')}</select></div>
        <div><label class="fl">Production Norms <span class="hint" style="position:static; font-size:9.5px;">(auto)</span></label><input id="dpNormValue" disabled value="${editing&&editing.normSec?dpNormDisplay(editing.normSec):''}"></div>
      </div>
      <div class="frow g5">
        <div><label class="fl">Part Name <span class="hint" style="position:static; font-size:9.5px;">(auto)</span></label><input id="dpPartName" disabled value="${(()=>{ if(!editing) return ''; const p=dpIssuedPartsList().find(x=>x.no===editing.partId); return p?esc(p.name):''; })()}"></div>
        <div><label class="fl">Operator Name</label><select id="dpOperator">${dpOperatorOptionsHtml(editing?editing.operatorId:'')}</select></div>
        <div><label class="fl">Production Hours</label><select id="dpHours">${dpHoursOptionsHtml(editing&&editing.hours?editing.hours:'')}</select></div>
        <div><label class="fl">Production Quantity</label><input id="dpQty" type="number" min="1" placeholder="Enter quantity" value="${editing?editing.qty:''}"></div>
        <div style="display:flex; align-items:flex-end; gap:8px;">
          <button class="btn amber" onclick="saveDailyProduction()">💾 ${editing?'Save Changes':'Save'}</button>
          ${editing?`<button class="btn ghost" onclick="cancelEditDailyProd()">Cancel</button>`:''}
        </div>
      </div>
    </div>
    <div class="panel">
      <h3>Daily Production Entries <span class="hint">${list.length} recorded</span></h3>
      ${dwGroupedCardsHtml(list, 'production', 'No Daily Production entries yet.')}
    </div>
  `;
}
function renderProductionNormsReport(main){
  main.innerHTML = `
    <div class="panel" style="margin-top:8px;">
      <h3>Production Norms <span class="hint">The Quotation's ACTUAL Cycle Time (never the Quotation Cycle Time) automatically becomes the default Production cycle time, operation-wise — edit any CNC/VMC operation below whenever the shop-floor time differs further. This is the only cycle time the Machine Capacity Report uses.</span></h3>
      <div class="hint" style="position:static; display:block; margin:0 0 4px;">Quotation (Actual Cycle Time) → Production Norms → Machine Capacity Report. Each CNC and VMC operation is tracked and edited separately — there is no combined Total Cycle Time here. If a Production Cycle Time is increased above the Quotation's Actual Cycle Time for that operation, it is highlighted in red.</div>
      <div class="frow g2" style="align-items:center; margin:0 0 12px;">
        <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700;">Select Part Number: ${prodNormsPartSelectHtml(prodNormsSelectedPart, 'setProdNormsSelectedPart')}</label>
        <span class="hint" style="position:static;">Choosing a Part Number here filters the report below and is reflected in the Part Number field on that part's card.</span>
      </div>
      <div id="prodNormsBox">${prodNormsReportHtml()}</div>
    </div>
  `;
}
// One row per planned Finished Part (from Sales Plan or Job Work Plan) that carries a
// non-zero planned quantity. Cycle time is the SUM of the individually-tracked Production
// Norms operation cycle times — the single source of truth kept in sync from the Quotation
// but editable per-operation on the shop floor — never straight from the Quotation, so an
// updated Production Norms operation value is always reflected here.
function machineCapacityRows(){
  const rows = [];
  const sumOps = arr => (arr||[]).reduce((s,v)=>s+(parseFloat(v)||0),0);
  DB.custPO.filter(x=>reportUnitMatch(x.unit)).forEach(p=>{
    const qty = p.orderedQty||0;
    if(qty<=0) return;
    const q = p.quotationId ? DB.quotation.find(x=>x.id===p.quotationId) : null;
    const item = q ? (q.items||[]).find(it=>it.partNo===p.finPartNo) : null;
    let cncSec=0, vmcSec=0, norm=null;
    if(q && item){
      const ops = salesOpsFromItem(item);
      norm = getOrCreateProdNorm('Sales', p.quotationId, q.quoteNo, p.finPartNo, p.finPartName, p.customer||planRecCustomerKey(p), p.unit, ops.cnc, ops.vmc);
      cncSec = norm ? sumOps(norm.prodCncOps) : 0; vmcSec = norm ? sumOps(norm.prodVmcOps) : 0;
    }
    rows.push({ source:'Sales Plan', customer:p.customer||planRecCustomerKey(p), partNo:p.finPartNo, partName:p.finPartName, qty, cncSec, vmcSec, hasCycleTime:!!norm });
  });
  DB.labourPO.filter(x=>reportUnitMatch(x.unit)).forEach(p=>{
    const t = labourPOMonthTotals(p, machineCapMonth);
    const qty = t.scheduled||0;
    if(qty<=0) return;
    const q = p.labourQuoteId ? DB.labourQuotation.find(x=>x.id===p.labourQuoteId) : null;
    const item = q ? (q.items||[]).find(it=>it.partNo===p.finPartNo) : null;
    let cncSec=0, vmcSec=0, norm=null;
    if(q && item){
      const ops = labourOpsFromItem(item);
      norm = getOrCreateProdNorm('Labour', p.labourQuoteId, q.quoteNo, p.finPartNo, p.finPartName, p.customer||planRecCustomerKey(p), p.unit, ops.cnc, ops.vmc);
      cncSec = norm ? sumOps(norm.prodCncOps) : 0; vmcSec = norm ? sumOps(norm.prodVmcOps) : 0;
    }
    rows.push({ source:'Job Work Plan', customer:p.customer||planRecCustomerKey(p), partNo:p.finPartNo, partName:p.finPartName, qty, cncSec, vmcSec, hasCycleTime:!!norm });
  });
  flushProdNormsDirty();
  return rows.sort((a,b)=> (a.customer||'').localeCompare(b.customer||'') || (a.partNo||'').localeCompare(b.partNo||''));
}
function mcBuildTypeSummary(label, rows, secKey, workingDays){
  let rawProdHrs=0, parts=0;
  rows.forEach(r=>{ if(r[secKey]>0){ rawProdHrs += (r.qty*r[secKey])/3600; parts++; } });
  const prodHrs = rawProdHrs / MC_EFFICIENCY; // 85% efficiency — effectively more machine hours are required to produce the same qty
  const settingHrs = parts * MC_SETTING_HOURS;
  const required = prodHrs + settingHrs;
  const machines = DB.machines.filter(m=>reportUnitMatch(m.unit) && (m.type||'').trim().toUpperCase()===label && m.status!=='Breakdown');
  const available = machines.length * MC_SHIFT_HOURS * workingDays;
  const balance = available - required;
  const utilPct = available>0 ? Math.round((required/available)*1000)/10 : (required>0 ? 999.9 : 0);
  const round2 = n => Math.round(n*100)/100;
  // Manpower: one operator covers 8 hrs/day × working days this month; Total Required Hrs
  // (production + setting time) is converted to a headcount, rounded up to a whole operator.
  const operatorDayHours = MC_OPERATOR_HOURS * workingDays;
  const operatorsRequired = operatorDayHours>0 ? Math.ceil(required / operatorDayHours) : 0;
  // Required Machine Count: how many machines of this type are actually needed to cover Total
  // Required Hrs this month, at MC_SHIFT_HOURS/day × workingDays capacity per machine — i.e.
  // the same load/hours-vs-capacity math as Available/Balance Hrs above, just expressed as a
  // machine headcount instead of hours. machineShortfall > 0 means that many more machines of
  // this type are needed than are currently registered (and not in Breakdown) for this unit.
  const perMachineHours = MC_SHIFT_HOURS * workingDays;
  const requiredMachines = perMachineHours>0 ? Math.ceil(required / perMachineHours) : 0;
  const machineShortfall = requiredMachines - machines.length;
  return { label, machines, machineCount:machines.length, workingDays, partsCount:parts,
    prodHrs:round2(prodHrs), settingHrs, required:round2(required), available:round2(available),
    balance:round2(balance), utilPct, sufficient: balance>=0, operatorsRequired,
    requiredMachines, machineShortfall };
}
function machineCapacitySummary(rows){
  const workingDays = mcWorkingDays();
  const cnc = mcBuildTypeSummary('CNC', rows, 'cncSec', workingDays);
  const vmc = mcBuildTypeSummary('VMC', rows, 'vmcSec', workingDays);
  const totalOperatorsRequired = cnc.operatorsRequired + vmc.operatorsRequired;
  return { cnc, vmc, totalOperatorsRequired };
}
function mcBlockHtml(sum){
  const cls = sum.sufficient ? 'ok' : 'bad';
  const pillCls = sum.sufficient ? 'pass' : 'fail';
  // Required Machine Count hint — shows how many machines of this type the current load
  // actually needs; if that's more than what's registered (and not in Breakdown), a second
  // "Shortage" badge spells out exactly how many more are needed, e.g. "Shortage: +1 CNC".
  const machineHintHtml = sum.machineShortfall>0
    ? `<span class="pill fail" style="font-size:11.5px; padding:5px 12px;" title="${sum.requiredMachines} ${sum.label} machine(s) needed for this month's load vs. ${sum.machineCount} currently registered">🔧 Shortage: +${sum.machineShortfall} ${sum.label}${sum.machineShortfall!==1?'s':''}</span>`
    : `<span class="pill pass" style="font-size:11.5px; padding:5px 12px;" title="${sum.machineCount} ${sum.label} machine(s) registered vs. ${sum.requiredMachines} needed for this month's load">🔧 Required ${sum.label} Machines: ${sum.requiredMachines}</span>`;
  return `
  <div class="mc-summary-block ${cls}">
    <div class="mc-summary-head">
      <h3>⚙️ ${sum.label} Machine Capacity — ${esc(monthKeyLabel(machineCapMonth))}</h3>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        ${machineHintHtml}
        <span class="pill ${pillCls}" style="font-size:11.5px; padding:5px 12px;">${sum.sufficient?'✅ Sufficient':'🔴 Insufficient'}</span>
      </div>
    </div>
    <div class="mc-stats">
      <div class="mc-stat c-blue"><div class="mk">Required Machine Hrs</div><div class="mv">${sum.prodHrs}</div></div>
      <div class="mc-stat c-amber"><div class="mk">Setting Time Hrs</div><div class="mv">${sum.settingHrs}</div></div>
      <div class="mc-stat c-red"><div class="mk">Total Required Hrs</div><div class="mv">${sum.required}</div></div>
      <div class="mc-stat c-cyan"><div class="mk">Available Monthly Hrs</div><div class="mv">${sum.available}</div></div>
      <div class="mc-stat c-green ${sum.balance<0?'bad':'good'}"><div class="mk">Balance Capacity Hrs</div><div class="mv">${sum.balance}</div></div>
      <div class="mc-stat c-purple ${sum.utilPct>100?'bad':''}"><div class="mk">Utilization %</div><div class="mv">${sum.utilPct}%</div></div>
      <div class="mc-stat c-orange"><div class="mk">Operators Required</div><div class="mv">${sum.operatorsRequired}</div></div>
    </div>
    <div class="mc-machine-note">${sum.machineCount} ${sum.label} machine(s) counted for this unit (Running/Idle — Breakdown excluded) × ${MC_SHIFT_HOURS} hrs/day (2 shifts × 8 hrs) × ${sum.workingDays} working day(s)${sum.machineCount?`: ${sum.machines.map(m=>esc(m.code)).join(', ')}`:' — no ' + sum.label + ' machines registered for this unit.'} &nbsp;|&nbsp; ${sum.partsCount} Part(s) need ${sum.label} time this month, each carrying a fixed ${MC_SETTING_HOURS} hr setting time. &nbsp;|&nbsp; Required Machine Hrs includes ${Math.round(MC_EFFICIENCY*100)}% machine efficiency (production hours ÷ ${MC_EFFICIENCY}); Available Machine Hrs is unaffected. &nbsp;|&nbsp; Operators Required = Total Required Hrs (${sum.required}) ÷ (${MC_OPERATOR_HOURS} hrs/operator/day × ${sum.workingDays} working day(s)), rounded up.</div>
  </div>`;
}
function mcManpowerSummaryHtml(sum){
  return `
  <div class="mc-summary-block" style="border-color:#c9b7e8; background:#faf7fd;">
    <div class="mc-summary-head">
      <h3>👷 Manpower (Operator) Requirement — ${esc(monthKeyLabel(machineCapMonth))}</h3>
    </div>
    <div class="mc-stats">
      <div class="mc-stat c-purple"><div class="mk">Total Operators Required</div><div class="mv">${sum.totalOperatorsRequired}</div></div>
      <div class="mc-stat c-blue"><div class="mk">CNC Operators Required</div><div class="mv">${sum.cnc.operatorsRequired}</div></div>
      <div class="mc-stat c-teal"><div class="mk">VMC Operators Required</div><div class="mv">${sum.vmc.operatorsRequired}</div></div>
    </div>
    <div class="mc-machine-note">Based on ${MC_OPERATOR_HOURS} working hrs per operator per day and ${sum.cnc.workingDays} working day(s) this month — Operators Required = Total Required Hrs ÷ (${MC_OPERATOR_HOURS} × Working Days), rounded up to the next whole operator, calculated separately for CNC and VMC.</div>
  </div>`;
}
function mcDetailTableHtml(rows){
  if(!rows.length) return '<div class="empty">No Sales PO Quantity or Scheduled Quantity found for this month.</div>';
  const missing = rows.filter(r=>!r.hasCycleTime).length;
  let totQty=0, totCnc=0, totVmc=0;
  rows.forEach(r=>{
    totQty += r.qty||0;
    if(r.cncSec>0) totCnc += Math.round((r.qty*r.cncSec/3600)*100)/100;
    if(r.vmcSec>0) totVmc += Math.round((r.qty*r.vmcSec/3600)*100)/100;
  });
  const round2 = n => Math.round(n*100)/100;
  return `
  <div class="perf-subhead"><span class="psh-badge">Detail</span><h3>Planned Parts — CNC / VMC Hours</h3><span class="hint">${rows.length} part(s)${missing?`, ${missing} missing linked cycle-time data`:''}</span></div>
  <div class="plan-table-wrap mc-detail-wrap">
  <table class="plan-table mc-detail-table">
    <thead><tr>
      <th>Source</th><th>Customer</th><th>Part No</th><th>Part Name</th><th class="pt-num-h">Planned Qty</th>
      <th class="pt-num-h">CNC Hrs</th>
      <th class="pt-num-h">VMC Hrs</th>
    </tr></thead>
    <tbody>
    ${rows.map(r=>{
      const cncHrs = Math.round((r.qty*r.cncSec/3600)*100)/100;
      const vmcHrs = Math.round((r.qty*r.vmcSec/3600)*100)/100;
      const warnRow = !r.hasCycleTime ? `<tr><td colspan="7" style="padding:2px 10px 8px;"><span class="hint" style="position:static; color:var(--amber);">⚠️ No linked Quotation / Job Work Quotation cycle-time found for this part — counted as 0 hrs here. Check the Quotation reference on this PO.</span></td></tr>` : '';
      // Cycle time here always comes from Production Norms, not the Quotation directly.
      return `<tr class="plan-row">
        <td class="pt-text"><span class="pill ${r.source==='Sales Plan'?'unit1':'unit2'}">${r.source}</span></td>
        <td class="pt-text">${esc(custDispByName(r.customer))||'—'}</td>
        <td class="pt-text"><b>${esc(r.partNo)||'—'}</b></td>
        <td class="pt-text rt-truncate" title="${esc(r.partName)}">${esc(r.partName)||'—'}</td>
        <td class="pt-text pt-num">${r.qty}</td>
        <td class="pt-text pt-num mc-cnc-cell">${r.cncSec>0?cncHrs:'—'}</td>
        <td class="pt-text pt-num mc-vmc-cell">${r.vmcSec>0?vmcHrs:'—'}</td>
      </tr>${warnRow}`;
    }).join('')}
    </tbody>
    <tfoot>
      <tr class="mc-total-row">
        <td class="pt-text" colspan="4"><b>Total</b></td>
        <td class="pt-text pt-num"><b>${totQty}</b></td>
        <td class="pt-text pt-num mc-cnc-cell"><b>${round2(totCnc)}</b></td>
        <td class="pt-text pt-num mc-vmc-cell"><b>${round2(totVmc)}</b></td>
      </tr>
    </tfoot>
  </table>
  </div>`;
}
function machineCapacityReportHtml(){
  const rows = machineCapacityRows();
  const sum = machineCapacitySummary(rows);
  return mcManpowerSummaryHtml(sum) + mcBlockHtml(sum.cnc) + mcBlockHtml(sum.vmc) + mcDetailTableHtml(rows);
}
function renderMachineCapacityReport(main){
  main.innerHTML = `
    <div class="panel" style="margin-top:8px;">
      <h3>Machine Capacity Report <span class="hint">Sales PO Quantity + Scheduled Quantity vs. CNC/VMC machine hours available this month — ${currentUnit==='Admin' ? reportScopeLabel() : unitLabel()}</span></h3>
      <div class="mc-toolbar">
        <div class="right">
          <label class="fl">Month</label>
          <input type="month" id="machineCapMonthSel" value="${esc(machineCapMonth)}" onchange="setMachineCapMonth(this.value)">
        </div>
        <div class="right">
          <label class="fl">Working Days <span class="hint" style="position:static; font-size:9.5px;">(auto = Total Days − Sundays; editable)</span></label>
          <input type="number" id="machineCapWorkingDaysInput" min="0" max="31" value="${mcWorkingDays()}" onchange="setMachineCapWorkingDays(this.value)">
        </div>
      </div>
      <div class="hint" style="position:static; display:block; margin:0 0 12px;">Scheduled Quantity (Job Work Plan) is taken for the selected month only. Sales PO Quantity (Sales Plan) is the full Customer PO quantity — it isn't month-tagged in Planning, so it is included in full against every month you check here; treat it as backlog demand rather than a guarantee it must finish in one month. CNC/VMC cycle time is taken from <b>Production Norms</b> (Production → ⏱ Production Norms) — not directly from the Quotation — so any update made there is reflected here automatically.</div>
      <div id="machineCapBox">${machineCapacityReportHtml()}</div>
    </div>
  `;
}
function prodSubtabsHtml(){
  return `<div class="subtabs" style="margin-top:12px;">
    ${subOK('production','jobs')?`<button class="${prodModuleSubTab==='jobs'?'active':''}" onclick="setProdModuleSubTab('jobs')">Production Jobs</button>`:''}
    ${subOK('production','daily')?`<button class="${prodModuleSubTab==='daily'?'active':''}" onclick="setProdModuleSubTab('daily')">📋 Daily Worksheet</button>`:''}
    ${subOK('production','norms')?`<button class="${prodModuleSubTab==='norms'?'active':''}" onclick="setProdModuleSubTab('norms')">⏱ Production Norms</button>`:''}
    ${subOK('production','machineCapacity')?`<button class="${prodModuleSubTab==='machineCapacity'?'active':''}" onclick="setProdModuleSubTab('machineCapacity')">⚙️ Machine Capacity Report</button>`:''}
    ${subOK('production','perfReport')?`<button class="${prodModuleSubTab==='perfReport'?'active':''}" onclick="setProdModuleSubTab('perfReport')">📈 Production Performance Report</button>`:''}
  </div>`;
}
function renderProduction(main){
  if(!subOK('production', prodModuleSubTab)) prodModuleSubTab = firstAllowedSub('production') || prodModuleSubTab;
  if(prodModuleSubTab==='daily'){
    main.innerHTML = `
      <div class="topbar"><div></div></div>
      ${flowline('production')}
      ${prodSubtabsHtml()}
      <div id="prodSub"></div>
    `;
    renderDailyWorksheet(document.getElementById('prodSub'));
    return;
  }
  if(prodModuleSubTab==='norms'){
    main.innerHTML = `
      <div class="topbar"><div></div></div>
      ${flowline('production')}
      ${prodSubtabsHtml()}
      <div id="prodSub"></div>
    `;
    renderProductionNormsReport(document.getElementById('prodSub'));
    return;
  }
  if(prodModuleSubTab==='machineCapacity'){
    main.innerHTML = `
      <div class="topbar"><div></div></div>
      ${flowline('production')}
      ${prodSubtabsHtml()}
      <div id="prodSub"></div>
    `;
    renderMachineCapacityReport(document.getElementById('prodSub'));
    return;
  }
  if(prodModuleSubTab==='perfReport'){
    main.innerHTML = `
      <div class="topbar"><div></div></div>
      ${flowline('production')}
      ${prodSubtabsHtml()}
      <div id="prodSub"></div>
    `;
    renderProductionPerformanceReport(document.getElementById('prodSub'));
    return;
  }
  const list = DB.production.filter(x=>reportUnitMatch(x.unit));
  prodNormalizeJobs(list);
  const openJobs = list.filter(p=>prodJobBalance(p)>0.0001);
  if(prodSelectedJobId && !openJobs.find(p=>p.id===prodSelectedJobId)) prodSelectedJobId = '';
  const selJob = prodSelectedJobId ? openJobs.find(p=>p.id===prodSelectedJobId) : null;
  const selCust = selJob ? DB.customers.find(x=>x.id===selJob.customerId) : null;
  main.innerHTML = `
    <div class="topbar"><div></div></div>
    ${flowline('production')}
    ${prodSubtabsHtml()}
    <div class="panel" style="margin-top:12px;">
      <h3>Pending Parts <span class="hint">(issued from Stores — ${openJobs.length} awaiting production output)</span></h3>
      <div class="hint" style="position:static; margin-bottom:10px;">Select a Part below to record its production output — Part Numbers are never typed manually; they only come from Stores issue.</div>
      <div class="frow g4" style="margin-bottom:12px;">
        <div style="max-width:280px;">
          <label class="fl">🔍 Search by Part No</label>
          <input id="pendingPartSearchInp" type="text" placeholder="Type a Part No…" value="${esc(pendingPartSearchTerm)}" oninput="onPendingSearchInput('part', this.value)">
        </div>
        <div style="max-width:280px;">
          <label class="fl">🔍 Search by Card No</label>
          <input id="pendingCardSearchInp" type="text" placeholder="Type a Card No…" value="${esc(pendingCardSearchTerm)}" oninput="onPendingSearchInput('card', this.value)">
        </div>
      </div>
      <div class="grid-box" id="pendingPartsGridBox">
        ${pendingPartsFilteredHtml(openJobs)}
      </div>
    </div>
    ${selJob ? `
    <div class="panel" id="prOutputPanel">
      <h3>Record Production Output <span class="hint">${esc(selJob.finPartNo||selJob.item)} — Card ${esc(selJob.cardNo)||'—'}</span></h3>
      <div class="hint" style="position:static; margin-bottom:10px;">Issued Qty must be fully accounted for: Issued Qty = OK Qty + Rejection Qty + Rework Qty + Shortage Qty.</div>
      <div class="frow g4">
        <div><label class="fl">Part</label><input disabled value="${esc(selJob.finPartNo||selJob.item)}"></div>
        <div><label class="fl">Customer</label><input disabled value="${selCust?esc(selCust.shortName||selCust.name):(esc(custDispByName(selJob.customerName))||'—')}"></div>
        <div><label class="fl">Issued Qty</label><input disabled value="${selJob.issuedQty}"></div>
        <div><label class="fl">Balance Remaining</label><input disabled value="${prodJobBalance(selJob)}"></div>
      </div>
      <div class="frow g4">
        <div><label class="fl">OK Qty</label><input id="prGoodQty" type="number" placeholder="0" oninput="updateProdEntryTotal()"></div>
        <div><label class="fl">Shortage Qty</label><input id="prShortQty" type="number" placeholder="0" oninput="updateProdEntryTotal()"></div>
        <div><label class="fl">Operator <span class="hint" style="position:static; font-size:9.5px;">(from Human Resources)</span></label><select id="prOperator">${hrOperatorNameOptionsHtml(selJob.operator||'')}</select></div>
        <div><label class="fl">Date</label><input id="prDate" type="date" value="${today()}"></div>
      </div>
      <div class="frow" style="align-items:center; margin-top:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <label class="fl" style="margin:0;">Rejection Details <span class="hint" style="position:static; font-size:9.5px;">(add one row per rejection reason)</span></label>
          <button type="button" class="btn small ghost" onclick="addProdRejRow()">+ Add Rejection Row</button>
        </div>
      </div>
      <div id="prRejRows"></div>
      <div class="frow" style="align-items:center; margin-top:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <label class="fl" style="margin:0;">Rework Details <span class="hint" style="position:static; font-size:9.5px;">(add one row per rework reason)</span></label>
          <button type="button" class="btn small ghost" onclick="addProdReworkRow()">+ Add Rework Row</button>
        </div>
      </div>
      <div id="prReworkRows"></div>
      <div class="frow g3" style="margin-top:10px;">
        <div><label class="fl">Entry Total <span class="hint" style="position:static; font-size:9.5px;">(Good + Rejection + Rework + Shortage)</span></label><input id="prEntryTotalDisp" disabled value="0"></div>
        <div><label class="fl">Balance After This Entry <span class="hint" style="position:static; font-size:9.5px;">(auto)</span></label><input id="prBalanceAfterDisp" disabled value=""></div>
      </div>
      <div style="display:flex; gap:10px; margin-top:10px;">
        <button class="btn amber" onclick="recordProdOutput()">💾 Save Output Entry</button>
        <button class="btn ghost" onclick="clearProdJobSelection()">← Back to Pending Parts</button>
      </div>
    </div>` : ''}
    <div class="panel">
      <h3>Production Jobs <span class="hint">${list.length} jobs</span></h3>
      <div class="frow g4" style="margin-bottom:12px;">
        <div style="max-width:280px;">
          <label class="fl">Search by Part No</label>
          <input id="prodJobSearchInp" type="text" placeholder="Type a Part No…" value="${esc(prodJobSearchTerm)}" oninput="onProdJobSearchInput('part', this.value)">
        </div>
        <div style="max-width:280px;">
          <label class="fl">Search by Card No</label>
          <input id="prodJobCardSearchInp" type="text" placeholder="Type a Card No…" value="${esc(prodJobCardSearchTerm)}" oninput="onProdJobSearchInput('card', this.value)">
        </div>
      </div>
      <div class="grid-box" id="prodJobsGridBox">
        ${prodJobsFilteredHtml(list)}
      </div>
    </div>
  `;
  if(selJob){
    addProdRejRow();
    addProdReworkRow();
    updateProdEntryTotal();
  }
}
// Renders just the job cards for the Production Jobs list, applying the Part No search filter.
function prodJobsFilteredHtml(list){
  const term = (prodJobSearchTerm||'').trim().toLowerCase();
  const cardTerm = (prodJobCardSearchTerm||'').trim().toLowerCase();
  let filtered = list;
  if(term) filtered = filtered.filter(p=>((p.finPartNo||p.item||'')+'').toLowerCase().includes(term));
  if(cardTerm) filtered = filtered.filter(p=>((p.cardNo||'')+'').toLowerCase().includes(cardTerm));
  if(!filtered.length) return (term||cardTerm) ? `<div class="empty">No Production Jobs match ${term?`Part No "${esc(prodJobSearchTerm)}"`:''}${term&&cardTerm?' and ':''}${cardTerm?`Card No "${esc(prodJobCardSearchTerm)}"`:''}.</div>` : '<div class="empty">No production jobs for this unit yet.</div>';
  return filtered.slice().reverse().map(p=>{
          const cust = DB.customers.find(x=>x.id===p.customerId);
          const bal = prodJobBalance(p);
          // Card color-coding: default grey = pending output, peach = completed & awaiting
          // Final Insp., green = completed & already pushed to Final Insp.
          const cardStyle = bal>0.0001
            ? ''
            : (p.pushedToFI ? 'background:#e9f8ec; border-color:#a9dcb2;' : 'background:#fdece0; border-color:#f0bd97;');
          return `<div class="rec-card" style="${cardStyle}">
            <div class="rc-title">${esc(p.finPartNo||p.item)}</div>
            <div class="rc-sub">${esc(p.finPartName||p.partName)||''}</div>
            ${p.cardNo?`<div class="rc-row"><span class="k">Card No</span><span class="v" style="color:var(--amber);">${esc(p.cardNo)}</span></div>`:''}
            <span class="pill rc-pill ${p.status==='Completed'?'done':p.status==='In Progress'?'progress':'open'}">${p.status}</span>
            <div class="rc-row"><span class="k">Customer</span><span class="v">${cust?esc(cust.shortName||cust.name):(esc(custDispByName(p.customerName))||esc(custDispByName(p.customer))||'—')}</span></div>
            <div class="rc-row"><span class="k">Issued Qty</span><span class="v">${p.issuedQty}${p.weightIssued?' Nos':''}</span></div>
            <div class="rc-row"><span class="k">OK Qty</span><span class="v" style="color:var(--green,#2e8b57);">${p.goodQty||0}</span></div>
            ${p.rejectionQty?`<div class="rc-row"><span class="k">Total Rejection Qty</span><span class="v" style="color:var(--red);">${p.rejectionQty}</span></div>`:''}
            ${(p.rejectionRows&&p.rejectionRows.length)?p.rejectionRows.map(r=>`<div class="rc-row"><span class="k">↳ ${esc(r.reason)}</span><span class="v" style="color:var(--red);">${r.qty}</span></div>`).join(''):''}
            ${p.reworkQty?`<div class="rc-row"><span class="k">Total Rework Qty</span><span class="v" style="color:var(--amber);">${p.reworkQty}</span></div>`:''}
            ${(p.reworkRows&&p.reworkRows.length)?p.reworkRows.map(r=>`<div class="rc-row"><span class="k">↳ ${esc(r.reason)}</span><span class="v" style="color:var(--amber);">${r.qty}</span></div>`).join(''):''}
            ${p.shortageQty?`<div class="rc-row"><span class="k">Shortage Qty</span><span class="v" style="color:var(--amber);">${p.shortageQty}</span></div>`:''}
            <div class="rc-row"><span class="k">Balance Remaining</span><span class="v" style="color:${bal>0.0001?'var(--red)':'var(--green,#2e8b57)'}; font-weight:700;">${bal>0.0001?bal:'✓ 0 (Fully Reconciled)'}</span></div>
            ${p.weightIssued ? `<div class="rc-row"><span class="k">Weight Issued</span><span class="v">${p.weightIssued} Kg <span class="hint" style="position:static; font-size:9.5px;">(@ ${p.unitWeight} Kg/Pc)</span></span></div>` : ''}
            <div class="rc-row"><span class="k">Operator</span><span class="v">${esc(p.operator)||'—'}</span></div>
            <div class="rc-row"><span class="k">Date</span><span class="v">${fmtDate(p.startDate)}</span></div>
            <div class="rc-actions">
              ${bal>0.0001? `<button class="btn small" onclick="selectJobForRecording('${p.id}')">📝 Record Output</button>` : ''}
              ${p.status==='Completed'? (p.pushedToFI? `<span class="hint" style="position:static;">✓ In Final Insp.</span>` : `<button class="btn small" onclick="pushToFinalInsp('${p.id}')">→ Final Insp.</button>`) : ''}
              <button class="btn danger" onclick="deleteRow('production','${p.id}')">Del</button>
            </div>
          </div>`;
        }).join('');
}
// Adds a live oninput handler for the search box: re-renders just the job cards grid so the
// input retains focus/cursor position while typing (avoids a full page re-render on every key).
function onProdJobSearchInput(which, val){
  if(which==='part') prodJobSearchTerm = val; else prodJobCardSearchTerm = val;
  const box = document.getElementById('prodJobsGridBox');
  if(box){
    const list = DB.production.filter(x=>reportUnitMatch(x.unit));
    box.innerHTML = prodJobsFilteredHtml(list);
  }
}
// Renders just the Pending Parts cards, applying the Part No / Card No search filters.
function pendingPartsFilteredHtml(openJobs){
  const partTerm = (pendingPartSearchTerm||'').trim().toLowerCase();
  const cardTerm = (pendingCardSearchTerm||'').trim().toLowerCase();
  let filtered = openJobs;
  if(partTerm) filtered = filtered.filter(p=>((p.finPartNo||p.item||'')+'').toLowerCase().includes(partTerm));
  if(cardTerm) filtered = filtered.filter(p=>((p.cardNo||'')+'').toLowerCase().includes(cardTerm));
  if(!openJobs.length) return '<div class="empty">No Parts issued from Stores yet. Issue material to Production from Stores → Bar / Forging / Job Work Issue Material.</div>';
  if(!filtered.length) return `<div class="empty">No Pending Parts match ${partTerm?`Part No "${esc(pendingPartSearchTerm)}"`:''}${partTerm&&cardTerm?' and ':''}${cardTerm?`Card No "${esc(pendingCardSearchTerm)}"`:''}.</div>`;
  return filtered.slice().reverse().map(p=>{
    const cust = DB.customers.find(x=>x.id===p.customerId);
    const bal = prodJobBalance(p);
    const isSel = p.id===prodSelectedJobId;
    return `<div class="rec-card" style="background:#e7f1fd; border-color:#a9cdf3; ${isSel?'border-color:var(--amber); box-shadow:0 0 0 2px var(--amber);':''}">      <div class="rc-title">${esc(p.finPartNo||p.item)}</div>
      <div class="rc-sub">${esc(p.finPartName||p.partName)||''}</div>
      ${p.cardNo?`<div class="rc-row"><span class="k">Card No</span><span class="v" style="color:var(--amber);">${esc(p.cardNo)}</span></div>`:''}
      <div class="rc-row"><span class="k">Customer</span><span class="v">${cust?esc(cust.shortName||cust.name):(esc(custDispByName(p.customerName))||'—')}</span></div>
      <div class="rc-row"><span class="k">Issued Qty</span><span class="v">${p.issuedQty}${p.weightIssued?' Nos':''}</span></div>
      <div class="rc-row"><span class="k">Balance to Record</span><span class="v" style="color:var(--red); font-weight:700;">${bal}</span></div>
      <div class="rc-row"><span class="k">Issued Date</span><span class="v">${fmtDate(p.startDate)}</span></div>
      <div class="rc-actions">
        <button class="btn small ${isSel?'':'ghost'}" onclick="selectJobForRecording('${p.id}')">${isSel?'✓ Selected':'📝 Select for Production'}</button>
      </div>
    </div>`;
  }).join('');
}
// Adds a live oninput handler for the Pending Parts search boxes: re-renders just the cards
// grid so the input retains focus/cursor position while typing (avoids a full page re-render).
function onPendingSearchInput(which, val){
  if(which==='part') pendingPartSearchTerm = val; else pendingCardSearchTerm = val;
  const box = document.getElementById('pendingPartsGridBox');
  if(box){
    const list = DB.production.filter(x=>reportUnitMatch(x.unit));
    prodNormalizeJobs(list);
    const openJobs = list.filter(p=>prodJobBalance(p)>0.0001);
    box.innerHTML = pendingPartsFilteredHtml(openJobs);
  }
}
function selectJobForRecording(jobId){
  prodSelectedJobId = (prodSelectedJobId===jobId) ? '' : jobId;
  render();
  if(prodSelectedJobId){
    const panel = document.getElementById('prOutputPanel');
    if(panel) panel.scrollIntoView({behavior:'smooth', block:'start'});
  }
}
function clearProdJobSelection(){
  prodSelectedJobId = '';
  render();
}
const PROD_REJ_REASONS = ['Bore Oversize','Bore Undersize','OD Oversize','OD Undersize','Length Oversize','Length Undersize','Thread Defect','Chamfer Defect','Radius Defect','Surface Finish Issue','Burr','Tool Mark','Scratch / Dent','Runout','Concentricity Issue','Flatness Issue','Parallelism Issue','Perpendicularity Issue','Hole Position Error','Wrong Operation','Missing Operation','Wrong Material','Wrong Part','Crack','Bend / Warpage','Fixture Mark','Machine Damage','Tool Breakage','Programming Error','Setup Error','Visual Defect','Others'];
const PROD_REWORK_REASONS = ['Bore Undersize — Rework','Bore Oversize — Rework','OD Rework','Length Rework','Thread Re-cut','Re-machining','Re-drilling','Additional Finishing','Deburring Rework','Surface Finish Rework','Re-inspection Required','Others'];
function prodReasonOptionsHtml(list, selected){
  return '<option value="">— select reason —</option>' + list.map(r=>`<option value="${esc(r)}" ${selected===r?'selected':''}>${esc(r)}</option>`).join('');
}
function prodRejReasonOptionsHtml(selected){ return prodReasonOptionsHtml(PROD_REJ_REASONS, selected); }
function prodReworkReasonOptionsHtml(selected){ return prodReasonOptionsHtml(PROD_REWORK_REASONS, selected); }
function prodRejRowHtml(rid, qty, reason){
  return `<div class="itemRow" data-rid="${rid}" style="margin-bottom:10px;">
    <div class="frow g3" style="margin-bottom:0; align-items:end;">
      <div><label class="fl">Rejection Qty</label><input type="number" class="prRejRowQty" placeholder="0" value="${qty||''}" oninput="updateProdEntryTotal()"></div>
      <div><label class="fl">Rejection Reason</label><select class="prRejRowReason" onchange="updateProdEntryTotal()">${prodRejReasonOptionsHtml(reason||'')}</select></div>
      <div><button type="button" class="btn danger" style="margin-top:12px;" onclick="removeProdRejRow('${rid}')">✕ Remove</button></div>
    </div>
  </div>`;
}
function addProdRejRow(qty, reason){
  const wrap = document.getElementById('prRejRows');
  const rid = 'rr'+Date.now()+Math.floor(Math.random()*1000);
  wrap.insertAdjacentHTML('beforeend', prodRejRowHtml(rid, qty, reason));
  updateProdEntryTotal();
}
function removeProdRejRow(rid){
  const el = document.querySelector(`#prRejRows .itemRow[data-rid="${rid}"]`);
  if(el) el.remove();
  updateProdEntryTotal();
}
function getProdRejRows(){
  return Array.from(document.querySelectorAll('#prRejRows .itemRow')).map(row=>{
    const qty = parseFloat(row.querySelector('.prRejRowQty').value)||0;
    const reason = row.querySelector('.prRejRowReason').value;
    return {qty, reason};
  }).filter(r=>r.qty>0 || r.reason);
}
function prodReworkRowHtml(rid, qty, reason){
  return `<div class="itemRow" data-rid="${rid}" style="margin-bottom:10px;">
    <div class="frow g3" style="margin-bottom:0; align-items:end;">
      <div><label class="fl">Rework Qty</label><input type="number" class="prReworkRowQty" placeholder="0" value="${qty||''}" oninput="updateProdEntryTotal()"></div>
      <div><label class="fl">Rework Reason</label><select class="prReworkRowReason" onchange="updateProdEntryTotal()">${prodReworkReasonOptionsHtml(reason||'')}</select></div>
      <div><button type="button" class="btn danger" style="margin-top:12px;" onclick="removeProdReworkRow('${rid}')">✕ Remove</button></div>
    </div>
  </div>`;
}
function addProdReworkRow(qty, reason){
  const wrap = document.getElementById('prReworkRows');
  const rid = 'rw'+Date.now()+Math.floor(Math.random()*1000);
  wrap.insertAdjacentHTML('beforeend', prodReworkRowHtml(rid, qty, reason));
  updateProdEntryTotal();
}
function removeProdReworkRow(rid){
  const el = document.querySelector(`#prReworkRows .itemRow[data-rid="${rid}"]`);
  if(el) el.remove();
  updateProdEntryTotal();
}
function getProdReworkRows(){
  return Array.from(document.querySelectorAll('#prReworkRows .itemRow')).map(row=>{
    const qty = parseFloat(row.querySelector('.prReworkRowQty').value)||0;
    const reason = row.querySelector('.prReworkRowReason').value;
    return {qty, reason};
  }).filter(r=>r.qty>0 || r.reason);
}
function updateProdEntryTotal(){
  const good = parseFloat((document.getElementById('prGoodQty')||{}).value)||0;
  const short = parseFloat((document.getElementById('prShortQty')||{}).value)||0;
  const rejTotal = getProdRejRows().reduce((s,r)=>s+(r.qty||0),0);
  const reworkTotal = getProdReworkRows().reduce((s,r)=>s+(r.qty||0),0);
  const total = Math.round((good+short+rejTotal+reworkTotal)*10000)/10000;
  const disp = document.getElementById('prEntryTotalDisp');
  if(disp) disp.value = total;
  const balAfterDisp = document.getElementById('prBalanceAfterDisp');
  if(balAfterDisp){
    const p = DB.production.find(x=>x.id===prodSelectedJobId);
    if(p){
      const bal = prodJobBalance(p);
      const after = Math.round((bal-total)*10000)/10000;
      balAfterDisp.value = after;
      balAfterDisp.style.color = after<-0.0001 ? 'var(--red)' : (after<=0.0001 ? 'var(--green,#2e8b57)' : '');
    } else balAfterDisp.value = '';
  }
}
function mergeQtyRows(existing, incoming){
  const rows = (existing||[]).map(r=>({reason:r.reason, qty:r.qty}));
  incoming.forEach(r=>{
    if(!(r.qty>0)) return;
    const found = rows.find(x=>x.reason===r.reason);
    if(found) found.qty = Math.round((found.qty+r.qty)*10000)/10000;
    else rows.push({reason:r.reason, qty:r.qty});
  });
  return rows;
}
function recordProdOutput(){
  if(!requireWorkingUnit()) return;
  const p = DB.production.find(x=>x.id===prodSelectedJobId);
  if(!p){ toast('Select a Job to record output against'); return; }
  const goodQty = parseFloat(document.getElementById('prGoodQty').value)||0;
  const shortageQty = parseFloat(document.getElementById('prShortQty').value)||0;
  const rejectionRows = getProdRejRows();
  const reworkRows = getProdReworkRows();
  for(const r of rejectionRows){
    if(r.qty>0 && !r.reason){ toast('Select a Rejection Reason for every row with a Rejection Qty'); return; }
    if(r.reason && !(r.qty>0)){ toast('Enter a Rejection Qty for every row with a Rejection Reason'); return; }
  }
  for(const r of reworkRows){
    if(r.qty>0 && !r.reason){ toast('Select a Rework Reason for every row with a Rework Qty'); return; }
    if(r.reason && !(r.qty>0)){ toast('Enter a Rework Qty for every row with a Rework Reason'); return; }
  }
  const rejTotal = rejectionRows.reduce((s,r)=>s+(r.qty||0),0);
  const reworkTotal = reworkRows.reduce((s,r)=>s+(r.qty||0),0);
  const entryTotal = Math.round((goodQty+shortageQty+rejTotal+reworkTotal)*10000)/10000;
  if(entryTotal<=0){ toast('Enter at least one quantity (Good, Rejection, Rework or Shortage)'); return; }
  const balance = prodJobBalance(p);
  if(entryTotal - balance > 0.0001){ toast(`Entry total (${entryTotal}) exceeds Balance Remaining (${balance}) — Issued Qty = Good + Rejection + Rework + Shortage must hold`); return; }
  const operator = document.getElementById('prOperator').value.trim();
  const entryDate = document.getElementById('prDate').value||today();
  p.goodQty = Math.round(((p.goodQty||0)+goodQty)*10000)/10000;
  p.shortageQty = Math.round(((p.shortageQty||0)+shortageQty)*10000)/10000;
  p.rejectionQty = Math.round(((p.rejectionQty||0)+rejTotal)*10000)/10000;
  p.reworkQty = Math.round(((p.reworkQty||0)+reworkTotal)*10000)/10000;
  p.rejectionRows = mergeQtyRows(p.rejectionRows, rejectionRows);
  p.reworkRows = mergeQtyRows(p.reworkRows, reworkRows);
  p.rejectionReason = p.rejectionRows.map(r=>r.reason).filter(Boolean).join(', ');
  if(!p.outputEntries) p.outputEntries = [];
  p.outputEntries.push({id:uid('oe'), date:entryDate, operator, goodQty, shortageQty, rejectionRows, reworkRows});
  if(operator) p.operator = operator;
  p.startDate = p.startDate || entryDate;
  p.stage = 'Production';
  const newBalance = prodJobBalance(p);
  if(newBalance<=0.0001){
    p.status = 'Completed';
    markJobCardComplete('production', p.id, entryDate);
    if(!p.returnedToStores && p.goodQty>0){
      const partNo = p.finPartNo || p.partNo || p.item;
      const we = returnQtyToStoresWIP({partNo, partName:p.finPartName||p.partName||'', qty:p.goodQty, cardNo:p.cardNo,
        fromStage:'Production', routeIndex:p.routeIndex||1, customerId:p.customerId, customerName:p.customerName,
        quotationId:p.quotationId, quoteNo:p.quoteNo, quoteRate:p.quoteRate});
      p.returnedToStores = true; p.returnedStoreId = we.id;
      saveDB();
      toast(`Job completed — ${p.goodQty} returned to Stores (WIP), Next Stage: ${we.nextStage}. Issue it from Stores → Material Issue — Next Stage.`);
    } else {
      saveDB();
      toast('Job fully reconciled — Issued Qty fully accounted for');
    }
  } else {
    p.status = 'In Progress';
    saveDB();
    toast(`Output recorded — Balance remaining: ${newBalance}`);
  }
  prodSelectedJobId = '';
  render();
}
function printProduction(){
  const list = DB.production.filter(x=>reportUnitMatch(x.unit));
  prodNormalizeJobs(list);
  const headers = ['Part','Part Name','Customer','Issued Qty','OK Qty','Rejection Qty','Rejection Breakdown','Rework Qty','Rework Breakdown','Shortage Qty','Balance','Operator','Date','Card No'];
  const rows = list.map(p=>{
    const cust = DB.customers.find(x=>x.id===p.customerId);
    const rejBreakdown = (p.rejectionRows&&p.rejectionRows.length) ? p.rejectionRows.map(r=>`${esc(r.reason)}: ${r.qty}`).join('; ') : '—';
    const reworkBreakdown = (p.reworkRows&&p.reworkRows.length) ? p.reworkRows.map(r=>`${esc(r.reason)}: ${r.qty}`).join('; ') : '—';
    const bal = prodJobBalance(p);
    return [esc(p.finPartNo||p.item), esc(p.finPartName||p.partName)||'—', cust?esc(cust.name):(esc(p.customerName)||esc(p.customer)||'—'),
      `<span class="num">${p.issuedQty}</span>`, `<span class="num">${p.goodQty||0}</span>`,
      `<span class="num">${p.rejectionQty||0}</span>`, rejBreakdown,
      `<span class="num">${p.reworkQty||0}</span>`, reworkBreakdown,
      `<span class="num">${p.shortageQty||0}</span>`, `<span class="num">${bal}</span>`,
      esc(p.operator)||'—', fmtDate(p.startDate)||'—', esc(p.cardNo)||'—'];
  });
  printReport('Production Jobs List', headers, rows, {barLeft:`Unit: ${esc(reportScopeLabel())}`, barRight:`Total Jobs: ${list.length}`, showUnitAddress:true});
}

/* ============================================================================================
   PRODUCTION PERFORMANCE REPORT — separate submodule under the Production Department.
   Dedicated Production Performance Analysis: From/To date filter drives every calculation,
   summary card, table and chart below. Reads DB.production (jobs + their outputEntries /
   rejectionRows), DB.custPO / DB.labourPO (for planned delivery dates), read-only —
   does not modify any other Production screen or data.
   ============================================================================================ */
function firstDayOfCurrentMonth(){ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10); }
function setProdPerfDate(which, val){
  if(which==='from') prodPerfFromDate = val; else prodPerfToDate = val;
  if(prodPerfFromDate && prodPerfToDate && prodPerfFromDate > prodPerfToDate){
    if(which==='from') prodPerfToDate = prodPerfFromDate; else prodPerfFromDate = prodPerfToDate;
    // keep the (corrected) values reflected in both inputs without rebuilding them
    const fEl = document.getElementById('prodPerfFromInput'), tEl = document.getElementById('prodPerfToInput');
    if(fEl) fEl.value = prodPerfFromDate;
    if(tEl) tEl.value = prodPerfToDate;
  }
  renderProdPerfResults();
}
function prodPerfDaysBetween(a,b){
  const da=new Date(a+'T00:00:00'), db=new Date(b+'T00:00:00');
  return Math.round((db-da)/86400000);
}
// Best-effort lookup of the planned/required delivery date linked to a Production job, traced
// through the Customer PO (Sales route) or Job Work PO commitment plan (Job Work route) for the
// same Customer + Finished Part. Returns '' if no linked delivery commitment can be found.
function prodPerfPlannedDateForJob(p){
  if(p.dueDate) return p.dueDate;
  const partKey = (p.finPartNo||p.partNo||p.item||'').trim().toLowerCase();
  if(!partKey) return '';
  if(p.customerId){
    const pos = (DB.custPO||[]).filter(x=>x.customerId===p.customerId && (x.finPartNo||'').trim().toLowerCase()===partKey && x.deliveryDate);
    if(pos.length){ pos.sort((a,b)=>(a.custPoDate||'').localeCompare(b.custPoDate||'')); return pos[pos.length-1].deliveryDate; }
    const lpo = (DB.labourPO||[]).find(x=>x.customerId===p.customerId && (x.finPartNo||'').trim().toLowerCase()===partKey);
    if(lpo && lpo.schedules && lpo.schedules.length){
      const commitDates = [];
      lpo.schedules.forEach(s=>(s.commitments||[]).forEach(c=>{ if(c.date) commitDates.push(c.date); }));
      if(commitDates.length){
        commitDates.sort();
        return commitDates.find(d=>d>=(p.startDate||'')) || commitDates[commitDates.length-1];
      }
    }
  }
  return '';
}
// Actual completion date = latest recorded output-entry date for the job (the point its
// Balance Remaining reached 0), falling back to the job's issue/start date.
function prodPerfCompletionDateForJob(p){
  if(p.outputEntries && p.outputEntries.length){
    const d = p.outputEntries.map(e=>e.date).filter(Boolean).sort();
    if(d.length) return d[d.length-1];
  }
  return p.startDate||'';
}
function prodPerfCustName(p){
  const c = p.customerId ? DB.customers.find(x=>x.id===p.customerId) : null;
  return (c ? (c.shortName||c.name) : (p.customerName||p.customer||'')) || 'Unspecified Customer';
}
function prodPerfPartLabel(p){ return p.finPartNo||p.partNo||p.item||'Unspecified Part'; }
// All Production output entries (each carrying its own date + rejection rows) whose entry
// date falls inside the selected range — this is the granularity Rejection Analysis / Pareto
// are computed at, so a job spanning multiple days only contributes the days actually in range.
function prodPerfEntriesInRange(from,to){
  const jobs = DB.production.filter(x=>reportUnitMatch(x.unit));
  const out = [];
  jobs.forEach(p=>{
    (p.outputEntries||[]).forEach(e=>{
      if(e.date && e.date>=from && e.date<=to) out.push({job:p, entry:e});
    });
  });
  return out;
}
function prodPerfComputeDelivery(from,to){
  const jobs = DB.production.filter(x=>reportUnitMatch(x.unit));
  const orders = jobs.filter(p=>p.startDate && p.startDate>=from && p.startDate<=to);
  let totalPlannedQty=0, totalProducedQty=0, onTimeOrders=0, delayedOrders=0, delayedQty=0, delaySum=0, noDueOrders=0;
  const detail = orders.map(p=>{
    totalPlannedQty += Number(p.qty||p.issuedQty||0);
    totalProducedQty += Number(p.goodQty||0);
    const completed = p.status==='Completed';
    const plannedDate = prodPerfPlannedDateForJob(p);
    const completionDate = completed ? prodPerfCompletionDateForJob(p) : '';
    let result = completed ? 'Pending Due Date' : 'In Progress';
    let delayDays = 0;
    if(completed && plannedDate && completionDate){
      delayDays = prodPerfDaysBetween(plannedDate, completionDate);
      if(delayDays<=0){ result='On Time'; onTimeOrders++; }
      else { result='Delayed'; delayedOrders++; delayedQty += Number(p.goodQty||p.issuedQty||0); delaySum += delayDays; }
    } else if(completed && !plannedDate){ noDueOrders++; }
    return {job:p, plannedDate, completionDate, result, delayDays: delayDays>0?delayDays:0};
  });
  const completedWithDue = onTimeOrders+delayedOrders;
  return {
    totalOrders: orders.length, totalPlannedQty, totalProducedQty, onTimeOrders, delayedOrders, noDueOrders,
    onTimePct: completedWithDue ? Math.round((onTimeOrders/completedWithDue)*1000)/10 : 0,
    delayedQty: Math.round(delayedQty*100)/100,
    avgDelayDays: delayedOrders ? Math.round((delaySum/delayedOrders)*10)/10 : 0,
    detail
  };
}
function prodPerfTopN(map, n){
  return Array.from(map.entries()).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value).slice(0, n||1000);
}
function prodPerfComputeRejection(from,to){
  const entries = prodPerfEntriesInRange(from,to);
  let totalProdQty=0, totalRejQty=0;
  const byPart=new Map(), byCust=new Map(), byMachine=new Map(), byOperator=new Map(), byReason=new Map();
  entries.forEach(({job,entry})=>{
    const rejRows = entry.rejectionRows||[];
    const rejTotal = rejRows.reduce((s,r)=>s+(Number(r.qty)||0),0);
    const entryTotal = Number(entry.goodQty||0) + rejTotal + (entry.reworkRows||[]).reduce((s,r)=>s+(Number(r.qty)||0),0) + Number(entry.shortageQty||0);
    totalProdQty += entryTotal;
    totalRejQty += rejTotal;
    if(rejTotal<=0) return;
    const partKey = prodPerfPartLabel(job);
    const custKey = prodPerfCustName(job);
    const machKey = job.machineName || job.machineId || 'Not Assigned';
    const opKey = entry.operator || job.operator || 'Unassigned';
    byPart.set(partKey, (byPart.get(partKey)||0)+rejTotal);
    byCust.set(custKey, (byCust.get(custKey)||0)+rejTotal);
    byMachine.set(machKey, (byMachine.get(machKey)||0)+rejTotal);
    byOperator.set(opKey, (byOperator.get(opKey)||0)+rejTotal);
    rejRows.forEach(r=>{
      if(!(Number(r.qty)>0)) return;
      const reason = r.reason || 'Unspecified Reason';
      byReason.set(reason, (byReason.get(reason)||0)+Number(r.qty));
    });
  });
  return {
    totalProdQty: Math.round(totalProdQty*100)/100, totalRejQty: Math.round(totalRejQty*100)/100,
    rejPct: totalProdQty ? Math.round((totalRejQty/totalProdQty)*1000)/10 : 0,
    byPart: prodPerfTopN(byPart), byCust: prodPerfTopN(byCust), byMachine: prodPerfTopN(byMachine),
    byOperator: prodPerfTopN(byOperator), byReason: prodPerfTopN(byReason)
  };
}
function esc2(s){ return esc(String(s==null?'':s)); }
// ---- Lightweight inline SVG chart builders (no external chart library dependency) ----
function prodPerfBarChartSvg(items, opts){
  opts = opts||{};
  const W = opts.width||640, H = opts.height||230, padL=40, padB=64, padT=16, padR=14;
  const plotW = W-padL-padR, plotH = H-padT-padB;
  if(!items.length) return `<div class="empty">No data for the selected date range.</div>`;
  const maxV = Math.max(...items.map(i=>i.value), 1);
  const n = items.length;
  const gap = 10;
  const barW = Math.max(10, (plotW - gap*(n-1)) / n);
  const color = opts.color || 'var(--steel)';
  let bars='', labels='';
  items.forEach((it,i)=>{
    const bh = plotH * (it.value/maxV);
    const x = padL + i*(barW+gap);
    const y = padT + (plotH-bh);
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${it.color||color}"></rect>
      <text x="${(x+barW/2).toFixed(1)}" y="${(y-5).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="var(--text)">${esc2(it.value)}</text>`;
    labels += `<text x="${(x+barW/2).toFixed(1)}" y="${(H-padB+16).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--text-dim)" transform="rotate(-38 ${(x+barW/2).toFixed(1)} ${(H-padB+16).toFixed(1)})">${esc2(it.label.length>18?it.label.slice(0,17)+'…':it.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; height:${H}px;">
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H-padB}" stroke="var(--line)"></line>
    <line x1="${padL}" y1="${H-padB}" x2="${W-padR}" y2="${H-padB}" stroke="var(--line)"></line>
    ${bars}${labels}
  </svg>`;
}
// Bars = rejection qty per reason (desc), overlaid line = cumulative rejection % (Pareto chart).
function prodPerfParetoSvg(items, opts){
  opts = opts||{};
  const W = opts.width||700, H = opts.height||260, padL=44, padR=44, padT=16, padB=70;
  const plotW = W-padL-padR, plotH = H-padT-padB;
  if(!items.length) return `<div class="empty">No rejections in the selected date range.</div>`;
  const maxV = Math.max(...items.map(i=>i.value), 1);
  const total = items.reduce((s,i)=>s+i.value,0) || 1;
  const n = items.length, gap=10;
  const barW = Math.max(10, (plotW-gap*(n-1))/n);
  let cum=0, bars='', line=[], dots='';
  items.forEach((it,i)=>{
    cum += it.value;
    const cumPct = cum/total*100;
    const bh = plotH*(it.value/maxV);
    const x = padL + i*(barW+gap);
    const y = padT+(plotH-bh);
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="var(--amber)"></rect>
      <text x="${(x+barW/2).toFixed(1)}" y="${(y-5).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--text)">${esc2(it.value)}</text>
      <text x="${(x+barW/2).toFixed(1)}" y="${(H-padB+16).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--text-dim)" transform="rotate(-38 ${(x+barW/2).toFixed(1)} ${(H-padB+16).toFixed(1)})">${esc2(it.label.length>16?it.label.slice(0,15)+'…':it.label)}</text>`;
    const ly = padT + plotH*(1-cumPct/100);
    const lx = x+barW/2;
    line.push(`${lx.toFixed(1)},${ly.toFixed(1)}`);
    dots += `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3" fill="var(--red)"></circle>
      <text x="${lx.toFixed(1)}" y="${(ly-8).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="var(--red)">${Math.round(cumPct)}%</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; height:${H}px;">
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H-padB}" stroke="var(--line)"></line>
    <line x1="${padL}" y1="${H-padB}" x2="${W-padR}" y2="${H-padB}" stroke="var(--line)"></line>
    <line x1="${W-padR}" y1="${padT}" x2="${W-padR}" y2="${H-padB}" stroke="var(--line)" stroke-dasharray="2,3"></line>
    <text x="${padL-6}" y="${padT+4}" text-anchor="end" font-size="9.5" fill="var(--text-dim)">Qty</text>
    <text x="${W-padR+6}" y="${padT+4}" text-anchor="start" font-size="9.5" fill="var(--text-dim)">100%</text>
    ${bars}
    <polyline points="${line.join(' ')}" fill="none" stroke="var(--red)" stroke-width="2"></polyline>
    ${dots}
  </svg>`;
}
function prodPerfGroupTableHtml(title, rows, totalRej){
  if(!rows.length) return `<div class="panel" style="margin-top:14px;"><h3>${esc2(title)}</h3><div class="empty">No rejections in the selected date range.</div></div>`;
  return `<div class="panel" style="margin-top:14px;">
    <h3>${esc2(title)}</h3>
    <table class="insp"><thead><tr><th>${esc2(title.replace('Rejection by ',''))}</th><th style="text-align:right;">Rejection Qty</th><th style="text-align:right;">% of Total Rejection</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td>${esc2(r.label)}</td><td style="text-align:right;">${r.value}</td><td style="text-align:right;">${totalRej? Math.round(r.value/totalRej*1000)/10 : 0}%</td></tr>`).join('')}</tbody></table>
  </div>`;
}
function renderProductionPerformanceReport(main){
  if(!prodPerfFromDate) prodPerfFromDate = firstDayOfCurrentMonth();
  if(!prodPerfToDate) prodPerfToDate = today();
  const from = prodPerfFromDate, to = prodPerfToDate;
  // The date inputs are rendered ONCE here and never rebuilt afterwards — only the
  // #prodPerfResults container below is refreshed when a date changes. Rebuilding the
  // <input type="date"> elements themselves on every change was what broke picking/typing
  // a date (the element was destroyed and recreated mid-edit, losing focus/selection).
  main.innerHTML = `
    <div class="panel" style="margin-top:8px;">
      <h3>Production Performance Report <span class="hint">Dedicated Production Performance Analysis — ${currentUnit==='Admin' ? reportScopeLabel() : unitLabel()}</span></h3>
      <div class="frow g3" style="align-items:end;">
        <div><label class="fl">From Date</label><input id="prodPerfFromInput" type="date" value="${esc(from)}" onchange="setProdPerfDate('from', this.value)"></div>
        <div><label class="fl">To Date</label><input id="prodPerfToInput" type="date" value="${esc(to)}" onchange="setProdPerfDate('to', this.value)"></div>
        <div><button class="btn ghost" onclick="printProductionPerformanceReport()">🖨 Print Report</button></div>
      </div>
      <div class="hint" style="position:static; margin:10px 0 0;">All figures below — summary cards, tables and charts — are computed only for orders/entries dated between the From and To dates selected above.</div>
    </div>
    <div id="prodPerfResults"></div>
  `;
  renderProdPerfResults();
}
function renderProdPerfResults(){
  const box = document.getElementById('prodPerfResults');
  if(!box) return;
  const from = prodPerfFromDate, to = prodPerfToDate;
  const del = prodPerfComputeDelivery(from,to);
  const rej = prodPerfComputeRejection(from,to);
  box.innerHTML = `
    <div class="panel" style="margin-top:14px;">
      <h3>1. Production Delivery Performance</h3>
      <div class="cards">
        <div class="card"><div class="v">${del.totalOrders}</div><div class="l">Total Production Orders</div></div>

        <div class="card"><div class="v">${del.totalPlannedQty}</div><div class="l">Total Planned Quantity</div></div>
        <div class="card"><div class="v">${del.totalProducedQty}</div><div class="l">Total Produced Quantity</div></div>
        <div class="card"><div class="v" style="color:var(--green);">${del.onTimeOrders}</div><div class="l">On-Time Completed Orders</div></div>
        <div class="card"><div class="v" style="color:var(--red);">${del.delayedOrders}</div><div class="l">Delayed Orders</div></div>
        <div class="card"><div class="v">${del.onTimePct}%</div><div class="l">On-Time Delivery %</div></div>
        <div class="card"><div class="v" style="color:var(--red);">${del.delayedQty}</div><div class="l">Delayed Quantity</div></div>
        <div class="card"><div class="v">${del.avgDelayDays}</div><div class="l">Average Delay Days</div></div>
      </div>
      ${del.noDueOrders ? `<div class="hint" style="position:static; margin-top:4px;">${del.noDueOrders} completed order(s) in range have no linked Customer PO / Job Work PO delivery commitment on record and are excluded from the On-Time / Delayed split above.</div>` : ''}
      <div class="hint" style="position:static; margin-top:2px;">On Time / Delayed is decided by comparing each order's linked Customer PO / Job Work PO delivery commitment date against its actual production completion date (last recorded output entry).</div>
      <h4 style="margin:16px 0 6px;">Orders in Range</h4>
      <div style="overflow:auto;">
      <table class="insp">
        <thead><tr><th>Card No</th><th>Part</th><th>Customer</th><th style="text-align:right;">Planned Qty</th><th style="text-align:right;">Produced Qty</th><th>Planned Date</th><th>Completion Date</th><th style="text-align:right;">Delay (Days)</th><th>Result</th></tr></thead>
        <tbody>${del.detail.length ? del.detail.map(d=>`<tr>
          <td>${esc2(d.job.cardNo||'—')}</td><td>${esc2(prodPerfPartLabel(d.job))}</td><td>${esc2(prodPerfCustName(d.job))}</td>
          <td style="text-align:right;">${d.job.qty??d.job.issuedQty??0}</td><td style="text-align:right;">${d.job.goodQty||0}</td>
          <td>${d.plannedDate?fmtDate(d.plannedDate):'—'}</td><td>${d.completionDate?fmtDate(d.completionDate):'—'}</td>
          <td style="text-align:right;">${d.delayDays||0}</td>
          <td><span class="pill ${d.result==='On Time'?'done':d.result==='Delayed'?'fail':'open'}">${esc2(d.result)}</span></td>
        </tr>`).join('') : `<tr><td colspan="9" class="empty">No production orders issued in the selected date range.</td></tr>`}</tbody>
      </table>
      </div>
    </div>

    <div class="panel" style="margin-top:14px;">
      <h3>2. On-Time Delivery Analysis</h3>
      <div class="cards">
        <div class="card"><div class="v" style="color:var(--green);">${del.onTimeOrders}</div><div class="l">On-Time Production</div></div>
        <div class="card"><div class="v" style="color:var(--red);">${del.delayedOrders}</div><div class="l">Delayed Production</div></div>
        <div class="card"><div class="v">${del.onTimePct}%</div><div class="l">On-Time Delivery %</div></div>
        <div class="card"><div class="v" style="color:var(--red);">${del.delayedOrders}</div><div class="l">Delayed Orders</div></div>
      </div>
      <div style="display:grid; grid-template-columns:1fr; gap:14px; margin-top:10px;">
        ${prodPerfBarChartSvg([
          {label:'On-Time Orders', value:del.onTimeOrders, color:'var(--green)'},
          {label:'Delayed Orders', value:del.delayedOrders, color:'var(--red)'}
        ], {width:420, height:210})}
      </div>
    </div>

    <div class="panel" style="margin-top:14px;">
      <h3>3. Rejection Analysis</h3>
      <div class="cards">
        <div class="card"><div class="v">${rej.totalProdQty}</div><div class="l">Total Production Quantity</div></div>
        <div class="card"><div class="v" style="color:var(--red);">${rej.totalRejQty}</div><div class="l">Total Rejection Quantity</div></div>
        <div class="card"><div class="v">${rej.rejPct}%</div><div class="l">Rejection Percentage</div></div>
      </div>
      ${prodPerfGroupTableHtml('Rejection by Part Number', rej.byPart, rej.totalRejQty)}
      ${prodPerfGroupTableHtml('Rejection by Customer', rej.byCust, rej.totalRejQty)}
      ${prodPerfGroupTableHtml('Rejection by Machine', rej.byMachine, rej.totalRejQty)}
      <div class="hint" style="position:static;">Machine is not currently captured on Production output entries — rejections show under "Not Assigned" until a Machine field is added to output recording.</div>
      ${prodPerfGroupTableHtml('Rejection by Operator', rej.byOperator, rej.totalRejQty)}
      ${prodPerfGroupTableHtml('Rejection by Reason', rej.byReason, rej.totalRejQty)}
    </div>

    <div class="panel" style="margin-top:14px;">
      <h3>4. Pareto Analysis — Rejection Reasons</h3>
      <div class="hint" style="position:static; margin-bottom:8px;">Bars = rejection quantity per reason (highest to lowest). Line = cumulative rejection %. Identifies the vital-few reasons driving most rejections.</div>
      ${prodPerfParetoSvg(rej.byReason, {width:700, height:260})}
    </div>

    <div class="panel" style="margin-top:14px;">
      <h3>5. Dashboard Summary</h3>
      <div class="cards">
        <div class="card"><div class="v">${del.totalOrders}</div><div class="l">Orders</div></div>
        <div class="card"><div class="v">${del.onTimePct}%</div><div class="l">On-Time %</div></div>
        <div class="card"><div class="v">${rej.rejPct}%</div><div class="l">Rejection %</div></div>
        <div class="card"><div class="v">${del.avgDelayDays}</div><div class="l">Avg Delay (Days)</div></div>
      </div>
      <h4 style="margin:16px 0 6px;">Rejection by Part Number</h4>
      ${prodPerfBarChartSvg(rej.byPart.slice(0,10), {width:700, height:230, color:'var(--red)'})}
      <h4 style="margin:16px 0 6px;">Rejection by Customer</h4>
      ${prodPerfBarChartSvg(rej.byCust.slice(0,10), {width:700, height:230, color:'var(--steel)'})}
    </div>
  `;
}
function printProductionPerformanceReport(){
  const from = prodPerfFromDate, to = prodPerfToDate;
  const del = prodPerfComputeDelivery(from,to);
  const rej = prodPerfComputeRejection(from,to);
  const headers = ['Card No','Part','Customer','Planned Qty','Produced Qty','Planned Date','Completion Date','Delay (Days)','Result'];
  const rows = del.detail.map(d=>[
    esc(d.job.cardNo||'—'), esc(prodPerfPartLabel(d.job)), esc(prodPerfCustName(d.job)),
    `<span class="num">${d.job.qty??d.job.issuedQty??0}</span>`, `<span class="num">${d.job.goodQty||0}</span>`,
    d.plannedDate?fmtDate(d.plannedDate):'—', d.completionDate?fmtDate(d.completionDate):'—',
    `<span class="num">${d.delayDays||0}</span>`, esc(d.result)
  ]);
  printReport('Production Performance Report', headers, rows, {
    barLeft:`Range: ${fmtDate(from)} to ${fmtDate(to)} — Unit: ${esc(reportScopeLabel())}`,
    barRight:`On-Time: ${del.onTimePct}% | Rejection: ${rej.rejPct}%`, showUnitAddress:true
  });
}

/* Best-effort auto-fill of material grade/supplier/certificate for a finished part, traced through
   BOM (part → purchased bar part) and Receiving Inspection (latest passed GRN for that bar part). */
function autoMaterialInfoForFinPart(finPartNo){
  const info = {grade:'', supplier:'', grir:'', cert:''};
  const bomRow = DB.bom.find(b=>b.mapType==='BAR' && (b.finPartNo||'').trim().toLowerCase()===(finPartNo||'').trim().toLowerCase());
  if(!bomRow) return info;
  const barItem = DB.items.find(it=>it.type==='BAR' && (it.code||'').trim().toLowerCase()===(bomRow.purPartNo||'').trim().toLowerCase());
  if(barItem) info.grade = barItem.grade || '';
  const grns = DB.receiving.filter(g=>g.result==='Pass' && (g.partNo||'').trim().toLowerCase()===(bomRow.purPartNo||'').trim().toLowerCase());
  if(grns.length){
    const latest = grns[grns.length-1];
    info.cert = latest.testCert || '';
    info.grir = [latest.invoiceNo, latest.invoiceDate].filter(Boolean).join(' / ');
    const po = DB.purchase.find(x=>x.id===latest.poId);
    if(po) info.supplier = po.supplier || '';
  }
  return info;
}
// Production quantity completed → sent to Final Inspection: auto-creates a Final Inspection Card
// carrying the Part No, Part Name and quantity across (Req.: "automatically receive the quantity
// along with the Part Number and part name"). The card is the live, open work item; the separate
// Final Inspection Report section (DB.finalInsp) is populated later, from the card, once the
// inspection team enters an OK Qty and generates a report for it (see saveFICardEntry/saveFI).
function pushToFinalInsp(prId, silent){
  if(!requireWorkingUnit()) return;
  const p = DB.production.find(x=>x.id===prId);
  if(!p) return;
  if(p.pushedToFI){ if(!silent) toast('Already sent to Final Inspection'); return; }
  const cust = DB.customers.find(x=>x.id===p.customerId);
  const mat = autoMaterialInfoForFinPart(p.item);
  const autoChars = charsFromInspParams(p.item);
  const fiQty = (p.goodQty!==undefined && p.goodQty!==null) ? p.goodQty : p.qty;
  const card = newFICardFrom({
    partNo:p.item, partName:p.finPartName||p.partName||'', qty:fiQty, cardNo:p.cardNo||'',
    customer:cust?cust.name:(p.customerName||p.customer||''),
    quotationId:p.quotationId||null, quoteNo:p.quoteNo||'', quoteRate:p.quoteRate||0,
    grade:mat.grade, supplier:mat.supplier, grir:mat.grir, cert:mat.cert, autoChars:autoChars||[]
  });
  p.pushedToFI = true; p.finalInspCardId = card.id;
  saveDB(); toast(silent?'Job Completed — auto-sent to Final Inspection':'Sent to Final Inspection — Final Inspection Card created'); render();
}
