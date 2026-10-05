/* ---------------- STORES ---------------- */
function labourQuotePartNoOptionsHtml(customerId){
  const seen = new Map();
  DB.labourQuotation.filter(q=>unitMatch(q.unit) && (!customerId || q.customerId===customerId)).forEach(q=>{
    (q.items||[]).forEach(it=>{
      const pn = (it.partNo||'').trim();
      if(!pn || seen.has(pn)) return; // first match wins as the default
      seen.set(pn, {partName:it.partName||'', quoteId:q.id, quoteNo:q.quoteNo});
    });
  });
  return Array.from(seen.entries()).map(([pn,v])=>
    `<option value="${esc(pn)}" data-quoteid="${esc(v.quoteId)}" data-quoteno="${esc(v.quoteNo)}" data-partname="${esc(v.partName)}">${esc(pn)} (${esc(v.quoteNo)})</option>`
  ).join('');
}
let stLQLink = null;
function fillItemFromLabourQuote(sel){
  const opt = sel.selectedOptions[0];
  const box = document.getElementById('lpLQLinkBox');
  if(!opt || !opt.value){ stLQLink=null; if(box) box.innerHTML=''; return; }
  const partno = opt.value;
  const {quoteid,quoteno,partname} = opt.dataset;
  document.getElementById('lpPartNo').value = partno||'';
  document.getElementById('lpPartName').value = partname||''; // defaults from Part No, still editable
  document.getElementById('lpSource').value = 'Job Work Quotation ' + quoteno;
  stLQLink = {quotationId:quoteid, quoteNo:quoteno, partNo:partno, partName:partname};
  if(box) box.innerHTML = `🔗 Will link to Job Work Quotation <strong>${esc(quoteno)}</strong> — Part Name auto-filled, editable if needed`;
}
function fillStorePartFromMaster(selEl){
  const opt = selEl.options[selEl.selectedIndex];
  const pn = document.getElementById('ppPartNo');
  const nm = document.getElementById('ppPartName');
  if(!opt || !opt.value || opt.value==='__other__'){
    if(opt && opt.value==='__other__'){ pn.value=''; nm.value=''; pn.focus(); }
    return;
  }
  pn.value = opt.getAttribute('data-code')||'';
  nm.value = opt.getAttribute('data-name')||'';
  autoFillUnitWeightFromNorm();
}
function autoFillUnitWeightFromNorm(){
  const pn = document.getElementById('ppPartNo');
  const uw = document.getElementById('ppUnitWt');
  if(!pn || !uw) return;
  const val = pn.value.trim().toLowerCase();
  if(!val) return;
  const norm = DB.bom.find(b=>b.mapType==='BAR' && (b.purPartNo||'').trim().toLowerCase()===val && b.normWeight>0);
  if(norm && !uw.value){ uw.value = norm.normWeight; toast('Unit weight auto-filled from BOM norm ('+norm.normWeight+' Kg/Pc)'); }
}
function setStoresSubTab(t){ storesSubTab = t; forgConvertMode=false; render(); }
/* ===== Material Ledger Report (Stores) ===================================================
   Two separate ledgers — Raw Material (DB.storesBar) and Forging Material (DB.storesForging) —
   built entirely from data the app already maintains: each stock item's own history[] log
   (pushed by pushStockHistory on every Receipt/Issue) supplies the date-wise movement trail and
   the running Balance Qty (balanceAfter); the Item Master's VIPL Quotation Price (vqPrice)
   supplies Rate per Unit/Kg for valuation; Supplier is looked up (best-effort) from Purchase
   Orders whose item description matches the Part No, since neither storesBar/storesForging nor
   its history entries carry a direct Purchase Order link today. No new source-of-truth data is
   introduced — this report only reads and re-presents existing records as a ledger. */
function partMasterRate(partNo){
  const key = (partNo||'').trim().toLowerCase();
  if(!key) return 0;
  const it = DB.items.find(i=>(i.code||'').trim().toLowerCase()===key);
  return it ? (parseFloat(it.vqPrice)||0) : 0;
}
// Best-effort Supplier lookup: the most recent Purchase Order (this unit) whose item
// description contains the Part No. Returns '' if nothing matches (shown as '—' in the table).
function lastKnownSupplierForPart(partNo){
  const key = (partNo||'').trim().toLowerCase();
  if(!key) return '';
  const matches = DB.purchase.filter(p=> reportUnitMatch(p.unit) && (p.items||[]).some(it=>(it.desc||'').toLowerCase().includes(key)));
  if(!matches.length) return '';
  matches.sort((a,b)=>(a.poDate||'').localeCompare(b.poDate||''));
  return matches[matches.length-1].supplier || '';
}
// Flattens one stock bucket (DB.storesBar or DB.storesForging) into date-wise ledger rows:
// Opening Qty → Received / Issued / Return-Rejected → Balance Qty (running, per Part No), each
// valued at the part's master Rate per Unit/Kg.
function materialLedgerRows(bucketKey){
  const list = DB[bucketKey].filter(x=>reportUnitMatch(x.unit));
  const rows = [];
  list.forEach(s=>{
    const rate = partMasterRate(s.partNo);
    const supplier = lastKnownSupplierForPart(s.partNo);
    const hist = (s.history||[]).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    let running = 0;
    hist.forEach(h=>{
      const opening = running;
      let received=0, issued=0, retRej=0;
      if(h.type==='purchase' || h.type==='conversion-in') received = parseFloat(h.qty)||0;
      else if(h.type==='issue' || h.type==='conversion-out') issued = parseFloat(h.qty)||0;
      else if(h.type==='adjust'){ const q=parseFloat(h.qty)||0; if(q<0) retRej = Math.abs(q); else received = q; }
      const balance = (h.balanceAfter!=null && h.balanceAfter!=='') ? (parseFloat(h.balanceAfter)||0) : (opening + received - issued - retRej);
      running = balance;
      rows.push({
        date:h.date||'', partNo:s.partNo||'', partName:s.partName||'',
        supplier: (h.type==='purchase') ? (supplier||'—') : '—',
        ref: h.note||'—', opening, received, issued, retRej, balance, rate,
        totalValue: received*rate, issuedValue: issued*rate, balanceValue: balance*rate
      });
    });
  });
  return rows.sort((a,b)=> (a.date||'').localeCompare(b.date||'') || a.partNo.localeCompare(b.partNo));
}
function materialLedgerFilteredRows(bucketKey){
  let rows = materialLedgerRows(bucketKey);
  if(mlFilterPartNo.trim()){
    const needle = mlFilterPartNo.trim().toLowerCase();
    rows = rows.filter(r=>r.partNo.toLowerCase().includes(needle));
  }
  if(mlFilterFrom) rows = rows.filter(r=> r.date && r.date>=mlFilterFrom);
  if(mlFilterTo) rows = rows.filter(r=> r.date && r.date<=mlFilterTo);
  return rows;
}
function setMLLedgerTab(t){ mlLedgerTab = t; render(); }
function setMLFilter(field, val){ mlFilterPartNo = field==='partNo'?val:mlFilterPartNo; mlFilterFrom = field==='from'?val:mlFilterFrom; mlFilterTo = field==='to'?val:mlFilterTo; render(); }
function clearMLFilters(){ mlFilterPartNo=''; mlFilterFrom=''; mlFilterTo=''; render(); }
function materialLedgerTableHtml(rows){
  return `
    <div class="tw">
      <table>
        <tr>
          <th>Date</th><th>Part No</th><th>Material Name</th><th>Supplier</th><th>PO / Receipt Reference</th>
          <th>Opening Qty</th><th>Received Qty</th><th>Prod. Issued Qty</th><th>Return/Rejected Qty</th><th>Balance Qty</th>
          <th>Rate (₹/Unit)</th><th>Total Value (₹)</th><th>Issued Value (₹)</th><th>Balance Value (₹)</th>
        </tr>
        ${rows.length ? rows.map(r=>`
          <tr>
            <td>${fmtDate(r.date)||'—'}</td><td>${esc(r.partNo)}</td><td>${esc(r.partName)||'—'}</td>
            <td>${esc(r.supplier)}</td><td>${esc(r.ref)}</td>
            <td>${r.opening}</td><td>${r.received||'—'}</td><td>${r.issued||'—'}</td><td>${r.retRej||'—'}</td><td style="font-weight:700;">${r.balance}</td>
            <td>${fmtMoney(r.rate)}</td><td>${fmtMoney(r.totalValue)}</td><td>${fmtMoney(r.issuedValue)}</td><td>${fmtMoney(r.balanceValue)}</td>
          </tr>`).join('') : `<tr><td colspan="14" class="empty">No material movements found${mlFilterPartNo||mlFilterFrom||mlFilterTo?' for the selected filters':''}.</td></tr>`}
      </table>
    </div>`;
}
function printMaterialLedger(){
  const rows = materialLedgerFilteredRows(mlLedgerTab==='raw'?'storesBar':'storesForging');
  const headers = ['Date','Part No','Material Name','Supplier','PO/Receipt Ref','Opening','Received','Issued','Return/Rej.','Balance','Rate (₹)','Total Value (₹)','Issued Value (₹)','Balance Value (₹)'];
  const numCol = [false,false,false,false,false, true,true,true,true,true, true,true,true,true];
  const theadHtml = '<tr>'+headers.map((h,i)=>`<th${numCol[i]?' class="num"':''}>${esc(h)}</th>`).join('')+'</tr>';
  const dataRows = rows.map(r=>[fmtDate(r.date)||'—', esc(r.partNo), esc(r.partName)||'—', esc(r.supplier), esc(r.ref),
    r.opening, r.received||'—', r.issued||'—', r.retRej||'—', r.balance,
    fmtMoney(r.rate), fmtMoney(r.totalValue), fmtMoney(r.issuedValue), fmtMoney(r.balanceValue)]);
  const bodyHtml = dataRows.length ? dataRows.map(r=>'<tr>'+r.map((c,i)=>`<td${numCol[i]?' class="num"':''}>${c}</td>`).join('')+'</tr>').join('')
    : `<tr><td colspan="${headers.length}" style="text-align:center; padding:12px; color:#888;">No records</td></tr>`;
  const totReceived = rows.reduce((a,r)=>a+r.received,0), totIssued = rows.reduce((a,r)=>a+r.issued,0), totRetRej = rows.reduce((a,r)=>a+r.retRej,0);
  const totBalVal = rows.reduce((a,r)=>a+r.balanceValue,0);
  const colgroupHtml = '<colgroup>'+[7,8,12,9,9,6,6,6,6,6,6,6,6,7].map(w=>`<col style="width:${w}%;">`).join('')+'</colgroup>';
  printReport(`${mlLedgerTab==='raw'?'Raw Material':'Forging Material'} Ledger Report`, headers, dataRows,
    {orientation:'landscape', theadHtml, bodyHtml, colgroupHtml, barRight:`Received: ${totReceived} · Issued: ${totIssued} · Return/Rej: ${totRetRej} · Balance Value: ${fmtMoney(totBalVal)}`});
}
function renderMaterialLedger(sub){
  const bucketKey = mlLedgerTab==='raw' ? 'storesBar' : 'storesForging';
  const rows = materialLedgerFilteredRows(bucketKey);
  const totReceived = rows.reduce((a,r)=>a+r.received,0);
  const totIssued = rows.reduce((a,r)=>a+r.issued,0);
  const totRetRej = rows.reduce((a,r)=>a+r.retRej,0);
  // Balance Qty/Value should reflect the CURRENT balance per Part No, not a sum across every
  // historical row (which would double-count) — take each part's latest row only.
  const latestByPart = {};
  rows.forEach(r=>{ latestByPart[r.partNo] = r; }); // rows are date-sorted, so the last write per part is the latest
  const totBalanceQty = Object.values(latestByPart).reduce((a,r)=>a+r.balance,0);
  const totBalanceVal = Object.values(latestByPart).reduce((a,r)=>a+r.balanceValue,0);
  sub.innerHTML = `
    <div class="subtabs" style="margin-bottom:14px;">
      <button class="${mlLedgerTab==='raw'?'active':''}" onclick="setMLLedgerTab('raw')">🔩 Raw Material Ledger</button>
      <button class="${mlLedgerTab==='forging'?'active':''}" onclick="setMLLedgerTab('forging')">⚙️ Forging Material Ledger</button>
    </div>
    <div class="panel">
      <h3>${mlLedgerTab==='raw'?'Raw Material':'Forging Material'} Ledger <span class="hint">${rows.length} movement(s)</span>
        <button class="btn ghost small" onclick="printMaterialLedger()" style="float:right;">🖨 Print</button>
      </h3>
      <div class="frow g4">
        <div><label class="fl">Part No <span class="hint" style="position:static; font-size:9.5px;">(type to search)</span></label>
          <input type="text" value="${esc(mlFilterPartNo)}" placeholder="e.g. NE121279" oninput="setMLFilter('partNo', this.value)"></div>
        <div><label class="fl">From Date</label><input type="date" value="${esc(mlFilterFrom)}" onchange="setMLFilter('from', this.value)"></div>
        <div><label class="fl">To Date</label><input type="date" value="${esc(mlFilterTo)}" onchange="setMLFilter('to', this.value)"></div>
        <div style="align-self:end;">${(mlFilterPartNo||mlFilterFrom||mlFilterTo) ? `<button class="btn ghost" onclick="clearMLFilters()">✕ Clear Filters</button>` : ''}</div>
      </div>
      <div class="cards" style="margin:14px 0;">
        <div class="card"><div class="v">${totReceived}</div><div class="l">Total Received Qty</div></div>
        <div class="card"><div class="v">${totIssued}</div><div class="l">Total Issued to Production</div></div>
        <div class="card"><div class="v">${totRetRej}</div><div class="l">Total Return/Rejected Qty</div></div>
        <div class="card"><div class="v">${totBalanceQty}</div><div class="l">Current Balance Qty</div></div>
        <div class="card"><div class="v">${fmtMoney(totBalanceVal)}</div><div class="l">Current Balance Value</div></div>
      </div>
      ${materialLedgerTableHtml(rows)}
      <div class="hint" style="position:static; margin-top:10px;">Supplier is inferred from the most recent Purchase Order whose item description matches this Part No — verify against the source Purchase Order / GRN for statutory or audit use. Return/Rejected Qty reflects any negative stock adjustments logged against the part; most parts will show 0 here.</div>
    </div>
  `;
}
function renderStores(main){
  if(!subOK('stores', storesSubTab)) storesSubTab = firstAllowedSub('stores') || storesSubTab;
  main.innerHTML = `
    <div class="topbar"><div></div></div>
    ${flowline('stores')}
    <div class="subtabs" style="margin-top:14px;">
      ${subOK('stores','bar')?`<button class="${storesSubTab==='bar'?'active':''}" onclick="setStoresSubTab('bar')">🔩 Bar Stock</button>`:''}
      ${subOK('stores','forging')?`<button class="${storesSubTab==='forging'?'active':''}" onclick="setStoresSubTab('forging')">⚙️ Forging Stock</button>`:''}
      ${subOK('stores','labour')?`<button class="${storesSubTab==='labour'?'active':''}" onclick="setStoresSubTab('labour')">👷 Job Work Stock</button>`:''}
      ${subOK('stores','wip')?`<button class="${storesSubTab==='wip'?'active':''}" onclick="setStoresSubTab('wip')">🔁 Material Issue — Next Stage ${storesWIPList().length?`<span class="badge">${storesWIPList().length}</span>`:''}</button>`:''}
      ${subOK('stores','ledger')?`<button class="${storesSubTab==='ledger'?'active':''}" onclick="setStoresSubTab('ledger')">📒 Material Ledger Report</button>`:''}
    </div>
    <div id="storesSub"></div>
  `;
  const sub = document.getElementById('storesSub');
  if(storesSubTab==='bar') return renderBarStock(sub);
  if(storesSubTab==='forging') return renderForgingStock(sub);
  if(storesSubTab==='wip') return renderStoresWIP(sub);
  if(storesSubTab==='ledger') return renderMaterialLedger(sub);
  return renderLabourStock(sub);
}
// Req. #1/#3/#4: material returned to Stores from a completed Production or Subcontract job sits
// here as Work-in-Progress until issued onward — In-House (Production) or Subcontract — to the Part's
// Next Stage, which is remembered from that Part's saved routing (Product Development → Part Routing).
function storesWIPList(){ return DB.stores.filter(x=>reportUnitMatch(x.unit) && x.wip && (x.qty||0)>0.0001); }
let wipCustSearch = '';
let wipPartSearch = '';
let wipDateFrom = firstOfCurrentMonth();
let wipDateTo = today();
function filterStoresWIP(){
  wipCustSearch = (document.getElementById('wipCustInp')||{value:''}).value.trim().toLowerCase();
  wipPartSearch = (document.getElementById('wipPartInp')||{value:''}).value.trim().toLowerCase();
  const box = document.getElementById('storesWIPGrid');
  if(box) box.innerHTML = storesWIPGridHtml();
}
function filterStoresWIPDate(which, val){
  if(which==='from') wipDateFrom = val; else wipDateTo = val;
  const box = document.getElementById('storesWIPGrid');
  if(box) box.innerHTML = storesWIPGridHtml();
}
function resetStoresWIPDateToCurrentMonth(){
  wipDateFrom = firstOfCurrentMonth(); wipDateTo = today();
  const fromEl = document.getElementById('wipDateFromInp'); if(fromEl) fromEl.value = wipDateFrom;
  const toEl = document.getElementById('wipDateToInp'); if(toEl) toEl.value = wipDateTo;
  const box = document.getElementById('storesWIPGrid');
  if(box) box.innerHTML = storesWIPGridHtml();
}
function storesWIPFilteredList(){
  let list = storesWIPList();
  if(wipCustSearch) list = list.filter(s=>(s.customerName||'').toLowerCase().includes(wipCustSearch));
  if(wipPartSearch) list = list.filter(s=>(s.partNo||'').toLowerCase().includes(wipPartSearch));
  if(wipDateFrom || wipDateTo){
    // Lots created before this filter existed have no createdDate — always keep those visible
    // rather than silently hiding older WIP material behind a date range it never had.
    list = list.filter(s=>{
      if(!s.createdDate) return true;
      if(wipDateFrom && s.createdDate < wipDateFrom) return false;
      if(wipDateTo && s.createdDate > wipDateTo) return false;
      return true;
    });
  }
  return list;
}
function storesWIPGridHtml(){
  const list = storesWIPFilteredList();
  return `<div class="grid-box">
        ${list.length ? list.slice().reverse().map(s=>`
          <div class="rec-card">
            <div class="rc-title">${esc(s.partNo)}</div>
            <div class="rc-sub">${esc(s.partName)||''}</div>
            <div class="rc-row"><span class="k">Card No</span><span class="v" style="color:var(--amber);">${esc(s.cardNo)||'—'}</span></div>
            <div class="rc-row"><span class="k">Customer</span><span class="v">${esc(custDispByName(s.customerName))||'—'}</span></div>
            <div class="rc-row"><span class="k">From Stage</span><span class="v">${esc(s.prevStage)||'—'}</span></div>
            <div class="rc-row"><span class="k">Qty in Stores</span><span class="v" style="font-weight:700;">${s.qty}</span></div>
            <div class="rc-row"><span class="k">Next Stage</span><span class="v">
              <select id="wipNext_${s.id}" onchange="setWIPNextStage('${s.id}', this.value)">
                ${['Production','Subcontract','Final Inspection'].map(st=>`<option value="${st}" ${s.nextStage===st?'selected':''}>${st}</option>`).join('')}
              </select>
            </span></div>
            ${s.nextStage==='Subcontract' ? `
            <div class="rc-row"><span class="k">Subcontractor PO</span><span class="v"><select id="wipSubPO_${s.id}" onchange="onWipSubPOChange('${s.id}')">${subcontractPOOptionsHtml()}</select></span></div>
            <div class="rc-row"><span class="k">Subcontractor</span><span class="v"><input id="wipSubName_${s.id}" disabled style="width:120px;"></span></div>
            <div class="rc-row"><span class="k">PO Price / Rate (Rs.)</span><span class="v"><input id="wipSubRate_${s.id}" disabled style="width:100px;"></span></div>
            <div class="rc-row"><span class="k">Operation/Stage</span><span class="v"><input id="wipOp_${s.id}" placeholder="e.g. Heat Treatment" style="width:120px;"></span></div>
            <div class="rc-row"><span class="k">DC No. <span style="color:var(--red);">*</span></span><span class="v"><input id="wipDcNo_${s.id}" placeholder="Delivery Challan No." style="width:120px;"></span></div>
            <div class="rc-row"><span class="k">DC Date</span><span class="v"><input id="wipDcDate_${s.id}" type="date" value="${esc(today())}" style="width:130px;"></span></div>` : ''}
            <div class="rc-actions">
              <input id="wipQty_${s.id}" type="number" step="any" placeholder="Qty" value="${s.qty}" style="width:80px; display:inline-block; margin-right:6px;">
              <button class="btn small amber" onclick="issueWIPOnward('${s.id}')">→ Issue to ${esc(s.nextStage)}</button>
            </div>
          </div>`).join('') : `<div class="empty">${(wipCustSearch||wipPartSearch||wipDateFrom||wipDateTo)?'No WIP material matches the current filters.':'No material currently pending in WIP — nothing has completed a Production or Subcontract stage yet.'}</div>`}
      </div>`;
}
function renderStoresWIP(main){
  const list = storesWIPList();
  main.innerHTML = `
    <div class="panel" style="margin-top:16px;">
      <h3>Work-in-Progress — Awaiting Issue to Next Stage <span class="hint">${list.length} lot(s)</span></h3>
      <div class="hint" style="position:static; margin-bottom:10px;">Material completed at Production or Subcontract returns here automatically and stays in Stores until issued onward. The Next Stage shown is remembered from the Part's saved routing (Product Development → Part Routing) — override it inline if required.</div>
      <div class="frow g4" style="align-items:end; margin-bottom:12px;">
        <div style="max-width:280px;">
          <label class="fl">🔍 Search by Customer Name</label>
          <input id="wipCustInp" placeholder="Type a Customer Name…" value="${esc(wipCustSearch)}" oninput="filterStoresWIP()">
        </div>
        <div style="max-width:280px;">
          <label class="fl">🔍 Search by Part Number</label>
          <input id="wipPartInp" placeholder="Type a Part No…" value="${esc(wipPartSearch)}" oninput="filterStoresWIP()">
        </div>
        <div><label class="fl">From Date</label><input type="date" id="wipDateFromInp" value="${esc(wipDateFrom)}" onchange="filterStoresWIPDate('from', this.value)"></div>
        <div><label class="fl">To Date</label><input type="date" id="wipDateToInp" value="${esc(wipDateTo)}" onchange="filterStoresWIPDate('to', this.value)"></div>
        <div><button class="btn ghost small" onclick="resetStoresWIPDateToCurrentMonth()" title="Reset to the 1st of this month → today">📅 This Month</button></div>
      </div>
      <div id="storesWIPGrid">${storesWIPGridHtml()}</div>
    </div>`;
}
function subcontractorOptionsHtml(selected){
  return '<option value="">— select —</option>' + DB.subcontractors.map(s=>`<option value="${s.id}" ${selected===s.id?'selected':''}>${esc(s.name)}${s.process?' — '+esc(s.process):''}</option>`).join('');
}
// Options list of OPEN Subcontractor POs (balance qty > 0) for the Stores → Subcontract issue
// screens. Each option carries data-* attributes so the issue form can auto-fill the
// Subcontractor, Process and Rate (Rs.) the instant a PO is picked — no manual price entry.
function subcontractPOOptionsHtml(){
  const list = DB.subcontractPOs.filter(po=>subcontractPOBalance(po)>0.0001);
  return '<option value="">— select a Subcontractor PO —</option>' + list.map(po=>
    `<option value="${po.id}" data-sub="${po.subcontractorId}" data-subname="${esc(po.subcontractorName)}" data-process="${esc(po.process)}" data-rate="${po.rate||0}" data-bal="${subcontractPOBalance(po)}">${esc(po.poNo)} — ${esc(po.subcontractorName)} (Bal ${subcontractPOBalance(po)})</option>`
  ).join('');
}
// Shared In-House / Subcontract issue-type block for the Bar Stock / Forging Stock "Issue Material"
// panels (Req. #1) — prefix distinguishes element ids per panel ('bar' | 'forg'). The Subcontract
// branch is now driven entirely by a Subcontractor PO pick: choosing a PO auto-fills the
// Subcontractor, Process and PO Price/Rate (Rs.) — nothing here is typed manually.
// Auto-generates the next Delivery Challan No. for a Stores → Subcontract issue (format
// DC-0001, DC-0002, ...) — the field is no longer manually typed.
function nextStoresDcNo(){
  DB.counters.storesDC = (DB.counters.storesDC||0) + 1;
  return 'DC-' + String(DB.counters.storesDC).padStart(4,'0');
}
function issueTypeFieldsHtml(prefix){
  return `
    <div class="frow g4" style="margin-top:10px;">
      <div><label class="fl">5. Issue Type</label><select id="${prefix}IssueType" onchange="onIssueTypeChange('${prefix}')">
        <option value="In-House">In-House</option>
        <option value="Subcontract">Subcontract</option>
      </select></div>
      <div id="${prefix}SubFields" style="display:none;"><label class="fl">Subcontractor PO</label><select id="${prefix}SubPO" onchange="onIssueSubPOChange('${prefix}')">${subcontractPOOptionsHtml()}</select></div>
      <div id="${prefix}SubNameRow" style="display:none;"><label class="fl">Subcontractor</label><input id="${prefix}SubName" disabled></div>
      <div id="${prefix}SubRateRow" style="display:none;"><label class="fl">PO Price / Rate (Rs.)</label><input id="${prefix}SubRate" disabled></div>
      <div id="${prefix}SubOpRow" style="display:none;"><label class="fl">Operation / Stage</label><input id="${prefix}SubOp" placeholder="e.g. Heat Treatment, Plating"></div>
      <div id="${prefix}SubDueRow" style="display:none;"><label class="fl">Due Date</label><input id="${prefix}SubDue" type="date"></div>
      <div id="${prefix}SubDcNoRow" style="display:none;"><label class="fl">Delivery Challan No. <span class="hint" style="position:static; font-size:9.5px;">(auto)</span></label><input id="${prefix}SubDcNo" disabled></div>
      <div id="${prefix}SubDcDateRow" style="display:none;"><label class="fl">DC Date</label><input id="${prefix}SubDcDate" type="date" value="${esc(today())}"></div>
    </div>`;
}
function onIssueSubPOChange(prefix){
  const sel = document.getElementById(prefix+'SubPO');
  const opt = sel && sel.selectedOptions ? sel.selectedOptions[0] : null;
  const nameEl = document.getElementById(prefix+'SubName');
  const rateEl = document.getElementById(prefix+'SubRate');
  if(nameEl) nameEl.value = opt ? (opt.dataset.subname||'') : '';
  if(rateEl) rateEl.value = opt && opt.dataset.rate ? '₹'+parseFloat(opt.dataset.rate).toFixed(2) : '';
}
function onIssueTypeChange(prefix){
  const isSub = document.getElementById(prefix+'IssueType').value==='Subcontract';
  ['SubFields','SubNameRow','SubRateRow','SubOpRow','SubDueRow','SubDcNoRow','SubDcDateRow'].forEach(k=>{
    const el = document.getElementById(prefix+k);
    if(el) el.style.display = isSub ? '' : 'none';
  });
  if(isSub){
    onIssueSubPOChange(prefix);
    const dcEl = document.getElementById(prefix+'SubDcNo');
    if(dcEl && !dcEl.value) dcEl.value = nextStoresDcNo();
  }
}
function readIssueTypeFields(prefix){
  const issueType = (document.getElementById(prefix+'IssueType')||{}).value || 'In-House';
  if(issueType!=='Subcontract') return {issueType:'In-House'};
  const poSel = document.getElementById(prefix+'SubPO');
  const poOpt = poSel && poSel.selectedOptions ? poSel.selectedOptions[0] : null;
  const poId = poSel ? poSel.value : '';
  const subcontractorId = poOpt ? (poOpt.dataset.sub||'') : '';
  const subcontractorName = poOpt ? (poOpt.dataset.subname||'') : '';
  const rate = poOpt && poOpt.dataset.rate ? parseFloat(poOpt.dataset.rate)||0 : 0;
  const operation = (document.getElementById(prefix+'SubOp')||{}).value.trim();
  const dueDate = (document.getElementById(prefix+'SubDue')||{}).value || '';
  const dcNo = (document.getElementById(prefix+'SubDcNo')||{}).value.trim();
  const dcDate = (document.getElementById(prefix+'SubDcDate')||{}).value || '';
  return {issueType:'Subcontract', poId, subcontractorId, subcontractorName, rate, operation, dueDate, dcNo, dcDate};
}
function onWipSubPOChange(stId){
  const sel = document.getElementById('wipSubPO_'+stId);
  const opt = sel && sel.selectedOptions ? sel.selectedOptions[0] : null;
  const nameEl = document.getElementById('wipSubName_'+stId);
  const rateEl = document.getElementById('wipSubRate_'+stId);
  if(nameEl) nameEl.value = opt ? (opt.dataset.subname||'') : '';
  if(rateEl) rateEl.value = opt && opt.dataset.rate ? '₹'+parseFloat(opt.dataset.rate).toFixed(2) : '';
}
function setWIPNextStage(stId, stage){ const s=DB.stores.find(x=>x.id===stId); if(s){ s.nextStage=stage; saveDB(); } renderStoresWIP(document.getElementById('storesSub')); }
function issueWIPOnward(stId){
  if(!requireWorkingUnit()) return;
  const s = DB.stores.find(x=>x.id===stId);
  if(!s){ toast('Stock item not found'); return; }
  const qty = parseFloat((document.getElementById('wipQty_'+stId)||{}).value)||0;
  if(qty<=0){ toast('Enter a valid quantity to issue'); return; }
  if(s.nextStage==='Final Inspection'){ issueWIPToFinalInsp(stId); return; }
  if(s.nextStage==='Subcontract'){
    const poSel = document.getElementById('wipSubPO_'+stId);
    const poOpt = poSel && poSel.selectedOptions ? poSel.selectedOptions[0] : null;
    const poId = poSel ? poSel.value : '';
    const subId = poOpt ? (poOpt.dataset.sub||'') : '';
    const subName = poOpt ? (poOpt.dataset.subname||'') : '';
    const rate = poOpt && poOpt.dataset.rate ? parseFloat(poOpt.dataset.rate)||0 : 0;
    const operation = (document.getElementById('wipOp_'+stId)||{}).value.trim();
    const dcNo = (document.getElementById('wipDcNo_'+stId)||{}).value.trim();
    const dcDate = (document.getElementById('wipDcDate_'+stId)||{}).value || '';
    issueStoresQty('stores', stId, qty, {finPartNo:s.partNo, finPartName:s.partName, issueType:'Subcontract', poId, subcontractorId:subId, subcontractorName:subName, rate, operation, dcNo, dcDate, stageIndex:s.routeIndex});
    return;
  }
  issueStoresQty('stores', stId, qty, {finPartNo:s.partNo, finPartName:s.partName, issueType:'In-House', stageIndex:s.routeIndex});
}
