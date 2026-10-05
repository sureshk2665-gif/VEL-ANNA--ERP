/* ===== Stock history helper ===== */
function pushStockHistory(entry, type, qty, note){
  if(!entry.history) entry.history = [];
  entry.history.push({date:today(), type, qty, balanceAfter:entry.qty, note:note||''});
}
function historyHtml(history, fromDate, toDate){
  if(!history || !history.length) return '';
  let rows = history;
  if(fromDate || toDate){
    rows = rows.filter(h=>{
      const d = h.date||'';
      if(fromDate && (!d || d < fromDate)) return false;
      if(toDate && (!d || d > toDate)) return false;
      return true;
    });
    if(!rows.length) return `<div class="rc-row" style="flex-direction:column; align-items:flex-start; gap:4px; margin-top:8px;"><span class="k">Stock History</span><div class="hint" style="font-size:10.5px;">No movements in the selected date range.</div></div>`;
  }
  const typeLabel = {purchase:'Purchased In', 'conversion-out':'Converted Out', 'conversion-in':'Converted In', adjustment:'Manual Correction'};
  return `
    <div class="rc-row" style="flex-direction:column; align-items:flex-start; gap:4px; margin-top:8px;">
      <span class="k">Stock History${(fromDate||toDate)?' <span class="hint" style="position:static; font-size:9px;">(filtered)</span>':''}</span>
      ${rows.slice().reverse().map(h=>`<div class="hint" style="font-size:10.5px; text-align:left;">${fmtDate(h.date)} — <strong>${typeLabel[h.type]||esc(h.type)}</strong>: ${h.qty} (balance after: ${h.balanceAfter})${h.note?' — '+esc(h.note):''}</div>`).join('')}
    </div>`;
}

/* ===== BAR STOCK ===== */
function barStockRowWeightKg(x, qtyOverride){
  const qty = qtyOverride!=null ? (parseFloat(qtyOverride)||0) : (parseFloat(x.qty)||0);
  const uw = parseFloat(x.unitWeight)||0;
  if((x.uom||'').toLowerCase()==='kg') return qty;
  if(uw>0) return qty*uw; // Nos / Mtr converted via unit weight
  return 0;
}
function formatWeightKgOrTon(kg){
  kg = parseFloat(kg)||0;
  if(kg>=1000) return (kg/1000).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})+' t';
  return kg.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2})+' kg';
}
/* ---- Stock Overview (Stores dashboard) — Available / Issued to Production / Balance, computed live from stock + history ---- */
function storesBarOverview(){
  const list = DB.storesBar.filter(x=>reportUnitMatch(x.unit));
  let balanceKg=0, issuedKg=0;
  list.forEach(s=>{
    balanceKg += barStockRowWeightKg(s);
    issuedKg += (s.history||[]).filter(h=>h.type==='issue').reduce((a,h)=>a+barStockRowWeightKg(s,h.qty),0);
  });
  return {availableKg: balanceKg+issuedKg, issuedKg, balanceKg, lines:list.length};
}
function storesForgingOverview(){
  const list = DB.storesForging.filter(x=>reportUnitMatch(x.unit));
  let balance=0, issued=0;
  list.forEach(s=>{
    balance += parseFloat(s.qty)||0;
    issued += (s.history||[]).filter(h=>h.type==='issue').reduce((a,h)=>a+(parseFloat(h.qty)||0),0);
  });
  return {available: balance+issued, issued, balance, lines:list.length};
}
function storesStockOverviewHtml(){
  const bar = storesBarOverview();
  const forg = storesForgingOverview();
  const row = (icon,label,available,issued,balance,unitFmt)=>`
    <div class="stov-row">
      <div class="stov-mat">${icon} <span>${label}</span></div>
      <div class="stov-metric stov-avail"><span class="stov-v">${unitFmt(available)}</span><span class="stov-l">Available Stock</span></div>
      <div class="stov-metric stov-issued"><span class="stov-v">${unitFmt(issued)}</span><span class="stov-l">Issued to Production</span></div>
      <div class="stov-metric stov-balance"><span class="stov-v">${unitFmt(balance)}</span><span class="stov-l">Balance Available Stock</span></div>
    </div>`;
  return `
    <div class="panel stock-overview-panel">
      <h3 style="justify-content:flex-start; text-align:left;">📊 Stock Overview <span class="hint">Live — updates automatically the moment a Receiving Inspection passes or stock is issued to Production</span></h3>
      <div class="stov-wrap">
        ${row('🔩','Bar Stock', bar.availableKg, bar.issuedKg, bar.balanceKg, formatWeightKgOrTon)}
        ${row('⚙️','Forging Stock', forg.available, forg.issued, forg.balance, v=>v.toLocaleString(undefined,{maximumFractionDigits:2}))}
      </div>
    </div>`;
}
// Single-material variant of the Stock Overview panel — used inside each material's own
// sub-module (Bar Stock, Forging Stock) instead of a combined dashboard on the main Stores page.
function storesMaterialOverviewHtml(icon, label, o, unitFmt){
  return `
    <div class="panel stock-overview-panel">
      <h3 style="justify-content:flex-start; text-align:left;">📊 Stock Overview <span class="hint">Live — updates automatically the moment a Receiving Inspection passes or stock is issued to Production</span></h3>
      <div class="stov-wrap">
        <div class="stov-row">
          <div class="stov-mat">${icon} <span>${label}</span></div>
          <div class="stov-metric stov-avail"><span class="stov-v">${unitFmt(o.availableKg!==undefined?o.availableKg:o.available)}</span><span class="stov-l">Available Stock</span></div>
          <div class="stov-metric stov-issued"><span class="stov-v">${unitFmt(o.issuedKg!==undefined?o.issuedKg:o.issued)}</span><span class="stov-l">Issued to Production</span></div>
          <div class="stov-metric stov-balance"><span class="stov-v">${unitFmt(o.balanceKg!==undefined?o.balanceKg:o.balance)}</span><span class="stov-l">Balance Available Stock</span></div>
        </div>
      </div>
    </div>`;
}
let barStockCustSearch = '';
let barStockPartSearch = '';
let barStockDateFrom = firstOfCurrentMonth();
let barStockDateTo = today();
/* ===== Direct link: Stores → Bar Stock  ⇄  Product Development → Bar Mapping (Finished Part No) ===== */
function barMappingFinPartOptionsHtml(selected, customerId){
  const seen = {}; const opts = [];
  DB.bom.forEach(b=>{
    if(b.mapType!=='BAR') return;
    if(customerId && b.customerId!==customerId) return; // customer-wise linked dropdown
    const key = (b.finPartNo||'').trim();
    if(key && !seen[key]){ seen[key]=1; opts.push({no:key, name:b.finPartName||''}); }
  });
  opts.sort((a,b)=>a.no.localeCompare(b.no));
  return opts.map(o=>`<option value="${esc(o.no)}" ${selected===o.no?'selected':''}>${esc(o.no)}</option>`).join('');
}
function barMappingRowsForFinPart(finPartNo){
  return DB.bom.filter(b=>b.mapType==='BAR' && (b.finPartNo||'').trim().toLowerCase()===(finPartNo||'').trim().toLowerCase());
}
function onBarAddFinPartChange(){
  const sel = document.getElementById('barFinPartSel');
  const list = document.getElementById('barPartList');
  const info = document.getElementById('barLinkedInfo');
  const noEl = document.getElementById('barPartNo');
  const nameEl = document.getElementById('barPartName');
  const uwEl = document.getElementById('barUnitWt');
  const uomEl = document.getElementById('barUom');
  if(!sel) return;
  const finPartNo = sel.value;
  if(!finPartNo){
    if(list) list.innerHTML = bomPartNoDatalistOptionsHtml('BAR');
    if(info) info.innerHTML = '';
    return;
  }
  const rows = barMappingRowsForFinPart(finPartNo);
  if(list) list.innerHTML = rows.map(r=>`<option value="${esc(r.purPartNo)}">${esc(r.purPartName)||''}</option>`).join('');
  if(!rows.length){
    if(info) info.innerHTML = `<div class="empty" style="margin-top:10px;">No Bar Mapping found for this Part yet. Define it in Product Development → Bar Mapping.</div>`;
    return;
  }
  // auto-fill when there is exactly one linked bar part; otherwise let the user pick from the (now-filtered) datalist
  if(rows.length===1){
    const r = rows[0];
    if(noEl) noEl.value = r.purPartNo||'';
    if(nameEl && !nameEl.value.trim()) nameEl.value = r.purPartName||'';
    if(uwEl && !uwEl.value && (r.prodPieceWeight>0 || r.pieceWeight>0)) uwEl.value = r.prodPieceWeight || r.pieceWeight;
    if(uomEl && !uomEl.value.trim() && r.uom) uomEl.value = r.uom;
  }
  if(info) info.innerHTML = barLinkedInfoHtml(rows);
}
function barLinkedInfoHtml(rows){
  return `<div class="mini-card">
    <div class="link-badge">🔗 Linked to Bar Mapping — ${rows.length} part${rows.length>1?'s':''}</div>
    ${rows.map(r=>`
      <div style="margin-top:6px; padding-top:6px; border-top:1px dashed var(--line);">
        <div class="mc-row"><span class="mc-k">Bar Part</span><span class="mc-v">${esc(r.purPartNo)||'—'} — ${esc(r.purPartName)||'—'}</span></div>
        <div class="mc-row"><span class="mc-k">UOM</span><span class="mc-v">${esc(r.uom)||'—'}</span></div>
        <div class="mc-row"><span class="mc-k">Shape / Size / Grade</span><span class="mc-v">${esc(r.shape)||'—'} · ${esc(r.size)||'—'} · ${esc(r.grade)||'—'}</span></div>
        <div class="mc-row"><span class="mc-k">Density</span><span class="mc-v">${r.density?r.density+' g/cm³':'—'}</span></div>
        <div class="mc-row"><span class="mc-k">Cut Length (Production)</span><span class="mc-v">${r.prodCutLength?r.prodCutLength+' mm':'—'}</span></div>
        <div class="mc-row"><span class="mc-k">Piece Weight (Production)</span><span class="mc-v">${r.prodPieceWeight?r.prodPieceWeight+' kg':'—'}</span></div>
        <div class="mc-row"><span class="mc-k">Production Location</span><span class="mc-v">${esc(r.prodLocation)||'—'}</span></div>
      </div>`).join('')}
  </div>`;
}
function bomPartNoDatalistOptionsHtml(mapType){
  const field = mapType==='BAR' ? 'purPartNo' : 'forgPartNo';
  const nameField = mapType==='BAR' ? 'purPartName' : 'forgPartName';
  const seen = {}; const opts = [];
  DB.bom.forEach(b=>{
    if(b.mapType!==mapType) return;
    const key = (b[field]||'').trim();
    if(key && !seen[key]){ seen[key]=1; opts.push(`<option value="${esc(key)}">${esc(b[nameField])||''}</option>`); }
  });
  return opts.join('');
}
function fillFinPartFromBarPartNo(){
  // if the user types/picks a Bar Part No directly (without choosing a Finished Part first),
  // reverse-lookup its Finished Part from Bar Mapping and reflect the link back.
  const noEl = document.getElementById('barPartNo');
  const finSel = document.getElementById('barFinPartSel');
  const info = document.getElementById('barLinkedInfo');
  if(!noEl || !finSel || finSel.value) return; // don't override an explicit finished-part selection
  const val = (noEl.value||'').trim().toLowerCase();
  if(!val) return;
  const match = DB.bom.find(b=>b.mapType==='BAR' && (b.purPartNo||'').trim().toLowerCase()===val);
  if(match){
    finSel.value = match.finPartNo||'';
    if(info) info.innerHTML = barLinkedInfoHtml(barMappingRowsForFinPart(match.finPartNo));
  }
}
function filterBarStockGrid(){
  barStockCustSearch = (document.getElementById('barStockCustInp')||{value:''}).value.trim().toLowerCase();
  barStockPartSearch = (document.getElementById('barStockPartInp')||{value:''}).value.trim().toLowerCase();
  const grid = document.getElementById('barStockGrid');
  if(grid) grid.innerHTML = barStockGridHtml();
}
function filterBarStockDate(which, val){
  if(which==='from') barStockDateFrom = val; else barStockDateTo = val;
  const grid = document.getElementById('barStockGrid');
  if(grid) grid.innerHTML = barStockGridHtml();
}
function resetBarStockDateToCurrentMonth(){
  barStockDateFrom = firstOfCurrentMonth(); barStockDateTo = today();
  const fromEl = document.getElementById('barStockDateFromInp'); if(fromEl) fromEl.value = barStockDateFrom;
  const toEl = document.getElementById('barStockDateToInp'); if(toEl) toEl.value = barStockDateTo;
  const grid = document.getElementById('barStockGrid');
  if(grid) grid.innerHTML = barStockGridHtml();
}
function clearBarStockDateFilter(){
  barStockDateFrom = ''; barStockDateTo = '';
  const fromEl = document.getElementById('barStockDateFromInp'); if(fromEl) fromEl.value = '';
  const toEl = document.getElementById('barStockDateToInp'); if(toEl) toEl.value = '';
  const grid = document.getElementById('barStockGrid');
  if(grid) grid.innerHTML = barStockGridHtml();
}
function onBarStockCustChange(){
  setStoresCustChange('barCustSel','barCustName');
  const sel = document.getElementById('barCustSel');
  const finSel = document.getElementById('barFinPartSel');
  if(!finSel) return;
  const customerId = (sel && sel.value && sel.value!=='__other__') ? sel.value : null;
  finSel.innerHTML = '<option value="">— select part (optional) —</option>' + barMappingFinPartOptionsHtml('', customerId);
  // clear any previously picked finished part / linked part, since it may no longer belong to this customer
  document.getElementById('barPartNo').value = '';
  document.getElementById('barPartName').value = '';
  document.getElementById('barUnitWt').value = '';
  const info = document.getElementById('barLinkedInfo');
  if(info) info.innerHTML = '';
  const list = document.getElementById('barPartList');
  if(list) list.innerHTML = bomPartNoDatalistOptionsHtml('BAR');
}
function setStoresCustChange(selId, inputId){
  const sel = document.getElementById(selId);
  const manual = document.getElementById(inputId);
  if(!sel || !manual) return;
  if(sel.value==='__other__'){ manual.style.display='block'; manual.value=''; manual.focus(); }
  else if(sel.value===''){ manual.style.display = DB.customers.length? 'none':'block'; }
  else{
    const c = DB.customers.find(x=>x.id===sel.value);
    manual.style.display='none'; manual.value = c?c.name:'';
  }
}
function onLabourStoresCustChange(){
  setStoresCustChange('lpCustSel','lpCustName');
  const sel = document.getElementById('lpCustSel');
  const lqSel = document.getElementById('lpLQSel');
  if(!lqSel) return;
  const customerId = (sel.value && sel.value!=='__other__') ? sel.value : null;
  lqSel.innerHTML = '<option value="">— pick a labour quotation part no —</option>' + labourQuotePartNoOptionsHtml(customerId);
  // clear any previously picked part, since it may no longer belong to this customer
  document.getElementById('lpPartNo').value = '';
  document.getElementById('lpPartName').value = '';
  const box = document.getElementById('lpLQLinkBox');
  if(box) box.innerHTML = '';
  stLQLink = null;
}
function storesCustSelectHtml(selId, inputId, editing, onchangeFn){
  const custOpts = DB.customers.map(c=>`<option value="${c.id}" ${editing&&editing.customerId===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
  const handler = onchangeFn || `setStoresCustChange('${selId}','${inputId}')`;
  return `<select id="${selId}" onchange="${handler}">
            <option value="">— select customer —</option>${custOpts}
            <option value="__other__" ${editing&&!editing.customerId?'selected':''}>Other (type manually)</option>
          </select>
          <input id="${inputId}" placeholder="Customer name" value="${editing?esc(editing.customerName):''}" style="margin-top:6px; display:${editing || DB.customers.length===0 ?'block':'none'};">`;
}
function readStoresCustomer(selId, inputId){
  const sel = document.getElementById(selId);
  const nameEl = document.getElementById(inputId);
  const customerName = nameEl ? nameEl.value.trim() : '';
  const customerId = (sel && sel.value && sel.value!=='__other__') ? sel.value : null;
  return {customerId, customerName};
}

function barStockGridHtml(){
  let list = DB.storesBar.filter(x=>reportUnitMatch(x.unit));
  if(barStockCustSearch){
    list = list.filter(s=>(s.customerName||'').toLowerCase().includes(barStockCustSearch));
  }
  if(barStockPartSearch){
    list = list.filter(s=>
      (s.partNo||'').toLowerCase().includes(barStockPartSearch) ||
      (s.finPartNo||'').toLowerCase().includes(barStockPartSearch)
    );
  }
  if(barStockDateFrom || barStockDateTo){
    // Date range filters to items that had at least one stock movement (received/issued/
    // converted) in that period — Stores has no single "date" per line item, only a running
    // history, so this is the meaningful equivalent of a From–To Date filter here.
    list = list.filter(s=>(s.history||[]).some(h=>{
      const d = h.date||'';
      if(barStockDateFrom && (!d || d < barStockDateFrom)) return false;
      if(barStockDateTo && (!d || d > barStockDateTo)) return false;
      return true;
    }));
  }
  return `<div class="grid-box">
    ${list.slice().reverse().map(s=>{
      const received = s.receivedQty||0, issued = s.issuedQty||0, closing = s.qty||0;
      const opening = Math.round((closing - received + issued) * 10000) / 10000;
      return `
      <div class="rec-card stock-card ${(s.qty||0)<=0?'nil':'ok'}">
        ${s.finPartNo ? `<div class="link-badge">🔗 ${esc(s.finPartNo)}${s.finPartName?' — '+esc(s.finPartName):''}</div>` : ''}
        <div class="rc-title">${esc(s.partNo)||'—'}</div>
        <div class="rc-sub">${esc(s.partName)||''}</div>
        <span class="pill ${(s.qty||0)<=0?'fail':'done'}">${(s.qty||0)<=0?'Nil Stock':'In Stock'}</span>
        <div class="rc-row"><span class="k">Customer</span><span class="v">${esc(custDispByName(s.customerName))||'—'}</span></div>
        <div class="rc-row"><span class="k">Type</span><span class="v">${s.kind==='converted'?'Converted (from '+esc(s.convertedFrom||'—')+')':'Purchased Bar'}</span></div>
        ${s.unitWeight ? `<div class="rc-row"><span class="k">Unit Weight</span><span class="v">${s.unitWeight} Kg/Pc</span></div>` : ''}
        <div class="rc-row"><span class="k">Source</span><span class="v">${esc(s.source)||'—'}</span></div>
        <div class="stock-balances">
          <div class="sb-item"><span class="sb-k">Opening</span><span class="sb-v">${opening}</span></div>
          <div class="sb-item"><span class="sb-k">Received</span><span class="sb-v" style="color:var(--green,#2a8f4e);">+${received}</span></div>
          <div class="sb-item"><span class="sb-k">Issued</span><span class="sb-v" style="color:var(--red);">-${issued}</span></div>
          <div class="sb-item"><span class="sb-k">Closing</span><span class="sb-v"><strong>${closing}${s.uom?' '+esc(s.uom):''}</strong></span></div>
        </div>
        ${historyHtml(s.history, barStockDateFrom, barStockDateTo)}
        <div class="rc-actions">
          <button class="btn danger" onclick="deleteRow('storesBar','${s.id}')">Del</button>
        </div>
      </div>`;
    }).join('') || `<div class="empty">${(barStockDateFrom||barStockDateTo||barStockCustSearch||barStockPartSearch)?'No bar stock matches the current filters.':'No bar stock matches this view.'}</div>`}
  </div>`;
}
function renderBarStock(main){
  const list = DB.storesBar.filter(x=>reportUnitMatch(x.unit));
  const totalQty = list.reduce((a,x)=>a+(parseFloat(x.qty)||0),0);
  const totalWeightKg = list.reduce((a,x)=>a+barStockRowWeightKg(x),0);
  const nilCount = list.filter(x=>(x.qty||0)<=0).length;
  const distinctParts = new Set(list.map(x=>x.partNo)).size;
  const linkedFinParts = new Set(list.filter(x=>x.finPartNo).map(x=>x.finPartNo)).size;
  main.innerHTML = `
    <div class="topbar"><div><h2>🔩 Bar Stock</h2></div></div>
    ${storesMaterialOverviewHtml('🔩','Bar Stock', storesBarOverview(), formatWeightKgOrTon)}
    <div class="cards">
      <div class="card"><div class="v">${distinctParts}</div><div class="l">Bar Part Numbers</div></div>
      <div class="card"><div class="v">${formatWeightKgOrTon(totalWeightKg)}</div><div class="l">Total Weight on Hand</div></div>
      <div class="card"><div class="v" style="color:${nilCount?'var(--red)':'inherit'};">${nilCount}</div><div class="l">Nil Stock Items</div></div>
      <div class="card"><div class="v" style="color:var(--steel);">${linkedFinParts}</div><div class="l">Linked Parts</div></div>
    </div>

    <div class="panel">
      <div class="section-total"><h3>Bar Stock <span class="hint">${list.length} line items</span></h3></div>
      <div class="frow g4" style="align-items:end;">
        <div style="max-width:280px;">
          <label class="fl">🔍 Search by Customer Name</label>
          <input id="barStockCustInp" placeholder="Type a Customer Name…" value="${esc(barStockCustSearch)}" oninput="filterBarStockGrid()">
        </div>
        <div style="max-width:280px;">
          <label class="fl">🔍 Search by Part Number</label>
          <input id="barStockPartInp" placeholder="Type a Part No…" value="${esc(barStockPartSearch)}" oninput="filterBarStockGrid()">
        </div>
        <div><label class="fl">From Date</label><input type="date" id="barStockDateFromInp" value="${esc(barStockDateFrom)}" onchange="filterBarStockDate('from', this.value)"></div>
        <div><label class="fl">To Date</label><input type="date" id="barStockDateToInp" value="${esc(barStockDateTo)}" onchange="filterBarStockDate('to', this.value)"></div>
        <div><button class="btn ghost small" onclick="resetBarStockDateToCurrentMonth()" title="Reset to the 1st of this month → today">📅 This Month</button></div>
      </div>
      <div class="hint" style="margin:6px 0 0;">Stores has no single date per stock line — From/To Date filters to items with a stock movement (received / issued / converted) in that period, and narrows the Stock History shown on each card to that range.</div>
      <div id="barStockGrid">${barStockGridHtml()}</div>
    </div>

    <div class="panel" style="border-left:4px solid var(--steel);">
      <h3 style="justify-content:flex-start; text-align:left;">🔗 Bar Stock is now fully automatic</h3>
      <div class="hint" style="line-height:1.6;">Bar stock is no longer added manually here. It flows in on its own: <b>Purchase Order → Material Receiving → Receiving Inspection (Pass) → Bar Stock</b>. Log incoming material in <b>Purchase → Material Receiving</b>; once Quality marks it <b>Pass</b>, the accepted quantity appears below automatically, already linked to its Customer and Part (from Bar Mapping). Rejected or Hold quantities are never added. Stock balances (Opening/Received/Issued/Closing) are all system-calculated — there is no manual balance edit.</div>
    </div>

    <div class="panel" style="border-left:4px solid var(--amber);">
      <h3 style="justify-content:flex-start; text-align:left;">📤 Issue Material to Production</h3>
      <div class="hint" style="position:static; margin-bottom:10px;">Select the Customer, then the Part Number and the Part Number it's being issued against — only relevant options are shown. Available stock and issue validation are automatic.</div>
      <div class="frow g4">
        <div><label class="fl">1. Customer</label><select id="barIssueCustSel" onchange="onBarIssueCustChange()">
          <option value="">— select customer —</option>${barIssueCustOptionsHtml()}
        </select></div>
        <div><label class="fl">2. Raw Material (Part Number)</label><select id="barIssuePartSel" onchange="onBarIssuePartChange()">
          <option value="">— select customer first —</option>
        </select></div>
        <div><label class="fl">3. Part Number <span class="hint" style="position:static; font-size:9.5px;">(required — for traceability)</span></label><select id="barIssueFinPartSel" onchange="onBarIssueFinPartChange()">
          <option value="">— select part first —</option>
        </select></div>
        <div><label class="fl">Available Stock</label><input id="barIssueAvail" type="text" disabled placeholder="—"></div>
      </div>
      <div class="frow g4">
        <div><label class="fl" id="barIssueQtyLbl">4. Issue Qty</label><input id="barIssueQty" type="number" step="any" placeholder="Qty to issue" oninput="calcBarIssueQty()"></div>
        <div id="barIssueWeightRow" style="display:none;"><label class="fl">Issue Weight (Kg) <span class="hint" style="position:static; font-size:9.5px;">(auto-calculated)</span></label><input id="barIssueWeightCalc" type="text" disabled placeholder="0"></div>
      </div>
      <div id="barIssueCalcRow"></div>
      ${issueTypeFieldsHtml('bar')}
      <div class="rowactions" style="justify-content:flex-start; margin-top:10px;">
        <button class="btn amber" onclick="confirmBarIssue()">✅ Validate &amp; Issue</button>
      </div>
    </div>
  `;
}
function addBarStock(){
  if(!requireWorkingUnit()) return;
  const {customerId, customerName} = readStoresCustomer('barCustSel','barCustName');
  const finPartSel = document.getElementById('barFinPartSel');
  const finPartNo = finPartSel ? finPartSel.value.trim() : '';
  const finMapping = finPartNo ? DB.bom.find(b=>b.mapType==='BAR' && (b.finPartNo||'').trim()===finPartNo) : null;
  const finPartName = finMapping ? finMapping.finPartName : '';
  const partNo = document.getElementById('barPartNo').value.trim();
  const partName = document.getElementById('barPartName').value.trim();
  const qty = parseFloat(document.getElementById('barQty').value)||0;
  const uom = document.getElementById('barUom').value.trim();
  const unitWeight = parseFloat(document.getElementById('barUnitWt').value)||0;
  const source = document.getElementById('barSource').value.trim()||'Manual';
  if(!customerName){ toast('Customer Name is required'); return; }
  if(!partNo){ toast('Part Number is required'); return; }
  if(!partName){ toast('Part Name is required'); return; }
  if(!uom){ toast('UOM is required'); return; }
  const entry = {id:'bar'+Date.now(), unit:currentUnit, kind:'bar', customerId, customerName, partNo, partName, qty, uom, source, history:[]};
  if(unitWeight>0) entry.unitWeight = unitWeight;
  if(finPartNo){ entry.finPartNo = finPartNo; entry.finPartName = finPartName; }
  pushStockHistory(entry, 'purchase', qty, 'Purchased stock added');
  DB.storesBar.push(entry);
  saveDB(); toast('Bar stock added'); render();
}

/* ===== FORGING STOCK ===== */
let forgConvertMode = false;
let forgStockCustSearch = '';
let forgStockPartSearch = '';
let forgStockDateFrom = firstOfCurrentMonth();
let forgStockDateTo = today();
let forgStockEditId = null; // stock card currently open in edit mode (Part Name / Customer / UOM only — balances stay system-calculated)
function toggleForgConvert(){ forgConvertMode = !forgConvertMode; render(); }
function filterForgStockGrid(){
  forgStockCustSearch = (document.getElementById('forgStockCustInp')||{value:''}).value.trim().toLowerCase();
  forgStockPartSearch = (document.getElementById('forgStockPartInp')||{value:''}).value.trim().toLowerCase();
  const grid = document.getElementById('forgStockGrid');
  if(grid) grid.innerHTML = forgStockGridHtml();
}
function filterForgStockDate(which, val){
  if(which==='from') forgStockDateFrom = val; else forgStockDateTo = val;
  const grid = document.getElementById('forgStockGrid');
  if(grid) grid.innerHTML = forgStockGridHtml();
}
function resetForgStockDateToCurrentMonth(){
  forgStockDateFrom = firstOfCurrentMonth(); forgStockDateTo = today();
  const fromEl = document.getElementById('forgStockDateFromInp'); if(fromEl) fromEl.value = forgStockDateFrom;
  const toEl = document.getElementById('forgStockDateToInp'); if(toEl) toEl.value = forgStockDateTo;
  const grid = document.getElementById('forgStockGrid');
  if(grid) grid.innerHTML = forgStockGridHtml();
}
function clearForgStockDateFilter(){
  forgStockDateFrom = ''; forgStockDateTo = '';
  const fromEl = document.getElementById('forgStockDateFromInp'); if(fromEl) fromEl.value = '';
  const toEl = document.getElementById('forgStockDateToInp'); if(toEl) toEl.value = '';
  const grid = document.getElementById('forgStockGrid');
  if(grid) grid.innerHTML = forgStockGridHtml();
}
function forgStockGridHtml(){
  let list = DB.storesForging.filter(x=>reportUnitMatch(x.unit));
  if(forgStockCustSearch){
    list = list.filter(s=>(s.customerName||'').toLowerCase().includes(forgStockCustSearch));
  }
  if(forgStockPartSearch){
    list = list.filter(s=>(s.partNo||'').toLowerCase().includes(forgStockPartSearch));
  }
  if(forgStockDateFrom || forgStockDateTo){
    // Same convention as Bar Stock: filter to items with a movement in the period, since a
    // stock line item has a running history rather than a single date.
    list = list.filter(s=>(s.history||[]).some(h=>{
      const d = h.date||'';
      if(forgStockDateFrom && (!d || d < forgStockDateFrom)) return false;
      if(forgStockDateTo && (!d || d > forgStockDateTo)) return false;
      return true;
    }));
  }
  return `<div class="grid-box">
    ${list.slice().reverse().map(s=>{
      const received = s.receivedQty||0, issued = s.issuedQty||0, closing = s.qty||0;
      const opening = Math.round((closing - received + issued) * 10000) / 10000;
      return `
      <div class="rec-card stock-card ${(s.qty||0)<=0?'nil':'ok'}">
        <div class="rc-title">${esc(s.partNo)||'—'}</div>
        <div class="rc-sub">${esc(s.partName)||''}</div>
        <span class="pill ${(s.qty||0)<=0?'fail':'done'}">${(s.qty||0)<=0?'Nil Stock':'In Stock'}</span>
        <div class="rc-row"><span class="k">Customer</span><span class="v">${esc(custDispByName(s.customerName))||'—'}</span></div>
        <div class="rc-row"><span class="k">Type</span><span class="v">${s.kind==='finished'?'Finished (from '+esc(s.convertedFrom||'—')+')':'Purchased Forging'}</span></div>
        <div class="rc-row"><span class="k">Source</span><span class="v">${esc(s.source)||'—'}</span></div>
        <div class="stock-balances">
          <div class="sb-item"><span class="sb-k">Opening</span><span class="sb-v">${opening}</span></div>
          <div class="sb-item"><span class="sb-k">Received</span><span class="sb-v" style="color:var(--green,#2a8f4e);">+${received}</span></div>
          <div class="sb-item"><span class="sb-k">Issued</span><span class="sb-v" style="color:var(--red);">-${issued}</span></div>
          <div class="sb-item"><span class="sb-k">Closing</span><span class="sb-v"><strong>${closing}${s.uom?' '+esc(s.uom):''}</strong></span></div>
        </div>
        ${historyHtml(s.history, forgStockDateFrom, forgStockDateTo)}
        ${forgStockEditId===s.id ? `
        <div class="rc-editbox" style="margin-top:8px; padding:8px; border:1px dashed var(--line); border-radius:6px;">
          <div><label class="fl">Part Name</label><input id="fsEditPartName_${s.id}" value="${esc(s.partName)||''}"></div>
          <div style="margin-top:6px;"><label class="fl">Customer</label><select id="fsEditCust_${s.id}">${custPOCustomerOptionsHtml(s.customerId)}</select></div>
          <div style="margin-top:6px;"><label class="fl">UOM</label><input id="fsEditUom_${s.id}" value="${esc(s.uom)||''}" placeholder="e.g. Nos"></div>
          <div style="margin-top:6px;"><label class="fl">Received Qty (Total) <span class="hint" style="position:static; font-size:9.5px;">(corrects Closing by the same amount — e.g. fix a duplicate GRN entry)</span></label><input id="fsEditReceived_${s.id}" type="number" step="any" value="${received}"></div>
        </div>` : ''}
        <div class="rc-actions">
          ${forgStockEditId===s.id
            ? `<button class="btn amber" onclick="saveForgStockEdit('${s.id}')">💾 Save</button> <button class="btn ghost" onclick="toggleForgStockEdit(null)">Cancel</button>`
            : `<button class="btn ghost" onclick="toggleForgStockEdit('${s.id}')">✏️ Edit</button> <button class="btn danger" onclick="deleteRow('storesForging','${s.id}')">Del</button>`}
        </div>
      </div>`;
    }).join('') || `<div class="empty">${(forgStockDateFrom||forgStockDateTo||forgStockCustSearch||forgStockPartSearch)?'No forging stock matches the current filters.':'Forging stock is empty for this unit.'}</div>`}
  </div>`;
}
// Toggles inline edit mode on a Forging Stock card. Only Part Name / Customer / UOM are
// editable here — Opening/Received/Issued/Closing stay system-calculated from GRN + Issue
// history exactly as before, per "Stores balances are all system-calculated" above.
function toggleForgStockEdit(id){
  forgStockEditId = id;
  const grid = document.getElementById('forgStockGrid');
  if(grid) grid.innerHTML = forgStockGridHtml();
}
function saveForgStockEdit(id){
  const s = DB.storesForging.find(x=>x.id===id);
  if(!s) return;
  const partName = (document.getElementById('fsEditPartName_'+id)||{value:s.partName||''}).value.trim();
  const custSel = document.getElementById('fsEditCust_'+id);
  const custId = custSel ? custSel.value : '';
  const custRec = custId ? DB.customers.find(c=>c.id===custId) : null;
  const uom = (document.getElementById('fsEditUom_'+id)||{value:s.uom||''}).value.trim();
  const newReceived = parseFloat((document.getElementById('fsEditReceived_'+id)||{}).value);
  s.partName = partName;
  if(custRec){ s.customerId = custRec.id; s.customerName = custRec.name; }
  else if(!custId){ s.customerId = null; }
  s.uom = uom;
  // Correcting Received Qty (e.g. a duplicated GRN entry counted twice) shifts Closing by the
  // same amount, so Opening/Issued stay untouched and the numbers keep reconciling — logged as
  // a Manual Correction in Stock History for traceability, instead of silently editing balances.
  if(!isNaN(newReceived) && Math.round(newReceived*10000)/10000 !== Math.round((s.receivedQty||0)*10000)/10000){
    const delta = Math.round((newReceived - (s.receivedQty||0))*10000)/10000;
    s.receivedQty = Math.round(newReceived*10000)/10000;
    s.qty = Math.round(((s.qty||0) + delta)*10000)/10000;
    if(!Array.isArray(s.history)) s.history = [];
    s.history.push({date:today(), type:'adjustment', qty:delta, balanceAfter:s.qty, note:'Received Qty corrected from '+((s.receivedQty||0)-delta)+' to '+s.receivedQty});
  }
  saveDB();
  toast('Forging Stock item updated');
  forgStockEditId = null;
  const grid = document.getElementById('forgStockGrid');
  if(grid) grid.innerHTML = forgStockGridHtml();
}
function renderForgingStock(main){
  const list = DB.storesForging.filter(x=>reportUnitMatch(x.unit));
  const rawForgings = list.filter(x=>x.qty>0 && x.kind!=='finished');
  const forgOpts = rawForgings.map(s=>`<option value="${s.id}" data-name="${esc(s.partName)}" data-qty="${s.qty}">${esc(s.partNo)} — ${esc(s.partName)} (avail. ${s.qty})</option>`).join('');
  main.innerHTML = `
    <div class="topbar"><div><h2>⚙️ Forging Stock</h2></div></div>
    ${storesMaterialOverviewHtml('⚙️','Forging Stock', storesForgingOverview(), v=>v.toLocaleString(undefined,{maximumFractionDigits:2}))}

    <div class="panel">
      <div class="section-total"><h3>Forging Stock <span class="hint">${list.length} line items</span></h3></div>
      <div class="frow g4" style="align-items:end;">
        <div style="max-width:280px;">
          <label class="fl">🔍 Search by Customer Name</label>
          <input id="forgStockCustInp" placeholder="Type a Customer Name…" value="${esc(forgStockCustSearch)}" oninput="filterForgStockGrid()">
        </div>
        <div style="max-width:280px;">
          <label class="fl">🔍 Search by Part Number</label>
          <input id="forgStockPartInp" placeholder="Type a Part No…" value="${esc(forgStockPartSearch)}" oninput="filterForgStockGrid()">
        </div>
        <div><label class="fl">From Date</label><input type="date" id="forgStockDateFromInp" value="${esc(forgStockDateFrom)}" onchange="filterForgStockDate('from', this.value)"></div>
        <div><label class="fl">To Date</label><input type="date" id="forgStockDateToInp" value="${esc(forgStockDateTo)}" onchange="filterForgStockDate('to', this.value)"></div>
        <div><button class="btn ghost small" onclick="resetForgStockDateToCurrentMonth()" title="Reset to the 1st of this month → today">📅 This Month</button></div>
      </div>
      <div class="hint" style="margin:6px 0 0;">Stores has no single date per stock line — From/To Date filters to items with a stock movement (received / issued / converted) in that period, and narrows the Stock History shown on each card to that range.</div>
      <div id="forgStockGrid">${forgStockGridHtml()}</div>
    </div>

    <div class="panel" style="border-left:4px solid var(--steel);">
      <h3 style="justify-content:flex-start; text-align:left;">🔗 Forging Stock is now fully automatic</h3>
      <div class="hint" style="line-height:1.6;">Forging stock is no longer added manually here. It flows in on its own: <b>Purchase Order → Material Receiving → Receiving Inspection (Pass) → Forging Stock</b>. Log incoming material in <b>Purchase → Material Receiving</b>; once Quality marks it <b>Pass</b>, the accepted quantity appears below automatically, already linked to its Customer (from Forging Mapping). Rejected or Hold quantities are never added.</div>
    </div>

    <div class="panel" style="background:var(--panel2);">
      <h3>🔁 Convert Forging Part No → Part No <span class="hint">Auto-fills from BOM mapping when available</span>
        <button class="btn ghost small" style="position:absolute; right:20px; top:16px;" onclick="toggleForgConvert()">${forgConvertMode?'Cancel':'+ New Conversion'}</button>
      </h3>
      ${forgConvertMode ? `
      <div class="frow g4">
        <div><label class="fl">Source Forging Part No <span class="hint" style="position:static; font-size:9.5px;">(from Forging Stock)</span></label>
          <select id="fcSourceSel" onchange="onForgConvertSourceChange()">
            <option value="">— select source part —</option>${forgOpts}
          </select>
        </div>
        <div><label class="fl">Part Number</label><input id="fcTargetPartNo" placeholder="e.g. FIN-9012"></div>
        <div><label class="fl">Part Name</label><input id="fcTargetPartName" placeholder="e.g. Machined Flange"></div>
        <div><label class="fl">Forging Qty Required / 1 Finished Unit <span class="hint" style="position:static; font-size:9.5px;">(from BOM Req. Qty if mapped)</span></label><input id="fcRatio" type="number" step="any" value="1" oninput="calcForgConvert()"></div>
      </div>
      <div class="frow g3">
        <div><label class="fl">Finished Qty to Produce</label><input id="fcOutputQty" type="number" step="any" placeholder="Qty to produce" oninput="calcForgConvert()"></div>
        <div><label class="fl">Required Forging Qty <span class="hint" style="position:static; font-size:9.5px;">(auto-calculated)</span></label><input id="fcRequiredQty" type="text" disabled placeholder="0"></div>
        <div><label class="fl">Available Forging Qty</label><input id="fcAvailQty" type="text" disabled placeholder="0"></div>
      </div>
      <div id="fcBomHint" class="hint" style="margin-top:4px;"></div>
      <button class="btn amber" style="margin-top:10px;" onclick="convertForgingStock()">🔁 Convert &amp; Update Stock</button>
      ` : `<div class="hint">Convert stock from a Forging Part No into a Part No — e.g. forged blank machined into the finished component. If a BOM mapping exists (Forging Part No → Part No), the Part and required qty ratio auto-fill. The system deducts the required forging quantity automatically and credits the part no.</div>`}
    </div>

    <div class="panel" style="border-left:4px solid var(--amber);">
      <h3 style="justify-content:flex-start; text-align:left;">📤 Issue Material to Production</h3>
      <div class="hint" style="position:static; margin-bottom:10px;">Select the Customer, then the Part Number and the Part Number it's being issued against — only relevant options are shown. Available stock and issue validation are automatic.</div>
      <div class="frow g4">
        <div><label class="fl">1. Customer</label><select id="forgIssueCustSel" onchange="onForgIssueCustChange()">
          <option value="">— select customer —</option>${forgIssueCustOptionsHtml()}
        </select></div>
        <div><label class="fl">2. Raw Material (Part Number)</label><select id="forgIssuePartSel" onchange="onForgIssuePartChange()">
          <option value="">— select customer first —</option>
        </select></div>
        <div><label class="fl">3. Part Number <span class="hint" style="position:static; font-size:9.5px;">(required — for traceability)</span></label><select id="forgIssueFinPartSel">
          <option value="">— select part first —</option>
        </select></div>
        <div><label class="fl">Available Stock</label><input id="forgIssueAvail" type="text" disabled placeholder="—"></div>
      </div>
      <div class="frow g4">
        <div><label class="fl">4. Issue Qty</label><input id="forgIssueQty" type="number" step="any" placeholder="Qty to issue"></div>
      </div>
      ${issueTypeFieldsHtml('forg')}
      <div class="rowactions" style="justify-content:flex-start; margin-top:10px;">
        <button class="btn amber" onclick="confirmForgIssue()">✅ Validate &amp; Issue</button>
      </div>
    </div>
  `;
}
function onForgConvertSourceChange(){
  const sel = document.getElementById('fcSourceSel');
  const opt = sel && sel.selectedOptions[0];
  const hint = document.getElementById('fcBomHint');
  if(opt && opt.value){
    const sourcePartNo = (DB.storesForging.find(x=>x.id===opt.value)||{}).partNo;
    const map = DB.bom.find(b=>(b.forgPartNo||'').trim().toLowerCase()===(sourcePartNo||'').trim().toLowerCase() && b.forgPartNo);
    if(map){
      document.getElementById('fcTargetPartNo').value = map.finPartNo||'';
      document.getElementById('fcTargetPartName').value = map.finPartName||'';
      hint.textContent = '🔗 Auto-filled from BOM mapping — enter conversion ratio manually.';
    } else {
      hint.textContent = 'No BOM mapping found for this forging part — enter Part No / Name and ratio manually.';
    }
  } else {
    hint.textContent = '';
  }
  calcForgConvert();
}
function calcForgConvert(){
  const sel = document.getElementById('fcSourceSel');
  const opt = sel && sel.selectedOptions[0];
  const avail = opt && opt.value ? parseFloat(opt.dataset.qty)||0 : 0;
  const ratio = parseFloat(document.getElementById('fcRatio').value)||0;
  const outQty = parseFloat(document.getElementById('fcOutputQty').value)||0;
  const required = Math.round(ratio*outQty*10000)/10000;
  document.getElementById('fcRequiredQty').value = required;
  document.getElementById('fcAvailQty').value = avail;
}
function convertForgingStock(){
  if(!requireWorkingUnit()) return;
  const sel = document.getElementById('fcSourceSel');
  const sourceId = sel.value;
  const source = DB.storesForging.find(x=>x.id===sourceId);
  if(!source){ toast('Select a source forging part'); return; }
  const targetPartNo = document.getElementById('fcTargetPartNo').value.trim();
  const targetPartName = document.getElementById('fcTargetPartName').value.trim();
  const ratio = parseFloat(document.getElementById('fcRatio').value)||0;
  const outputQty = parseFloat(document.getElementById('fcOutputQty').value)||0;
  if(!targetPartNo || !targetPartName){ toast('Part Number and Part Name are required'); return; }
  if(ratio<=0){ toast('Conversion ratio must be greater than 0'); return; }
  if(outputQty<=0){ toast('Enter a valid Finished Qty to Produce'); return; }
  const requiredQty = Math.round(ratio*outputQty*10000)/10000;
  if(requiredQty > (source.qty||0)){ toast('Required forging qty ('+requiredQty+') exceeds available stock ('+source.qty+')'); return; }
  source.qty = Math.round(((source.qty||0)-requiredQty)*10000)/10000;
  source.issuedQty = Math.round(((source.issuedQty||0)+requiredQty)*10000)/10000;
  pushStockHistory(source, 'conversion-out', requiredQty, `Converted to ${targetPartNo} — ${targetPartName} (ratio ${ratio})`);
  let target = DB.storesForging.find(x=>unitMatch(x.unit) && x.kind==='finished' && x.partNo===targetPartNo);
  if(!target){
    target = {id:'forgf'+Date.now(), unit:currentUnit, kind:'finished', partNo:targetPartNo, partName:targetPartName, qty:0, receivedQty:0, issuedQty:0, source:'Conversion from '+source.partNo, convertedFrom:source.partNo, history:[]};
    DB.storesForging.push(target);
  }
  target.qty = Math.round(((target.qty||0)+outputQty)*10000)/10000;
  target.receivedQty = Math.round(((target.receivedQty||0)+outputQty)*10000)/10000;
  pushStockHistory(target, 'conversion-in', outputQty, `Converted from ${source.partNo} — ${source.partName} (used ${requiredQty})`);
  forgConvertMode = false;
  saveDB(); toast(`Converted ${requiredQty} of ${source.partNo} → ${outputQty} of ${targetPartNo}`); render();
}
function printBarForgingStock(cat){
  const bucket = cat==='bar' ? 'storesBar' : 'storesForging';
  const label = cat==='bar' ? 'Bar' : 'Forging';
  const list = DB[bucket].filter(x=>reportUnitMatch(x.unit));
  const headers = ['Customer Name','Part Number','Part Name','Type','UOM','Qty on Hand','Source'];
  const rows = list.map(s=>[esc(s.customerName)||'—', esc(s.partNo)||'—', esc(s.partName)||'—', esc(s.kind)||'—', esc(s.uom)||'—', `<span class="num">${s.qty}</span>`, esc(s.source)||'—']);
  printReport(label+' Stock List', headers, rows, {barLeft:`Unit: ${esc(reportScopeLabel())}`, barRight:`Total Line Items: ${list.length}`});
}
/* ===== LABOUR STOCK — derived live from Production Planning (Scheduled Qty) and Product
   Development (mapped Production Location), net of whatever has actually been Issued to
   Production from here. No manual stock entry — every render recomputes straight from
   DB.labourPO + DB.production (jobs created via "Issue to Production" below), so a change to
   a Customer PO, a Monthly Schedule, a Production Location mapping, or an Issue to Production
   shows up immediately.
   Flow this feeds: Job Work Store Stock → Issue to Production → Production → Final Inspection → Finished Goods
   → Finished Inventory → Sales / Job Work Invoice (each later stage already existed and is
   untouched; this module only adds the missing first step and links it through). */
let labourStockCustFilter = ''; // Customer Name search text (substring match, case-insensitive) — shared across all 3 Job Work Stock sub-tabs
let labourStockPartFilter = ''; // Part Number search text (substring match, case-insensitive) — shared across all 3 Job Work Stock sub-tabs
let labourMappingPartFilter = ''; // Part No search text typed into the Job Work Mapping list's search box (case-insensitive)
let bomPartFilter = {BAR:'', FORGING:''}; // Part No search text for Bar Mapping / Forging Mapping lists — kept separate per mapType
function firstOfCurrentMonth(){ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10); }
// Defaults to the Current Month (1st → today) across all 3 Job Work Stock sub-tabs.
let labourStockDateFrom = firstOfCurrentMonth();
let labourStockDateTo = today();
let labourReceiptEditId = null; // id of the DC Receipt entry currently being edited in the form above the ledger ('' /null = adding new)
function labourStockRowKey(customerId, finPartNo){ return (customerId||'')+'||'+(finPartNo||'').trim().toLowerCase(); }
// Total already Issued to Production against a Customer + Finished Part from Job Work Stock —
// summed straight from the Production jobs this screen itself creates (marked
// labourStockSource:true), so it's always in sync with the Production module with no
// duplicate bookkeeping.
function labourStockIssuedQty(customerId, finPartNo){
  const key = labourStockRowKey(customerId, finPartNo);
  return DB.production.filter(p=>p.labourStockSource && reportUnitMatch(p.unit) && labourStockRowKey(p.customerId, p.finPartNo)===key)
    .reduce((a,p)=>a+(parseFloat(p.issuedQty)||0),0);
}
// Total physically received from the Customer (against ALL Delivery Challans logged for this
// Customer + Finished Part) — the real, DC-traceable source of Job Work Stock's Available Qty.
function labourReceiptTotalQty(customerId, finPartNo){
  const key = labourStockRowKey(customerId, finPartNo);
  return DB.labourMaterialReceipt.filter(r=>reportUnitMatch(r.unit) && labourStockRowKey(r.customerId, r.finPartNo)===key)
    .reduce((a,r)=>a+(parseFloat(r.qtyReceived)||0),0);
}
// Part Number list scoped to the selected Customer for the DC Receipt entry form — sourced from
// that Customer's Open Job Work PO's + Job Work Mapping, so a part can be picked even before a PO
// exists (material can arrive from the customer ahead of the PO being raised).
function labourReceiptPartOptionsHtml(customerId, selectedPartNo){
  if(!customerId) return '<option value="">— select a Customer first —</option>';
  const cust = DB.customers.find(x=>x.id===customerId);
  const custKey = cust ? (cust.name||'').trim().toLowerCase() : '';
  const seen = {}; const opts = [];
  DB.labourPO.filter(x=>reportUnitMatch(x.unit) && (x.customerId===customerId || (custKey && (x.customer||'').trim().toLowerCase()===custKey))).forEach(po=>{
    const pn = (po.finPartNo||'').trim();
    if(pn && !seen[pn]){ seen[pn]=1; opts.push({pn, name:po.finPartName||''}); }
  });
  DB.labourMapping.filter(m=>m.customerId===customerId || (custKey && (m.customer||'').trim().toLowerCase()===custKey)).forEach(m=>{
    const pn = (m.finPartNo||'').trim();
    if(pn && !seen[pn]){ seen[pn]=1; opts.push({pn, name:m.finPartName||''}); }
  });
  if(!opts.length) return '<option value="">— no parts found for this customer (raise a Job Work PO or Job Work Mapping first, or type it under Job Work Mapping) —</option>';
  return '<option value="">— select part —</option>' + opts.map(o=>`<option value="${esc(o.pn)}" data-partname="${esc(o.name)}" ${o.pn===selectedPartNo?'selected':''}>${esc(o.pn)} — ${esc(o.name)||'—'}</option>`).join('');
}
function onLabourReceiptCustomerChange(){
  const sel = document.getElementById('lmrCustomerSel');
  const partSel = document.getElementById('lmrPartSel');
  if(partSel) partSel.innerHTML = labourReceiptPartOptionsHtml(sel.value, '');
  // Customer changed → Part is reset, so the PO Number field must be re-evaluated too (it goes
  // back to "no part selected yet" until a Part is chosen again).
  const poWrap = document.getElementById('lmrPoNoWrap');
  if(poWrap) poWrap.innerHTML = labourReceiptPoNoFieldHtml(sel.value, '', '');
}
// Fires when the Part Number is (re)selected — looks up whether a PO Number is already on file
// for this exact Customer + Part combination in the Customer PO module (Job Work PO sub-tab,
// DB.labourPO — the same source this screen already uses for its Part Number list) and
// refreshes the PO Number field accordingly: auto-filled + locked if found, or left blank and
// editable if not.
function onLabourReceiptPartChange(){
  const custSel = document.getElementById('lmrCustomerSel');
  const partSel = document.getElementById('lmrPartSel');
  const poWrap = document.getElementById('lmrPoNoWrap');
  if(poWrap) poWrap.innerHTML = labourReceiptPoNoFieldHtml(custSel?custSel.value:'', partSel?partSel.value:'', '');
}
// Looks up the PO Number already on file for this Customer + Part in the Customer PO module
// (Job Work PO sub-tab — DB.labourPO). If more than one PO exists for the same Customer + Part,
// the most recent one (by PO Date) is used. Returns '' if none is on file yet.
function labourReceiptFetchPoNo(customerId, finPartNo){
  if(!customerId || !(finPartNo||'').trim()) return '';
  const key = finPartNo.trim().toLowerCase();
  const matches = DB.labourPO.filter(x=>reportUnitMatch(x.unit) && x.customerId===customerId
    && (x.finPartNo||'').trim().toLowerCase()===key && (x.poNo||'').trim());
  if(!matches.length) return '';
  matches.sort((a,b)=>(b.poDate||'').localeCompare(a.poDate||''));
  return matches[0].poNo;
}
// Renders the PO Number field: auto-fetched + read-only when a Customer PO already exists for
// this Customer + Part, otherwise blank/editable (pre-filled with any value already manually
// saved on this DC Receipt entry, when editing).
function labourReceiptPoNoFieldHtml(customerId, finPartNo, storedValue){
  const fetched = labourReceiptFetchPoNo(customerId, finPartNo);
  if(fetched){
    return `<input id="lmrPoNo" value="${esc(fetched)}" disabled title="Auto-fetched from Customer PO for this Customer + Part">`;
  }
  return `<input id="lmrPoNo" placeholder="Enter PO Number" value="${esc(storedValue||'')}" title="No PO on file in Customer PO for this Customer + Part — enter it manually">`;
}
// Saves a Customer Material Inward (DC Receipt) entry — the moment this is saved, the quantity
// is immediately visible in Job Work Stock's "Stock Qty (Available)" (labourStockRows() reads
// straight off DB.labourMaterialReceipt), and the DC No./Date stay attached to this record
// permanently so every unit of stock is traceable back to the Delivery Challan it arrived on.
function saveLabourMaterialReceipt(){
  if(!requireWorkingUnit()) return;
  const dcNoEl = document.getElementById('lmrDcNo');
  const dcDateEl = document.getElementById('lmrDcDate');
  const custSel = document.getElementById('lmrCustomerSel');
  const partSel = document.getElementById('lmrPartSel');
  const poNoEl = document.getElementById('lmrPoNo');
  const qtyEl = document.getElementById('lmrQty');
  const remarksEl = document.getElementById('lmrRemarks');
  const dcNo = (dcNoEl.value||'').trim();
  const dcDate = dcDateEl.value||'';
  const customerId = custSel.value;
  const customerOpt = custSel.selectedIndex>=0 ? custSel.options[custSel.selectedIndex] : null;
  const customer = customerOpt ? customerOpt.textContent : '';
  const partOpt = partSel.selectedIndex>=0 ? partSel.options[partSel.selectedIndex] : null;
  const finPartNo = partSel.value;
  const finPartName = partOpt ? (partOpt.dataset.partname||'') : '';
  // PO Number: auto-fetched (field disabled) from the Customer PO module when one already exists
  // for this Customer + Part, otherwise whatever the user typed manually into the now-editable
  // field — either way it's saved against this DC Receipt entry (Customer + Part combination).
  const poNo = (poNoEl && poNoEl.value ? poNoEl.value : '').trim();
  const qty = parseFloat(qtyEl.value)||0;
  const remarks = (remarksEl.value||'').trim();
  if(!dcNo){ toast('Enter the DC Number'); return; }
  if(!dcDate){ toast('Enter the DC Date'); return; }
  if(!customerId){ toast('Select the Customer Name'); return; }
  if(!finPartNo){ toast('Select the Part Number'); return; }
  if(qty<=0){ toast('Enter a valid Quantity Received'); return; }
  if(labourReceiptEditId){
    // Editing an existing DC Receipt entry — update it in place. If the qty is reduced below
    // what's already been issued to Production against this Customer+Part, warn but still allow
    // it (the pooled Balance across that Customer+Part's DC's will simply show as fully consumed).
    const rec = DB.labourMaterialReceipt.find(r=>r.id===labourReceiptEditId);
    if(!rec){ toast('This DC Receipt entry no longer exists'); labourReceiptEditId=null; render(); return; }
    Object.assign(rec, { dcNo, dcDate, customerId, customer, finPartNo, finPartName, poNo, qtyReceived: qty, remarks });
    saveDB();
    toast(`DC ${dcNo} — entry updated (${qty} of ${finPartNo})`);
    labourReceiptEditId = null;
    dcNoEl.value=''; qtyEl.value=''; remarksEl.value='';
    render();
    return;
  }
  DB.labourMaterialReceipt.push({
    id:'lmr'+Date.now()+Math.floor(Math.random()*10000), unit:currentUnit,
    dcNo, dcDate, customerId, customer, finPartNo, finPartName, poNo,
    qtyReceived: qty, date: today(), remarks
  });
  saveDB();
  toast(`DC ${dcNo} — ${qty} of ${finPartNo} received into Job Work Stock (Customer-Supplied Material)`);
  dcNoEl.value=''; qtyEl.value=''; remarksEl.value='';
  render();
}
// Loads an existing DC Receipt entry back into the entry form above the ledger for editing.
// Switches the form into "edit mode" (labourReceiptEditId set) — Save Receipt becomes Update,
// and a Cancel Edit button appears alongside it.
function editLabourMaterialReceipt(id){
  const rec = DB.labourMaterialReceipt.find(r=>r.id===id);
  if(!rec){ toast('DC Receipt entry not found'); return; }
  labourReceiptEditId = id;
  render();
  // Scroll the form into view so the user immediately sees what they're editing.
  setTimeout(()=>{ const el = document.getElementById('lmrDcNo'); if(el){ el.scrollIntoView({behavior:'smooth', block:'center'}); el.focus(); } }, 30);
}
function cancelLabourReceiptEdit(){
  labourReceiptEditId = null;
  render();
}
// Deletes a Customer Material Inward (DC Receipt) entry outright. Warns before deleting if any
// quantity from this Customer+Part pool has already been Issued to Production, since removing
// this DC reduces the total Received Qty that issue was netted against (the issue/Production job
// itself is untouched — only this DC record and its own contribution to Stock Qty is removed).
function deleteLabourMaterialReceipt(id){
  const rec = DB.labourMaterialReceipt.find(r=>r.id===id);
  if(!rec){ toast('DC Receipt entry not found'); return; }
  const issuedForPart = labourStockIssuedQty(rec.customerId, rec.finPartNo);
  const msg = issuedForPart>0.0001
    ? `Delete DC ${rec.dcNo} (${rec.qtyReceived} of ${rec.finPartNo})? Note: ${issuedForPart} has already been Issued to Production against this Customer+Part — deleting this DC will reduce the available Received Qty it was netted against.`
    : `Delete DC ${rec.dcNo} (${rec.qtyReceived} of ${rec.finPartNo})? This cannot be undone.`;
  if(!confirm(msg)) return;
  DB.labourMaterialReceipt = DB.labourMaterialReceipt.filter(r=>r.id!==id);
  if(labourReceiptEditId===id) labourReceiptEditId = null;
  saveDB();
  toast(`DC ${rec.dcNo} — entry deleted`);
  render();
}
// FIFO-allocates each Customer + Part's total "Issued to Production" qty back across that
// key's DC receipts in date order, so every individual DC entry shows its own remaining
// Balance in Stock — full traceability from DC → Job Work Stock → Production without needing to
// pick a specific DC at issue time (issue itself still nets from the pooled Customer+Part total).
// Core FIFO balance calculation shared by the DC Receipt ledger AND the main Job Work Stock
// table. Every DC Receipt is — and stays — its own separate schedule/entry (never merged into
// any other DC's quantity or into a Part No.'s Production Planning schedule). "Issued to
// Production" for a Customer+Part is only netted off in date order across that Part's own DC
// receipts purely to show each DC's remaining Balance; the DC records themselves are never
// combined or added together.
function labourReceiptBalanceRows(){
  const rows = DB.labourMaterialReceipt.filter(x=>reportUnitMatch(x.unit));
  const byKey = {};
  rows.forEach(r=>{
    const key = labourStockRowKey(r.customerId, r.finPartNo);
    if(!byKey[key]) byKey[key] = [];
    byKey[key].push(r);
  });
  const out = [];
  Object.keys(byKey).forEach(key=>{
    const list = byKey[key].slice().sort((a,b)=>(a.dcDate||'').localeCompare(b.dcDate||'') || (a.id||'').localeCompare(b.id||''));
    let remainingIssued = labourStockIssuedQty(list[0].customerId, list[0].finPartNo);
    list.forEach(r=>{
      const qty = parseFloat(r.qtyReceived)||0;
      const consumed = Math.min(qty, Math.max(remainingIssued,0));
      remainingIssued = Math.round((remainingIssued-consumed)*10000)/10000;
      out.push({...r, balance: Math.round((qty-consumed)*10000)/10000});
    });
  });
  return out;
}
function labourReceiptLedgerRows(){
  let rows = labourReceiptBalanceRows();
  if(labourStockCustFilter) rows = rows.filter(r=>(r.customer||'').toLowerCase().includes(labourStockCustFilter.toLowerCase()));
  if(labourStockPartFilter) rows = rows.filter(r=>(r.finPartNo||'').toLowerCase().includes(labourStockPartFilter.toLowerCase()));
  if(labourStockDateFrom || labourStockDateTo){
    rows = rows.filter(r=>{
      const d = r.dcDate||'';
      if(labourStockDateFrom && (!d || d < labourStockDateFrom)) return false;
      if(labourStockDateTo && (!d || d > labourStockDateTo)) return false;
      return true;
    });
  }
  return rows.sort((a,b)=>(b.dcDate||'').localeCompare(a.dcDate||'') || (b.id||'').localeCompare(a.id||''));
}
function labourReceiptLedgerHtml(){
  const rows = labourReceiptLedgerRows();
  if(!rows.length) return `<div class="empty">${(labourStockDateFrom||labourStockDateTo||labourStockCustFilter||labourStockPartFilter)?'No Customer Material Inward (DC) entries match the current filters.':'No Customer Material Inward (DC) entries yet — record one above as soon as material arrives.'}</div>`;
  return `
    <div class="report-table-wrap" style="max-height:400px; overflow-y:auto;">
    <table class="report-table">
      <thead><tr><th>DC Date</th><th>DC No</th><th>Customer</th><th>Part No</th><th>Part Name</th><th style="text-align:right;">Qty Received</th><th style="text-align:right;">Balance in Stock</th><th>Remarks</th><th>Actions</th></tr></thead>
      <tbody>
        ${rows.map(r=>`
        <tr${labourReceiptEditId===r.id?' style="background:color-mix(in srgb, var(--amber) 14%, transparent);"':''}>
          <td>${fmtDate(r.dcDate)}</td>
          <td><b>${esc(r.dcNo)}</b></td>
          <td>${esc(custDispByName(r.customer))||'—'}</td>
          <td><b>${esc(r.finPartNo)}</b></td>
          <td class="rt-truncate" title="${esc(r.finPartName)}">${esc(r.finPartName)||'—'}</td>
          <td style="text-align:right;">${r.qtyReceived}</td>
          <td style="text-align:right; ${r.balance>0.0001?'font-weight:700; color:var(--green);':'color:var(--text-dim);'}">${r.balance}</td>
          <td class="rt-truncate" title="${esc(r.remarks)}">${esc(r.remarks)||'—'}</td>
          <td><button class="btn sm" onclick="editLabourMaterialReceipt('${r.id}')" title="Edit this DC Receipt entry">✎ Edit</button> <button class="btn sm danger" onclick="deleteLabourMaterialReceipt('${r.id}')" title="Delete this DC Receipt entry">🗑 Delete</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>`;
}
// Scheduled Qty (Production Planning reference only) per Customer + Finished Part — live
// Scheduled Qty summed across every Open Job Work PO for that Customer + Part. Kept separate
// from DC Receipts entirely: receiving material against a DC never changes this number.
function labourStockScheduledQtyFor(customerId, finPartNo){
  const key = labourStockRowKey(customerId, finPartNo);
  return DB.labourPO.filter(x=>reportUnitMatch(x.unit) && labourStockRowKey(x.customerId, x.finPartNo)===key)
    .reduce((a,rec)=>a+labourPOTotals(rec).scheduled,0);
}
// Job Work Stock table rows — ONE ROW PER DC RECEIPT/INBOUND. Each Customer Material Inward
// (DC Receipt) is its own separate schedule/entry, identified by its DC Number, and is never
// merged or added into any other DC's quantity or into the Part No.'s existing Production
// Planning schedule (e.g. an existing 500 Nos schedule stays 500; a new 200 Nos DC shows up as
// its own separate 200 Nos row, not as 700). Only once material is Issued to Production does it
// leave this DC's own balance (FIFO-netted, see labourReceiptBalanceRows()).
function labourStockRows(){
  const receiptRows = labourReceiptBalanceRows().map(r=>({
    id: r.id, customerId: r.customerId, customer: r.customer, finPartNo: r.finPartNo, finPartName: r.finPartName,
    dcNo: r.dcNo, dcDate: r.dcDate,
    scheduledQty: labourStockScheduledQtyFor(r.customerId, r.finPartNo),
    receivedQty: parseFloat(r.qtyReceived)||0,
    stockQty: r.balance,
    issuedToProd: Math.round(((parseFloat(r.qtyReceived)||0) - r.balance)*10000)/10000,
    prodLocation: labourMappingLocationFor(r.customerId, r.finPartNo) || '—'
  }));
  // Seed a placeholder row (no DC yet) for any Customer + Part that has a live Production
  // Planning schedule but no DC Receipt at all — so it's still visible ahead of material
  // physically arriving. Never merges with an actual DC row above.
  const seen = new Set(receiptRows.map(r=>labourStockRowKey(r.customerId, r.finPartNo)));
  const seedRows = [];
  DB.labourPO.filter(x=>reportUnitMatch(x.unit)).forEach(rec=>{
    const key = labourStockRowKey(rec.customerId, rec.finPartNo);
    if(seen.has(key) || seedRows.some(s=>labourStockRowKey(s.customerId,s.finPartNo)===key)) return;
    seedRows.push({
      id: null, customerId: rec.customerId, customer: rec.customer, finPartNo: rec.finPartNo, finPartName: rec.finPartName,
      dcNo: '', dcDate: '',
      scheduledQty: labourStockScheduledQtyFor(rec.customerId, rec.finPartNo),
      receivedQty: 0, stockQty: 0, issuedToProd: 0,
      prodLocation: labourMappingLocationFor(rec.customerId, rec.finPartNo) || '—'
    });
  });
  return [...receiptRows, ...seedRows]
    .sort((a,b)=>(a.customer||'').localeCompare(b.customer||'') || (a.finPartNo||'').localeCompare(b.finPartNo||'') || (b.dcDate||'').localeCompare(a.dcDate||''));
}
/* ---- Customer Material Ledger Report (Job Card Tracking → Reports) ----
   One row per Customer + Part No of customer-supplied material — Received Qty (Customer Material
   Inward / DC Receipts), Dispatched Qty (Job Work Invoices raised against it), Rejected Qty
   (rejections logged on Production jobs sourced from this customer material), and the resulting
   Pending Balance = Received − Dispatched − Rejected. An empty date range means all-time (no
   restriction) — the default — so the report reflects the customer's full outstanding balance
   unless a specific period is chosen. */
let cmlDateFrom = '';
let cmlDateTo = '';
let cmlPartFilter = '';
function setCmlDate(which, val){ if(which==='from') cmlDateFrom=val; else cmlDateTo=val; renderCmlResultsOnly(); }
function setCmlPartFilter(val){ cmlPartFilter = (val||'').trim(); renderCmlResultsOnly(); }
function clearCmlDateFilter(){
  cmlDateFrom=''; cmlDateTo='';
  const f = document.getElementById('cmlDateFromInput'); if(f) f.value='';
  const t = document.getElementById('cmlDateToInput'); if(t) t.value='';
  renderCmlResultsOnly();
}
// Updates only the hint line + ledger table (never the filter inputs themselves) so typing in the
// Part No search box or picking a date doesn't rebuild/recreate those inputs mid-edit — a full
// innerHTML rebuild on every keystroke was stealing focus after each character and, for the native
// date pickers, re-baking a half-typed value back into a freshly recreated element, corrupting
// whatever the user was still typing (e.g. a year of "0002" instead of "2026").
function renderCmlResultsOnly(){
  const hint = document.getElementById('cmlHint');
  if(hint) hint.innerHTML = (cmlDateFrom||cmlDateTo) ? `Showing activity from ${cmlDateFrom?fmtDate(cmlDateFrom):'the start'} to ${cmlDateTo?fmtDate(cmlDateTo):'today'}.` : 'Showing all-time data — no date restriction applied.';
  const wrap = document.getElementById('cmlTableWrap');
  if(wrap) wrap.innerHTML = cmlTableHtml();
}
function cmlInDateRange(dateStr){
  if(!cmlDateFrom && !cmlDateTo) return true; // all-time — no restriction
  const d = dateStr||'';
  if(!d) return false;
  if(cmlDateFrom && d<cmlDateFrom) return false;
  if(cmlDateTo && d>cmlDateTo) return false;
  return true;
}
function customerMaterialLedgerRows(){
  const receipts = DB.labourMaterialReceipt.filter(r=>reportUnitMatch(r.unit) && cmlInDateRange(r.dcDate));
  const dispatches = DB.sales.filter(s=>reportUnitMatch(s.unit) && s.invKind==='labour' && cmlInDateRange(s.invDate));
  const prodJobs = DB.production.filter(p=>reportUnitMatch(p.unit) && p.labourStockSource && cmlInDateRange(p.startDate));
  const map = new Map(); // key -> {customerId, customer, finPartNo, finPartName, received, dispatched, rejected}
  const keyOf = (customerId, finPartNo)=> (customerId||'')+'||'+(finPartNo||'').trim().toLowerCase();
  const ensure = (customerId, customer, finPartNo, finPartName)=>{
    const key = keyOf(customerId, finPartNo);
    if(!map.has(key)) map.set(key, {customerId, customer, finPartNo, finPartName, received:0, dispatched:0, rejected:0});
    const g = map.get(key);
    if(!g.customer && customer) g.customer = customer;
    if(!g.finPartName && finPartName) g.finPartName = finPartName;
    return g;
  };
  receipts.forEach(r=>{ ensure(r.customerId, r.customer, r.finPartNo, r.finPartName).received += (parseFloat(r.qtyReceived)||0); });
  dispatches.forEach(s=>{
    const po = s.labourPOId ? DB.labourPO.find(x=>x.id===s.labourPOId) : null;
    const customerId = po ? po.customerId : null;
    ensure(customerId, s.customer, s.partNo, s.partName).dispatched += (parseFloat(s.qty)||0);
  });
  prodJobs.forEach(p=>{ ensure(p.customerId, p.customerName, p.finPartNo, p.finPartName).rejected += (parseFloat(p.rejectionQty)||0); });
  return Array.from(map.values()).map(g=>({
    ...g,
    received: Math.round(g.received*10000)/10000,
    dispatched: Math.round(g.dispatched*10000)/10000,
    rejected: Math.round(g.rejected*10000)/10000,
    pending: Math.round((g.received-g.dispatched-g.rejected)*10000)/10000
  })).filter(g=> !cmlPartFilter || (g.finPartNo||'').toLowerCase().includes(cmlPartFilter.toLowerCase()))
    .sort((a,b)=>(a.customer||'').localeCompare(b.customer||'') || (a.finPartNo||'').localeCompare(b.finPartNo||''));
}
function printCustomerMaterialLedger(){
  const rows = customerMaterialLedgerRows();
  const headers = ['Customer','Part No','Part Name','Received Qty','Dispatched Qty','Rejected Qty','Pending Balance'];
  const tableRows = rows.map(r=>[esc(custDispByName(r.customer))||'—', esc(r.finPartNo)||'—', esc(r.finPartName)||'—', `<span class="num">${r.received}</span>`, `<span class="num">${r.dispatched}</span>`, `<span class="num">${r.rejected}</span>`, `<span class="num">${r.pending}</span>`]);
  const period = (cmlDateFrom||cmlDateTo) ? `${cmlDateFrom?fmtDate(cmlDateFrom):'Start'} to ${cmlDateTo?fmtDate(cmlDateTo):'Today'}` : 'All-Time';
  printReport('Customer Material Ledger Report', headers, tableRows, {barLeft:`Unit: ${esc(reportScopeLabel())} · Period: ${period}`, barRight:`Total Part(s): ${rows.length}`});
}
function cmlTableHtml(){
  const rows = customerMaterialLedgerRows();
  const totals = rows.reduce((a,r)=>({received:a.received+r.received, dispatched:a.dispatched+r.dispatched, rejected:a.rejected+r.rejected, pending:a.pending+r.pending}), {received:0,dispatched:0,rejected:0,pending:0});
  return `
      <h3>Ledger <span class="hint">${rows.length} Customer+Part combination(s)</span></h3>
      <div class="tw"><table>
        <thead><tr><th>Customer</th><th>Part No</th><th>Part Name</th><th style="text-align:right;">Received Qty</th><th style="text-align:right;">Dispatched Qty</th><th style="text-align:right;">Rejected Qty</th><th style="text-align:right;">Pending Balance</th></tr></thead>
        <tbody>
        ${rows.length ? rows.map(r=>`
          <tr>
            <td>${esc(custDispByName(r.customer))||'—'}</td>
            <td><b>${esc(r.finPartNo)}</b></td>
            <td class="rt-truncate" title="${esc(r.finPartName)}">${esc(r.finPartName)||'—'}</td>
            <td style="text-align:right;">${r.received}</td>
            <td style="text-align:right;">${r.dispatched}</td>
            <td style="text-align:right; ${r.rejected>0.0001?'color:var(--red);':''}">${r.rejected}</td>
            <td style="text-align:right; font-weight:700; ${r.pending>0.0001?'color:var(--amber);':(r.pending<-0.0001?'color:var(--red);':'color:var(--green);')}">${r.pending}</td>
          </tr>`).join('') : `<tr><td colspan="7" class="empty">No Customer Material Inward (DC) entries found${(cmlDateFrom||cmlDateTo||cmlPartFilter)?' for the current filters':' yet'}.</td></tr>`}
        </tbody>
        ${rows.length ? `<tfoot><tr style="font-weight:800; border-top:2px solid var(--line);">
          <td colspan="3">Total</td>
          <td style="text-align:right;">${Math.round(totals.received*10000)/10000}</td>
          <td style="text-align:right;">${Math.round(totals.dispatched*10000)/10000}</td>
          <td style="text-align:right; color:var(--red);">${Math.round(totals.rejected*10000)/10000}</td>
          <td style="text-align:right; color:var(--amber);">${Math.round(totals.pending*10000)/10000}</td>
        </tr></tfoot>` : ''}
      </table></div>`;
}
function renderCustomerMaterialLedgerReport(main){
  main.innerHTML = `
    <div class="topbar"><div><h2>📊 Job Card Tracking — Customer Material Ledger Report</h2></div></div>
    <div class="panel" style="margin-top:12px;">
      <h3>Customer Material Ledger <span class="hint">Customer-supplied Part Numbers — Received, Dispatched, Rejected and Pending Balance.</span></h3>
      <div class="frow g4" style="align-items:end;">
        <div><label class="fl">Date From <span class="hint" style="position:static; font-size:9px;">(blank = all-time)</span></label><input id="cmlDateFromInput" type="date" value="${esc(cmlDateFrom)}" onchange="setCmlDate('from', this.value)"></div>
        <div><label class="fl">Date To <span class="hint" style="position:static; font-size:9px;">(blank = all-time)</span></label><input id="cmlDateToInput" type="date" value="${esc(cmlDateTo)}" onchange="setCmlDate('to', this.value)"></div>
        <div><label class="fl">🔍 Search by Part No</label><input id="cmlPartFilterInput" type="text" placeholder="Type a Part No…" value="${esc(cmlPartFilter)}" oninput="setCmlPartFilter(this.value)"></div>
        <div><button class="btn ghost small" onclick="clearCmlDateFilter()">📅 Clear Dates — Show All-Time</button></div>
      </div>
      <div class="hint" id="cmlHint" style="position:static; display:block; margin-top:8px;">${(cmlDateFrom||cmlDateTo) ? `Showing activity from ${cmlDateFrom?fmtDate(cmlDateFrom):'the start'} to ${cmlDateTo?fmtDate(cmlDateTo):'today'}.` : 'Showing all-time data — no date restriction applied.'}</div>
      <div class="rowactions" style="justify-content:flex-start; margin-top:10px;">
        <button class="btn ghost small" onclick="printCustomerMaterialLedger()">🖨 Print</button>
        <button class="btn ghost small" onclick="closeModuleReports()">← Back to Job Card Tracking</button>
      </div>
    </div>
    <div class="panel" id="cmlTableWrap">${cmlTableHtml()}</div>`;
}
function labourStockPartOptionsHtml(){
  const parts = [...new Set([
    ...DB.labourPO.filter(x=>reportUnitMatch(x.unit)).map(x=>x.finPartNo),
    ...DB.labourMaterialReceipt.filter(x=>reportUnitMatch(x.unit)).map(x=>x.finPartNo)
  ].filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  return parts.map(pn=>`<option value="${esc(pn)}">`).join('');
}
function labourStockCustOptionsHtml(){
  const custIds = [...new Set(DB.labourPO.filter(x=>reportUnitMatch(x.unit)).map(x=>x.customerId))];
  const opts = custIds.map(id=>{
    const rec = DB.labourPO.find(x=>x.customerId===id);
    return {id, name: rec?rec.customer:id};
  }).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  return opts.map(o=>`<option data-id="${esc(o.id)}" value="${esc(o.name)}">`).join('');
}
// Both boxes are plain substring (contains), case-insensitive text search — typing partially
// narrows results live, no need to pick an exact match from the dropdown suggestions.
function onLabourStockCustFilterChange(inputEl){
  labourStockCustFilter = inputEl.value.trim();
  renderLabourStockTableOnly();
}
function onLabourStockPartFilterChange(inputEl){
  labourStockPartFilter = inputEl.value.trim();
  renderLabourStockTableOnly();
}
function clearLabourStockCustPartFilters(){
  labourStockCustFilter = ''; labourStockPartFilter = '';
  ['labourStockCustSel','labourStockPartSel'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  renderLabourStockTableOnly();
}
// Shared Customer Name + Part Number search bar, rendered at the top of all 3 Job Work Stock
// sub-tabs so parts can be found quickly regardless of which tab is open.
function labourStockFilterBarHtml(){
  return `
    <div class="frow g4" style="align-items:end; margin-bottom:12px;">
      <div style="max-width:280px;">
        <label class="fl">🔍 Search by Customer Name</label>
        <input list="labourStockCustList" id="labourStockCustSel" placeholder="Type a Customer Name…" value="${esc(labourStockCustFilter)}" oninput="onLabourStockCustFilterChange(this)">
        <datalist id="labourStockCustList">${labourStockCustOptionsHtml()}</datalist>
      </div>
      <div style="max-width:280px;">
        <label class="fl">🔍 Search by Part Number</label>
        <input list="labourStockPartList" id="labourStockPartSel" placeholder="Type a Part No…" value="${esc(labourStockPartFilter)}" oninput="onLabourStockPartFilterChange(this)">
        <datalist id="labourStockPartList">${labourStockPartOptionsHtml()}</datalist>
      </div>
      <div><label class="fl">From Date</label><input type="date" id="labourStockDateFromInp" value="${esc(labourStockDateFrom)}" onchange="filterLabourStockDate('from', this.value)"></div>
      <div><label class="fl">To Date</label><input type="date" id="labourStockDateToInp" value="${esc(labourStockDateTo)}" onchange="filterLabourStockDate('to', this.value)"></div>
      <div style="display:flex; gap:8px;">
        <button class="btn ghost small" onclick="resetLabourStockDateToCurrentMonth()" title="Reset to the 1st of this month → today">📅 This Month</button>
        ${(labourStockCustFilter||labourStockPartFilter)?`<button class="btn ghost small" onclick="clearLabourStockCustPartFilters()">✕ Clear Search</button>`:''}
      </div>
    </div>`;
}
// Only the table body + count re-render on filter change, keeping the dropdown's own
// focus/scroll undisturbed — the whole screen is otherwise static (no button ever needed).
function renderLabourStockTableOnly(){
  const box = document.getElementById('labourStockTableBox');
  if(box) box.innerHTML = labourStockTableHtml();
  const txnBox = document.getElementById('labourStockTxnBox');
  if(txnBox) txnBox.innerHTML = labourStockTxnHtml();
  const receiptBox = document.getElementById('labourReceiptLedgerBox');
  if(receiptBox) receiptBox.innerHTML = labourReceiptLedgerHtml();
}
function filterLabourStockDate(which, val){
  if(which==='from') labourStockDateFrom = val; else labourStockDateTo = val;
  renderLabourStockTableOnly();
}
function resetLabourStockDateToCurrentMonth(){
  labourStockDateFrom = firstOfCurrentMonth();
  labourStockDateTo = today();
  const fromEl = document.getElementById('labourStockDateFromInp'); if(fromEl) fromEl.value = labourStockDateFrom;
  const toEl = document.getElementById('labourStockDateToInp'); if(toEl) toEl.value = labourStockDateTo;
  renderLabourStockTableOnly();
}
function clearLabourStockDateFilter(){
  labourStockDateFrom = ''; labourStockDateTo = '';
  const fromEl = document.getElementById('labourStockDateFromInp'); if(fromEl) fromEl.value = '';
  const toEl = document.getElementById('labourStockDateToInp'); if(toEl) toEl.value = '';
  renderLabourStockTableOnly();
}
// Job Work Stock itself is a live balance (Scheduled Qty net of Issued to Production), so a
// date range doesn't filter the balance — instead it filters this transaction ledger of every
// "Issue to Production" event raised from Job Work Stock, each carrying its own date and Card No.
function labourStockTxnRows(){
  let rows = DB.production.filter(p=>p.labourStockSource && reportUnitMatch(p.unit));
  if(labourStockCustFilter) rows = rows.filter(p=>(p.customerName||'').toLowerCase().includes(labourStockCustFilter.toLowerCase()));
  if(labourStockPartFilter) rows = rows.filter(p=>(p.finPartNo||'').toLowerCase().includes(labourStockPartFilter.toLowerCase()));
  if(labourStockDateFrom || labourStockDateTo){
    rows = rows.filter(p=>{
      const d = p.startDate||'';
      if(labourStockDateFrom && (!d || d < labourStockDateFrom)) return false;
      if(labourStockDateTo && (!d || d > labourStockDateTo)) return false;
      return true;
    });
  }
  return rows.slice().sort((a,b)=>(b.startDate||'').localeCompare(a.startDate||''));
}
function labourStockTxnHtml(){
  const rows = labourStockTxnRows();
  if(!rows.length) return `<div class="empty">${(labourStockDateFrom||labourStockDateTo||labourStockCustFilter||labourStockPartFilter)?'No Issue to Production transactions match the current filters.':'No Issue to Production transactions yet.'}</div>`;
  return `
    <div class="report-table-wrap" style="max-height:400px; overflow-y:auto;">
    <table class="report-table">
      <thead><tr><th>Date</th><th>Card No</th><th>Customer</th><th>Part No</th><th>Part Name</th><th>DC No</th><th style="text-align:right;">Qty Issued</th><th>Job Work PO No</th></tr></thead>
      <tbody>
        ${rows.map(p=>`
        <tr>
          <td>${fmtDate(p.startDate)}</td>
          <td>${esc(p.cardNo)||'—'}</td>
          <td>${esc(p.customerName)||'—'}</td>
          <td><b>${esc(p.finPartNo)||'—'}</b></td>
          <td class="rt-truncate" title="${esc(p.finPartName)}">${esc(p.finPartName)||'—'}</td>
          <td>${esc(p.dcNo)||'—'}</td>
          <td style="text-align:right;">${p.issuedQty}</td>
          <td>${esc(p.labourPONo)||'—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>`;
}
function labourStockTableHtml(){
  let rows = labourStockRows();
  if(labourStockCustFilter) rows = rows.filter(r=>(r.customer||'').toLowerCase().includes(labourStockCustFilter.toLowerCase()));
  if(labourStockPartFilter) rows = rows.filter(r=>(r.finPartNo||'').toLowerCase().includes(labourStockPartFilter.toLowerCase()));
  // Date range applies to each DC's own DC Date — Pending DC Items (no DC yet, so no date) always
  // stay visible regardless of the range, since a live shortfall shouldn't be hidden by a filter.
  if(labourStockDateFrom || labourStockDateTo){
    rows = rows.filter(r=>{
      if(!r.dcNo) return true;
      const d = r.dcDate||'';
      if(labourStockDateFrom && (!d || d < labourStockDateFrom)) return false;
      if(labourStockDateTo && (!d || d > labourStockDateTo)) return false;
      return true;
    });
  }
  if(!rows.length) return '<div class="empty">No Job Work Stock to show for the current filters.</div>';
  // Grouped for readability: DC Received Stock (has a DC No.) first, Pending DC Items
  // (no DC yet) below — each under its own visual sub-header. Purely a display grouping;
  // does not change any underlying data or totals.
  const dcRows = rows.filter(r=>r.dcNo);
  const pendingRows = rows.filter(r=>!r.dcNo);
  const rowHtml = r=>`
        <tr data-cust="${esc(r.customerId||'')}" data-part="${esc(r.finPartNo||'')}" data-receipt="${esc(r.id||'')}">
          <td>${esc(custDispByName(r.customer))||'—'} <span class="csm-tag">🏷️ CSM</span></td>
          <td><b>${esc(r.finPartNo)||'—'}</b></td>
          <td class="rt-truncate" title="${esc(r.finPartName)}">${esc(r.finPartName)||'—'}</td>
          <td>${r.dcNo?`<b>${esc(r.dcNo)}</b>${r.dcDate?`<br><span class="hint" style="position:static;">${fmtDate(r.dcDate)}</span>`:''}`:'<span class="hint" style="position:static;">— no DC yet —</span>'}</td>
          <td style="color:var(--text-dim);">${r.scheduledQty}</td>
          <td style="color:var(--green);">${r.receivedQty||0}</td>
          <td style="color:var(--steel);">${r.issuedToProd||0}</td>
          <td style="${r.stockQty<0?'color:#b23b3b; font-weight:700;':'font-weight:700;'}">${r.stockQty}</td>
          <td>${esc(r.prodLocation)}</td>
          <td class="lst-issue-cell">
            ${r.stockQty>0.0001 ? `
              <div class="lst-issue-wrap">
                <input type="number" class="lsIssueQtyInput" placeholder="Qty" min="0" max="${r.stockQty}">
                <button class="btn small amber" onclick="issueLabourStockToProduction(this)" title="Issue to Production">→ Issue</button>
              </div>
            ` : `<span class="hint" style="position:static;">No stock</span>`}
          </td>
        </tr>`;
  const groupHeader = (label, count)=>`<tr class="lst-group-row"><td colspan="10">${label} <span style="color:var(--text-dim); text-transform:none; font-weight:600;">(${count})</span></td></tr>`;
  return `
    <div class="report-table-wrap" style="max-height:640px; overflow-y:auto;">
    <table class="report-table labour-stock-table">
      <colgroup>
        <col style="width:9%;"><col style="width:7%;"><col style="width:9%;"><col style="width:10%;">
        <col style="width:6%;"><col style="width:6%;"><col style="width:6%;"><col style="width:6%;">
        <col style="width:8%;"><col style="width:19%;">
      </colgroup>
      <thead><tr><th>Customer</th><th>Part No.</th><th>Part Name</th><th>DC No.</th><th>Sched.</th><th>Recd.</th><th>Issued</th><th>Stock</th><th>Location</th><th>Issue qty</th></tr></thead>
      <tbody>
        ${dcRows.length?groupHeader('📥 DC Received Stock', dcRows.length)+dcRows.map(rowHtml).join(''):''}
        ${pendingRows.length?groupHeader('⏳ Pending DC Items', pendingRows.length)+pendingRows.map(rowHtml).join(''):''}
      </tbody>
    </table>
    </div>`;
}
// Issues part of a Job Work Stock row straight into a Production job — the single missing link
// in Job Work Store Stock → Production → Final Inspection → Finished Goods → Sales Invoice. Mirrors
// the same pattern used by Bar/Forging "Issue to Production" (issueStoresQty): validates the
// quantity against what's actually available, creates the Production job with full Customer /
// Finished Part / Job Work PO traceability (via a Card No.), and the issued qty is immediately
// netted out of Job Work Stock because labourStockIssuedQty() reads straight off this same job.
function issueLabourStockToProduction(btn){
  if(!requireWorkingUnit()) return;
  const tr = btn.closest('tr');
  const customerId = tr.dataset.cust || '';
  const finPartNo = tr.dataset.part || '';
  const receiptId = tr.dataset.receipt || '';
  const qtyInput = tr.querySelector('.lsIssueQtyInput');
  const qty = parseFloat(qtyInput ? qtyInput.value : '') || 0;
  if(qty<=0){ toast('Enter a valid quantity to issue'); return; }
  // Row is matched by its specific DC Receipt id (each DC is its own separate schedule/entry),
  // falling back to the Customer+Part placeholder row when there's no DC yet.
  const row = labourStockRows().find(r=> receiptId ? r.id===receiptId : ((r.customerId||'')===customerId && (r.finPartNo||'')===finPartNo && !r.id));
  if(!row){ toast('Job Work Stock row not found'); return; }
  if(qty > row.stockQty + 0.0001){ toast('Issue Qty exceeds available Job Work Stock for this DC ('+row.stockQty+')'); return; }
  const po = DB.labourPO.find(x=>(x.customerId||'')===customerId && (x.finPartNo||'').trim().toLowerCase()===finPartNo.trim().toLowerCase());
  const cardNo = uid('cd'); // traceability card no. — follows this issued batch through Production → Final Insp. → Inventory → Sales / Job Work Invoice
  const item = [finPartNo, row.finPartName].filter(Boolean).join(' — ');
  DB.production.push({
    id:'pr'+Date.now(), unit:currentUnit, item, qty, issuedQty:qty, stage:'Issued', operator:'', startDate:today(), status:'Pending', cardNo,
    labourStockSource:true, labourPOId: po?po.id:null, labourPONo: po?po.poNo:'',
    customerId: customerId||null, customerName: row.customer||'',
    finPartNo, finPartName: row.finPartName||'',
    dcNo: row.dcNo||'', dcDate: row.dcDate||'', // traceable back to the exact DC Receipt this material was issued from
    goodQty:0, rejectionQty:0, rejectionRows:[], reworkQty:0, reworkRows:[], shortageQty:0, outputEntries:[]
  });
  saveDB();
  toast(row.stockQty-qty<=0.0001
    ? `Fully issued — Card ${cardNo} issued ${qty} of ${finPartNo}${row.dcNo?` (DC ${row.dcNo})`:''} to Production`
    : `Card ${cardNo} issued ${qty} of ${finPartNo}${row.dcNo?` (DC ${row.dcNo})`:''} to Production — balance ${Math.round((row.stockQty-qty)*10000)/10000}`);
  renderLabourStockTableOnly();
}
function setLabourStockSubTab(t){ labourStockSubTab = t; render(); }
function renderLabourStock(main){
  const rows = labourStockRows();
  const editRec = labourReceiptEditId ? DB.labourMaterialReceipt.find(r=>r.id===labourReceiptEditId) : null;
  if(!editRec) labourReceiptEditId = null; // stale id (e.g. deleted elsewhere) — fall back to add mode
  const tabsHtml = `
    <div class="subtabs" style="margin-bottom:14px;">
      <button class="${labourStockSubTab==='inward'?'active':''}" onclick="setLabourStockSubTab('inward')">📥 Customer Material Inward — DC Receipt</button>
      <button class="${labourStockSubTab==='stock'?'active':''}" onclick="setLabourStockSubTab('stock')">📦 Job Work Stock</button>
      <button class="${labourStockSubTab==='txn'?'active':''}" onclick="setLabourStockSubTab('txn')">📤 Issued to Production — Transactions</button>
    </div>`;
  if(labourStockSubTab==='inward'){
    main.innerHTML = tabsHtml + `
    <div class="panel">
      <div class="section-total">
        <h3>📥 Customer Material Inward — DC Receipt <span class="hint">Customer-Supplied Material — every entry stays linked to its DC No. for traceability</span></h3>
      </div>
      ${labourStockFilterBarHtml()}
      <div class="hint" style="margin:2px 0 12px;">${editRec
        ? `Editing DC <b>${esc(editRec.dcNo)}</b> — update the fields below and click Update Receipt, or Cancel to leave it unchanged.`
        : `Record it the moment a Customer hands over material against a Delivery Challan. The Quantity Received is added to Job Work Stock's Available Stock immediately, and the DC No./DC Date stay attached to that stock permanently — this material is tracked separately from company-owned Stores (Bar/Forging) stock throughout its life in Job Work Stock.`}</div>
      <div class="frow g4" style="align-items:end;">
        <div><label class="fl">Customer Name</label><select id="lmrCustomerSel" onchange="onLabourReceiptCustomerChange()">${custPOCustomerOptionsHtml(editRec?editRec.customerId:'')}</select></div>
        <div><label class="fl">Part Number / Part Name</label><select id="lmrPartSel" onchange="onLabourReceiptPartChange()">${labourReceiptPartOptionsHtml(editRec?editRec.customerId:'', editRec?editRec.finPartNo:'')}</select></div>
        <div id="lmrPoNoWrap"><label class="fl">PO Number <span class="hint" style="position:static; font-size:9.5px;">(auto, from Customer PO — editable if none found)</span></label>${labourReceiptPoNoFieldHtml(editRec?editRec.customerId:'', editRec?editRec.finPartNo:'', editRec?editRec.poNo:'')}</div>
        <div><label class="fl">DC Number</label><input id="lmrDcNo" placeholder="e.g. DC-1045" value="${editRec?esc(editRec.dcNo):''}"></div>
        <div><label class="fl">DC Date</label><input type="date" id="lmrDcDate" value="${esc(editRec?editRec.dcDate:today())}"></div>
        <div><label class="fl">Quantity Received</label><input type="number" id="lmrQty" min="0" placeholder="Qty" value="${editRec?esc(editRec.qtyReceived):''}"></div>
        <div><label class="fl">Remarks</label><input id="lmrRemarks" placeholder="optional" value="${editRec?esc(editRec.remarks):''}"></div>
        <div style="display:flex; gap:8px;">
          <button class="btn amber" onclick="saveLabourMaterialReceipt()">${editRec?'💾 Update Receipt':'📥 Save Receipt'}</button>
          ${editRec?`<button class="btn" onclick="cancelLabourReceiptEdit()">✕ Cancel</button>`:''}
        </div>
      </div>
      <div class="hint" style="margin:10px 0 6px;">Customer Material Inward — every DC logged, with its live Balance still in Job Work Stock. The search boxes above scope this ledger too.</div>
      <div id="labourReceiptLedgerBox">${labourReceiptLedgerHtml()}</div>
    </div>`;
    return;
  }
  if(labourStockSubTab==='stock'){
    main.innerHTML = tabsHtml + `
    <div class="panel">
      <div class="section-total">
        <h3>Job Work Stock <span class="hint">${rows.length} Customer × Part lines — live, auto-updating</span></h3>
      </div>
      ${labourStockFilterBarHtml()}
      <div class="hint" style="margin:2px 0 12px;">Stock Qty (Available) = total Quantity Received from the Customer against DC's, net of everything already Issued to Production from here — this is real, DC-traceable Customer-Supplied Material (as opposed to company-owned Stores Bar/Forging stock). Scheduled Qty is shown alongside for Planning reference only. Production Location is fetched from the Product Development mapping. Use "Issue to Production" to send a quantity for machining — it creates a Production job (linked to the Customer, Part and Job Work PO) and is deducted from Job Work Stock immediately; from there the job flows through Production → Final Inspection → Finished Goods → Sales / Job Work Invoice as normal.</div>
      <div id="labourStockTableBox">${labourStockTableHtml()}</div>
    </div>`;
    return;
  }
  // labourStockSubTab==='txn'
  main.innerHTML = tabsHtml + `
    <div class="panel">
      <div class="section-total"><h3>Issued to Production — Transactions</h3></div>
      ${labourStockFilterBarHtml()}
      <div class="hint" style="margin:6px 0 12px;">Job Work Stock's Stock Qty is a live balance, so a date range doesn't apply to it directly — instead it filters this ledger of every "Issue to Production" event, each with its own Date, Card No. and Job Work PO link.</div>
      <div id="labourStockTxnBox">${labourStockTxnHtml()}</div>
    </div>`;
}
// Renders just the grouped mapping cards for a given mapType + filtered row set — shared by the
// full renderBOMMapping() render and by bomListOnly-refresh on search input.
function bomGroupCardsHtml(rows, mapType){
  const isBar = mapType==='BAR';
  const partLabel = isBar ? 'Purchased (Bar)' : 'Forging';
  const partField = isBar ? 'purPartNo' : 'forgPartNo';
  const nameField = isBar ? 'purPartName' : 'forgPartName';
  const groups = {};
  rows.forEach(b=>{
    const key = (b.finPartNo||'').trim() || '—';
    if(!groups[key]) groups[key] = {finPartNo:b.finPartNo, finPartName:b.finPartName, customerName:b.customerName, rows:[]};
    groups[key].rows.push(b);
  });
  const groupList = Object.values(groups);
  return groupList.length ? groupList.map(g=>`
        <div class="bom-fp-card">
          <div class="bfc-title">${esc(g.finPartNo)||'—'} <span style="font-weight:400; color:var(--text-dim);">— ${esc(g.finPartName)||'—'}</span></div>
          <div class="bfc-sub">👤 ${esc(custDispByName(g.customerName))||'—'} · ${g.rows.length} linked part(s)</div>
          ${g.rows.map(r=>`
            <div class="bom-row-card">
              <div class="brc-grid">
                <div class="brc-box brc-blue">
                  <div class="brc-box-title">${partLabel} Part</div>
                  <div class="brc-kv"><span>Part No</span><b>${esc(r[partField])||'—'}</b></div>
                  <div class="brc-kv"><span>Part Name</span><b>${esc(r[nameField])||'—'}</b></div>
                </div>
                ${isBar?`
                <div class="brc-box brc-teal">
                  <div class="brc-box-title">Dimensions</div>
                  <div class="brc-kv"><span>Shape</span><b>${esc(r.shape)||'—'}</b></div>
                  <div class="brc-kv"><span>Size</span><b>${esc(r.size)||'—'}</b></div>
                  <div class="brc-kv"><span>Grade</span><b>${esc(r.grade)||'—'}</b></div>
                  <div class="brc-kv"><span>Density</span><b>${r.density?r.density+' g/cm³':'—'}</b></div>
                </div>
                <div class="brc-box brc-green">
                  <div class="brc-box-title">Production Calc</div>
                  <div class="brc-kv"><span>Cut Length - Prod (mm)</span><b>${r.prodCutLength||'—'}</b></div>
                  <div class="brc-kv"><span>Piece Weight - Prod (kg)</span><b>${r.prodPieceWeight||'0'}</b></div>
                </div>`:''}
                <div class="brc-box brc-purple">
                  <div class="brc-box-title">Production Info</div>
                  <div class="brc-kv"><span>Production Location</span><b>${esc(r.prodLocation)||'—'}</b></div>
                </div>
              </div>
              <div class="brc-actions">
                <button class="btn small ghost" onclick="editBOM('${r.id}')">Edit</button>
                <button class="btn danger" onclick="deleteRow('bom','${r.id}')">Del</button>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('') : `<div class="empty">No finished-part ${isBar?'bar':'forging'} mappings defined yet. Use the form above to link ${isBar?'Bar':'Forging'} parts to a Part Number.</div>`;
}
// Filters a mapType's DB.bom rows by Part No / Part Name (case-insensitive substring match).
function bomFilteredRows(mapType){
  const rows = DB.bom.filter(b=>b.mapType===mapType);
  const key = (bomPartFilter[mapType]||'').trim().toLowerCase();
  if(!key) return rows;
  return rows.filter(b=>(b.finPartNo||'').toLowerCase().includes(key) || (b.finPartName||'').toLowerCase().includes(key));
}
// Updates only the list box + counts as the user types, so the search input never loses focus.
function renderBOMListOnly(mapType){
  const rows = bomFilteredRows(mapType);
  const groupCount = new Set(rows.map(b=>(b.finPartNo||'').trim()||'—')).size;
  const box = document.getElementById('bomListBox_'+mapType); if(box) box.innerHTML = bomGroupCardsHtml(rows, mapType);
  const countEl = document.getElementById('bomListCount_'+mapType);
  if(countEl) countEl.textContent = `${groupCount} part(s), ${rows.length} mapping row(s)`;
  const clearWrap = document.getElementById('bomFilterClearWrap_'+mapType); if(clearWrap) clearWrap.style.display = bomPartFilter[mapType] ? 'inline-flex' : 'none';
}
function onBOMPartFilterChange(inputEl, mapType){
  bomPartFilter[mapType] = inputEl.value;
  renderBOMListOnly(mapType);
}
function clearBOMPartFilter(mapType){
  bomPartFilter[mapType] = '';
  const inp = document.getElementById('bomPartFilterInp_'+mapType); if(inp) inp.value = '';
  renderBOMListOnly(mapType);
}
function renderBOMMapping(main, mapType){
  const isBar = mapType==='BAR';
  const rows = bomFilteredRows(mapType);
  const editing = editingBOMId ? DB.bom.filter(b=>b.mapType===mapType).find(x=>x.id===editingBOMId) : null;
  const partLabel = isBar ? 'Purchased (Bar)' : 'Forging';
  const partField = isBar ? 'purPartNo' : 'forgPartNo';
  const nameField = isBar ? 'purPartName' : 'forgPartName';
  const custOpts = DB.customers.map(c=>`<option value="${c.id}" ${editing&&editing.customerId===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
  main.innerHTML = `
  <div class="bom-mapping-screen">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <div class="desc" style="color:var(--text-dim); font-size:13px;">Define which ${partLabel} Parts go into each Part Number</div>
      <button class="btn ghost" onclick="printBOM('${mapType}')">🖨 Print ${isBar?'Bar':'Forging'} Mapping List</button>
    </div>
    <div class="panel">
      <h3>${editing?'Edit':'New'} ${isBar?'Bar':'Forging'} Mapping</h3>
      ${bomFinPartDatalistHtml(editing?editing.customerId:'', editing?editing.customerName:'')}
      <div class="bom-form-grid">
      <div class="brc-box brc-blue" style="margin-bottom:0;">
        <div class="brc-box-title">Basic Info</div>
        <div class="frow g4">
          <div><label class="fl">Customer Name <span style="color:var(--danger,#e05252);">*</span></label>
            ${customerPickerHtml('bomCustSelDD','bomCustSel', editing?editing.customerId:'', !!(editing&&!editing.customerId), `setBOMCustChange('${mapType}')`)}
            <input id="bomCustName" placeholder="Customer name" value="${editing?esc(editing.customerName):''}" style="margin-top:6px; display:${editing || DB.customers.length===0 ?'block':'none'};" oninput="updateBOMFinPartDatalist('${mapType}')">
          </div>
          <div><label class="fl">Part No <span class="hint" style="position:static; font-size:9.5px;">(from Quotation)</span></label>
            <select id="bomFinNoQuoteSel" onchange="fillBOMFinPartFromQuote(this)">
              <option value="">— pick part from quotation —</option>${quotationFinPartPickerOptionsHtml(editing?editing.customerId:'', editing?editing.customerName:'')}
              <option value="__other__">Other (type manually)</option>
            </select>
            <input id="bomFinNo" list="bomFinPartList" style="margin-top:6px;" placeholder="e.g. FP-1023" value="${editing?esc(editing.finPartNo):''}"></div>
          <div><label class="fl">Part Name</label><input id="bomFinName" placeholder="e.g. Steering Knuckle" value="${editing?esc(editing.finPartName):''}"></div>
          <div><label class="fl">Production Location</label>${prodLocationPickerHtml('bomProdLocSel','bomProdLoc', editing?editing.prodLocation:'')}</div>
        </div>
      </div>
      <div class="brc-box brc-teal" style="margin-bottom:0;">
        <div class="brc-box-title">${partLabel} Part</div>
        <div class="frow g4" style="margin-bottom:0;">
          <div><label class="fl">${partLabel} Part <span class="hint" style="position:static; font-size:9.5px;">(from Item Master — ${isBar?'Bar':'Forging'})</span></label>
            <select id="bomPartSel" onchange="onBOMItemChange('${mapType}')" style="margin-bottom:6px;">
              <option value="">— pick ${isBar?'bar':'forging'} part —</option>${itemMasterOptionsHtmlByType(mapType)}
              <option value="__other__">Other (type manually)</option>
            </select>
            <input id="bomPartNo" placeholder="${partLabel} Part No" value="${editing?esc(editing[partField]):''}"></div>
          <div><label class="fl">${partLabel} Part Name</label><input id="bomPartName" placeholder="${partLabel} Part Name" value="${editing?esc(editing[nameField]):''}"></div>
        </div>
      </div>
      ${isBar ? `
      <!-- Material Name / Shape / Size / Grade / Density are no longer a separate data-entry
           step here — they're pulled automatically the moment a Purchased (Bar) Part is picked
           above (that Item Master record already carries this spec), and only feed the
           Production Calc weight math below. -->
      <input type="hidden" id="bomMaterial" value="${editing?esc(editing.material):''}">
      <input type="hidden" id="bomShape" value="${editing?esc(editing.shape):''}">
      <input type="hidden" id="bomSize" value="${editing?esc(editing.size):''}">
      <input type="hidden" id="bomGrade" value="${editing?esc(editing.grade):''}">
      <input type="hidden" id="bomDensity" value="${editing&&editing.density?editing.density:defaultDensityForMaterial(editing?editing.material:'Steel')}">
      <div class="brc-box brc-green" style="margin-bottom:0;">
        <div class="brc-box-title">Production Calc</div>
        <div class="frow g4" style="margin-bottom:0;">
        <div><label class="fl">Cut Length - Production (mm) <span class="hint" style="position:static; font-size:9.5px;">(feeds Stores unit weight)</span></label><input id="bomProdCutLength" type="number" step="any" placeholder="e.g. 125" value="${editing?editing.prodCutLength||'':''}" oninput="recalcBarPieceWeight()"></div>
        <div><label class="fl">Piece Weight - Production (kg) <span class="hint" style="position:static; font-size:9.5px;">(auto-calculated, used by Stores)</span></label><input id="bomProdPieceWeight" type="text" value="${editing?editing.prodPieceWeight||'0':'0'}" disabled></div>
      </div>
      </div>
      ` : ''}
      </div>
      <div class="rowactions" style="justify-content:flex-start;">
        <button class="btn amber" onclick="${editing?'saveEditBOM(\''+mapType+'\')':'addBOM(\''+mapType+'\')'}">${editing?'💾 Save Changes':'💾 Save Mapping'}</button>
        ${editing?`<button class="btn ghost" onclick="cancelEditBOM()">Cancel</button>`:''}
      </div>
    </div>

    <div class="panel">
      <div class="section-total">
        <h3>Part → ${partLabel} Mapping <span class="hint" id="bomListCount_${mapType}">${new Set(rows.map(b=>(b.finPartNo||'').trim()||'—')).size} part(s), ${rows.length} mapping row(s)</span></h3>
        <input id="bomPartFilterInp_${mapType}" value="${esc(bomPartFilter[mapType]||'')}" placeholder="🔍 Search by Part No" oninput="onBOMPartFilterChange(this,'${mapType}')" style="max-width:200px;">
        <span id="bomFilterClearWrap_${mapType}" style="display:${bomPartFilter[mapType]?'inline-flex':'none'};"><button class="btn ghost small" onclick="clearBOMPartFilter('${mapType}')">✕ Clear</button></span>
      </div>
      <div id="bomListBox_${mapType}">${bomGroupCardsHtml(rows, mapType)}</div>
    </div>
  </div>
  `;
}
function setBOMCustChange(mapType){
  const sel = document.getElementById('bomCustSel');
  const manual = document.getElementById('bomCustName');
  if(sel.value==='__other__'){ manual.style.display='block'; manual.value=''; manual.focus(); }
  else if(sel.value===''){ manual.style.display = DB.customers.length? 'none':'block'; }
  else{
    const c = DB.customers.find(x=>x.id===sel.value);
    manual.style.display='none'; manual.value = c?c.name:'';
  }
  updateBOMFinPartDatalist(mapType);
}
function updateBOMFinPartDatalist(mapType){
  const sel = document.getElementById('bomCustSel');
  const manual = document.getElementById('bomCustName');
  const custId = sel && sel.value && sel.value!=='__other__' ? sel.value : '';
  const custName = manual ? manual.value : '';
  replaceFinPartDatalist(custId, custName); // show all known Part Nos regardless of Bar/Forging type
  refreshBOMFinPartQuoteSelect(custId, custName);
}
function refreshBOMFinPartQuoteSelect(custId, custName){
  const sel = document.getElementById('bomFinNoQuoteSel');
  if(!sel) return;
  sel.innerHTML = `<option value="">— pick part from quotation —</option>${quotationFinPartPickerOptionsHtml(custId, custName)}<option value="__other__">Other (type manually)</option>`;
}
function onBOMItemChange(mapType){
  const sel = document.getElementById('bomPartSel');
  const noEl = document.getElementById('bomPartNo');
  const nameEl = document.getElementById('bomPartName');
  if(sel.value==='__other__'){ noEl.value=''; nameEl.value=''; noEl.focus(); return; }
  if(sel.value===''){ return; }
  const opt = sel.options[sel.selectedIndex];
  noEl.value = opt.dataset.code || '';
  nameEl.value = opt.dataset.name || '';
  if(mapType==='BAR'){
    const matEl = document.getElementById('bomMaterial');
    const shapeEl = document.getElementById('bomShape');
    const sizeEl = document.getElementById('bomSize');
    const gradeEl = document.getElementById('bomGrade');
    const densEl = document.getElementById('bomDensity');
    if(matEl && opt.dataset.material) matEl.value = opt.dataset.material;
    if(shapeEl && opt.dataset.shape) shapeEl.value = opt.dataset.shape;
    if(sizeEl) sizeEl.value = opt.dataset.size || '';
    if(gradeEl) gradeEl.value = opt.dataset.grade || '';
    if(densEl) densEl.value = opt.dataset.density || defaultDensityForMaterial(matEl?matEl.value:'Steel');
    recalcBarPieceWeight();
  }
}
function recalcBarPieceWeight(){
  const shapeEl = document.getElementById('bomShape');
  const sizeEl = document.getElementById('bomSize');
  const densEl = document.getElementById('bomDensity');
  const prodCutEl = document.getElementById('bomProdCutLength');
  const prodOutEl = document.getElementById('bomProdPieceWeight');
  if(!shapeEl || !sizeEl || !densEl) return;
  if(prodCutEl && prodOutEl){
    const pw = calcBarPieceWeightKg(shapeEl.value, sizeEl.value, densEl.value, prodCutEl.value);
    prodOutEl.value = pw || 0;
  }
}
function readBOMForm(mapType){
  const custSel = document.getElementById('bomCustSel').value;
  const customerName = document.getElementById('bomCustName').value.trim();
  const finPartNo = document.getElementById('bomFinNo').value.trim();
  const finPartName = document.getElementById('bomFinName').value.trim();
  if(!customerName){ toast('Customer Name is required'); return null; }
  if(!finPartNo){ toast('Part No is required'); return null; }
  if(!finPartName){ toast('Part Name is required'); return null; }
  const partField = mapType==='BAR' ? 'purPartNo' : 'forgPartNo';
  const nameField = mapType==='BAR' ? 'purPartName' : 'forgPartName';
  const partNo = document.getElementById('bomPartNo').value.trim();
  const itemMatch = DB.items.find(it=>it.type===mapType && (it.code||'').trim().toLowerCase()===partNo.toLowerCase());
  const data = {
    customerId: (custSel && custSel!=='__other__') ? custSel : null,
    customerName, finPartNo, finPartName, mapType,
    prodLocation:document.getElementById('bomProdLoc').value.trim(),
    uom:(itemMatch&&itemMatch.uom)||''
  };
  data[partField] = partNo;
  data[nameField] = document.getElementById('bomPartName').value.trim();
  if(mapType==='BAR'){
    data.material = document.getElementById('bomMaterial').value;
    data.shape = document.getElementById('bomShape').value;
    data.size = document.getElementById('bomSize').value.trim();
    data.grade = document.getElementById('bomGrade').value.trim();
    data.density = parseFloat(document.getElementById('bomDensity').value) || defaultDensityForMaterial(data.material);
    // Cut Length / Piece Weight for Quotation now live on the Quotation line item itself, not
    // here — keep any previously-saved values so old records/print-outs don't lose them, but
    // this form no longer collects or overwrites them.
    const prevBOM = editingBOMId ? DB.bom.find(x=>x.id===editingBOMId) : null;
    data.cutLength = prevBOM ? (prevBOM.cutLength||0) : 0;
    data.pieceWeight = prevBOM ? (prevBOM.pieceWeight||0) : 0;
    data.prodCutLength = parseFloat(document.getElementById('bomProdCutLength').value) || 0; // Production cut length
    data.prodPieceWeight = calcBarPieceWeightKg(data.shape, data.size, data.density, data.prodCutLength); // Production/Stores unit weight
    data.normWeight = data.prodPieceWeight || data.pieceWeight; // Stores "norm weight" auto-fill now uses Production Piece Weight
  }
  return data;
}
function addBOM(mapType){
  if(!requireAdminOffice()) return;
  const data = readBOMForm(mapType);
  if(!data) return;
  DB.bom.push({id:'bm'+Date.now(), ...data});
  saveDB(); toast((mapType==='BAR'?'Bar':'Forging')+' mapping saved'); render();
}
function editBOM(id){ editingBOMId = id; render(); }
function cancelEditBOM(){ editingBOMId = null; render(); }
function saveEditBOM(mapType){
  if(!requireAdminOffice()) return;
  const b = DB.bom.find(x=>x.id===editingBOMId);
  if(!b) return;
  const data = readBOMForm(mapType);
  if(!data) return;
  Object.assign(b, data);
  editingBOMId = null;
  saveDB(); toast('Mapping updated'); render();
}
function printBOM(mapType){
  const isBar = mapType==='BAR';
  const rows = DB.bom.filter(b=>b.mapType===mapType);
  const partField = isBar ? 'purPartNo' : 'forgPartNo';
  const nameField = isBar ? 'purPartName' : 'forgPartName';
  const headers = ['Customer Name','Part No','Part Name',(isBar?'Purchased':'Forging')+' Part No',(isBar?'Purchased':'Forging')+' Part Name']
    .concat(isBar?['Shape','Size','Grade','Density (g/cm³)','Cut Length (mm)','Piece Weight (kg)','Cut Length - Prod (mm)','Piece Weight - Prod (kg)']:[])
    .concat(['Production Location','UOM']);
  const tableRows = rows.map(r=>[esc(r.customerName)||'—', esc(r.finPartNo)||'—', esc(r.finPartName)||'—', esc(r[partField])||'—', esc(r[nameField])||'—']
    .concat(isBar?[esc(r.shape)||'—', esc(r.size)||'—', esc(r.grade)||'—', r.density||'—', r.cutLength||'—', r.pieceWeight||'0', r.prodCutLength||'—', r.prodPieceWeight||'0']:[])
    .concat([esc(r.prodLocation)||'—', esc(r.uom)||'—']));
  printReport((isBar?'Bar':'Forging')+' Part Mapping', headers, tableRows, {barRight:`Total Mapping Rows: ${rows.length}`});
}
function addStore(type){
  if(!requireWorkingUnit()) return;
  const isLabour = type==='labour';
  const partNoEl = document.getElementById(isLabour?'lpPartNo':'ppPartNo');
  const partNameEl = document.getElementById(isLabour?'lpPartName':'ppPartName');
  const qtyEl = document.getElementById(isLabour?'lpQty':'ppQty');
  const locEl = document.getElementById(isLabour?'lpLoc':'ppLoc');
  const sourceEl = document.getElementById(isLabour?'lpSource':'ppSource');
  const partNo=partNoEl.value.trim();
  const partName=partNameEl.value.trim();
  const qty=parseFloat(qtyEl.value)||0;
  let customerId=null, customerName='';
  if(isLabour){
    const cust = readStoresCustomer('lpCustSel','lpCustName');
    customerId = cust.customerId; customerName = cust.customerName;
    if(!customerName){ toast('Customer Name is required'); return; }
    if(!partNo){ toast('Select a Part No from the list'); return; }
    if(!(qty>0)){ toast('Qty is required'); return; }
    if(!document.getElementById('lpUom').value.trim()){ toast('UOM is required'); return; }
  }
  if(!partName){ toast('Part Name is required'); return; }
  const item = [partNo,partName].filter(Boolean).join(' — ');
  const entry = {id:'s'+Date.now(), unit:currentUnit, item, partNo, partName, qty, issuedQty:0, history:[], location:locEl.value.trim(), source:sourceEl.value.trim()||'Manual'};
  if(isLabour){
    entry.customerId = customerId; entry.customerName = customerName;
    entry.uom = document.getElementById('lpUom').value.trim();
    const plEl = document.getElementById('lpProdLoc');
    entry.prodLocation = plEl ? plEl.value.trim() : '';
  }
  if(!isLabour){
    const uwEl = document.getElementById('ppUnitWt');
    const unitWeight = parseFloat(uwEl ? uwEl.value : '') || 0;
    if(unitWeight>0) entry.unitWeight = unitWeight;
  }
  if(isLabour && stLQLink){
    entry.labourQuotationId = stLQLink.quotationId;
    entry.quoteNo = stLQLink.quoteNo;
    entry.partNo = stLQLink.partNo;
    entry.partName = stLQLink.partName;
  }
  DB.stores.push(entry);
  stLQLink = null;
  saveDB(); toast((isLabour?'Job Work':'Purchase')+' part added to stock'); render();
}
/* ================= JOB CARD TRACKING / PART ROUTING / SUBCONTRACT — shared helpers ================= */
function getPartRouting(partNo){
  if(!partNo) return null;
  const key = partNo.trim().toLowerCase();
  return DB.partRouting.find(r=>(r.partNo||'').trim().toLowerCase()===key) || null;
}
// Fallback sequence used for any Part Number that has no explicit routing saved yet, so existing
// single-stage data keeps behaving exactly as before (Stores → Production → Final Inspection → Finished Goods).
function defaultRoutingStages(){ return ['Stores','Production','Stores','Final Inspection','Inventory']; }
// Returns the next actionable stage (skipping plain 'Stores' holding points, which are never a
// destination in themselves) at or after position `fromIdx` in the Part's saved routing sequence.
function nextActionableStage(partNo, fromIdx){
  const r = getPartRouting(partNo);
  const stages = (r && r.stages && r.stages.length) ? r.stages : defaultRoutingStages();
  for(let i=Math.max(fromIdx,0); i<stages.length; i++){
    if(stages[i] && stages[i]!=='Stores') return {stage:stages[i], index:i, isLast:i>=stages.length-1};
  }
  return {stage:'Final Inspection', index:stages.length, isLast:true};
}
// Append-only Job Card ledger entry — every stage movement of every Part Number is logged here and
// never overwritten, giving full historical traceability from Stores through to Inventory.
function logJobCard(o){
  DB.jobCards.push(Object.assign({
    id:'jc'+Date.now()+'_'+Math.floor(Math.random()*10000), unit:currentUnit,
    issueDate: today(), completionDate:'', status:'Open', issueType:'', subcontractorName:'', operation:'', remarks:''
  }, o));
}
function markJobCardComplete(refType, refId, completionDate){
  const j = DB.jobCards.slice().reverse().find(x=>x.refType===refType && x.refId===refId && x.status==='Open');
  if(j){ j.status='Completed'; j.completionDate = completionDate||today(); }
}
function jobCardHistoryForPart(partNo){
  const key=(partNo||'').trim().toLowerCase();
  return DB.jobCards.filter(j=>(j.partNo||'').trim().toLowerCase()===key)
    .sort((a,b)=>(a.issueDate||'').localeCompare(b.issueDate||'') || (''+a.id).localeCompare(''+b.id));
}
// Current stage / status summary for a Part Number, derived from its Job Card ledger.
function partCurrentStatus(partNo){
  const hist = jobCardHistoryForPart(partNo);
  if(!hist.length) return null;
  const openRow = hist.slice().reverse().find(j=>j.status==='Open');
  const last = hist[hist.length-1];
  return {
    current: openRow ? openRow.stage : (last.stage==='Inventory' ? 'Finished Goods' : last.stage),
    previous: openRow ? (openRow.prevStage||'—') : (last.prevStage||'—'),
    next: openRow ? (openRow.nextStage||'—') : (last.stage==='Inventory' ? '— Completed —' : (last.nextStage||'—')),
    completed: !openRow, history: hist
  };
}
// Deposits a completed quantity back into Stores as Work-in-Progress, tags it with the Part's
// current/next stage (per its saved routing, or manual override), and logs the Job Card movement.
// This is the "material remains in Stores until issued to the next stage" rule (Req. #3/#4).
function returnQtyToStoresWIP(o){
  // o.routeIndex is the index of the stage that JUST finished (e.g. Production); search for the
  // next actionable stage strictly after it.
  const searchFrom = (o.routeIndex||0)+1;
  const nx = o.nextStageOverride ? {stage:o.nextStageOverride, index:searchFrom} : nextActionableStage(o.partNo, searchFrom);
  const entry = {
    id:'s'+Date.now()+'_'+Math.floor(Math.random()*10000), unit:currentUnit,
    item:[o.partNo,o.partName].filter(Boolean).join(' — '), partNo:o.partNo||'', partName:o.partName||'',
    qty:o.qty||0, issuedQty:0, history:[], location:'WIP', source:o.fromStage||'Production',
    wip:true, cardNo:o.cardNo||'', currentStage:'Stores', prevStage:o.fromStage||'', nextStage:nx.stage, routeIndex:nx.index,
    customerId:o.customerId||null, customerName:o.customerName||'', createdDate:today(),
    // Carried through so Finished Goods valuation (via the eventual Final Inspection record) keeps
    // the batch's Sales Quotation Rate instead of losing it along the way.
    quotationId:o.quotationId||null, quoteNo:o.quoteNo||'', quoteRate:o.quoteRate||0
  };
  DB.stores.push(entry);
  logJobCard({cardNo:o.cardNo, partNo:o.partNo, partName:o.partName, qty:o.qty, prevStage:o.fromStage, stage:'Stores', nextStage:nx.stage,
    issueType:'', refType:'stores', refId:entry.id, status:'Open', remarks:`Returned to Stores from ${o.fromStage}; awaiting issue to ${nx.stage}`});
  return entry;
}
// Single source of truth for issuing Bar/Forging stock to Production — validates available
// balance, deducts it, tracks cumulative Issued Qty (for the Opening/Received/Issued/Closing
// view), logs traceable history, and creates the Production record. Used by the Issue Material
// panel on both Bar Stock and Forging Stock screens.
function issueStoresQty(bucket, stId, qty, finPart){
  if(!requireWorkingUnit()) return false;
  const s = DB[bucket].find(x=>x.id===stId);
  if(!s){ toast('Stock item not found'); return false; }
  if(qty<=0){ toast('Enter a valid quantity to issue'); return false; }
  if(qty > (s.qty||0)){ toast('Issue Qty exceeds available stock ('+s.qty+(s.uom?' '+s.uom:'')+')'); return false; }
  const issueType = (finPart && finPart.issueType==='Subcontract') ? 'Subcontract' : 'In-House';
  if(issueType==='Subcontract' && (!finPart.poId || !finPart.subcontractorName || !finPart.operation)){
    toast('Select a Subcontractor PO and enter the Operation/Stage for a Subcontract issue'); return false;
  }
  if(issueType==='Subcontract' && !finPart.dcNo){
    toast('Enter the Delivery Challan No. for this Subcontract issue'); return false;
  }
  let scPO = null;
  if(issueType==='Subcontract'){
    scPO = DB.subcontractPOs.find(x=>x.id===finPart.poId);
    if(!scPO){ toast('Selected Subcontractor PO not found'); return false; }
  }
  // The routing position this job/subcontract will occupy: an explicit stageIndex (set when
  // re-issuing WIP material that already has a computed Next Stage) or 1 (the first actionable
  // stage — Production — right after Stores) for a fresh raw-material issue.
  const jobStageIndex = (finPart && finPart.stageIndex!==undefined) ? finPart.stageIndex : 1;
  const cardNo = uid('cd'); // auto-generated traceability card no. — follows this issued batch through Production/Subcontract → Final Insp. → Inventory → Sales
  const isWeightBased = !!s.unitWeight;
  // Prefer the exact Nos the user actually typed (passed through as finPart.nosQty) over
  // re-deriving it from the auto-calculated weight — dividing that weight back by the raw
  // stock's own unit weight can disagree by a hair with the part-specific piece weight used
  // to compute the weight in the first place, which was wrongly rejecting exact full-balance
  // issues (e.g. "130 available" vs. a re-derived 130.00x Nos).
  const nosQty = isWeightBased ? ((finPart && finPart.nosQty!=null) ? finPart.nosQty : Math.floor((qty/s.unitWeight)*1000)/1000) : qty;
  if(issueType==='Subcontract'){
    const bal = subcontractPOBalance(scPO);
    if(nosQty > bal + 0.0001){ toast(`Issue Qty exceeds the Subcontractor PO balance (${bal} available on ${scPO.poNo})`); return false; }
  }
  const item = [s.partNo,s.partName].filter(Boolean).join(' — ');
  const finPartNo = finPart ? (finPart.finPartNo||'') : '';
  const finPartName = finPart ? (finPart.finPartName||'') : '';
  const trackPartNo = finPartNo || s.partNo || '';
  const trackPartName = finPartName || s.partName || '';
  s.qty = Math.round(((s.qty||0) - qty) * 10000) / 10000;
  s.issuedQty = Math.round(((s.issuedQty||0) + qty) * 10000) / 10000;
  // Material sitting in Stores as WIP (bucket 'stores', tagged wip:true) is now moving onward —
  // close its ledger row so Part Tracking always shows exactly one Open stage at a time.
  if(bucket==='stores' && s.wip) markJobCardComplete('stores', s.id, today());
  if(issueType==='Subcontract'){
    DB.counters.sc = (DB.counters.sc||0)+1;
    DB.counters.jtn = (DB.counters.jtn||0)+1;
    const subId = 'sc'+Date.now();
    const rate = scPO.rate||0;
    const jobTrackingNo = 'JTN-'+String(DB.counters.jtn).padStart(5,'0');
    DB.subcontract.push({
      id:subId, jobNo:'SC-'+String(DB.counters.sc).padStart(4,'0'), jobTrackingNo, unit:currentUnit, cardNo,
      partNo:trackPartNo, partName:trackPartName, qty:nosQty, operation:finPart.operation||'',
      subcontractorId:finPart.subcontractorId||'', subcontractorName:finPart.subcontractorName||'',
      poId:scPO.id, poNo:scPO.poNo, rate, amount:Math.round(nosQty*rate*100)/100,
      issueDate:today(), dueDate:finPart.dueDate||'', status:'Issued', receivedQty:0, receivedDate:'',
      dcNo:finPart.dcNo||'', dcDate:finPart.dcDate||today(),
      remarks:'', storeId:s.id, storeBucket:bucket, routeIndex:jobStageIndex
    });
    pushStockHistory(s, 'issue', qty, `Card ${cardNo} — DC ${finPart.dcNo||'—'} — issued to Subcontractor "${finPart.subcontractorName}" (${finPart.operation}) against PO ${scPO.poNo} — Job Tracking No. ${jobTrackingNo}${finPartNo?` for Part ${finPartNo}`:''}`);
    logJobCard({cardNo, partNo:trackPartNo, partName:trackPartName, qty:nosQty, prevStage:'Stores', stage:'Subcontract', nextStage:'Stores',
      issueType:'Subcontract', subcontractorName:finPart.subcontractorName||'', operation:finPart.operation||'', dcNo:finPart.dcNo||'', refType:'subcontract', refId:subId, status:'Open'});
    saveDB();
    toast(`Card ${cardNo} — DC ${finPart.dcNo||'—'} — issued (${nosQty}) to Subcontractor "${finPart.subcontractorName}" — Job Tracking No. ${jobTrackingNo} — Rate ₹${rate.toFixed(2)} — see Job Card Tracking → Subcontract Jobs`);
    render();
    return true;
  }
  const prId = 'pr'+Date.now();
  DB.production.push({
    id:prId, unit:currentUnit, item, qty:nosQty, issuedQty:nosQty, stage:'Issued', operator:'', startDate:today(), status:'Pending',
    storeId:s.id, storeBucket:bucket, partNo:trackPartNo, partName:trackPartName, cardNo,
    weightIssued:isWeightBased?qty:0, unitWeight:s.unitWeight||0,
    customerId:s.customerId||null, customerName:s.customerName||'',
    finPartNo, finPartName, issueType:'In-House', routeIndex:jobStageIndex,
    goodQty:0, rejectionQty:0, rejectionRows:[], reworkQty:0, reworkRows:[], shortageQty:0, outputEntries:[]
  });
  pushStockHistory(s, 'issue', qty, `Card ${cardNo} — issued to Production${finPartNo?` for Part ${finPartNo}`:''}${isWeightBased?` (≈${nosQty} Nos @ ${s.unitWeight} Kg/Pc)`:''}`);
  logJobCard({cardNo, partNo:trackPartNo, partName:trackPartName, qty:nosQty, prevStage:'Stores', stage:'Production', nextStage:'Stores',
    issueType:'In-House', refType:'production', refId:prId, status:'Open'});
  saveDB();
  toast(isWeightBased
    ? (s.qty<=0 ? `Fully consumed — Card ${cardNo} issued ${qty} Kg (≈${nosQty} Nos) to Production` : `Card ${cardNo} issued ${qty} Kg (≈${nosQty} Nos) to Production — balance ${s.qty} Kg`)
    : (s.qty<=0 ? `Fully consumed — Card ${cardNo} issued (${qty}) to Production` : `Card ${cardNo} issued (${qty}) to Production — balance ${s.qty}`));
  render();
  return true;
}
/* ---- Customer-first Issue Material panel (Bar Stock) ---- */
function barIssueCustOptionsHtml(){
  const list = DB.storesBar.filter(x=>reportUnitMatch(x.unit) && (x.qty||0)>0);
  const seen = {}; const opts=[];
  list.forEach(s=>{
    const key = s.customerId || ('name:'+(s.customerName||'').trim().toLowerCase());
    if(!key || seen[key]) return; seen[key]=1;
    opts.push(`<option value="${esc(key)}">${esc(custDispByName(s.customerName))||'— Unassigned —'}</option>`);
  });
  return opts.join('');
}
function barIssuePartOptionsForCust(custKey){
  return DB.storesBar.filter(x=>reportUnitMatch(x.unit) && (x.qty||0)>0 && (x.customerId||('name:'+(x.customerName||'').trim().toLowerCase()))===custKey);
}
function barIssueFinPartOptionsHtml(s){
  if(!s) return '<option value="">— select part first —</option>';
  const customerId = s.customerId || null;
  // Prefer BOM mappings for this exact raw material part no (and customer, if known)
  let matches = DB.bom.filter(b=>b.mapType==='BAR' && (b.purPartNo||'').trim().toLowerCase()===(s.partNo||'').trim().toLowerCase() && (!customerId||b.customerId===customerId));
  if(!matches.length){
    // fall back to any finished part mapped for this customer
    matches = DB.bom.filter(b=>b.mapType==='BAR' && (!customerId||b.customerId===customerId));
  }
  const seen={}; const opts=[];
  matches.forEach(b=>{
    const key=(b.finPartNo||'').trim();
    if(key && !seen[key]){ seen[key]=1; opts.push({no:key,name:b.finPartName||'',pw:parseFloat(b.prodPieceWeight)||parseFloat(b.pieceWeight)||0}); }
  });
  opts.sort((a,b)=>a.no.localeCompare(b.no));
  if(!opts.length) return '<option value="">— no part mapping found —</option>';
  return '<option value="">— select part —</option>' + opts.map(o=>`<option value="${esc(o.no)}" data-name="${esc(o.name)}" data-pw="${o.pw}" ${s.finPartNo===o.no?'selected':''}>${esc(o.no)}</option>`).join('');
}
// Returns the correct Kg/Pc weight to use for the currently selected Part Number (field 3) —
// each finished Part Number can have its own Piece Weight - Production (from Bar Mapping/BOM),
// which may differ from another part cut off the very same raw material bar. Falls back to the
// raw stock item's own unitWeight only if the selected part has no specific weight recorded.
function barIssueActiveUnitWeight(s){
  const finSel = document.getElementById('barIssueFinPartSel');
  const opt = finSel && finSel.selectedOptions[0];
  const pw = opt ? parseFloat(opt.getAttribute('data-pw')) : NaN;
  if(pw>0) return pw;
  return (s && s.unitWeight) || 0;
}
function onBarIssueCustChange(){
  const key = document.getElementById('barIssueCustSel').value;
  const partSel = document.getElementById('barIssuePartSel');
  const finSel = document.getElementById('barIssueFinPartSel');
  const avail = document.getElementById('barIssueAvail');
  const qtyEl = document.getElementById('barIssueQty');
  document.getElementById('barIssueQtyLbl').textContent = '4. Issue Qty';
  document.getElementById('barIssueWeightRow').style.display = 'none';
  document.getElementById('barIssueCalcRow').innerHTML = '';
  finSel.innerHTML = '<option value="">— select part first —</option>';
  if(!key){ partSel.innerHTML = '<option value="">— select customer first —</option>'; avail.value=''; qtyEl.value=''; return; }
  const list = barIssuePartOptionsForCust(key);
  partSel.innerHTML = '<option value="">— select part —</option>' + list.map(s=>`<option value="${s.id}">${esc(s.partNo)} — ${esc(s.partName)} (avail. ${s.qty}${s.uom?' '+esc(s.uom):''})</option>`).join('');
  avail.value=''; qtyEl.value='';
  document.getElementById('barIssueCalcRow').innerHTML='';
}
function onBarIssuePartChange(){
  const id = document.getElementById('barIssuePartSel').value;
  const s = DB.storesBar.find(x=>x.id===id);
  const availNos = s && s.unitWeight ? Math.floor((s.qty/s.unitWeight)*1000)/1000 : null;
  document.getElementById('barIssueAvail').value = s ? (availNos!==null ? `${availNos} Nos (${s.qty} ${s.uom||'Kg'})` : (s.qty+(s.uom?' '+s.uom:''))) : '';
  document.getElementById('barIssueFinPartSel').innerHTML = barIssueFinPartOptionsHtml(s);
  document.getElementById('barIssueQty').value = '';
  onBarIssueFinPartChange();
}
// Fires when the Part Number (field 3) changes, since each finished part can carry its own
// Piece Weight - Production even though it's cut from the same raw material bar stock item.
function onBarIssueFinPartChange(){
  const id = document.getElementById('barIssuePartSel').value;
  const s = DB.storesBar.find(x=>x.id===id);
  const lbl = document.getElementById('barIssueQtyLbl');
  const weightRow = document.getElementById('barIssueWeightRow');
  const weightCalc = document.getElementById('barIssueWeightCalc');
  const uw = barIssueActiveUnitWeight(s);
  if(s && uw){
    lbl.textContent = '4. Issue Qty (Nos)';
    weightRow.style.display = '';
    document.getElementById('barIssueCalcRow').innerHTML = `<div class="hint" style="position:static; margin-top:6px;">Unit weight ${uw} Kg/Pc — enter quantity in Nos, the issue weight is calculated automatically.</div>`;
  } else {
    lbl.textContent = '4. Issue Qty';
    weightRow.style.display = 'none';
    document.getElementById('barIssueCalcRow').innerHTML = '';
  }
  calcBarIssueQty();
}
function calcBarIssueQty(){
  const id = document.getElementById('barIssuePartSel').value;
  const s = DB.storesBar.find(x=>x.id===id);
  const uw = barIssueActiveUnitWeight(s);
  if(!s || !uw){ return; }
  const nos = parseFloat(document.getElementById('barIssueQty').value)||0;
  const weight = Math.round(nos*uw*10000)/10000;
  document.getElementById('barIssueWeightCalc').value = weight;
}
function confirmBarIssue(){
  const id = document.getElementById('barIssuePartSel').value;
  if(!document.getElementById('barIssueCustSel').value){ toast('Select a Customer'); return; }
  if(!id){ toast('Select a Part Number'); return; }
  const finSel = document.getElementById('barIssueFinPartSel');
  const finPartNo = finSel.value;
  if(!finPartNo){ toast('Part Number is required'); return; }
  const finPartName = (finSel.selectedOptions[0]||{}).dataset ? finSel.selectedOptions[0].dataset.name : '';
  const s = DB.storesBar.find(x=>x.id===id);
  if(!s){ toast('Stock item not found'); return; }
  const uw = barIssueActiveUnitWeight(s);
  const entered = parseFloat(document.getElementById('barIssueQty').value)||0;
  // For weight-based bar stock the user enters Nos only — the issue weight (Kg, the unit stock
  // is actually tracked in) is calculated automatically, using the Piece Weight specific to the
  // selected Part Number (field 3), and used for the deduction/validation.
  const qty = uw ? Math.round(entered*uw*10000)/10000 : entered;
  issueStoresQty('storesBar', id, qty, Object.assign({finPartNo, finPartName, nosQty: entered}, readIssueTypeFields('bar')));
}
/* ---- Customer-first Issue Material panel (Forging Stock) ---- */
function forgIssueCustOptionsHtml(){
  const list = DB.storesForging.filter(x=>reportUnitMatch(x.unit) && (x.qty||0)>0 && x.kind!=='finished');
  const seen = {}; const opts=[];
  list.forEach(s=>{
    const key = s.customerId || ('name:'+(s.customerName||'').trim().toLowerCase());
    if(!key || seen[key]) return; seen[key]=1;
    opts.push(`<option value="${esc(key)}">${esc(custDispByName(s.customerName))||'— Unassigned —'}</option>`);
  });
  return opts.join('');
}
function forgIssuePartOptionsForCust(custKey){
  return DB.storesForging.filter(x=>reportUnitMatch(x.unit) && (x.qty||0)>0 && x.kind!=='finished' && (x.customerId||('name:'+(x.customerName||'').trim().toLowerCase()))===custKey);
}
function forgIssueFinPartOptionsHtml(s){
  if(!s) return '<option value="">— select part first —</option>';
  const customerId = s.customerId || null;
  // Prefer BOM mappings for this exact forging part no (and customer, if known)
  let matches = DB.bom.filter(b=>b.mapType==='FORGING' && (b.forgPartNo||'').trim().toLowerCase()===(s.partNo||'').trim().toLowerCase() && (!customerId||b.customerId===customerId));
  if(!matches.length){
    matches = DB.bom.filter(b=>b.mapType==='FORGING' && (!customerId||b.customerId===customerId));
  }
  const seen={}; const opts=[];
  matches.forEach(b=>{
    const key=(b.finPartNo||'').trim();
    if(key && !seen[key]){ seen[key]=1; opts.push({no:key,name:b.finPartName||''}); }
  });
  opts.sort((a,b)=>a.no.localeCompare(b.no));
  if(!opts.length) return '<option value="">— no part mapping found —</option>';
  return '<option value="">— select part —</option>' + opts.map(o=>`<option value="${esc(o.no)}" data-name="${esc(o.name)}">${esc(o.no)}</option>`).join('');
}
function onForgIssueCustChange(){
  const key = document.getElementById('forgIssueCustSel').value;
  const partSel = document.getElementById('forgIssuePartSel');
  const finSel = document.getElementById('forgIssueFinPartSel');
  const avail = document.getElementById('forgIssueAvail');
  const qtyEl = document.getElementById('forgIssueQty');
  finSel.innerHTML = '<option value="">— select part first —</option>';
  if(!key){ partSel.innerHTML = '<option value="">— select customer first —</option>'; avail.value=''; qtyEl.value=''; return; }
  const list = forgIssuePartOptionsForCust(key);
  partSel.innerHTML = '<option value="">— select part —</option>' + list.map(s=>`<option value="${s.id}">${esc(s.partNo)} — ${esc(s.partName)} (avail. ${s.qty}${s.uom?' '+esc(s.uom):''})</option>`).join('');
  avail.value=''; qtyEl.value='';
}
function onForgIssuePartChange(){
  const id = document.getElementById('forgIssuePartSel').value;
  const s = DB.storesForging.find(x=>x.id===id);
  document.getElementById('forgIssueAvail').value = s ? (s.qty+(s.uom?' '+s.uom:'')) : '';
  document.getElementById('forgIssueFinPartSel').innerHTML = forgIssueFinPartOptionsHtml(s);
  document.getElementById('forgIssueQty').value = '';
}
function confirmForgIssue(){
  const id = document.getElementById('forgIssuePartSel').value;
  if(!document.getElementById('forgIssueCustSel').value){ toast('Select a Customer'); return; }
  if(!id){ toast('Select a Part Number'); return; }
  const finSel = document.getElementById('forgIssueFinPartSel');
  const finPartNo = finSel.value;
  if(!finPartNo){ toast('Part Number is required'); return; }
  const finPartName = (finSel.selectedOptions[0]||{}).dataset ? finSel.selectedOptions[0].dataset.name : '';
  const qty = parseFloat(document.getElementById('forgIssueQty').value)||0;
  issueStoresQty('storesForging', id, qty, Object.assign({finPartNo, finPartName}, readIssueTypeFields('forg')));
}
function issueToProduction(stId){
  if(!requireWorkingUnit()) return;
  const s = DB.stores.find(x=>x.id===stId);
  const cardNo = uid('cd');
  DB.production.push({id:'pr'+Date.now(), unit:currentUnit, item:s.item, qty:s.qty, issuedQty:s.qty, stage:'Issued', operator:'', startDate:today(), status:'Pending', cardNo,
    quotationId:s.labourQuotationId||null, quoteNo:s.quoteNo||'', customerId:s.customerId||null, customerName:s.customerName||'',
    goodQty:0, rejectionQty:0, rejectionRows:[], reworkQty:0, reworkRows:[], shortageQty:0, outputEntries:[]});
  saveDB(); toast('Issued to Production'); render();
}
function updateIssueQtyCalc(stId){
  const s = DB.stores.find(x=>x.id===stId);
  if(!s || !s.unitWeight) return;
  const wtEl = document.getElementById('piQty_'+stId);
  const calcEl = document.getElementById('piCalcQty_'+stId);
  if(!wtEl || !calcEl) return;
  const wt = parseFloat(wtEl.value)||0;
  const nos = wt>0 ? Math.floor((wt/s.unitWeight)*1000)/1000 : 0;
  calcEl.value = nos>0 ? nos+' Nos' : '';
}
function partialIssueToProduction(stId){
  if(!requireWorkingUnit()) return;
  const s = DB.stores.find(x=>x.id===stId);
  if(!s){ toast('Stock item not found'); return; }
  const qtyEl = document.getElementById('piQty_'+stId);
  const qty = parseFloat(qtyEl ? qtyEl.value : '') || 0;
  if(qty<=0){ toast('Enter a valid quantity to issue'); return; }
  if(qty > (s.qty||0)){ toast('Qty exceeds available balance ('+s.qty+')'); return; }
  const cardNo = uid('cd'); // auto-generated traceability card no. — follows this issued batch through Production → Final Insp. → Inventory → Sales
  const isWeightBased = !!s.unitWeight;
  const nosQty = isWeightBased ? Math.floor((qty/s.unitWeight)*1000)/1000 : qty;
  DB.production.push({
    id:'pr'+Date.now(), unit:currentUnit, item:s.item, qty:nosQty, issuedQty:nosQty, stage:'Issued', operator:'', startDate:today(), status:'Pending',
    quotationId:s.labourQuotationId||null, quoteNo:s.quoteNo||'', storeId:s.id, partNo:s.partNo||'', partName:s.partName||'', cardNo,
    weightIssued:isWeightBased?qty:0, unitWeight:s.unitWeight||0,
    customerId:s.customerId||null, customerName:s.customerName||'',
    goodQty:0, rejectionQty:0, rejectionRows:[], reworkQty:0, reworkRows:[], shortageQty:0, outputEntries:[]
  });
  s.qty = Math.round(((s.qty||0) - qty) * 10000) / 10000;
  s.issuedQty = Math.round(((s.issuedQty||0) + qty) * 10000) / 10000;
  if(!s.history) s.history = [];
  s.history.push({date:today(), qty, balanceAfter:s.qty, cardNo, note:isWeightBased?`Issued ${qty} Kg → ${nosQty} Nos (unit wt ${s.unitWeight} Kg/Pc)`:undefined});
  saveDB();
  toast(isWeightBased
    ? (s.qty<=0 ? `Fully consumed — Card ${cardNo} issued ${qty} Kg (≈${nosQty} Nos) to Production` : `Card ${cardNo} issued ${qty} Kg (≈${nosQty} Nos) to Production — balance ${s.qty} Kg`)
    : (s.qty<=0 ? `Fully consumed — Card ${cardNo} issued (${qty}) to Production` : `Card ${cardNo} issued (${qty}) to Production — balance ${s.qty}`));
  render();
}
function printStores(filter){
  let list = DB.stores.filter(x=>reportUnitMatch(x.unit));
  if(filter==='labour') list = list.filter(x=>x.labourQuotationId);
  const headers = ['Customer Name','Part No','Part Name','UOM','Qty on Hand','Unit Wt (Kg/Pc)','Location','Source','Supplier Inv. No','Test Cert. No','Heat No'];
  const rows = list.map(s=>[esc(s.customerName)||'—', esc(s.partNo)||'—', esc(s.partName)||esc(s.item), esc(s.uom)||'—', `<span class="num">${s.qty}</span>`, s.unitWeight?`<span class="num">${s.unitWeight}</span>`:'—', esc(s.location)||'—', esc(s.source)||'—', esc(s.invoiceNo)||'—', esc(s.testCert)||'—', esc(s.heatNo)||'—']);
  printReport(filter==='labour' ? 'Job Work Stock List' : 'Stores Stock List', headers, rows, {barLeft:`Unit: ${esc(reportScopeLabel())}`, barRight:`Total Line Items: ${list.length}`});
}
