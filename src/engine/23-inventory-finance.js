/* ---------------- INVENTORY (Finished Goods) ---------------- */
let invSubTab = 'stock'; // 'stock' | 'ledger'
let fgLedgerFrom = '', fgLedgerTo = '', fgLedgerPartNo = '', fgLedgerCust = '';
function setInvSubTab(t){ invSubTab = t; render(); }
// A Finished Part No belongs to this ledger only if it is a SALES part — i.e. it appears on a
// Customer PO (Sales PO, raised off a Sales Quotation). Job Work (job-work) Finished Parts flow
// through Job Work Stock → Job Work PO → Job Work Invoice instead and are deliberately excluded here,
// per the requirement that this ledger is Sales Part No / Sales Customer only.
function fgIsSalesPartNo(partNo){
  const key = (partNo||'').trim().toLowerCase();
  if(!key) return false;
  return DB.custPO.some(p=>(p.finPartNo||'').trim().toLowerCase()===key);
}
// Every dated movement against Finished Goods (Sales parts only): Receipts come from
// DB.inventory (each entry pushed here — automatically the moment OK Qty is entered on a Final
// Inspection Card, straight against that card's Part No/Model —
// IS a Receipt/Production transaction; a rare negative-qty entry is treated as a
// Rejection/Adjustment instead). Issues/Deliveries come from DB.sales Sales Invoices
// (invKind !== 'labour') raised against that Part No. Nothing here is ever double-counted:
// Sales Invoices don't touch DB.inventory, so each source contributes exactly one transaction
// per real-world event.
function fgLedgerTransactions(){
  const txns = [];
  DB.inventory.filter(x=>reportUnitMatch(x.unit) && fgIsSalesPartNo(x.partNo)).forEach(iv=>{
    const qty = parseFloat(iv.qty)||0;
    if(qty>=0){
      txns.push({date:iv.date||'', type:(iv.source||'').indexOf('Final Insp.')===0 ? 'Production Receipt (Final Insp.)' : 'Receipt (Manual Entry)',
        cardNo:iv.cardNo||'', customer:custDispByName(iv.customer)||iv.customer||'', partNo:iv.partNo||'', partName:iv.partName||'',
        receipt:qty, issue:0, adj:0, _id:iv.id||''});
    } else {
      txns.push({date:iv.date||'', type:'Rejection / Adjustment', cardNo:iv.cardNo||'', customer:custDispByName(iv.customer)||iv.customer||'',
        partNo:iv.partNo||'', partName:iv.partName||'', receipt:0, issue:0, adj:qty, _id:iv.id||''});
    }
  });
  DB.sales.filter(x=>reportUnitMatch(x.unit) && x.invKind!=='labour' && fgIsSalesPartNo(x.partNo)).forEach(s=>{
    txns.push({date:s.invDate||'', type:'Sales Invoice / Delivery', cardNo:s.dcNo||s.invNo||'', customer:custDispByName(s.customer)||s.customer||'',
      partNo:s.partNo||'', partName:s.partName||'', receipt:0, issue:parseFloat(s.qty)||0, adj:0, _id:s.id||''});
  });
  return txns;
}
// Builds the actual ledger: one Opening Balance row + one row per transaction (running balance)
// + one Closing Balance row, PER Part No, scoped to the selected period. Opening Stock is the
// true net balance of every transaction strictly before "From Date" (0 if no From Date is set),
// so the classic ledger identity always holds for the printed period:
//   Opening Stock + Receipts/Production − Issues/Delivery ± Adjustments = Closing/Available Stock
function fgLedgerRows(dateFrom, dateTo, partNoFilter, custFilter){
  let txns = fgLedgerTransactions();
  if(partNoFilter && partNoFilter.trim()){
    const needle = partNoFilter.trim().toLowerCase();
    txns = txns.filter(t=>(t.partNo||'').toLowerCase().includes(needle));
  }
  if(custFilter) txns = txns.filter(t=>(t.customer||'')===custFilter);
  const byPart = {};
  txns.forEach(t=>{
    const key = (t.partNo||'').trim().toLowerCase();
    if(!key) return;
    if(!byPart[key]) byPart[key] = {partNo:t.partNo, partName:t.partName, txns:[]};
    if(!byPart[key].partName && t.partName) byPart[key].partName = t.partName;
    byPart[key].txns.push(t);
  });
  const rows = [], summary = [];
  let grandOpening=0, grandReceipt=0, grandIssue=0, grandAdj=0, grandClosing=0;
  Object.keys(byPart).sort((a,b)=>a.localeCompare(b)).forEach(key=>{
    const grp = byPart[key];
    const sorted = grp.txns.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'') || String(a._id).localeCompare(String(b._id)));
    let opening = 0;
    sorted.forEach(t=>{ if(dateFrom && t.date && t.date<dateFrom) opening += (t.receipt||0)-(t.issue||0)+(t.adj||0); });
    opening = Math.round(opening*10000)/10000;
    const inRange = sorted.filter(t=>(!dateFrom || !t.date || t.date>=dateFrom) && (!dateTo || !t.date || t.date<=dateTo));
    rows.push({partNo:grp.partNo, partName:grp.partName, date:dateFrom||'—', type:'Opening Balance', cardNo:'—', customer:'—',
      opening:null, receipt:null, issue:null, adj:null, closing:opening, marker:'open'});
    let running = opening, sumR=0, sumI=0, sumA=0;
    inRange.forEach(t=>{
      const openBal = running;
      running = Math.round((running + (t.receipt||0) - (t.issue||0) + (t.adj||0))*10000)/10000;
      sumR += t.receipt||0; sumI += t.issue||0; sumA += t.adj||0;
      rows.push({partNo:grp.partNo, partName:grp.partName, date:t.date, type:t.type, cardNo:t.cardNo, customer:t.customer,
        opening:openBal, receipt:t.receipt||0, issue:t.issue||0, adj:t.adj||0, closing:running, marker:''});
    });
    rows.push({partNo:grp.partNo, partName:grp.partName, date:dateTo||'—', type:'Closing Balance', cardNo:'—', customer:'—',
      opening:null, receipt:null, issue:null, adj:null, closing:running, marker:'close'});
    summary.push({partNo:grp.partNo, partName:grp.partName, opening, receipt:Math.round(sumR*10000)/10000, issue:Math.round(sumI*10000)/10000, adj:Math.round(sumA*10000)/10000, closing:running});
    grandOpening+=opening; grandReceipt+=sumR; grandIssue+=sumI; grandAdj+=sumA; grandClosing+=running;
  });
  return {rows, summary, totals:{opening:Math.round(grandOpening*10000)/10000, receipt:Math.round(grandReceipt*10000)/10000, issue:Math.round(grandIssue*10000)/10000, adj:Math.round(grandAdj*10000)/10000, closing:Math.round(grandClosing*10000)/10000}};
}
function fgLedgerCustOptionsHtml(){
  const names = new Set();
  fgLedgerTransactions().forEach(t=>{ if(t.customer) names.add(t.customer); });
  return Array.from(names).sort().map(n=>`<option value="${esc(n)}" ${fgLedgerCust===n?'selected':''}>${esc(n)}</option>`).join('');
}
function setFGLedgerFilter(field, val){
  if(field==='from') fgLedgerFrom=val; else if(field==='to') fgLedgerTo=val;
  else if(field==='partNo') fgLedgerPartNo=val; else if(field==='cust') fgLedgerCust=val;
  renderFinishedGoodsLedgerOnly();
}
function clearFGLedgerFilters(){ fgLedgerFrom=''; fgLedgerTo=''; fgLedgerPartNo=''; fgLedgerCust=''; render(); }
function renderFinishedGoodsLedgerOnly(){
  const box = document.getElementById('fgLedgerBox');
  if(box) box.innerHTML = fgLedgerTableAndSummaryHtml();
}
function fgLedgerTableAndSummaryHtml(){
  const {rows, summary, totals} = fgLedgerRows(fgLedgerFrom, fgLedgerTo, fgLedgerPartNo, fgLedgerCust);
  const rowHtml = r=>`
    <tr class="${r.marker==='open'?'fgl-open':r.marker==='close'?'fgl-close':''}">
      <td>${r.marker?'—':fmtDate(r.date)||'—'}</td>
      <td>${r.marker?`<b>${esc(r.type)}</b>`:esc(r.type)}</td>
      <td>${esc(r.cardNo)}</td>
      <td>${esc(r.customer)}</td>
      <td><b>${esc(r.partNo)}</b></td>
      <td class="rt-truncate" title="${esc(r.partName)}">${esc(r.partName)||'—'}</td>
      <td style="text-align:right;">${r.opening===null?'—':r.opening}</td>
      <td style="text-align:right; color:var(--green);">${r.receipt===null?'—':(r.receipt||'—')}</td>
      <td style="text-align:right; color:var(--steel);">${r.issue===null?'—':(r.issue||'—')}</td>
      <td style="text-align:right; ${r.adj<0?'color:#b23b3b;':''}">${r.adj===null?'—':(r.adj||'—')}</td>
      <td style="text-align:right; font-weight:700;">${r.closing}</td>
    </tr>`;
  const tableHtml = `
    <div class="report-table-wrap" style="max-height:560px; overflow-y:auto;">
    <table class="report-table">
      <thead><tr><th>Date</th><th>Transaction Type</th><th>Card No</th><th>Customer</th><th>Part Number</th><th>Part Name</th>
        <th style="text-align:right;">Opening Stock</th><th style="text-align:right;">Receipt/Production Qty</th>
        <th style="text-align:right;">Issue/Delivery Qty</th><th style="text-align:right;">Rejection/Adj. Qty</th>
        <th style="text-align:right;">Closing Stock</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map(rowHtml).join('') : `<tr><td colspan="11" class="empty">No Finished Goods (Sales Part) movements found for the selected filters.</td></tr>`}
      </tbody>
    </table>
    </div>`;
  const summaryHtml = `
    <div class="panel" style="margin-top:16px; background:linear-gradient(180deg, var(--panel), var(--panel2));">
      <h3 style="justify-content:flex-start; text-align:left;">📊 Finished Goods Available Stock Summary <span class="hint">as of ${fgLedgerTo?fmtDate(fgLedgerTo):'today'} — final available qty per Part Number</span></h3>
      <div class="report-table-wrap">
        <table class="report-table">
          <thead><tr><th>Part Number</th><th>Part Name</th><th style="text-align:right;">Opening Stock</th><th style="text-align:right;">Receipt/Production Qty</th><th style="text-align:right;">Issue/Delivery Qty</th><th style="text-align:right;">Rejection/Adj. Qty</th><th style="text-align:right;">Available Stock (Closing)</th></tr></thead>
          <tbody>
            ${summary.length ? summary.map(s=>`
            <tr>
              <td><b>${esc(s.partNo)}</b></td>
              <td class="rt-truncate" title="${esc(s.partName)}">${esc(s.partName)||'—'}</td>
              <td style="text-align:right;">${s.opening}</td>
              <td style="text-align:right; color:var(--green);">${s.receipt||'—'}</td>
              <td style="text-align:right; color:var(--steel);">${s.issue||'—'}</td>
              <td style="text-align:right; ${s.adj<0?'color:#b23b3b;':''}">${s.adj||'—'}</td>
              <td style="text-align:right; font-weight:800; color:${s.closing<0?'#b23b3b':'var(--green)'};">${s.closing}</td>
            </tr>`).join('') : `<tr><td colspan="7" class="empty">No Finished Goods stock to summarize.</td></tr>`}
          </tbody>
          ${summary.length ? `<tfoot><tr style="font-weight:800;">
            <td colspan="2">Grand Total</td>
            <td style="text-align:right;">${totals.opening}</td>
            <td style="text-align:right;">${totals.receipt||'—'}</td>
            <td style="text-align:right;">${totals.issue||'—'}</td>
            <td style="text-align:right;">${totals.adj||'—'}</td>
            <td style="text-align:right;">${totals.closing}</td>
          </tr></tfoot>` : ''}
        </table>
      </div>
    </div>`;
  return tableHtml + summaryHtml;
}
function printFGLedger(){
  const {rows, summary, totals} = fgLedgerRows(fgLedgerFrom, fgLedgerTo, fgLedgerPartNo, fgLedgerCust);
  const headers = ['Date','Transaction Type','Card No','Customer','Part Number','Part Name','Opening Stock','Receipt/Production Qty','Issue/Delivery Qty','Rejection/Adj. Qty','Closing Stock'];
  const numCol = [false,false,false,false,false,false, true,true,true,true,true];
  const theadHtml = '<tr>'+headers.map((h,i)=>`<th${numCol[i]?' class="num"':''}>${esc(h)}</th>`).join('')+'</tr>';
  const bodyHtml = rows.length ? rows.map(r=>`<tr${r.marker?' class="prHiRow"':''}>`+
      [r.marker?'—':(fmtDate(r.date)||'—'), r.marker?`<b>${esc(r.type)}</b>`:esc(r.type), esc(r.cardNo), esc(r.customer), esc(r.partNo), esc(r.partName)||'—',
       r.opening===null?'—':r.opening, r.receipt===null?'—':(r.receipt||'—'), r.issue===null?'—':(r.issue||'—'), r.adj===null?'—':(r.adj||'—'), r.closing]
      .map((c,i)=>`<td${numCol[i]?' class="num"':''}>${c}</td>`).join('')+'</tr>').join('')
    : `<tr><td colspan="${headers.length}" style="text-align:center; padding:12px; color:#888;">No records</td></tr>`;
  const colgroupHtml = '<colgroup>'+[8,13,8,11,10,13,7,9,9,7,9].map(w=>`<col style="width:${w}%;">`).join('')+'</colgroup>';
  const summaryHtml = `
    <div class="prNote" style="margin-top:22px;">
      <div class="ntTitle">📊 Finished Goods Available Stock Summary — as of ${fgLedgerTo?fmtDate(fgLedgerTo):'Today'}</div>
      <div class="ntBody">
        <table>
          <tr><th>Part Number</th><th>Part Name</th><th class="num">Opening</th><th class="num">Receipt/Prod.</th><th class="num">Issue/Delivery</th><th class="num">Rejection/Adj.</th><th class="num">Available Stock</th></tr>
          ${summary.length ? summary.map(s=>`<tr>
            <td><b>${esc(s.partNo)}</b></td><td>${esc(s.partName)||'—'}</td>
            <td class="num">${s.opening}</td><td class="num">${s.receipt||'—'}</td><td class="num">${s.issue||'—'}</td><td class="num">${s.adj||'—'}</td>
            <td class="num" style="font-weight:800;">${s.closing}</td>
          </tr>`).join('') : `<tr><td colspan="7">No Finished Goods stock to summarize.</td></tr>`}
          <tr class="prTotalRow"><td colspan="2"><strong>Grand Total</strong></td>
            <td class="num">${totals.opening}</td><td class="num">${totals.receipt||'—'}</td><td class="num">${totals.issue||'—'}</td><td class="num">${totals.adj||'—'}</td>
            <td class="num">${totals.closing}</td>
          </tr>
        </table>
      </div>
    </div>`;
  printReport('Finished Goods Stock Ledger', headers, [], {theadHtml, bodyHtml, colgroupHtml, orientation:'landscape',
    barLeft:`Unit: ${esc(reportScopeLabel())} · Period: ${fgLedgerFrom?fmtDate(fgLedgerFrom):'Beginning'} to ${fgLedgerTo?fmtDate(fgLedgerTo):'Today'}`,
    barRight:`Sales Finished Parts Only · ${summary.length} Part(s)`, footerHtml:summaryHtml});
}

function renderInventory(main){
  if(!subOK('inventory', invSubTab)) invSubTab = firstAllowedSub('inventory') || invSubTab;
  if(invSubTab==='ledger'){
    main.innerHTML = `
      <div class="topbar"><div></div></div>
      ${flowline('inventory')}
      <div class="subtabs" style="margin-top:12px;">
        ${subOK('inventory','stock')?`<button class="${invSubTab==='stock'?'active':''}" onclick="setInvSubTab('stock')">📦 Finished Goods Stock</button>`:''}
        ${subOK('inventory','ledger')?`<button class="${invSubTab==='ledger'?'active':''}" onclick="setInvSubTab('ledger')">📒 Finished Goods Stock Ledger</button>`:''}
      </div>
      <div class="panel">
        <h3>Finished Goods Stock Ledger <span class="hint">Sales Finished Parts only — Job Work (job-work) parts are tracked separately in Job Work Stock</span>
          <button class="btn ghost small" onclick="printFGLedger()" style="float:right;">🖨 Print / PDF</button>
        </h3>
        <div class="frow g4">
          <div><label class="fl">From Date</label><input type="date" value="${esc(fgLedgerFrom)}" onchange="setFGLedgerFilter('from', this.value)"></div>
          <div><label class="fl">To Date</label><input type="date" value="${esc(fgLedgerTo)}" onchange="setFGLedgerFilter('to', this.value)"></div>
          <div><label class="fl">Part No <span class="hint" style="position:static; font-size:9.5px;">(type to search)</span></label>
            <input type="text" value="${esc(fgLedgerPartNo)}" placeholder="e.g. AH CL 26 D920" oninput="setFGLedgerFilter('partNo', this.value)"></div>
          <div><label class="fl">Customer Wise</label><select onchange="setFGLedgerFilter('cust', this.value)"><option value="">— all customers —</option>${fgLedgerCustOptionsHtml()}</select></div>
          <div style="align-self:end;">${(fgLedgerFrom||fgLedgerTo||fgLedgerPartNo||fgLedgerCust) ? `<button class="btn ghost" onclick="clearFGLedgerFilters()">✕ Clear Filters</button>` : ''}</div>
        </div>
        <div class="hint" style="margin:8px 0 12px;">Standard stock-ledger format: Opening Stock + Receipt/Production Qty − Issue/Delivery Qty ± Rejection/Adjustment Qty = Closing/Available Stock, computed per Part Number for the selected period. Receipts are sourced only from OK Qty entered on a Final Inspection Card (posted automatically, independent of the separate Final Inspection Report); Issues are sourced from Sales Invoices (Job Work Invoices are excluded — this ledger is Sales Part No / Sales Customer only).</div>
        <div id="fgLedgerBox">${fgLedgerTableAndSummaryHtml()}</div>
      </div>
    `;
    return;
  }
  const list = DB.inventory.filter(x=>reportUnitMatch(x.unit));
  const totalQty = list.reduce((a,x)=>a+(parseFloat(x.qty)||0),0);
  main.innerHTML = `
    <div class="topbar"><div></div></div>
    ${flowline('inventory')}
    <div class="subtabs" style="margin-top:12px;">
      ${subOK('inventory','stock')?`<button class="${invSubTab==='stock'?'active':''}" onclick="setInvSubTab('stock')">📦 Finished Goods Stock</button>`:''}
      ${subOK('inventory','ledger')?`<button class="${invSubTab==='ledger'?'active':''}" onclick="setInvSubTab('ledger')">📒 Finished Goods Stock Ledger</button>`:''}
    </div>
    <div class="panel" style="margin-top:12px;">
      <h3>📦 Finished Goods Stock <span class="hint">Sourced only from Final Inspection — no manual entry</span></h3>
      <div class="hint" style="line-height:1.6; position:static;">Finished Stock is no longer added manually here. It flows in on its own: <b>Production → Final Inspection Card created (Part No / Model &amp; Production Qty already on it) → OK Quantity entered → Finished Goods Stock updated automatically</b>, against that same Part No — no Model re-selection needed. This happens the moment OK Qty is saved on the card, independently of the separate Final Inspection Report. To correct a wrong quantity, fix it at the source (the Final Inspection Card), not here.</div>
    </div>
    <div class="panel">
      <h3>Finished Goods Stock <span class="hint">${list.length} line items · ${totalQty} total qty</span></h3>
      <div class="grid-box">
        ${list.slice().reverse().map(iv=>`
          <div class="rec-card">
            <div class="rc-title">${esc(iv.item)}</div>
            <div class="rc-sub">${esc(iv.source)||'Final Insp.'} · ${fmtDate(iv.date)}${iv.quoteNo?` · Quote ${esc(iv.quoteNo)}`:''}</div>
            ${iv.cardNo?`<div class="rc-row"><span class="k">Card No</span><span class="v" style="color:var(--amber);">${esc(iv.cardNo)}</span></div>`:''}
            <span class="pill rc-pill ${iv.qty>0?'done':'fail'}">${iv.qty>0?'In Stock':'Consumed'}</span>
            <div class="rc-row"><span class="k">Qty Available</span><span class="v">${iv.qty}</span></div>
            <div class="rc-row"><span class="k">Customer</span><span class="v">${esc(custDispByName(iv.customer))||'—'}</span></div>
            <div class="rc-actions">
              ${iv.fiId?`<button class="btn small ghost" onclick="viewFI('${iv.fiId}')">📄 View Report</button>`:''}
              ${iv.finalInspCardId?`<button class="btn small ghost" onclick="viewFICardFromReport('${iv.finalInspCardId}')">🗂 View Card</button>`:''}
              <button class="btn danger" onclick="deleteRow('inventory','${iv.id}')">Del</button>
            </div>
          </div>`).join('') || '<div class="empty">Finished Goods stock is empty for this unit — it will populate automatically the moment OK Qty is entered on a Final Inspection Card.</div>'}
      </div>
    </div>
  `;
}
// Manual Finished Stock entry has been retired — Finished Stock is now populated ONLY from
// a Final Inspection Card's OK Qty (see pushOKQtyToFinishedStock), so the required traceability is guaranteed:
// Production → Final Inspection Card → OK Qty → Final Inspection Report (Pass) → Finished Stock.
function addInventory(){
  toast('Manual Stock Entry is disabled — Finished Stock is now created automatically when a Final Inspection Report is passed.');
}
function printInventory(){
  const list = DB.inventory.filter(x=>reportUnitMatch(x.unit));
  const headers = ['Item','Qty Available','Customer','Source','Date','Quote No','Card No'];
  const rows = list.map(iv=>[esc(iv.item), `<span class="num">${iv.qty}</span>`, esc(iv.customer)||'—', esc(iv.source)||'Manual', fmtDate(iv.date)||'—', esc(iv.quoteNo)||'—', esc(iv.cardNo)||'—']);
  printReport('Finished Goods Inventory', headers, rows, {barLeft:`Unit: ${esc(reportScopeLabel())}`, barRight:`Total Line Items: ${list.length}`});
}

/* ================================ FINANCE — CLOSING STOCK STATEMENT ================================
   Values every stock category "as of" a chosen Closing Date, for month-end closing stock valuation.
   No transaction dated AFTER the Closing Date is allowed to affect any figure on this screen — every
   helper below re-derives the balance strictly from each item's own dated history/ledger instead of
   reading today's live balance, so a past month-end can always be re-run and will match what was true
   on that date, unaffected by anything entered since.
      • Raw Material Stock Value  — Bar Stock + Forging Stock, replayed from DB.storesBar/DB.storesForging
        history up to the Closing Date (same source data as the Stores → Material Ledger report),
        valued at each Part's Item Master rate (VIPL Quotation Price).
      • WIP Value = Raw Material Cost (the value of material already issued into Production/Subcontract
        but not yet completed, reconstructed from the append-only Job Card ledger so a past date is
        rebuilt correctly even though today's live Stores-WIP snapshot has since moved on) + Machining
        Cost Incurred (this app does not maintain a per-operation machining/labour cost ledger, so this
        is estimated as an editable % of that WIP's Raw Material Cost — shown and adjustable right on
        this screen, never hidden, so the figure is transparent rather than a black box).
      • Finished Goods Stock Value — Sales Finished Parts closing balance as of the Closing Date (the
        exact same engine as the Finished Goods Stock Ledger's "Available Stock Summary", just re-run
        with the Closing Date as the cut-off), valued at each Part's last known Quotation Rate on or
        before that date. */
let financeClosingDate = today();
function setFinanceClosingDate(v){ financeClosingDate = v || today(); renderFinanceStatementOnly(); }
function financeSettings(){ if(!DB.settings.finance) DB.settings.finance = {wipMachiningPct:30}; return DB.settings.finance; }
function setFinanceWipPct(v){ financeSettings().wipMachiningPct = Math.max(0, parseFloat(v)||0); saveDB(); renderFinanceStatementOnly(); }
// Raw Material — replays one Stores bucket's per-part history up to (and including) asOfDate only;
// any history entry dated after asOfDate is simply never looked at, so it cannot affect the balance.
// SALES MANUFACTURING ONLY: a raw material Part No is included only if the BOM (Bar/Forging
// Mapping) traces it to a Sales Finished Part No (fgIsSalesPartNo) — Job Work material is supplied
// by the customer, never ours, and must never appear in this valuation.
function financeIsSalesRawMaterialPartNo(rawPartNo){
  const key = (rawPartNo||'').trim().toLowerCase();
  if(!key) return false;
  return DB.bom.some(b=> (((b.purPartNo||'').trim().toLowerCase()===key) || ((b.forgPartNo||'').trim().toLowerCase()===key)) && fgIsSalesPartNo(b.finPartNo));
}
function financeStoresBalanceAsOf(bucketKey, asOfDate){
  const list = (DB[bucketKey]||[]).filter(x=>reportUnitMatch(x.unit) && financeIsSalesRawMaterialPartNo(x.partNo));
  const out = [];
  list.forEach(s=>{
    const hist = (s.history||[]).slice().filter(h=>!asOfDate || !h.date || h.date<=asOfDate).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    let running = 0;
    hist.forEach(h=>{
      let received=0, issued=0, retRej=0;
      if(h.type==='purchase' || h.type==='conversion-in') received = parseFloat(h.qty)||0;
      else if(h.type==='issue' || h.type==='conversion-out') issued = parseFloat(h.qty)||0;
      else if(h.type==='adjust'){ const q=parseFloat(h.qty)||0; if(q<0) retRej = Math.abs(q); else received = q; }
      running = (h.balanceAfter!=null && h.balanceAfter!=='') ? (parseFloat(h.balanceAfter)||0) : (running + received - issued - retRej);
    });
    if(running>0.0001){
      const rate = partMasterRate(s.partNo);
      out.push({partNo:s.partNo||'—', partName:s.partName||'—', qty:running, rate, value:running*rate});
    }
  });
  return out;
}
// WIP — rebuilt from the append-only Job Card ledger (never from today's live Stores-WIP snapshot,
// which no longer shows batches that have since moved on to Final Inspection/Finished Goods). A batch
// counts as "in WIP as of asOfDate" only if it entered Stores-WIP on/before that date AND had not
// yet been marked Completed (moved onward) on/before that date.
// SALES MANUFACTURING ONLY: only batches whose Part No is a Sales Finished Part (fgIsSalesPartNo)
// are included — Job Work batches are excluded entirely, since the customer owns that material.
function financeWipAsOfDate(asOfDate){
  const rows = (DB.jobCards||[]).filter(j=>reportUnitMatch(j.unit) && j.refType==='stores' && j.stage==='Stores' && fgIsSalesPartNo(j.partNo));
  const byPart = {};
  rows.forEach(j=>{
    if(!j.issueDate || (asOfDate && j.issueDate>asOfDate)) return; // entered WIP after the closing date — excluded
    const departedByThen = j.status==='Completed' && j.completionDate && (!asOfDate || j.completionDate<=asOfDate);
    if(departedByThen) return; // already left WIP on/before the closing date — excluded
    const key = (j.partNo||'').trim().toLowerCase(); if(!key) return;
    if(!byPart[key]) byPart[key] = {partNo:j.partNo||'—', partName:j.partName||'—', qty:0};
    byPart[key].qty += parseFloat(j.qty)||0;
  });
  const pct = financeSettings().wipMachiningPct;
  return Object.values(byPart).filter(r=>r.qty>0.0001).map(r=>{
    const rate = partMasterRate(r.partNo);
    const rmValue = r.qty*rate;
    const machValue = rmValue * (pct/100);
    return {...r, rate, rmValue, machValue, value: rmValue+machValue};
  });
}
// Finished Goods — reuses the same Sales-Part closing-balance engine as the Finished Goods Stock
// Ledger, just re-run with dateTo = the Closing Date (and no From Date, i.e. full history to date).
function financeLatestQuoteRate(partNo, asOfDate){
  const key = (partNo||'').trim().toLowerCase();
  const recs = DB.inventory.filter(x=>reportUnitMatch(x.unit) && (x.partNo||'').trim().toLowerCase()===key
    && (!asOfDate || !x.date || x.date<=asOfDate) && (parseFloat(x.quoteRate)||0)>0);
  if(!recs.length) return 0;
  recs.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  return parseFloat(recs[recs.length-1].quoteRate)||0;
}
function financeFGAsOfDate(asOfDate){
  const {summary} = fgLedgerRows('', asOfDate, '', '');
  return summary.filter(r=>r.closing>0.0001).map(r=>{
    const rate = financeLatestQuoteRate(r.partNo, asOfDate);
    return {partNo:r.partNo||'—', partName:r.partName||'—', qty:r.closing, rate, value:r.closing*rate};
  });
}
function financeClosingStockSummary(asOfDate){
  const rm = [...financeStoresBalanceAsOf('storesBar', asOfDate), ...financeStoresBalanceAsOf('storesForging', asOfDate)];
  const wip = financeWipAsOfDate(asOfDate);
  const fg = financeFGAsOfDate(asOfDate);
  const rmValue = rm.reduce((a,r)=>a+r.value,0);
  const wipRmValue = wip.reduce((a,r)=>a+r.rmValue,0);
  const wipMachValue = wip.reduce((a,r)=>a+r.machValue,0);
  const wipValue = wipRmValue + wipMachValue;
  const fgValue = fg.reduce((a,r)=>a+r.value,0);
  return {rm, wip, fg, rmValue, wipRmValue, wipMachValue, wipValue, fgValue, totalValue: rmValue+wipValue+fgValue};
}
function financeBreakdownTableHtml(rows, extraCols){
  const cols = extraCols || [];
  if(!rows.length) return '<div class="empty">No stock in this category as of the selected Closing Date.</div>';
  return `<div class="report-table-wrap" style="max-height:260px; overflow-y:auto;">
    <table class="report-table">
      <thead><tr><th>Part No</th><th>Part Name</th><th style="text-align:right;">Qty</th>${cols.map(c=>`<th style="text-align:right;">${esc(c.label)}</th>`).join('')}<th style="text-align:right;">Value (₹)</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td><b>${esc(r.partNo)}</b></td><td>${esc(r.partName)}</td><td style="text-align:right;">${r.qty}</td>${cols.map(c=>`<td style="text-align:right;">${c.get(r)}</td>`).join('')}<td style="text-align:right; font-weight:700;">${fmtMoney(r.value)}</td></tr>`).join('')}</tbody>
    </table>
  </div>`;
}
function renderFinanceStatementOnly(){
  const box = document.getElementById('financeStatementBox');
  if(box) box.innerHTML = financeStatementHtml();
}
function financeStatementHtml(){
  financeSettings();
  const s = financeClosingStockSummary(financeClosingDate);
  return `
    <div class="cards" style="margin:14px 0;">
      <div class="card"><div class="v">${fmtMoney(s.rmValue)}</div><div class="l">Raw Material Stock Value</div></div>
      <div class="card"><div class="v">${fmtMoney(s.wipValue)}</div><div class="l">WIP Value</div></div>
      <div class="card"><div class="v">${fmtMoney(s.fgValue)}</div><div class="l">Finished Goods Stock Value</div></div>
      <div class="card" style="background:linear-gradient(155deg, color-mix(in srgb, var(--green,#278449) 16%, var(--panel)), var(--panel));">
        <div class="v" style="color:var(--green,#278449);">${fmtMoney(s.totalValue)}</div><div class="l">Total Closing Stock Value</div>
      </div>
    </div>
    <div class="panel" style="margin-bottom:12px;">
      <h3 style="justify-content:flex-start;">🔩 Raw Material Stock <span class="hint">Our own Bar + Forging (Sales Manufacturing only), as of ${fmtDate(financeClosingDate)}</span></h3>
      ${financeBreakdownTableHtml(s.rm)}
    </div>
    <div class="panel" style="margin-bottom:12px;">
      <h3 style="justify-content:flex-start;">⚙️ WIP (Work-in-Progress) <span class="hint">Our own Sales Manufacturing material in Production/Subcontract, not yet completed, as of ${fmtDate(financeClosingDate)}</span></h3>
      <div class="frow g4" style="margin-bottom:10px;">
        <div><label class="fl">Machining Cost — % of WIP Raw Material Cost <span class="hint" style="position:static; font-size:9.5px;">(no per-operation machining cost ledger is maintained — adjust to match your costing policy)</span></label>
          <input type="number" min="0" step="0.5" value="${financeSettings().wipMachiningPct}" onchange="setFinanceWipPct(this.value)" style="max-width:140px;"></div>
      </div>
      <div class="cards" style="margin-bottom:10px;">
        <div class="card"><div class="v">${fmtMoney(s.wipRmValue)}</div><div class="l">WIP — Raw Material Cost</div></div>
        <div class="card"><div class="v">${fmtMoney(s.wipMachValue)}</div><div class="l">WIP — Machining Cost Incurred</div></div>
      </div>
      ${financeBreakdownTableHtml(s.wip, [{label:'Machining Cost (₹)', get:r=>fmtMoney(r.machValue)}])}
    </div>
    <div class="panel">
      <h3 style="justify-content:flex-start;">🗄️ Finished Goods Stock <span class="hint">Our own Sales Finished Parts (Job Work excluded), as of ${fmtDate(financeClosingDate)} — valued at last known Quotation Rate</span></h3>
      ${financeBreakdownTableHtml(s.fg)}
    </div>
  `;
}
function printFinanceClosingStock(){
  financeSettings();
  const s = financeClosingStockSummary(financeClosingDate);
  const co = DB.settings.company || {name:'VISALAM INDUSTRIES PVT LTD', logo:''};
  const w = window.open('', '_blank', 'width=950,height=1100');
  if(!w){ alert('Popup blocked — please allow popups for this site to print.'); return; }
  const sectionTable = (title, rows, extraCols)=>{
    const cols = extraCols||[];
    const rowsHtml = rows.length ? rows.map(r=>`<tr><td>${esc(r.partNo)}</td><td>${esc(r.partName)}</td><td class="num">${r.qty}</td>${cols.map(c=>`<td class="num">${c.get(r)}</td>`).join('')}<td class="num">${fmtMoney(r.value)}</td></tr>`).join('')
      : `<tr><td colspan="${4+cols.length}" style="text-align:center; color:#888;">No stock in this category</td></tr>`;
    return `<div class="secTitle">${esc(title)}</div>
      <table class="dat"><thead><tr><th>Part No</th><th>Part Name</th><th class="num">Qty</th>${cols.map(c=>`<th class="num">${esc(c.label)}</th>`).join('')}<th class="num">Value (₹)</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>`;
  };
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Closing Stock Statement — ${esc(fmtDate(financeClosingDate))}</title>
  <style>
    @page{ size:A4 portrait; margin:16mm 14mm 18mm; }
    *{ box-sizing:border-box; }
    :root{ --accent:#1f5673; --accent-dark:#123a4e; --accent-dim:#e9f0f4; --ink:#1c2b3a; --sub-ink:#5b6b7a; --line-soft:#d9e0e6; }
    html,body{ margin:0; padding:0; }
    body{ font-family:'Segoe UI',Arial,sans-serif; color:var(--ink); font-size:11.5px; line-height:1.45; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .csHead{ display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2.5px solid var(--accent); padding-bottom:10px; margin-bottom:12px; }
    .csHead h1{ font-size:17px; margin:0; letter-spacing:0.3px; font-weight:800; color:var(--accent-dark); }
    .csTitle{ font-size:14px; font-weight:800; margin:0 0 14px; text-transform:uppercase; letter-spacing:0.8px; color:#fff; background:linear-gradient(135deg,var(--accent),var(--accent-dark)); padding:7px 14px; border-radius:4px; text-align:center; }
    .kpis{ display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:16px; }
    .kpis .k{ border:1px solid var(--line-soft); border-radius:6px; padding:8px 10px; }
    .kpis .k .v{ font-size:14px; font-weight:800; color:var(--accent-dark); }
    .kpis .k .l{ font-size:8.5px; text-transform:uppercase; letter-spacing:0.4px; color:var(--sub-ink); margin-top:2px; }
    .kpis .k.tot{ background:var(--accent-dim); }
    .secTitle{ font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.4px; color:var(--accent-dark); margin:14px 0 6px; border-bottom:1.5px solid var(--accent); padding-bottom:3px; }
    table.dat{ width:100%; border-collapse:collapse; margin-bottom:6px; }
    table.dat th, table.dat td{ border:1px solid var(--line-soft); padding:5px 8px; font-size:10.5px; text-align:center; vertical-align:middle; }
    table.dat th{ background:var(--accent); color:#fff; text-transform:uppercase; font-size:9px; }
    .assump{ font-size:9.5px; color:var(--sub-ink); margin-top:10px; }
    @media print{ .noPrint{ display:none; } }
    .noPrint{ text-align:center; margin:16px 0; }
    .noPrint button{ padding:8px 18px; font-size:13px; cursor:pointer; margin:0 4px; border-radius:3px; border:1px solid #ccc; background:#fff; }
    .noPrint button:first-child{ background:var(--accent); color:#fff; border-color:var(--accent); }
  </style></head><body>
    <div class="csHead"><h1>${esc(co.name||'VISALAM INDUSTRIES PVT LTD')}</h1><div>Printed: ${esc(fmtDate(today()))}</div></div>
    <div class="csTitle">Closing Stock Statement — Sales Manufacturing — as of ${esc(fmtDate(financeClosingDate))}</div>
    <div class="kpis">
      <div class="k"><div class="v">${fmtMoney(s.rmValue)}</div><div class="l">Raw Material Stock Value</div></div>
      <div class="k"><div class="v">${fmtMoney(s.wipValue)}</div><div class="l">WIP Value</div></div>
      <div class="k"><div class="v">${fmtMoney(s.fgValue)}</div><div class="l">Finished Goods Stock Value</div></div>
      <div class="k tot"><div class="v">${fmtMoney(s.totalValue)}</div><div class="l">Total Closing Stock Value</div></div>
    </div>
    ${sectionTable('Raw Material Stock (Bar + Forging)', s.rm)}
    ${sectionTable('WIP — Raw Material Cost ' + fmtMoney(s.wipRmValue) + ' + Machining Cost ' + fmtMoney(s.wipMachValue), s.wip, [{label:'Machining Cost (₹)', get:r=>fmtMoney(r.machValue)}])}
    ${sectionTable('Finished Goods Stock (Sales Parts)', s.fg)}
    <div class="assump">Scope: our own Sales Manufacturing items only (Raw Material → Machining → Finished Goods) — Job Work items are excluded entirely, since that material is supplied by the customer and is never ours. Only transactions dated on or before the Closing Date are included. Raw Material is valued at Item Master rate; Finished Goods at last known Quotation Rate on or before the Closing Date; WIP Machining Cost is estimated at ${financeSettings().wipMachiningPct}% of WIP Raw Material Cost (no per-operation machining cost ledger is maintained in this system).</div>
    <div class="noPrint">
      <button onclick="window.print()">🖨 Print / Save as PDF</button>
      <button onclick="window.close()">Close</button>
    </div>
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(()=>{ try{ w.print(); }catch(e){} }, 300);
}
function renderFinance(main){
  financeSettings();
  main.innerHTML = `
    <div class="topbar"><div><h2>💹 Finance</h2><div class="desc">Closing Stock Statement — month-end closing stock valuation for our own Sales Manufacturing items only (Raw Material → Machining → Finished Goods). Job Work items are never included, since that material belongs to the customer.</div></div></div>
    <div class="panel" style="margin-top:8px;">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:6px;">
        <div><b style="font-size:15px;">📅 Closing Stock Statement</b> <span class="hint" style="position:static;">— Sales Manufacturing only</span></div>
        <button class="btn small" onclick="printFinanceClosingStock()" style="background:var(--steel); color:#fff; border-color:var(--steel); font-weight:700;">🖨 Print Closing Stock Statement (PDF)</button>
      </div>
      <div class="frow g4">
        <div><label class="fl">Closing Date <span class="hint" style="position:static; font-size:9px;">(figures reflect stock as of this date only)</span></label>
          <input type="date" value="${esc(financeClosingDate)}" onchange="setFinanceClosingDate(this.value)"></div>
      </div>
      <div class="hint" style="position:static; display:block; margin:10px 0 0;">Only stock transactions dated on or before the Closing Date are included in every figure below — anything entered or dated after the Closing Date has no effect on this report, so a past month-end can always be re-run later and will still match what was true on that date. Scope: our own Sales Manufacturing Raw Material → Machining (WIP) → Finished Goods only — Job Work items (customer-supplied material) are excluded from every figure here, since that stock and its material cost is never ours.</div>
      <div id="financeStatementBox">${financeStatementHtml()}</div>
    </div>
  `;
}
