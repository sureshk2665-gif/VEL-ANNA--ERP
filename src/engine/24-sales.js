/* ---------------- SALES ---------------- */
function currentSalesInvoiceKind(){ return salesSubTab==='labourInvoice' ? 'labour' : 'sales'; }
// Invoice-level packing count label — Sales Invoices pack in Boxes, Job Work Invoices in Trays.
function packCountLabel(kind){ return kind==='labour' ? 'Number of Trays' : 'Number of Boxes'; }
// Reads + validates the packing-count field on the invoice form. Returns {ok, value} where value
// is '' (left blank) or a whole number ≥ 0.
function readSalePackCount(kind){
  const el = document.getElementById('slPackCount');
  const raw = el ? el.value.trim() : '';
  if(raw==='') return {ok:true, value:''};
  const n = Number(raw);
  if(!Number.isInteger(n) || n<0){ toast(`${packCountLabel(kind)} must be a whole number (0 or more)`); return {ok:false}; }
  return {ok:true, value:n};
}
// Options for the Job Work PO dropdown used inside the Job Work Invoice item row. Filtered by
// Customer; each option already carries its own Finished Part No/Name, so this single
// dropdown IS the Finished Part No selection for a Job Work Invoice row.
// Matches a Sales/Job Work PO's unit against the Unit chosen on the invoice. A PO with no unit
// recorded, or raised while Admin Office was active (before per-invoice Unit selection existed),
// is treated as belonging to EITHER unit rather than being hidden — only a PO explicitly stamped
// with the OTHER specific unit is excluded.
function poUnitMatches(recUnit, invoiceUnit){
  if(!invoiceUnit) return true;
  if(!recUnit || recUnit==='Admin') return true;
  return recUnit===invoiceUnit;
}
function liPOOptionsHtml(customerId, finPartNo, selectedId, unit){
  if(!unit) return '<option value="">— select the Unit above first —</option>';
  if(!customerId) return '<option value="">— select a Customer first —</option>';
  let list = DB.labourPO.filter(p=>p.customerId===customerId && poUnitMatches(p.unit, unit));
  if(finPartNo) list = list.filter(p=>(p.finPartNo||'').trim().toLowerCase()===finPartNo.trim().toLowerCase());
  if(!list.length) return `<option value="">— no Open PO found for ${esc(unit)}${finPartNo?' / this part':''} —</option>`;
  list = dedupePOsByPart(list, p=>labourPOTotals(p).pending, selectedId); // one option per Part No — no duplicates
  return '<option value="">— select Open PO —</option>' + list.slice().sort((a,b)=>(a.finPartNo||'').localeCompare(b.finPartNo||'')).map(p=>
    `<option value="${p.id}" ${p.id===selectedId?'selected':''}>${esc(p.finPartNo)}</option>`).join('');
}
function setSalesSubTab(t){
  salesSubTab = t;
  // Reset the item-entry draft when switching tabs; Job Work Invoice rows are always linked
  // to a Job Work Quotation (no "none"/"sales" choice needed on this screen).
  saleItemRows = [emptySaleItemRow()];
  editingSaleId = null;
  saleInvoiceUnit = (currentUnit==='Unit-1'||currentUnit==='Unit-2') ? currentUnit : '';
  render();
}
// User picks the Unit (Unit-1/Unit-2) on the New Invoice form — this is what filters which
// Sales PO / Job Work PO (and therefore which Part Numbers) are selectable below. Changing it
// clears any Part No already picked on every row, since it may no longer be valid for the new
// Unit, and refreshes the Part No / PO No dropdowns immediately.
function onSaleUnitChange(selEl){
  saleInvoiceUnit = selEl.value;
  saleItemRows.forEach(r=>{ r.partNo=''; r.partName=''; r.rate=''; r.qty=''; r.uom=''; r.labourPOId=''; r.custPOId=''; });
  const poNoEl = document.getElementById('slPoNo'); if(poNoEl) poNoEl.value='';
  const poDateEl = document.getElementById('slPoDate'); if(poDateEl) poDateEl.value='';
  // Job Work Invoice numbering is unit-wise (Unit-1 plain / Unit-2 "S-" prefixed) — the moment
  // the Unit is (re)picked on a brand-new (not-yet-saved) invoice, refresh the auto-suggested
  // Invoice No to that Unit's next number. Skipped when editing an existing invoice/draft,
  // since the Unit is locked there anyway.
  if(!editingSaleId && currentSalesInvoiceKind()==='labour'){
    const invEl = document.getElementById('slInv');
    if(invEl){
      const dateEl = document.getElementById('slDate');
      invEl.value = saleInvoiceUnit ? nextLabourInvNo(dateEl?dateEl.value:today(), saleInvoiceUnit) : '';
    }
  }
  renderSaleItemsTable();
}

/* ==== MONTHLY SALES / LABOUR / COMMON INVOICE SUMMARY DASHBOARD ====
   Sits at the top of the Sales module. Filterable by Month and by Customer (default: All
   Customers) — filters are shared across all three variants below.

   IMPORTANT — every figure here is fetched from the *source* record, never from the raised
   Invoice itself (DB.sales), so the dashboard always reflects what was actually ordered /
   planned, independent of billing progress:

     Sales (kind='sales'):
       PO Value        = Sales PO Ordered Qty × Sales PO Price, for every Sales PO (DB.custPO)
                          whose PO Date falls in the selected month — fetched straight from the
                          Sales PO record.
       Committed Value = sum of Sales Plan entries (DB.custPO[].plans[], logged in
                          Planning → Sales Plan) dated in the selected month, valued at the
                          Sales PO's Price.

     Job Work (kind='labour') — sourced ONLY from the Planning module (DB.labourPO's
     Planning-owned arrays), never from invoices:
       Scheduled Value = sum of Customer Schedule Qty entries (DB.labourPO[].scheduleQtyEntries[],
                          logged in Planning → Job Work Plan) dated in the selected month, valued
                          at the Job Work PO's Price.
       Committed Value = sum of Commitment entries (DB.labourPO[].commitments[], logged in
                          Planning → Job Work Plan) dated in the selected month, valued at the
                          Job Work PO's Price.

     Balance Value     = (first card) − Committed Value, for either kind.
   'combined' sums the Sales and Job Work figures into one Common Invoice Summary card set.
   All scoped to the active unit (Admin = all units) and, when set, to one customer. */
// Sales PO Value — fetched from the Sales PO (Customer PO) record itself: Ordered Qty × Price,
// for Sales POs whose own PO Date falls in the selected month.
function salesDashPOValue(month, customerId){
  let total = 0;
  DB.custPO.filter(p=>reportUnitMatch(p.unit) && (!customerId || p.customerId===customerId)).forEach(p=>{
    if(monthKeyOf(p.custPoDate)===month) total += (parseFloat(p.orderedQty)||0)*(parseFloat(p.price)||0);
  });
  return total;
}
// Sales Committed Value — from the Sales Plan entries logged against each Sales PO in Planning.
function salesDashCommittedValue(month, customerId){
  let total = 0;
  DB.custPO.filter(p=>reportUnitMatch(p.unit) && (!customerId || p.customerId===customerId)).forEach(p=>{
    const price = parseFloat(p.price)||0;
    (p.plans||[]).forEach(pl=>{ if(monthKeyOf(pl.date)===month) total += (parseFloat(pl.qty)||0)*price; });
  });
  return total;
}
// Job Work Scheduled Value — from the Customer Schedule Qty entries logged in Planning → Job Work Plan.
function labourDashScheduledValue(month, customerId){
  let total = 0;
  DB.labourPO.filter(p=>reportUnitMatch(p.unit) && (!customerId || p.customerId===customerId)).forEach(p=>{
    const price = parseFloat(p.price)||0;
    (p.scheduleQtyEntries||[]).forEach(s=>{ if(monthKeyOf(s.date)===month) total += (parseFloat(s.qty)||0)*price; });
  });
  return total;
}
// Job Work Committed Value — from the Commitment entries logged in Planning → Job Work Plan.
function labourDashCommittedValue(month, customerId){
  let total = 0;
  DB.labourPO.filter(p=>reportUnitMatch(p.unit) && (!customerId || p.customerId===customerId)).forEach(p=>{
    const price = parseFloat(p.price)||0;
    (p.commitments||[]).forEach(c=>{ if(monthKeyOf(c.date)===month) total += (parseFloat(c.qty)||0)*price; });
  });
  return total;
}
// Invoice Value — the actual raised Invoice amount (qty × rate) for the given kind, whose
// Invoice Date falls in the selected month. This is the only card fetched from DB.sales
// (the invoice itself) rather than from the PO/Planning records.
function salesDashInvoiceValue(month, customerId, kind){
  const custName = customerId ? (DB.customers.find(c=>c.id===customerId)||{}).name : '';
  return DB.sales.filter(s=>reportUnitMatch(s.unit) && (kind==='labour' ? s.invKind==='labour' : s.invKind!=='labour') && monthKeyOf(s.invDate)===month && (!customerId || s.customer===custName))
    .reduce((a,s)=>a+(parseFloat(s.qty)||0)*(parseFloat(s.rate)||0), 0);
}
function salesDashMonthOptionsHtml(){
  const months = new Set([salesDashMonth]);
  // Sales PO Value is scoped by each Sales PO's own PO Date; Sales Committed Value is scoped
  // by each Sales Plan (custPO.plans[]) entry date — both live on the Customer PO / Planning
  // records, not on the invoice.
  DB.custPO.filter(p=>reportUnitMatch(p.unit)).forEach(p=>{
    const pmk=monthKeyOf(p.custPoDate); if(pmk) months.add(pmk);
    (p.plans||[]).forEach(pl=>{ const mk=monthKeyOf(pl.date); if(mk) months.add(mk); });
  });
  // Job Work Scheduled Value and Committed Value are both scoped purely by Planning-module dates
  // (Job Work Plan's Schedule Qty entries and Commitment entries on the Job Work PO record).
  DB.labourPO.filter(p=>reportUnitMatch(p.unit)).forEach(p=>{
    (p.scheduleQtyEntries||[]).forEach(s=>{ const mk=monthKeyOf(s.date); if(mk) months.add(mk); });
    (p.commitments||[]).forEach(c=>{ const mk=monthKeyOf(c.date); if(mk) months.add(mk); });
  });
  // Invoice Value is scoped by the Invoice Date itself.
  DB.sales.filter(s=>reportUnitMatch(s.unit)).forEach(s=>{ const mk=monthKeyOf(s.invDate); if(mk) months.add(mk); });
  return Array.from(months).sort().reverse().map(m=>`<option value="${m}" ${m===salesDashMonth?'selected':''}>${fmtMonthLabel(m)}</option>`).join('');
}
function fmtMonthLabel(mk){
  if(!mk) return '—';
  const [y,m] = mk.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const idx = parseInt(m,10)-1;
  return (names[idx]||m)+' '+y;
}
function salesDashCustomerOptionsHtml(){
  return '<option value="">All Customers</option>' + DB.customers.slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(c=>
    `<option value="${c.id}" ${c.id===salesDashCustomerId?'selected':''}>${esc(c.name)}</option>`).join('');
}
function setSalesDashMonth(v){ salesDashMonth = v || today().slice(0,7); refreshSalesDashboards(); }
function setSalesDashCustomer(v){ salesDashCustomerId = v || ''; refreshSalesDashboards(); }
// Re-renders every dashboard box present on the current screen (Common Summary + whichever
// per-kind box matches the active tab + the Customer-wise Sales Summary) so all stay in sync
// with one shared filter change.
function refreshSalesDashboards(){
  ['salesDashBoxCombined','salesDashBoxSales','salesDashBoxLabour'].forEach(id=>{
    const box = document.getElementById(id); if(!box) return;
    const kind = id==='salesDashBoxSales' ? 'sales' : id==='salesDashBoxLabour' ? 'labour' : 'combined';
    box.innerHTML = salesDashboardHtml(kind);
  });
  const custBox = document.getElementById('salesCustDashBox');
  if(custBox) custBox.innerHTML = customerWiseSalesSummaryHtml();
}
// Customer-wise Sales Summary — totals only (no per-invoice line items). For the selected
// month, sums each customer's raised Invoice Value (Sales + Job Work combined, qty × rate)
// from DB.sales, grouped by customer name, sorted highest first. Purely a read view: it never
// lists individual invoices, only each customer's grand total for the month.
function customerWiseSalesSummaryHtml(){
  const totals = {};
  DB.sales.filter(s=>reportUnitMatch(s.unit) && monthKeyOf(s.invDate)===salesDashMonth).forEach(s=>{
    const name = s.customer || '— Unnamed —';
    totals[name] = (totals[name]||0) + (parseFloat(s.qty)||0)*(parseFloat(s.rate)||0);
  });
  const rows = Object.entries(totals).sort((a,b)=>b[1]-a[1]);
  const grandTotal = rows.reduce((a,r)=>a+r[1],0);
  // Cycles through a fixed palette of light pastel colors so each customer row is easy to tell
  // apart at a glance — purely cosmetic, wraps around if there are more customers than colors.
  const palette = [
    {bg:'#e7f1fc', bd:'#bcd9f5', tx:'#1f5f8f'}, {bg:'#e6f8ee', bd:'#b7e4cb', tx:'#1f8f5a'},
    {bg:'#f1ecfb', bd:'#d3c2f2', tx:'#5a2f8f'}, {bg:'#fdf1e0', bd:'#f3d9a4', tx:'#a56a10'},
    {bg:'#fbe7e5', bd:'#f0bcb6', tx:'#8f3a2f'}, {bg:'#e6f6f8', bd:'#b7e0e4', tx:'#1f7f8f'},
    {bg:'#fbe9f4', bd:'#f0bcdb', tx:'#a02f6f'}, {bg:'#f3f7e2', bd:'#d6e6a8', tx:'#5a7a1f'}
  ];
  return `
    <div class="panel" style="margin-top:16px;">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
        <h3 style="margin:0;">📊 Customer-wise Sales Summary</h3>
        <div class="hint" style="position:static; font-size:10.5px;">${fmtMonthLabel(salesDashMonth)} · Total Invoice Value</div>
      </div>
      ${rows.length ? `
      <div style="display:flex; flex-direction:column; gap:6px; max-height:340px; overflow-y:auto;">
        ${rows.map(([name,val],i)=>{ const c = palette[i%palette.length]; return `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 12px; background:${c.bg}; border:1px solid ${c.bd}; border-radius:var(--r-md);">
            <span style="font-size:12px; font-weight:600; color:${c.tx};">${esc(name)}</span>
            <span style="font-size:13px; font-weight:800; color:${c.tx};">${fmtMoney(val)}</span>
          </div>`; }).join('')}
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 12px; margin-top:10px; background:linear-gradient(155deg,#4f8fce,#1f5f8f); border-radius:var(--r-md); color:#fff;">
        <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.03em;">Grand Total</span>
        <span style="font-size:14px; font-weight:800;">${fmtMoney(grandTotal)}</span>
      </div>` : '<div class="empty">No invoices raised for this month yet.</div>'}
    </div>`;
}
function salesDashboardCardsHtml(firstLabel, first, committed, invoiceValue){
  const totalBalance = committed - invoiceValue;
  return `
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(132px,1fr)); gap:7px;">
        <div style="background:#e7f1fc; border:1px solid #bcd9f5; border-radius:var(--r-md); padding:8px 11px; color:#1f5f8f; box-shadow:var(--sh-sm); text-align:center;">
          <div style="font-size:10px; letter-spacing:.03em; opacity:.85; text-transform:uppercase;">${firstLabel}</div>
          <div style="font-size:16px; font-weight:800; margin-top:2px;">${fmtMoney(first)}</div>
        </div>
        <div style="background:#e6f8ee; border:1px solid #b7e4cb; border-radius:var(--r-md); padding:8px 11px; color:#1f8f5a; box-shadow:var(--sh-sm); text-align:center;">
          <div style="font-size:10px; letter-spacing:.03em; opacity:.85; text-transform:uppercase;">Committed Value</div>
          <div style="font-size:16px; font-weight:800; margin-top:2px;">${fmtMoney(committed)}</div>
        </div>
        <div style="background:#f1ecfb; border:1px solid #d3c2f2; border-radius:var(--r-md); padding:8px 11px; color:#5a2f8f; box-shadow:var(--sh-sm); text-align:center;">
          <div style="font-size:10px; letter-spacing:.03em; opacity:.85; text-transform:uppercase;">Invoice Value</div>
          <div style="font-size:16px; font-weight:800; margin-top:2px;">${fmtMoney(invoiceValue)}</div>
        </div>
        <div style="background:${totalBalance<0?'#fbe7e5; border:1px solid #f0bcb6; color:#8f3a2f;':'#fdf1e0; border:1px solid #f3d9a4; color:#a56a10;'} border-radius:var(--r-md); padding:8px 11px; box-shadow:var(--sh-sm); text-align:center;">
          <div style="font-size:10px; letter-spacing:.03em; opacity:.85; text-transform:uppercase;">Balance Value</div>
          <div style="font-size:16px; font-weight:800; margin-top:2px;">${fmtMoney(totalBalance)}</div>
        </div>
      </div>`;
}
// kind: 'sales' | 'labour' | 'combined'. filtersHtml is only rendered once (on the combined
// card, which always sits at the top) to avoid repeating the same Month/Customer controls
// three times on one screen; the per-kind boxes below just react to the shared state.
// Sales card 1 = "PO Value" (from the Sales PO record); Job Work card 1 = "Scheduled Value"
// (from Planning → Job Work Plan's Schedule Qty entries). Card 2 is always "Committed Value",
// fetched from each module's own Planning-owned commitment entries — never from the invoice.
// Card 3 ("Invoice Value") is the one card fetched from the actual raised Invoice(s).
// Card 4 ("Balance Value") = Committed Value − Invoice Value (what's committed but not yet invoiced).
function salesDashboardHtml(kind){
  const title = kind==='labour' ? '📊 Monthly Job Work Sales Summary' : kind==='sales' ? '📊 Monthly Sales Summary' : '📊 Common Invoice Summary (Sales + Job Work)';
  let firstLabel, first, committed, invoiceValue;
  if(kind==='combined'){
    firstLabel = 'PO / Scheduled Value';
    first = salesDashPOValue(salesDashMonth, salesDashCustomerId) + labourDashScheduledValue(salesDashMonth, salesDashCustomerId);
    committed = salesDashCommittedValue(salesDashMonth, salesDashCustomerId) + labourDashCommittedValue(salesDashMonth, salesDashCustomerId);
    invoiceValue = salesDashInvoiceValue(salesDashMonth, salesDashCustomerId, 'sales') + salesDashInvoiceValue(salesDashMonth, salesDashCustomerId, 'labour');
  } else if(kind==='labour'){
    firstLabel = 'Scheduled Value';
    first = labourDashScheduledValue(salesDashMonth, salesDashCustomerId);
    committed = labourDashCommittedValue(salesDashMonth, salesDashCustomerId);
    invoiceValue = salesDashInvoiceValue(salesDashMonth, salesDashCustomerId, 'labour');
  } else {
    firstLabel = 'PO Value';
    first = salesDashPOValue(salesDashMonth, salesDashCustomerId);
    committed = salesDashCommittedValue(salesDashMonth, salesDashCustomerId);
    invoiceValue = salesDashInvoiceValue(salesDashMonth, salesDashCustomerId, 'sales');
  }
  const showFilters = kind==='combined';
  return `
    <div class="panel" style="margin-top:16px;">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
        <h3 style="margin:0;">${title}</h3>
        ${showFilters ? `
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
          <div><label class="fl">Month</label><select id="salesDashMonthSel" onchange="setSalesDashMonth(this.value)">${salesDashMonthOptionsHtml()}</select></div>
          <div><label class="fl">Customer</label><select id="salesDashCustSel" onchange="setSalesDashCustomer(this.value)">${salesDashCustomerOptionsHtml()}</select></div>
        </div>` : `<div class="hint" style="position:static; font-size:10.5px;">${fmtMonthLabel(salesDashMonth)}${salesDashCustomerId ? ' · '+esc((DB.customers.find(c=>c.id===salesDashCustomerId)||{}).name||'') : ' · All Customers'}</div>`}
      </div>
      ${salesDashboardCardsHtml(firstLabel, first, committed, invoiceValue)}
    </div>`;
}

function renderSales(main){
  if(!subOK('sales', salesSubTab)) salesSubTab = firstAllowedSub('sales') || salesSubTab;
  const isLabour = currentSalesInvoiceKind()==='labour';
  main.innerHTML = `
    <div class="topbar" style="margin-bottom:4px; padding-bottom:3px;"><div><h2>${isLabour?'Job Work Invoice':'Sales Invoice'}</h2></div>
    </div>
    <div class="sales-summary-split" style="display:grid; grid-template-columns:1.3fr 1fr; gap:12px; align-items:start; margin-top:2px;">
      <div>
        <div id="salesDashBoxCombined">${salesDashboardHtml('combined')}</div>
        <div id="${isLabour?'salesDashBoxLabour':'salesDashBoxSales'}">${salesDashboardHtml(isLabour?'labour':'sales')}</div>
      </div>
      <div id="salesCustDashBox">${customerWiseSalesSummaryHtml()}</div>
    </div>
    <div class="flowline" style="margin-top:6px;">${isLabour
      ? `<span>Job Work Quotation</span> <span>→</span> <span>Job Work PO</span> <span>→</span> <span class="here">Job Work Invoice</span>`
      : `<span>Sales Quotation</span> <span>→</span> <span>Sales PO</span> <span>→</span> <span class="here">Sales Invoice</span>`}</div>
    <div class="subtabs" style="margin-top:8px;">
      ${subOK('sales','invoices')?`<button class="${salesSubTab!=='labourInvoice'?'active':''}" onclick="setSalesSubTab('invoices')">🧾 Sales Invoice <span class="hint" style="position:static;">(from Sales PO)</span></button>`:''}
      ${subOK('sales','labourInvoice')?`<button class="${salesSubTab==='labourInvoice'?'active':''}" onclick="setSalesSubTab('labourInvoice')">🧾 Job Work Invoice <span class="hint" style="position:static;">(from Job Work PO)</span></button>`:''}
    </div>
    <div id="salesSub" style="margin-top:8px;"></div>
  `;
  const sub = document.getElementById('salesSub');
  return renderSalesInvoices(sub);
}


// Keeps the auto-generated Invoice No's FY bracket ("<seq> (25-26)") in sync with the chosen
// Invoice Date — only when the seq portion still matches the current auto-suggestion, so a
// manually-typed/custom Invoice No is never overwritten.
function onSaleInvDateChange(newDate){
  const invEl = document.getElementById('slInv');
  if(!invEl) return;
  const cur = invEl.value.trim();
  // Recognizes both the plain Sales/Unit-1 form ("126 (26-27)") and the Unit-2 "S-" prefixed
  // Job Work form ("S-126 (26-27)") so the FY bracket stays in sync either way, without ever
  // dropping/altering a manually-typed custom number.
  const m = cur.match(/^(S-)?\s*(\d+)\s*\([^)]*\)\s*$/i);
  if(!m) return; // user has customized the number — leave it alone
  invEl.value = (m[1]?m[1]:'')+m[2]+' ('+fyLabel(newDate)+')';
}
function onSaleCustChange(){
  const custId = document.getElementById('slCustSel').value;
  const c = DB.customers.find(x=>x.id===custId);
  document.getElementById('slCust').value = c ? c.name : '';
  document.getElementById('slGstin').value = c ? (c.gstin||'') : '';
  const hsnEl = document.getElementById('slHsn');
  if(hsnEl) hsnEl.value = c ? (c.hsn||'') : '';
  // Pre-fill any line item still on the default HSN with the newly-selected customer's HSN
  // Code, so the user doesn't have to re-type it per line — still freely editable per row.
  if(c && c.hsn){
    saleItemRows.forEach(r=>{ if(!r.hsn || r.hsn==='998898') r.hsn = c.hsn; });
  }
  const gstTypeEl = document.getElementById('slGstType');
  const gstVal = c ? (c.gstType==='inter'?'inter':'intra') : 'intra';
  if(gstTypeEl) gstTypeEl.value = gstVal;
  const gstDisplayEl = document.getElementById('slGstTypeDisplay');
  if(gstDisplayEl) gstDisplayEl.value = gstVal==='inter' ? 'Inter-State — IGST 18%' : 'Intra-State — CGST 9% + SGST 9%';
  // Delivery Challan No. dropdown is scoped to the selected customer (Job Work Invoice only) —
  // rebuild its options and clear any previously-selected DC since it belonged to the old customer.
  const dcSelEl = document.getElementById('slDcSel');
  if(dcSelEl){
    dcSelEl.innerHTML = labourInvoiceDcOptionsHtml(custId, '', saleItemRows[0]?saleItemRows[0].partNo:'');
    const dcNoEl = document.getElementById('slDcNo'); if(dcNoEl) dcNoEl.value = '';
    saleItemRows.forEach(r=>{ r.dcNo = ''; });
  }
  renderSaleItemsTable();
}
function getSaleCustomerContext(){
  const custSel = document.getElementById('slCustSel');
  const custInput = document.getElementById('slCust');
  const custId = custSel ? custSel.value : '';
  const custName = custInput ? custInput.value.trim() : '';
  return {custId, custName};
}
// UOM auto-fetch: sourced from Product Development (Bar/Forging Mapping), which is the one
// place UOM is maintained per Finished Part No. Defaults to NOS if not mapped.
function bomUOMForPart(finPartNo){
  const key = (finPartNo||'').trim().toLowerCase();
  if(!key) return 'NOS';
  const b = DB.bom.find(x=>(x.finPartNo||'').trim().toLowerCase()===key && x.uom);
  return b ? b.uom : 'NOS';
}
// Sales Invoice's "Customer Name → Finished Part Number" step: the filtered part list is
// drawn directly from that customer's Customer PO (Sales PO) records — the Customer PO IS
// the linked master, so selecting one auto-fetches PO No, PO Date, Part Name, Price and the
// Ordered/Invoiced/Balance quantity control together in one step.
function salesInvoicedQtyForCustPO(custPOId){
  return DB.sales.filter(s=>s.invKind!=='labour' && s.custPOId===custPOId).reduce((a,s)=>a+(parseFloat(s.qty)||0),0);
}
function salesCustPOBalance(p){ return (parseFloat(p.orderedQty)||0) - salesInvoicedQtyForCustPO(p.id); }
// Every OTHER Customer PO (same customer, same Finished Part No, excluding the one currently
// linked to this invoice line) that still has a pending Balance Quantity > 0 — surfaced so the
// user knows more stock is still owed against this part even though only one PO can be linked
// per invoice line.
function otherOpenSalesPOsForPart(customerId, finPartNo, excludeId){
  const key = (finPartNo||'').trim().toLowerCase();
  if(!key) return [];
  return DB.custPO.filter(p=> p.customerId===customerId && p.id!==excludeId && (p.finPartNo||'').trim().toLowerCase()===key)
    .map(p=>({poNo:p.custPoNo, poQty:p.orderedQty||0, invoiced:salesInvoicedQtyForCustPO(p.id), balance:salesCustPOBalance(p)}))
    .filter(x=>x.balance>0);
}
// Sums of Finished Goods Inventory currently on hand for a Part No (current unit scope) — a
// read-only reference figure shown in the Sales Invoice summary; never written to from here.
function currentInventoryStockFor(partNo){
  const key = (partNo||'').trim().toLowerCase();
  if(!key) return 0;
  return DB.inventory.filter(x=>reportUnitMatch(x.unit) && (x.partNo||'').trim().toLowerCase()===key)
    .reduce((a,x)=>a+(parseFloat(x.qty)||0),0);
}
// Compact, at-a-glance summary shown above the Part No selector on a Sales Invoice line, once a
// Customer PO is linked — PO Number, PO Quantity, Already Invoiced Quantity, Balance Quantity
// and Current Inventory Stock, each in its own subtly-tinted cell so the five figures are easy
// to tell apart without the row looking busy or over-colored.
function salesPOSummaryHtml(poNo, poQty, invoiced, balance, stock){
  const cell = (label, value, tint, warn)=>`
    <div class="poSumCell" style="background:${tint};">
      <div class="poSumLabel">${label}</div>
      <div class="poSumVal" ${warn?'style="color:#b23b3b;"':''}>${value}</div>
    </div>`;
  return `<div class="poSumRow">
    ${cell('PO Number', esc(poNo)||'—', 'rgba(90,167,255,0.12)')}
    ${cell('PO Quantity', poQty, 'rgba(63,208,201,0.14)')}
    ${cell('Already Invoiced Qty', invoiced, 'rgba(255,182,72,0.16)')}
    ${cell('Balance Quantity', balance, 'rgba(124,147,179,0.16)', balance<0)}
    ${cell('Current Inventory Stock', stock, 'rgba(111,209,122,0.16)')}
  </div>`;
}
// Extra row(s) shown ABOVE the main summary row when the same Part No has other Customer
// PO(s) (same customer) still carrying a pending Balance Quantity — one full row per such PO,
// using the SAME 4 columns/order/colors as the main row (PO Number | PO Quantity | Already
// Invoiced Quantity | Balance Quantity) so it reads as directly comparable, additional PO
// detail rather than a different kind of information.
function otherOpenPOsRowHtml(others){
  if(!others || !others.length) return '';
  const cell = (label, value, tint, warn)=>`
    <div class="poSumCell" style="background:${tint};">
      <div class="poSumLabel">${label}</div>
      <div class="poSumVal" ${warn?'style="color:#b23b3b;"':''}>${value}</div>
    </div>`;
  return others.map(o=>`<div class="poSumRow">
    ${cell('PO Number (Other Open PO)', esc(o.poNo)||'—', 'rgba(90,167,255,0.12)')}
    ${cell('PO Quantity', o.poQty, 'rgba(63,208,201,0.14)')}
    ${cell('Already Invoiced Quantity', o.invoiced, 'rgba(255,182,72,0.16)')}
    ${cell('Balance Quantity', o.balance, 'rgba(124,147,179,0.16)')}
  </div>`).join('');
}
// Collapses a list of PO records down to exactly ONE per Finished Part No, so the Part No
// dropdown never shows the same Part No twice even if a customer has several PO records
// against it. The PO with an open Balance (balanceFn > 0) wins; if none are open, the most
// recent one is kept for reference. If selectedId is supplied (editing an existing line), that
// exact PO always wins for its Part No so the current selection is never silently dropped.
function dedupePOsByPart(list, balanceFn, selectedId){
  const map = new Map();
  list.forEach(p=>{
    const key = (p.finPartNo||'').trim().toLowerCase();
    if(!key) return;
    const cur = map.get(key);
    if(!cur){ map.set(key, p); return; }
    if(selectedId && p.id===selectedId){ map.set(key, p); return; }
    if(cur.id===selectedId) return;
    const curOpen = balanceFn(cur) > 0, pOpen = balanceFn(p) > 0;
    if(pOpen || !curOpen) map.set(key, p); // prefer an open PO; among equals, the later (more recent) one wins
  });
  return Array.from(map.values());
}
function salesCustPOOptionsHtml(customerId, selectedId, unit){
  if(!unit) return '<option value="">— select the Unit above first —</option>';
  if(!customerId) return '<option value="">— select a Customer first —</option>';
  const rawList = DB.custPO.filter(p=>p.customerId===customerId && poUnitMatches(p.unit, unit));
  if(!rawList.length) return `<option value="">— no Customer PO found for this customer under ${esc(unit)} —</option>`;
  const list = dedupePOsByPart(rawList, salesCustPOBalance, selectedId); // one option per Part No — no duplicates
  return '<option value="">— select Part Number —</option>' + list.slice().sort((a,b)=>(a.finPartNo||'').localeCompare(b.finPartNo||'')).map(p=>
    `<option value="${p.id}" ${p.id===selectedId?'selected':''}>${esc(p.finPartNo)}</option>`).join('');
}

function renderSalesInvoices(main){
  const kind = currentSalesInvoiceKind();
  const isLabour = kind==='labour';
  const list = DB.sales.filter(x=>reportUnitMatch(x.unit) && (isLabour ? x.invKind==='labour' : x.invKind!=='labour'));
  // Group every line item that shares the same Invoice No (within the same unit) into a single
  // card — one invoice = one box, however many item lines it has — instead of repeating the
  // invoice header/PO/GST info once per line item.
  const groups = [];
  const groupMap = new Map();
  list.forEach(s=>{
    const key = s.unit+'||'+s.invNo;
    if(!groupMap.has(key)){ const g={key, invNo:s.invNo, items:[]}; groupMap.set(key, g); groups.push(g); }
    groupMap.get(key).items.push(s);
  });
  const editing = editingSaleId ? DB.sales.find(x=>x.id===editingSaleId) : null;
  const custMatch = editing ? DB.customers.find(c=>c.name===editing.customer) : null;
  const custOpts = DB.customers.map(c=>`<option value="${c.id}" ${custMatch&&custMatch.id===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
  // Job Work Invoices get their unit-wise next number (Unit-1 plain, Unit-2 "S-" prefixed) —
  // only once a Unit is actually chosen, since there's nothing to preview before that; Sales
  // Invoices keep the single shared sequence.
  const invNoDefault = isLabour
    ? (saleInvoiceUnit ? nextLabourInvNo(editing?editing.invDate:today(), saleInvoiceUnit) : '')
    : nextInvNo(editing?editing.invDate:today());
  // Unit is locked to the Active Unit whenever a specific unit (not Admin Office) is active;
  // Admin Office — where this module normally runs from — must choose Unit-1 or Unit-2 per
  // invoice, since Part Numbers are mapped per unit (via that unit's Sales/Job Work PO).
  const unitLocked = currentUnit==='Unit-1' || currentUnit==='Unit-2';
  if(unitLocked) saleInvoiceUnit = currentUnit;
  main.innerHTML = `
    <div class="panel">
      <h3>${editing? `✎ Edit ${isLabour?'Job Work':'Sales'} Invoice — ${esc(editing.invNo)}` : `New ${isLabour?'Job Work':'Sales'} Invoice`}</h3>
      <div class="frow g4">
        <div><label class="fl">Unit <span class="hint" style="position:static; color:var(--red);">*required</span></label>
          <select id="slUnitSel" onchange="onSaleUnitChange(this)" ${unitLocked?'disabled':''}>
            <option value="">— select Unit —</option>
            <option value="Unit-1" ${saleInvoiceUnit==='Unit-1'?'selected':''}>Unit 1 (G51-I)</option>
            <option value="Unit-2" ${saleInvoiceUnit==='Unit-2'?'selected':''}>Unit 2 (S-48)</option>
          </select>
          ${unitLocked?`<input type="hidden" id="slUnitLocked" value="${esc(currentUnit)}">`:''}
        </div>
        <div><label class="fl">Invoice No <span class="hint" style="position:static; font-size:9.5px;">(auto, editable)</span></label>
          <input id="slInv" value="${editing?esc(editing.invNo):invNoDefault}" placeholder="${(isLabour&&!editing&&!saleInvoiceUnit)?'— select Unit above first —':''}"></div>
        <div><label class="fl">Invoice Date</label><input id="slDate" type="date" value="${editing?esc(editing.invDate):today()}" ${editing?'':'onchange="onSaleInvDateChange(this.value)"'}></div>
        <div><label class="fl">Select Customer</label><select id="slCustSel" onchange="onSaleCustChange()"><option value="">— select customer —</option>${custOpts}</select></div>
      </div>
      <input type="hidden" id="slGstin" value="${editing?esc(editing.gstin):''}">
      <input type="hidden" id="slCust" value="${editing?esc(editing.customer):''}">
      <div class="frow g4">
        <div><label class="fl">GST Type <span class="hint" style="position:static; font-size:9.5px;">(auto, from Customer's GST Rate)</span></label>
          <input id="slGstTypeDisplay" readonly style="background:var(--panel2); color:var(--text-dim); font-weight:600;"
            value="${((editing?editing.gstType:(custMatch&&custMatch.gstType))==='inter')?'Inter-State — IGST 18%':'Intra-State — CGST 9% + SGST 9%'}">
          <input type="hidden" id="slGstType" value="${(editing?editing.gstType:(custMatch&&custMatch.gstType))==='inter'?'inter':'intra'}">
        </div>
        <div><div id="slPoNoWrap"></div></div>
        <div><label class="fl">PO Date <span class="hint" style="position:static; font-size:9.5px;">(auto)</span></label><input id="slPoDate" type="date" value="${editing?esc(editing.poDate):''}"></div>
        ${isLabour ? `
        <div><label class="fl">Delivery Challan No. <span class="hint" style="position:static; font-size:9.5px;">(Customer DC)</span></label>
          <select id="slDcSel" onchange="onSaleDcSelect(this)">${labourInvoiceDcOptionsHtml(custMatch?custMatch.id:'', editing?editing.dcNo:(saleItemRows[0]?saleItemRows[0].dcNo:''), saleItemRows[0]?saleItemRows[0].partNo:'')}</select>
          <input type="hidden" id="slDcNo" value="${editing?esc(editing.dcNo||''):esc(saleItemRows[0]?saleItemRows[0].dcNo:'')}">
        </div>` : '<div></div>'}
      </div>
      <div class="frow g4">
        <div><label class="fl">${packCountLabel(kind)}</label>
          <input id="slPackCount" type="number" min="0" step="1" inputmode="numeric" placeholder="e.g. 12" value="${editing && editing.packCount!=null ? esc(String(editing.packCount)) : ''}"></div>
        <div></div><div></div><div></div>
      </div>
      <h4 style="margin:16px 0 8px;">Item Lines${editing?' <span class="hint" style="position:static; font-size:9.5px;">(row 1 updates this invoice line; any extra rows are added as new lines on the same invoice)</span>':''}</h4>
      <div id="saleItemsBody"></div>
      <button class="btn ghost small" style="margin-top:8px;" onclick="addSaleItemRow()">➕ Add Item Row</button>
      <div style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
        ${editing
          ? `<button class="btn amber" onclick="updateSaleInvoice()">💾 Update Invoice</button> <button class="btn ghost" onclick="cancelEditSale()">✕ Cancel Edit</button>`
          : `<button class="btn amber" onclick="addSale()">💾 Save Invoice</button>`}
      </div>
    </div>
    <div class="panel">
      <h3 style="display:flex; justify-content:space-between; align-items:center;"><span>${isLabour?'Job Work':'Sales'} Invoices <span class="hint">${groups.length} invoice(s) · ${list.length} item line(s)</span></span>
      </h3>
      <div class="inv-grid">
        ${groups.slice().reverse().map(g=>{
          const first = g.items[0];
          const invTotal = g.items.reduce((a,s)=>a+(s.qty*s.rate),0);
          const allSameStatus = g.items.every(s=>s.status===first.status);
          return `<div class="rec-card" style="text-align:left; align-items:stretch;">
            <div class="rc-title">${esc(g.invNo)}</div>
            <div class="rc-sub" style="align-self:flex-start; margin-left:0;">${esc(custDispByName(first.customer))||'—'} · ${fmtDate(first.invDate)}</div>
            ${allSameStatus ? `<span class="pill rc-pill ${first.status==='Draft'?'open':'done'}" style="align-self:flex-start;">${first.status}</span>` : ''}
            ${first.poNo?`<div class="rc-row"><span class="k">PO No</span><span class="v">${esc(first.poNo)}${first.poDate?' · '+fmtDate(first.poDate):''}</span></div>`:''}
            <div class="rc-row"><span class="k">GST Type</span><span class="v">${first.gstType==='inter'?'IGST 18%':'CGST 9% + SGST 9%'}</span></div>
            <div style="margin:8px 0 2px; border-top:1px solid var(--line,#e4e4e4); padding-top:6px;">
              ${g.items.map(s=>{
                const lineValue=(s.qty*s.rate);
                return `<div style="padding:6px 0; border-bottom:1px dashed var(--line,#eaeaea);">
                  <div style="font-weight:600; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(s.item)}${s.cardNo?` <span style="color:var(--amber); font-weight:400;">· Card ${esc(s.cardNo)}</span>`:''}</div>
                  <div class="hint" style="position:static; font-size:10px; margin-bottom:5px;">HSN ${esc(s.hsn)||'—'} · Qty ${s.qty} × ${fmtMoney(s.rate)} = ${fmtMoney(lineValue)}${!allSameStatus?' · '+esc(s.status):''}</div>
                  <div style="display:flex; gap:5px; flex-wrap:wrap;">
                    <button class="btn small ghost" style="padding:3px 8px; font-size:10.5px;" onclick="startEditSale('${s.id}')">✎ Edit</button>
                    <button class="btn small ghost" style="padding:3px 8px; font-size:10.5px;" onclick="toggleSaleStatus('${s.id}')">⇄ Toggle</button>
                    <button class="btn danger" style="padding:3px 8px; font-size:10.5px;" onclick="deleteRow('sales','${s.id}')">Del</button>
                  </div>
                </div>`;
              }).join('')}
            </div>
            <div class="rc-row"><span class="k">Invoice Total (Excl. GST)</span><span class="v" style="font-weight:700;">${fmtMoney(invTotal)}</span></div>
            <div class="rc-actions" style="justify-content:flex-start;">
              <button class="btn small ghost" onclick="printSalesInvoice('${first.id}')">🖨 Print Invoice</button>
            </div>
          </div>`;
        }).join('') || '<div class="empty">No invoices for this unit yet.</div>'}
      </div>
    </div>
  `;
  renderSaleItemsTable();
}
// Rebuilds the header Delivery Challan No. dropdown to match item row 1's currently-selected
// Part No (Job Work Invoice only) — called any time that Part No changes, so the DC list always
// stays scoped to the part actually being invoiced and never shows unrelated DC's. If the
// previously-selected DC no longer matches the new part, it's cleared automatically.
function refreshLabourInvoiceDcSelect(){
  const dcSelEl = document.getElementById('slDcSel');
  if(!dcSelEl) return;
  const {custId} = getSaleCustomerContext();
  const finPartNo = saleItemRows[0] ? (saleItemRows[0].partNo||'') : '';
  // Prefer the row's currently-stored DC No (e.g. just auto-fetched by applyLabourInvoiceRef())
  // over whatever the dropdown DOM still shows from before the rebuild, so an auto-fetched DC
  // reference actually sticks instead of being immediately overwritten by the old selection.
  const prevDc = (saleItemRows[0] && saleItemRows[0].dcNo) ? saleItemRows[0].dcNo : dcSelEl.value;
  dcSelEl.innerHTML = labourInvoiceDcOptionsHtml(custId, prevDc, finPartNo);
  const stillValid = Array.from(dcSelEl.options).some(o=>o.value===prevDc && prevDc!=='');
  const dcNoEl = document.getElementById('slDcNo');
  if(!stillValid){
    dcSelEl.value = '';
    if(dcNoEl) dcNoEl.value = '';
    saleItemRows.forEach(r=>{ r.dcNo = ''; });
  } else if(dcNoEl){
    dcNoEl.value = prevDc;
    saleItemRows.forEach(r=>{ r.dcNo = prevDc; });
  }
}
function renderSaleItemsTable(){
  const host = document.getElementById('saleItemsBody');
  if(!host) return;
  const isLabour = currentSalesInvoiceKind()==='labour';
  const {custId, custName} = getSaleCustomerContext();
  const noUnitYet = !saleInvoiceUnit;
  const custHint = noUnitYet ? '<span class="hint" style="position:static; color:var(--amber);"> — select the Unit above first</span>'
    : (custId || custName) ? '' : '<span class="hint" style="position:static; color:var(--amber);"> — select a customer above to filter this list</span>';
  const noCustYet = !custId;
  host.innerHTML = `
    <div class="itemRowsWrap">
      ${saleItemRows.map((r,i)=>`
        <div class="itemRow" data-idx="${i}">
          <div class="itemRowTop">
            <span class="itemRowNo">Item ${i+1}</span>
            ${saleItemRows.length>1?`<button class="btn danger small" type="button" onclick="removeSaleItemRow(${i})">✕ Remove</button>`:''}
          </div>
          ${isLabour ? `
          ${(()=>{
              const po = r.labourPOId ? DB.labourPO.find(x=>x.id===r.labourPOId) : null;
              if(!po) return '<div class="hint" style="position:static; display:block; margin:0 0 8px;">Select a Part No below to auto-fetch Rate, PO No/Date &amp; Balance.</div>';
              const t = labourPOTotals(po);
              const fgStock = currentInventoryStockFor(po.finPartNo);
              const cell = (label, value, tint, warn)=>`
                <div class="poSumCell" style="background:${tint};">
                  <div class="poSumLabel">${label}</div>
                  <div class="poSumVal" ${warn?'style="color:#b23b3b;"':''}>${value}</div>
                </div>`;
              return `<div class="poSumRow" style="margin-bottom:10px;">
                ${cell('Scheduled Quantity', t.scheduled, 'rgba(63,208,201,0.14)')}
                ${cell('Already Invoiced Quantity', t.dispatched, 'rgba(255,182,72,0.16)')}
                ${cell('Balance Quantity', t.pending, 'rgba(124,147,179,0.16)', t.pending<0)}
                ${cell('Finished Goods Quantity', fgStock, 'rgba(111,209,122,0.16)')}
              </div>`;
            })()}
          ` : `
          <div class="ldHintBox">
            ${(()=>{
              const p = r.custPOId ? DB.custPO.find(x=>x.id===r.custPOId) : null;
              if(!p) return '<span class="hint" style="position:static;">Select a Part No below to auto-fetch Rate, PO No/Date &amp; the summary below.</span>';
              const invoiced = salesInvoicedQtyForCustPO(p.id);
              const balance = salesCustPOBalance(p);
              const stock = currentInventoryStockFor(p.finPartNo);
              const others = otherOpenSalesPOsForPart(p.customerId, p.finPartNo, p.id);
              return otherOpenPOsRowHtml(others) + salesPOSummaryHtml(p.custPoNo, p.orderedQty||0, invoiced, balance, stock);
            })()}
          </div>
          `}
          <div class="frow g6">
            <div><label class="fl">Part No. <span class="hint" style="position:static; color:var(--red);">*required</span>${custHint}</label>
              ${isLabour
                ? `<select ${noUnitYet?'disabled':''} onchange="onSaleRowPOChange(${i}, this)">${liPOOptionsHtml(custId, '', r.labourPOId, saleInvoiceUnit)}</select>`
                : `<select ${(noUnitYet||noCustYet)?'disabled':''} onchange="onSaleRowCustPOChange(${i}, this)">${salesCustPOOptionsHtml(custId, r.custPOId, saleInvoiceUnit)}</select>`}
              ${(()=>{
                if(!r.partNo) return '';
                const mappedUnit = resolveSalesPartUnit(r.partNo);
                if(!mappedUnit) return `<span class="hint" style="position:static; font-size:9.5px; display:block; margin-top:3px;">Mapped Unit (Product Dev.): — not mapped yet —</span>`;
                const mismatch = saleInvoiceUnit && mappedUnit!==saleInvoiceUnit;
                return `<span class="hint" style="position:static; font-size:9.5px; display:block; margin-top:3px; ${mismatch?'color:#b23b3b; font-weight:700;':'color:var(--green);'}">Mapped Unit (Product Dev.): ${esc(mappedUnit)} (${esc(unitShortTag(mappedUnit))})${mismatch?' ⚠ differs from selected Invoice Unit':''}</span>`;
              })()}
            </div>
            <div><label class="fl">Part Name <span class="hint" style="position:static; font-size:9.5px;">(auto)</span></label><input data-f="partName" value="${esc(r.partName)}" placeholder="auto" readonly style="background:var(--panel2); color:var(--text-dim);"></div>
            <div><label class="fl">HSN/SAC Code</label><input data-f="hsn" value="${esc(r.hsn)}" placeholder="e.g. 998898"></div>
            <div><label class="fl">Qty</label><input data-f="qty" type="number" value="${esc(r.qty)}" oninput="refreshSaleRowTotal(${i}, this)"></div>
            <div><label class="fl">Rate (₹) <span class="hint" style="position:static; font-size:9.5px;">(auto)</span></label><input data-f="rate" type="number" value="${r.rate!==''&&r.rate!=null?Number(r.rate).toFixed(2):''}" readonly style="background:var(--panel2); color:var(--text-dim);"></div>
            <div><label class="fl">Total</label><input id="saleRowTotal${i}" value="${fmtMoney2((parseFloat(r.qty)||0)*(parseFloat(r.rate)||0))}" readonly style="background:var(--panel2); color:var(--text-dim); font-weight:700;"></div>
          </div>
        </div>`).join('')}
    </div>`;
  renderHeaderPOSelect();
  if(isLabour) refreshLabourInvoiceDcSelect();
}
// Header "PO No." cell (same row as Customer Name) — for Sales Invoice this is a dropdown
// listing every Open PO for the selected customer (across all Part Nos), so the user can pick
// the required PO directly, in one place, instead of only inferring it from an item row. Picking
// one also auto-fills item row 1 (Part No/Name/Rate/Qty) via applyCustPOToRow, same as before.
// Job Work Invoice keeps its original simple auto-filled text field, unchanged.
function renderHeaderPOSelect(){
  const wrap = document.getElementById('slPoNoWrap');
  if(!wrap) return;
  const editingRec = editingSaleId ? DB.sales.find(x=>x.id===editingSaleId) : null;
  if(currentSalesInvoiceKind()==='labour'){
    const existingEl = document.getElementById('slPoNo');
    const val = existingEl ? existingEl.value : (editingRec?editingRec.poNo:'');
    wrap.innerHTML = `<label class="fl">PO No. <span class="hint" style="position:static; font-size:9.5px;">(auto, from Job Work PO)</span></label><input id="slPoNo" placeholder="auto-fetched once a line item is linked below" value="${esc(val||'')}">`;
    return;
  }
  const {custId} = getSaleCustomerContext();
  // Three-step flow: Customer → Part No (picked on item row 1) → PO No. here is then scoped to
  // ONLY that Part No's Open POs, within the selected Unit — never a mix of every part/unit the
  // customer has ordered.
  const partNo = saleItemRows[0] ? (saleItemRows[0].partNo||'').trim() : '';
  let selectedId = saleItemRows[0] ? saleItemRows[0].custPOId : '';
  if(!selectedId && editingRec && editingRec.custPOId) selectedId = editingRec.custPOId;
  let list = [];
  if(custId && partNo && saleInvoiceUnit){
    const key = partNo.toLowerCase();
    list = DB.custPO.filter(p=> p.customerId===custId && poUnitMatches(p.unit, saleInvoiceUnit) && (p.finPartNo||'').trim().toLowerCase()===key)
      .map(p=>({id:p.id, poNo:p.custPoNo||'—', balance:salesCustPOBalance(p)}))
      .filter(x=>x.balance>0);
    if(selectedId && !list.some(x=>x.id===selectedId)){
      const extra = DB.custPO.find(p=>p.id===selectedId); // keep the currently-linked PO visible even if its balance has since closed
      if(extra) list.unshift({id:extra.id, poNo:extra.custPoNo||'—', balance:salesCustPOBalance(extra)});
    }
  }
  const optionsHtml = !saleInvoiceUnit
    ? '<option value="">— select the Unit above first —</option>'
    : !custId
    ? '<option value="">— select a Customer first —</option>'
    : !partNo
      ? '<option value="">— select a Part No below first —</option>'
      : (list.length ? '<option value="">— select PO No —</option>' + list.map(o=>{
          const label = (o.poNo||'—').padEnd(16,'\u00A0') + '·  Pending: ' + String(o.balance).padStart(4,'\u00A0');
          return `<option value="${o.id}" ${o.id===selectedId?'selected':''}>${esc(label)}</option>`;
        }).join('') : '<option value="">— no Open PO for this Part No —</option>');
  const poNoTextVal = selectedId ? ((DB.custPO.find(p=>p.id===selectedId)||{}).custPoNo||'') : (editingRec?editingRec.poNo:'');
  wrap.innerHTML = `
    <label class="fl">PO No. <span class="hint" style="position:static; font-size:9.5px;">(Open POs for the selected Part No)</span></label>
    <select id="slPoNoSel" style="font-family:var(--mono); font-size:11.5px;" onchange="onHeaderPOSelect(this)" ${(!saleInvoiceUnit||!custId||!partNo)?'disabled':''}>${optionsHtml}</select>
    <input type="hidden" id="slPoNo" value="${esc(poNoTextVal||'')}">
  `;
}
// User picks a PO directly from the header PO No. dropdown — links it onto item row 1 (auto-
// filling Part No/Name/Rate/Qty) and updates PO No/PO Date, exactly as if it had been chosen via
// the Part No. selector on that row.
function onHeaderPOSelect(selEl){
  const poId = selEl.value;
  const p = DB.custPO.find(x=>x.id===poId);
  const poDateEl = document.getElementById('slPoDate'); if(poDateEl) poDateEl.value = p?(p.custPoDate||''):'';
  if(!saleItemRows[0]) saleItemRows[0] = emptySaleItemRow();
  if(p) applyCustPOToRow(0, p.id); else saleItemRows[0].custPOId = '';
  renderSaleItemsTable();
}
function refreshSaleRowTotal(i, qtyEl){
  if(!saleItemRows[i]) return;
  saleItemRows[i].qty = qtyEl.value;
  const rate = parseFloat(saleItemRows[i].rate)||0;
  const qty = parseFloat(qtyEl.value)||0;
  const totalEl = document.getElementById('saleRowTotal'+i);
  if(totalEl) totalEl.value = fmtMoney2(qty*rate);
}
function syncSaleItemRows(){
  const rowsEls = document.querySelectorAll('#saleItemsBody .itemRow');
  rowsEls.forEach(rowEl=>{
    const i = parseInt(rowEl.dataset.idx, 10);
    if(!saleItemRows[i]) return;
    rowEl.querySelectorAll('[data-f]').forEach(inp=>{
      saleItemRows[i][inp.dataset.f] = inp.value;
    });
  });
}
function addSaleItemRow(){
  syncSaleItemRows();
  const {custId} = getSaleCustomerContext();
  const c = custId ? DB.customers.find(x=>x.id===custId) : null;
  const row = emptySaleItemRow();
  if(c && c.hsn) row.hsn = c.hsn;
  const dcNoEl = document.getElementById('slDcNo'); if(dcNoEl && dcNoEl.value) row.dcNo = dcNoEl.value;
  saleItemRows.push(row);
  renderSaleItemsTable();
}
function removeSaleItemRow(i){
  syncSaleItemRows();
  saleItemRows.splice(i,1);
  if(saleItemRows.length===0) saleItemRows.push(emptySaleItemRow());
  renderSaleItemsTable();
}
// Auto-fills the header PO No / PO Date the first time a row supplies them, without
// clobbering a value the user already typed/edited.
function autoFillHeaderPO(poNo, poDate){
  const poNoEl = document.getElementById('slPoNo'); if(poNoEl && !poNoEl.value && poNo) poNoEl.value = poNo;
  const poDateEl = document.getElementById('slPoDate'); if(poDateEl && !poDateEl.value && poDate) poDateEl.value = poDate;
}
// Job Work Invoice ONLY — resolves the most relevant PO No / PO Date / DC No / DC Date for a
// given Customer + Part, per this priority (does not affect Sales Invoice or any other module):
//   1. PO No / PO Date: from the Job Work PO on file for this Customer + Part (DB.labourPO,
//      the "Customer PO Number" entered against that Job Work PO), if one has a PO No filled in.
//   2. If no PO No is on file there, fall back to the PO No already logged against a Customer
//      Material Inward / DC Receipt entry (DB.labourMaterialReceipt) for this Customer + Part —
//      that record has no PO Date field, so PO Date is left blank in this case.
//   DC No / DC Date: always sourced from the most recent Customer Material Inward / DC Receipt
//   entry (DB.labourMaterialReceipt) for this Customer + Part — Job Work PO carries no DC data.
function labourInvoiceFetchRef(customerId, finPartNo){
  const ref = {poNo:'', poDate:'', dcNo:'', dcDate:''};
  if(!customerId || !(finPartNo||'').trim()) return ref;
  const key = finPartNo.trim().toLowerCase();
  // 1) PO No/Date from Job Work PO (Customer PO reference) — most recent by PO Date.
  const poMatches = DB.labourPO.filter(x=>reportUnitMatch(x.unit) && x.customerId===customerId
    && (x.finPartNo||'').trim().toLowerCase()===key && (x.poNo||'').trim());
  if(poMatches.length){
    poMatches.sort((a,b)=>(b.poDate||'').localeCompare(a.poDate||''));
    ref.poNo = poMatches[0].poNo; ref.poDate = poMatches[0].poDate||'';
  }
  // DC Receipt entries for this Customer + Part, most recent by DC Date — used for DC No/Date
  // always, and as the PO No fallback when step 1 above found nothing.
  const dcMatches = DB.labourMaterialReceipt.filter(r=>r.customerId===customerId
    && (r.finPartNo||'').trim().toLowerCase()===key);
  if(dcMatches.length){
    dcMatches.sort((a,b)=>(b.dcDate||'').localeCompare(a.dcDate||''));
    if(!ref.poNo){
      const withPoNo = dcMatches.find(r=>(r.poNo||'').trim());
      if(withPoNo) ref.poNo = withPoNo.poNo;
    }
    const withDcNo = dcMatches.find(r=>(r.dcNo||'').trim());
    if(withDcNo){ ref.dcNo = withDcNo.dcNo; ref.dcDate = withDcNo.dcDate||''; }
  }
  return ref;
}
// Applies the resolved reference (PO No/Date always overwritten to stay in sync with whichever
// Part/PO is currently selected; DC No/Date pre-selects the matching option in the header DC
// dropdown, still overridable by hand afterwards).
function applyLabourInvoiceRef(i, customerId, finPartNo){
  const ref = labourInvoiceFetchRef(customerId, finPartNo);
  const poNoEl = document.getElementById('slPoNo'); if(poNoEl) poNoEl.value = ref.poNo||'';
  const poDateEl = document.getElementById('slPoDate'); if(poDateEl) poDateEl.value = ref.poDate||'';
  if(saleItemRows[i]) saleItemRows[i].dcNo = ref.dcNo||'';
}
// Job Work PO → Monthly Schedule → Commitment cascade (Job Work Invoice screen only). Selecting
// the PO auto-fetches Part/Rate/UOM/PO No/PO Date; selecting a Commitment auto-fills Qty
// from its Balance Qty and shows the 3-line reference hint.
function onSaleRowPOChange(i, selEl){
  syncSaleItemRows();
  saleItemRows[i].labourPOId = selEl.value;
  saleItemRows[i].scheduleId = ''; saleItemRows[i].commitmentId = '';
  const po = DB.labourPO.find(x=>x.id===selEl.value);
  if(po){
    saleItemRows[i].partNo = po.finPartNo||''; saleItemRows[i].partName = po.finPartName||'';
    // Rounded to 2 decimals (nearest paisa) so the Rate shown/stored never carries 3-4+ raw
    // decimal places — keeps Rate × Qty = Total exactly consistent with what's displayed.
    saleItemRows[i].rate = po.price ? Math.round(po.price*100)/100 : '';
    saleItemRows[i].uom = bomUOMForPart(po.finPartNo);
    const t = labourPOTotals(po);
    saleItemRows[i].qty = t.pending>0 ? t.pending : '';
    // PO No/Date + DC No/Date — Job Work Invoice-only reference logic (Customer PO first, DC
    // Receipt fallback for PO No, DC Receipt always for DC No/Date). See labourInvoiceFetchRef().
    applyLabourInvoiceRef(i, po.customerId, po.finPartNo);
  }
  renderSaleItemsTable();
}
// Sales Invoice's single-step Finished Part Number selection (via Customer PO / Sales PO) —
// auto-fetches Part Name, Rate, UOM, PO No, PO Date and the Ordered/Invoiced/Balance qty
// control all at once.
function onSaleRowCustPOChange(i, selEl){
  syncSaleItemRows();
  applyCustPOToRow(i, selEl.value);
  renderSaleItemsTable();
}
// Shared "link this row to this Customer PO" logic — used both by the Part No. selector above
// and by the PO No. selector (which lets the user pick a SPECIFIC open PO when the same Part
// No has more than one, instead of only the one auto-picked by Part No.).
function applyCustPOToRow(i, poId){
  if(!saleItemRows[i]) return;
  saleItemRows[i].custPOId = poId;
  const p = DB.custPO.find(x=>x.id===poId);
  if(p){
    saleItemRows[i].partNo = p.finPartNo||''; saleItemRows[i].partName = p.finPartName||'';
    // Rounded to 2 decimals (nearest paisa) — same as onSaleRowPOChange above.
    saleItemRows[i].rate = p.price ? Math.round(p.price*100)/100 : '';
    saleItemRows[i].uom = bomUOMForPart(p.finPartNo);
    const balance = salesCustPOBalance(p);
    saleItemRows[i].qty = balance>0 ? balance : '';
    // Keep the header PO No/PO Date fields in sync with whichever PO is now linked — the header
    // fields are the primary PO display and are always kept up to date from here.
    const poNoEl = document.getElementById('slPoNo'); if(poNoEl) poNoEl.value = p.custPoNo||'';
    const poDateEl = document.getElementById('slPoDate'); if(poDateEl) poDateEl.value = p.custPoDate||'';
  }
}
function addSale(){
  if(!requireWorkingUnit()) return;
  if(!saleInvoiceUnit){ toast('Select the Unit (Unit 1 / Unit 2) first'); return; }
  syncSaleItemRows();
  const kind = currentSalesInvoiceKind();
  const inv=document.getElementById('slInv').value.trim();
  const invDate=document.getElementById('slDate').value;
  const customer=document.getElementById('slCust').value.trim();
  const gstin=document.getElementById('slGstin').value.trim();
  const gstType=document.getElementById('slGstType').value;
  const poNo=document.getElementById('slPoNo').value.trim();
  const poDate=document.getElementById('slPoDate').value;
  if(!inv){ toast('Invoice No is required'); return; }
  const pack = readSalePackCount(kind); if(!pack.ok) return;
  const rowsToSave = saleItemRows.filter(r=>r.partNo.trim() || r.partName.trim());
  if(rowsToSave.length===0){ toast('Add at least one item row with Part No / Part Name'); return; }
  for(const r of rowsToSave){
    if(!r.partNo.trim()){ toast('Part No is required on every item row'); return; }
    if(!r.partName.trim()){ toast('Part Name is required on every item row'); return; }
  }
  // Job Work Invoice rows must be linked to a Job Work PO, and the invoice qty can never exceed
  // that PO's Balance Qty (Scheduled − already invoiced across the whole PO).
  if(kind==='labour'){
    for(const r of rowsToSave){
      if(!r.labourPOId){ toast(`Link a Job Work PO for ${r.partNo}`); return; }
      const po = DB.labourPO.find(x=>x.id===r.labourPOId);
      if(!po){ toast(`Selected Job Work PO not found for ${r.partNo}`); return; }
      const qty = parseFloat(r.qty)||0;
      const balance = labourPOTotals(po).pending;
      if(qty>balance){ toast(`Qty (${qty}) exceeds the Job Work PO's Balance Qty (${balance}) for ${r.partNo}`); return; }
    }
  } else {
    // Sales Invoice rows must be linked to a Sales PO (Customer PO), and can never invoice
    // beyond that PO's Balance Qty (Ordered − already invoiced).
    for(const r of rowsToSave){
      if(!r.custPOId){ toast(`Link a Sales PO for ${r.partNo}`); return; }
      const p = DB.custPO.find(x=>x.id===r.custPOId);
      if(!p){ toast(`Selected Sales PO not found for ${r.partNo}`); return; }
      const qty = parseFloat(r.qty)||0;
      const balance = salesCustPOBalance(p);
      if(qty>balance){ toast(`Qty (${qty}) exceeds the Sales PO's Balance Qty (${balance}) for ${r.partNo}`); return; }
    }
  }
  rowsToSave.forEach(r=>{
    const partNo=r.partNo.trim(), partName=r.partName.trim();
    const qty=parseFloat(r.qty)||0;
    const item = `${partNo} — ${partName}`;
    DB.sales.push({
      id:'sl'+Date.now()+'_'+Math.random().toString(36).slice(2,7), unit:saleInvoiceUnit, invNo:inv, invDate,
      customer, gstin, item, partNo, partName, qty, rate:parseFloat(r.rate)||0, uom:(r.uom||'').trim(),
      hsn:r.hsn.trim()||'998898', dcNo:r.dcNo.trim(), gstType, poNo, poDate, note:r.note.trim(),
      invKind: kind, labourPOId: kind==='labour'?r.labourPOId:null,
      custPOId: kind!=='labour'?r.custPOId:null,
      packCount: pack.value,
      status:'Draft'
    });
  });
  setSalesSubTab(salesSubTab); // resets saleItemRows for the current tab and re-renders
  saveDB(); toast(`Invoice created with ${rowsToSave.length} item(s)`);
}
// ---- Edit an existing Sales / Job Work Invoice line. Each invoice line is its own DB.sales
// record, so Edit loads that single record into the form (Item Lines is limited to one row
// while editing) and Update Invoice writes the changes back onto the same record rather than
// creating a new one. ----
function startEditSale(id){
  const s = DB.sales.find(x=>x.id===id);
  if(!s) return;
  editingSaleId = id;
  salesSubTab = s.invKind==='labour' ? 'labourInvoice' : 'invoices';
  saleInvoiceUnit = (s.unit==='Unit-1'||s.unit==='Unit-2') ? s.unit : '';
  saleItemRows = [{
    partNo: s.partNo||'', partName: s.partName||'', hsn: s.hsn||'998898',
    qty: s.qty!=null?String(s.qty):'', rate: s.rate!=null?String(s.rate):'',
    dcNo: s.dcNo||'', note: s.note||'', labourPOId: s.labourPOId||'', custPOId: s.custPOId||'',
    uom: s.uom||''
  }];
  render();
}
function cancelEditSale(){
  editingSaleId = null;
  saleItemRows = [emptySaleItemRow()];
  saleInvoiceUnit = (currentUnit==='Unit-1'||currentUnit==='Unit-2') ? currentUnit : '';
  render();
}
function updateSaleInvoice(){
  if(!editingSaleId) return;
  const s = DB.sales.find(x=>x.id===editingSaleId);
  if(!s){ toast('Invoice line not found'); editingSaleId=null; render(); return; }
  if(!saleInvoiceUnit){ toast('Select the Unit (Unit 1 / Unit 2) first'); return; }
  syncSaleItemRows();
  const kind = currentSalesInvoiceKind();
  const inv=document.getElementById('slInv').value.trim();
  const invDate=document.getElementById('slDate').value;
  const customer=document.getElementById('slCust').value.trim();
  const gstin=document.getElementById('slGstin').value.trim();
  const gstType=document.getElementById('slGstType').value;
  const poNo=document.getElementById('slPoNo').value.trim();
  const poDate=document.getElementById('slPoDate').value;
  if(!inv){ toast('Invoice No is required'); return; }
  const pack = readSalePackCount(kind); if(!pack.ok) return;
  const r = saleItemRows[0];
  if(!r || !r.partNo.trim()){ toast('Part No is required'); return; }
  if(!r.partName.trim()){ toast('Part Name is required'); return; }
  const qty = parseFloat(r.qty)||0;
  // Balance check excludes this record's own previously-counted qty (against the same PO),
  // since that qty is already "used" by the very record being edited.
  if(kind==='labour'){
    if(!r.labourPOId){ toast(`Link a Job Work PO for ${r.partNo}`); return; }
    const po = DB.labourPO.find(x=>x.id===r.labourPOId);
    if(!po){ toast(`Selected Job Work PO not found for ${r.partNo}`); return; }
    let balance = labourPOTotals(po).pending;
    if(s.labourPOId===r.labourPOId) balance += (parseFloat(s.qty)||0);
    if(qty>balance){ toast(`Qty (${qty}) exceeds the Job Work PO's Balance Qty (${balance}) for ${r.partNo}`); return; }
  } else {
    if(!r.custPOId){ toast(`Link a Sales PO for ${r.partNo}`); return; }
    const p = DB.custPO.find(x=>x.id===r.custPOId);
    if(!p){ toast(`Selected Sales PO not found for ${r.partNo}`); return; }
    let balance = salesCustPOBalance(p);
    if(s.custPOId===r.custPOId) balance += (parseFloat(s.qty)||0);
    if(qty>balance){ toast(`Qty (${qty}) exceeds the Sales PO's Balance Qty (${balance}) for ${r.partNo}`); return; }
  }
  // Any additional rows beyond the first are validated up front too (against current balances,
  // since row 1's update hasn't been committed yet) before anything is written to DB.sales.
  const extraRows = saleItemRows.slice(1).filter(x=>x.partNo.trim() || x.partName.trim());
  for(const er of extraRows){
    if(!er.partNo.trim()){ toast('Part No is required on every extra item row'); return; }
    if(!er.partName.trim()){ toast('Part Name is required on every extra item row'); return; }
    const erQty = parseFloat(er.qty)||0;
    if(kind==='labour'){
      if(!er.labourPOId){ toast(`Link a Job Work PO for ${er.partNo}`); return; }
      const po = DB.labourPO.find(x=>x.id===er.labourPOId);
      if(!po){ toast(`Selected Job Work PO not found for ${er.partNo}`); return; }
      const balance = labourPOTotals(po).pending;
      if(erQty>balance){ toast(`Qty (${erQty}) exceeds the Job Work PO's Balance Qty (${balance}) for ${er.partNo}`); return; }
    } else {
      if(!er.custPOId){ toast(`Link a Sales PO for ${er.partNo}`); return; }
      const p = DB.custPO.find(x=>x.id===er.custPOId);
      if(!p){ toast(`Selected Sales PO not found for ${er.partNo}`); return; }
      const balance = salesCustPOBalance(p);
      if(erQty>balance){ toast(`Qty (${erQty}) exceeds the Sales PO's Balance Qty (${balance}) for ${er.partNo}`); return; }
    }
  }
  const partNo=r.partNo.trim(), partName=r.partName.trim();
  Object.assign(s, {
    unit: saleInvoiceUnit, invNo:inv, invDate, customer, gstin, item:`${partNo} — ${partName}`, partNo, partName, qty,
    rate:parseFloat(r.rate)||0, uom:(r.uom||'').trim(), hsn:r.hsn.trim()||'998898', dcNo:r.dcNo.trim(),
    gstType, poNo, poDate, note:r.note.trim(),
    labourPOId: kind==='labour'?r.labourPOId:null, custPOId: kind!=='labour'?r.custPOId:null
  });
  // Extra rows become new invoice lines on the same invoice (same invNo/date/customer/PO header),
  // pushed one at a time so each subsequent row's balance check reflects the ones just added.
  extraRows.forEach(er=>{
    const erPartNo=er.partNo.trim(), erPartName=er.partName.trim();
    DB.sales.push({
      id:'sl'+Date.now()+'_'+Math.random().toString(36).slice(2,7), unit:s.unit, invNo:inv, invDate,
      customer, gstin, item:`${erPartNo} — ${erPartName}`, partNo:erPartNo, partName:erPartName,
      qty:parseFloat(er.qty)||0, rate:parseFloat(er.rate)||0, uom:(er.uom||'').trim(),
      hsn:er.hsn.trim()||'998898', dcNo:er.dcNo.trim(), gstType, poNo, poDate, note:er.note.trim(),
      invKind: kind, labourPOId: kind==='labour'?er.labourPOId:null,
      custPOId: kind!=='labour'?er.custPOId:null,
      packCount: pack.value,
      status:'Draft'
    });
  });
  // Packing count is invoice-level: keep it identical on every line of this invoice.
  DB.sales.forEach(x=>{ if(x.unit===s.unit && x.invNo===inv) x.packCount = pack.value; });
  editingSaleId = null;
  saleItemRows = [emptySaleItemRow()];
  saveDB(); toast(extraRows.length ? `Invoice updated — ${extraRows.length} new item(s) added` : 'Invoice updated'); render();
}
function printSalesList(){
  const isLabour = currentSalesInvoiceKind()==='labour';
  const list = DB.sales.filter(x=>reportUnitMatch(x.unit) && (isLabour ? x.invKind==='labour' : x.invKind!=='labour'));
  const headers = ['Invoice No','Date','Customer','HSN/SAC','PO No','Item','Qty','Rate (₹)','Value (Excl. GST) (₹)','Status','Card No'];
  const rows = list.map(s=>{
    const lineValue=(s.qty*s.rate);
    return [esc(s.invNo), fmtDate(s.invDate)||'—', esc(s.customer)||'—', esc(s.hsn)||'—', esc(s.poNo)||'—', esc(s.item), `<span class="num">${s.qty}</span>`, `<span class="num">${fmtMoney(s.rate)}</span>`, `<span class="num">${fmtMoney(lineValue)}</span>`, esc(s.status), esc(s.cardNo)||'—'];
  });
  printReport(`${isLabour?'Job Work':'Sales'} Invoices List`, headers, rows, {barLeft:`Unit: ${esc(reportScopeLabel())}`, barRight:`Total Invoices: ${list.length}`});
}
function printSalesInvoice(id){
  const seed = DB.sales.find(x=>x.id===id);
  if(!seed) return;
  showInvoiceCopyPrompt(id);
}
// Copy-selection prompt shown before printing a Sales/Job Work Invoice (both use this same
// printSalesInvoice function) — lets the user pick which copy to print, matching standard GST
// invoice practice (Original for Recipient / Triplicate for Supplier). Print-only: nothing about
// the invoice record itself changes based on this choice, and no other printout in the system
// shows this prompt.
function showInvoiceCopyPrompt(id){
  const old = document.getElementById('invCopyModalOverlay');
  if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'invCopyModalOverlay';
  ov.style.cssText = 'position:fixed; inset:0; background:rgba(10,20,40,0.58); z-index:9999; display:flex; align-items:center; justify-content:center; font-family:"Segoe UI",Arial,sans-serif;';
  ov.onclick = (e)=>{ if(e.target===ov) ov.remove(); };
  const options = [
    {value:'both', title:'Both Copies', sub:'Original & Triplicate'},
    {value:'original', title:'Original Only', sub:'Original for Recipient'},
    {value:'triplicate', title:'Triplicate Only', sub:'Triplicate for Supplier'}
  ];
  ov.innerHTML = `
    <div onclick="event.stopPropagation()" style="background:#fff; border-radius:12px; width:400px; max-width:92vw; padding:26px 26px 22px; box-shadow:0 20px 56px rgba(10,20,40,0.35);">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:4px;">
        <div style="width:36px; height:36px; border-radius:9px; background:linear-gradient(135deg,#0f2745,#0a1a30); display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0;">🖨</div>
        <h3 style="margin:0; font-size:16px; color:#0f2745; font-weight:800; letter-spacing:0.1px;">Select Copy to Print</h3>
      </div>
      <div style="font-size:11.5px; color:#667181; margin:8px 0 18px 48px;">Choose which copy of the Tax Invoice you'd like to print.</div>
      <div id="invCopyOptions" style="display:flex; flex-direction:column; gap:9px;">
        ${options.map((o,i)=>`
          <label class="invCopyOptRow" onclick="selectInvCopyOpt(this)" style="display:flex; align-items:center; gap:13px; padding:13px 15px; border:1.6px solid ${i===0?'#0f2745':'#dde3ea'}; border-radius:9px; cursor:pointer; background:${i===0?'#eef2f7':'#fff'}; transition:border-color .12s, background .12s;">
            <input type="radio" name="invCopyChoice" value="${o.value}" ${i===0?'checked':''} style="width:17px; height:17px; accent-color:#0f2745; flex-shrink:0; margin:0; cursor:pointer;">
            <div style="display:flex; flex-direction:column; line-height:1.4;">
              <span style="font-size:13.3px; font-weight:700; color:#132039;">${o.title}</span>
              <span style="font-size:10.8px; color:#8895a3;">${o.sub}</span>
            </div>
          </label>
        `).join('')}
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:22px;">
        <button onclick="document.getElementById('invCopyModalOverlay').remove()" style="padding:9px 18px; font-size:12.5px; border-radius:6px; border:1.5px solid #d5dbe2; background:#fff; color:#3a4757; cursor:pointer; font-weight:600;">Cancel</button>
        <button onclick="confirmInvoiceCopyPrint('${id}')" style="padding:9px 20px; font-size:12.5px; border-radius:6px; border:none; background:#0f2745; color:#fff; cursor:pointer; font-weight:700; box-shadow:0 3px 8px rgba(15,39,69,0.3);">🖨 Print</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
}
// Keeps the selected-option card highlighted (border + tint) in sync with the radio button —
// whole row is clickable, not just the small radio circle, for easier selection.
function selectInvCopyOpt(labelEl){
  const container = labelEl.parentElement;
  container.querySelectorAll('.invCopyOptRow').forEach(row=>{
    const active = row===labelEl;
    row.style.borderColor = active ? '#0f2745' : '#dde3ea';
    row.style.background = active ? '#eef2f7' : '#fff';
    row.querySelector('input[type="radio"]').checked = active;
  });
}
function confirmInvoiceCopyPrint(id){
  const ov = document.getElementById('invCopyModalOverlay');
  const choice = ov ? (ov.querySelector('input[name="invCopyChoice"]:checked')||{}).value : 'original';
  if(ov) ov.remove();
  const copyLabels = choice==='both' ? ['ORIGINAL FOR RECIPIENT','TRIPLICATE FOR SUPPLIER']
    : choice==='triplicate' ? ['TRIPLICATE FOR SUPPLIER']
    : ['ORIGINAL FOR RECIPIENT'];
  renderSalesInvoicePrintout(id, copyLabels);
}
function renderSalesInvoicePrintout(id, copyLabels){
  const seed = DB.sales.find(x=>x.id===id);
  if(!seed) return;
  // Group every line item that shares the same Invoice No within this unit into one tax invoice
  const items = DB.sales.filter(x=>x.unit===seed.unit && x.invNo===seed.invNo);
  const co = DB.settings.company || {name:'VISALAM INDUSTRIES PVT LTD', logo:''};
  const gs = DB.settings.gst || {};
  const bk = DB.settings.bank || {};
  const addr = (DB.settings.addresses||{});
  // The printed address now follows the Unit selected on the invoice itself — Unit-1 invoices
  // print the Unit-1 works address, Unit-2 invoices print the Unit-2 works address — so the
  // user never has to pick a unit again at print time. Falls back to the Admin/Registered
  // Office address if the matching unit address hasn't been filled in, or if the invoice
  // isn't tagged to a specific unit (e.g. legacy records).
  const officeAddr = (seed.unit==='Unit-1' ? addr.unit1 : seed.unit==='Unit-2' ? addr.unit2 : '') || addr.office || '';
  const gstType = seed.gstType || 'intra';

  const lineRows = items.map((s,i)=>{
    const amt = (s.qty||0)*(s.rate||0);
    return {sl:i+1, hsn:s.hsn||'998898', partNo:s.partNo||'', partName:s.partName||s.item||'', note:s.note||'', dcNo:s.dcNo||'', qty:s.qty||0, rate:s.rate||0, amt};
  });
  const subtotal = lineRows.reduce((a,r)=>a+r.amt,0);
  let cgst=0, sgst=0, igst=0;
  if(gstType==='inter'){ igst = subtotal*0.18; } else { cgst = subtotal*0.09; sgst = subtotal*0.09; }
  const grandTotal = subtotal + cgst + sgst + igst;
  const roundedTotal = Math.round(grandTotal);

  // Purchase Order No. and Date now print as two separate rows (PO No first, Date directly
  // below) instead of run together on one line — same split-row pattern used for PO Number/PO
  // Date on the Purchase Order printout itself.
  const poEntries = [...new Map(items.filter(x=>x.poNo).map(x=>[x.poNo+'|'+x.poDate, {poNo:x.poNo, poDate:x.poDate}])).values()];
  // Bill To address: fetched from the Customer Master record matched by name (the same
  // master used everywhere else customer data is looked up), so the full address always
  // prints on the invoice without needing to be re-typed on the invoice itself.
  const billToCust = DB.customers.find(c=>c.name===seed.customer);
  // Number of Boxes (Sales) / Number of Trays (Job Work) — invoice-level, so take it from
  // whichever line of this invoice carries it.
  const packCount = (items.map(x=>x.packCount).find(v=>v!=null && v!=='')) ?? '';
  const billToAddr = billToCust ? (billToCust.address||'') : '';
  const billToPhone = billToCust ? (billToCust.phone||'') : '';
  // Primary contact's Email/Mobile (Customer Master → Contacts) — falls back to the
  // customer-level Phone above when no contact record has been added yet.
  const billToContact = billToCust ? custPrimaryContact(billToCust.id) : {name:'',email:'',mobile:''};

  const rowsHtml = lineRows.map(r=>`<tr>
      <td class="c-sl">${r.sl}</td>
      <td class="c-hsn">${esc(r.hsn)}</td>
      <td class="c-partno">${esc(r.partNo)||'—'}</td>
      <td class="c-desc">${esc(r.partName)||'—'}${r.dcNo?`<div class="itemNote">D.C No : ${esc(r.dcNo)}</div>`:''}${r.note?`<div class="itemNote">${esc(r.note)}</div>`:''}</td>
      <td class="c-num">${Number(r.qty).toLocaleString('en-IN')}</td>
      <td class="c-num">${Number(r.rate).toLocaleString('en-IN',{minimumFractionDigits:2, maximumFractionDigits:2})}</td>
      <td class="c-num">${Number(r.amt).toLocaleString('en-IN',{minimumFractionDigits:2, maximumFractionDigits:2})}</td>
    </tr>`).join('');

  const w = window.open('', '_blank', 'width=950,height=1100');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tax Invoice — ${esc(seed.invNo)}</title>
  <style>
    @page{ size:A4; margin:8mm; }
    *{ box-sizing:border-box; }
    :root{
      /* Corporate dark-navy palette — swapped from the previous teal/amber combination for a
         cleaner, single-hue MNC look. Only used inside this print window. */
      --ink:#132039; --navy:#0f2745; --navy-dark:#0a1a30; --navy-dim:#eef2f7; --navy-dim2:#f7f9fb;
      --line:#c7d0da; --line-soft:#dde3ea;
      --hi-bg:#eaf1fb; --hi-border:#9fb9d9; --hi-ink:#0f2745;
    }
    html, body{ height:100%; }
    body{ font-family:'Times New Roman',Times,serif; color:var(--ink); margin:0; padding:0; font-size:13px; line-height:1.42; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    /* Card stretches to fill the full printable A4 height, with the signature block pinned to
       the bottom (margin-top:auto) — so short invoices still look deliberately composed on the
       page instead of leaving a large empty gap at the bottom. Compact spacing throughout (see
       below) keeps a typical invoice — up to ~4-5 line items — comfortably on a single page. */
    .invBox{ border:1.6px solid var(--navy); border-radius:6px; overflow:hidden; min-height:281mm; display:flex; flex-direction:column; box-shadow:0 0 0 1px rgba(15,39,69,0.04); }
    /* Header rows use a medium blue-grey tint (#cfdbe9) + clean navy borders — clearly visible
       when printed, but light enough that the dark navy text stays crisp and legible. */
    .invTitleBar{ position:relative; text-align:center; font-weight:800; font-size:17.2px; letter-spacing:2.6px; padding:9px 0; border-bottom:1.6px solid var(--navy); text-transform:uppercase; color:var(--navy-dark); background:#cfdbe9; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    /* Copy label (e.g. "ORIGINAL FOR RECIPIENT" / "TRIPLICATE FOR SUPPLIER") shown at the top
       right corner of the invoice, per the copy chosen in the pre-print prompt. */
    .copyTag{ position:absolute; top:50%; right:16px; transform:translateY(-50%); font-size:10.9px; font-weight:700; letter-spacing:0.6px; color:var(--navy-dark); border:1px solid var(--navy); padding:3px 10px; border-radius:3px; background:#fff; text-transform:uppercase; white-space:nowrap; }
    .invCopyBreak{ page-break-after:always; }
    .invHead{ display:flex; justify-content:space-between; align-items:center; padding:12px 18px; border-bottom:1.2px solid var(--line); gap:14px; background:var(--navy-dim); }
    .invHead .brand{ display:flex; gap:12px; align-items:center; }
    .invHead .brand img{ max-height:50px; max-width:120px; object-fit:contain; }
    .invHead h1{ font-size:19.5px; margin:0 0 4px; letter-spacing:0.3px; color:var(--navy-dark); font-weight:800; }
    .invHead .addr{ font-size:11.8px; color:#3a4757; max-width:340px; }
    .invHead .addr .addrLine{ line-height:1.4; }
    .invHead .contact{ font-size:11.5px; color:#3a4757; margin-top:3px; }
    .invHead .gstinBlk{ text-align:center; font-size:12.1px; background:#fff; border:1px solid var(--line); border-radius:5px; padding:7px 14px; }
    .invHead .gstinBlk .big{ font-weight:800; font-size:14.1px; color:var(--navy-dark); margin-bottom:2px; }
    .metaBar{ display:flex; border-bottom:1.2px solid var(--navy); }
    .metaBar .col{ flex:1; padding:8px 18px; font-size:12.4px; }
    .metaBar .col:first-child{ border-right:1.2px solid var(--line); }
    .metaBar .kv{ display:flex; justify-content:center; align-items:center; text-align:center; gap:10px; margin-bottom:3px; padding:2px 4px; border-radius:3px; }
    .metaBar .kv.prHiRow{ background:var(--hi-bg); border:1px solid var(--hi-border); }
    .metaBar .kv.prHiRow .k, .metaBar .kv.prHiRow .v{ color:var(--hi-ink); font-weight:800; }
    .metaBar .kv .k{ color:#556071; min-width:100px; text-align:right; }
    .metaBar .kv .v{ font-weight:700; min-width:100px; text-align:left; }
    .partyBar{ padding:10px 18px; border-bottom:1.2px solid var(--navy); font-size:12.6px; background:#fff; text-align:left; }
    .partyBar .lbl{ font-size:10.6px; text-transform:uppercase; letter-spacing:0.7px; color:#667181; margin-bottom:2px; }
    .partyBar .nm{ font-weight:800; font-size:14.7px; color:var(--navy-dark); }
    .partyBar .gst{ margin-top:4px; font-weight:700; }
    .partyBar .addr{ margin:3px 0 0; font-size:12.1px; color:#3a4757; max-width:520px; }
    .partyBar .addr .addrLine{ line-height:1.4; }
    table.items{ width:100%; border-collapse:collapse; }
    table.items th{ background:#cfdbe9; -webkit-print-color-adjust:exact; print-color-adjust:exact; color:var(--navy-dark); font-weight:800; font-size:10.7px; text-transform:uppercase; letter-spacing:0.5px; padding:7px 7px; text-align:center; border-right:1px solid var(--line); border-bottom:1.2px solid var(--navy); }
    table.items th:last-child{ border-right:none; }
    table.items th{ border-right-color:#a9bbd1; }
    table.items td{ padding:6px 7px; font-size:12.2px; border-top:1px solid var(--line-soft); border-right:1px solid var(--line-soft); vertical-align:middle; text-align:center; }
    table.items td.c-desc{ text-align:center; }
    table.items td:last-child{ border-right:none; }
    table.items tr:nth-child(even) td{ background:var(--navy-dim2); }
    table.items tr:last-child td{ border-bottom:1.2px solid var(--navy); }
    .c-sl{ width:36px; }
    .c-hsn{ width:82px; }
    .c-partno{ width:110px; }
    .c-num{ width:88px; white-space:nowrap; }
    .itemNote{ font-size:10.6px; color:#667181; font-style:italic; margin-top:1px; line-height:1.3; }
    .totalsWrap{ display:flex; border-top:1.2px solid var(--navy); }
    .totalsWrap .left{ flex:1.4; padding:10px 18px; font-size:11.8px; border-right:1.2px solid var(--line); display:flex; align-items:center; justify-content:flex-start; gap:18px; text-align:center; }
    .totalsWrap .left .cardNo{ flex:1; align-self:flex-start; }
    /* Number of Boxes (Sales) / Number of Trays (Job Work) — small square highlight cell on the
       left of the Sub Total / GST block. */
    .packSq{ width:108px; height:108px; flex:0 0 108px; border:2px solid #0b5d1e; border-radius:6px; background:#eef7f0; color:#0b5d1e; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:6px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .packSq .pl{ font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; line-height:1.2; }
    .packSq .pv{ font-size:30px; font-weight:800; line-height:1.1; margin-top:6px; }
    .totalsWrap .right{ flex:1; }
    .totalsWrap table{ width:100%; border-collapse:collapse; }
    .totalsWrap table td{ padding:6px 14px; font-size:12.2px; border-top:1px solid var(--line-soft); text-align:center; vertical-align:middle; }
    .totalsWrap table td.k{ color:#3a4757; text-align:right; }
    .totalsWrap table td.v{ text-align:right; font-weight:700; white-space:nowrap; padding-right:18px; }
    .totalsWrap table tr.grand td{ border-top:1.6px solid var(--hi-border); font-weight:800; font-size:14.9px; background:var(--hi-bg); color:var(--hi-ink); }
    .wordsBar{ padding:8px 18px; border-top:1.2px solid var(--navy); font-size:12.1px; background:var(--navy-dim); text-align:center; }
    .mcw-total-row{ gap:6px; }
    .mcw-total-row input{ padding:6px 7px; font-size:13.8px; }
    .mcw-total-row label.fl{ font-size:10.3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .mcw-total-row label.fl .hint{ display:none; }
    .wordsBar .lbl{ font-size:10.6px; text-transform:uppercase; color:#667181; letter-spacing:0.5px; }
    .wordsBar .val{ font-weight:700; color:var(--navy-dark); }
    .bankBar{ display:flex; border-top:1.2px solid var(--navy); }
    .bankBar .b1{ flex:1.4; padding:10px 18px; font-size:11.8px; text-align:left; }
    .bankBar .b1 .lbl{ font-size:10.6px; text-transform:uppercase; color:#667181; letter-spacing:0.5px; margin-bottom:4px; font-weight:700; }
    .bankBar .b1 .kv{ display:flex; justify-content:flex-start; gap:8px; margin-bottom:2px; }
    .bankBar .b1 .kv .k{ color:#556071; min-width:105px; display:inline-block; text-align:left; }
    .bankBar .b2{ flex:1; padding:10px 18px; font-size:11.4px; color:#3a4757; display:flex; align-items:center; text-align:left; }
    /* Terms & Conditions — full-width strip directly below Bank Details, so the paragraph runs
       across the whole A4 width (3–4 lines) instead of a narrow right-hand column. */
    .termsBar{ padding:8px 18px; border-top:1.2px solid var(--navy); font-size:11.8px; line-height:1.45; color:#3a4757; text-align:justify; }
    /* Certification statement — full-width strip directly below Terms & Conditions (moved out of
       the right side of the Bank Details row). */
    .certBar{ padding:8px 18px; border-top:1px solid var(--line); font-size:11.8px; line-height:1.45; color:#3a4757; text-align:justify; }
    .declBar{ padding:7px 18px; border-top:1px solid var(--line-soft); font-size:10.6px; font-style:italic; color:#556071; text-align:center; }
    .signBar{ display:flex; justify-content:space-between; align-items:flex-end; gap:24px; padding:22px 18px 14px; border-top:1.2px solid var(--navy); margin-top:auto; }
    .signBar .box{ text-align:center; width:220px; }
    .signBar .co{ font-weight:700; font-size:12.1px; margin-bottom:44px; color:var(--navy-dark); }
    .signBar .ln{ padding-top:5px; font-size:11.8px; }
    /* Receiver acknowledgement — bottom-left, opposite the Authorised Signatory. */
    .signBar .rcv{ text-align:left; font-size:12.2px; color:var(--ink); }
    .signBar .rcv .rcvTxt{ font-weight:700; margin-bottom:26px; color:var(--navy-dark); }
    .signBar .rcv .rcvLn{ margin-top:12px; white-space:nowrap; }
    .signBar .rcv .rcvLn .k{ display:inline-block; width:72px; }
    @media print{ .noPrint{ display:none; } }
    .noPrint{ text-align:center; margin:14px 0; }
    .noPrint button{ padding:8px 18px; font-size:13px; cursor:pointer; margin:0 4px; border-radius:3px; border:1px solid #ccc; background:#fff; }
    .noPrint button:first-child{ background:var(--navy); color:#fff; border-color:var(--navy); }
    @media print{ .totalsWrap table tr.grand td, .metaBar .kv.prHiRow{ background:var(--hi-bg) !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style></head><body>
    ${copyLabels.map((copyLabel, copyIdx)=>`<div${copyIdx<copyLabels.length-1?' class="invCopyBreak"':''}>
    <div class="invBox">
      <div class="invTitleBar">Tax Invoice<span class="copyTag">${esc(copyLabel)}</span></div>
      <div class="invHead">
        <div class="brand">
          ${co.logo?`<img src="${co.logo}" alt="logo">`:''}
          <div>
            <h1>${esc(co.name||'VISALAM INDUSTRIES PVT LTD')}</h1>
            <div class="addr">${printHeaderAddrHtml(officeAddr)}</div>
            <div class="contact">${gs.phone?'Cell : '+esc(gs.phone):''}${gs.email?'  &nbsp;Email: '+esc(gs.email):''}</div>
          </div>
        </div>
        <div class="gstinBlk">
          <div class="big">GSTIN : ${esc(gs.gstin)||'—'}</div>
          <div>${esc(gs.stateName)||''} STATE CODE : ${esc(gs.stateCode)||''}</div>
          ${gs.cin?`<div style="margin-top:2px;">CIN : ${esc(gs.cin)}</div>`:''}
          ${gs.msmeNo?`<div style="margin-top:2px;">MSME No : ${esc(gs.msmeNo)}${gs.msmeCategory?' ('+esc(gs.msmeCategory)+')':''}</div>`:''}
        </div>
      </div>
      <div class="metaBar">
        <div class="col">
          <div class="kv"><span class="k">Invoice No</span><span class="v">${esc(seed.invNo)}</span></div>
          <div class="kv"><span class="k">Invoice Date</span><span class="v">${fmtDate(seed.invDate)||'—'}</span></div>
          <div class="kv"><span class="k">Unit</span><span class="v">${esc(seed.unit)}</span></div>
        </div>
        <div class="col">
          ${poEntries.length ? poEntries.map(e=>`<div class="kv"><span class="k">Purchase Order</span><span class="v">${esc(e.poNo)}</span></div><div class="kv"><span class="k">PO Date</span><span class="v">${e.poDate?fmtDate(e.poDate):'—'}</span></div>`).join('') : `<div class="kv"><span class="k">Purchase Order</span><span class="v">—</span></div>`}
        </div>
      </div>
      <div class="partyBar">
        <div class="lbl">Bill To (M/s)</div>
        <div class="nm">${esc(seed.customer)||'—'}</div>
        ${billToAddr?`<div class="addr">${printHeaderAddrHtml(billToAddr)}</div>`:''}
        ${billToPhone?`<div style="margin-top:2px; font-size:12.4px; color:#333;">Phone : ${esc(billToPhone)}</div>`:''}
        ${billToContact.mobile && billToContact.mobile!==billToPhone?`<div style="margin-top:1px; font-size:12.4px; color:#333;">Mobile : ${esc(billToContact.mobile)}${billToContact.name?' ('+esc(billToContact.name)+')':''}</div>`:''}
        ${billToContact.email?`<div style="margin-top:1px; font-size:12.4px; color:#333;">Email : ${esc(billToContact.email)}</div>`:''}
        <div class="gst">Party's GSTIN : ${esc(seed.gstin)||'—'}</div>
      </div>
      <table class="items">
        <thead><tr><th class="c-sl">Sl.No</th><th class="c-hsn">HSN/SAC</th><th class="c-partno">Part No</th><th>Part Name</th><th class="c-num">Qty</th><th class="c-num">Rate (₹)</th><th class="c-num">Amount (₹)</th></tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="7" style="text-align:center;padding:16px;color:#888;">No line items</td></tr>`}</tbody>
      </table>
      <div class="totalsWrap">
        <div class="left">
          <div class="packSq"><div class="pl">${packCountLabel(seed.invKind)}</div><div class="pv">${packCount!==''?esc(String(packCount)):'—'}</div></div>
          ${seed.cardNo?`<div class="cardNo"><strong>Traceability Card No :</strong> ${esc(seed.cardNo)}</div>`:''}
        </div>
        <div class="right">
          <table>
            <tr><td class="k">Sub Total</td><td class="v">${subtotal.toLocaleString('en-IN',{minimumFractionDigits:2, maximumFractionDigits:2})}</td></tr>
            ${gstType==='inter'
              ? `<tr><td class="k">Add IGST @ 18%</td><td class="v">${igst.toLocaleString('en-IN',{minimumFractionDigits:2, maximumFractionDigits:2})}</td></tr>`
              : `<tr><td class="k">Add CGST @ 9%</td><td class="v">${cgst.toLocaleString('en-IN',{minimumFractionDigits:2, maximumFractionDigits:2})}</td></tr>
                 <tr><td class="k">Add SGST @ 9%</td><td class="v">${sgst.toLocaleString('en-IN',{minimumFractionDigits:2, maximumFractionDigits:2})}</td></tr>`}
            <tr class="grand"><td>Grand Total</td><td class="v">₹ ${roundedTotal.toLocaleString('en-IN')}</td></tr>
          </table>
        </div>
      </div>
      <div class="wordsBar"><span class="lbl">Invoice Total (in words) : </span><span class="val">Rupees ${esc(amountInWords(roundedTotal))}</span></div>
      <div class="bankBar">
        <div class="b1">
          <div class="lbl">Bank Details</div>
          <div class="kv"><span class="k">Bank A/C No.</span><span>${esc(bk.accNo)||'—'}</span></div>
          <div class="kv"><span class="k">Bank Name</span><span>${esc(bk.bankName)||'—'}</span></div>
          <div class="kv"><span class="k">Branch Name</span><span>${esc(bk.branch)||'—'}</span></div>
          <div class="kv"><span class="k">IFSC Code</span><span>${esc(bk.ifsc)||'—'}</span></div>
        </div>
      </div>
      <div class="termsBar">All goods are delivered / dispatched in good condition and we take no responsibility for any loss or damage in transit, goods once sold cannot be taken back, all disputes are subject to Chennai jurisdiction only, and interest will be charged @ 24% if not paid within 30 days from the date of the bill.</div>
      <div class="certBar">Certified that the particulars given above are true and correct and that the amount indicated represents the price actually charged, and that there is no flow of additional consideration directly or indirectly from the buyer.</div>
      <div class="signBar">
        <div class="rcv">
          <div class="rcvTxt">Received the above material in good condition</div>
          <div class="rcvLn"><span class="k">Signature</span>: ______________________</div>
          <div class="rcvLn"><span class="k">Date</span>: ______________________</div>
        </div>
        <div class="box">
          <div class="co">For ${esc(co.name||'VISALAM INDUSTRIES PVT LTD')}</div>
          <div class="ln">Authorised Signatory</div>
        </div>
      </div>
    </div>
    </div>`).join('')}
    <div class="noPrint">
      <button onclick="window.print()">🖨 Print</button>
      <button onclick="window.close()">Close</button>
    </div>
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(()=>{ try{ w.print(); }catch(e){} }, 300);
}
function toggleSaleStatus(id){
  const s = DB.sales.find(x=>x.id===id);
  s.status = s.status==='Draft'?'Dispatched':'Draft';
  saveDB(); render();
}

/* ---- Customers submodule (Sales) ---- */
// Each customer can carry any number of Contact records — {name,email,mobile} — held in
// custContactsDraft while the New/Edit Customer form is open, then saved onto customer.contacts.
// custPrimaryContact() / custContactsOf() below let any other module (Quotation, Sales Order,
// Invoice, etc.) pull a customer's email/mobile the same way it already pulls address/phone.
function custContactRowHtml(row, i){
  return `
    <div class="frow g3" data-cc-row="${i}" style="align-items:flex-end;">
      <div><label class="fl">${i===0?'Contact Person':''}</label><input placeholder="Contact person name" value="${esc(row.name)}" onchange="updateCustContactField(${i},'name',this.value)"></div>
      <div><label class="fl">${i===0?'Email ID':''}</label><input type="email" placeholder="name@company.com" value="${esc(row.email)}" onchange="updateCustContactField(${i},'email',this.value)"></div>
      <div><label class="fl">${i===0?'Mobile Number':''}</label><input placeholder="+91 ..." value="${esc(row.mobile)}" onchange="updateCustContactField(${i},'mobile',this.value)"></div>
      <div><button class="btn danger small" title="Delete this contact" onclick="deleteCustContactRow(${i})">✕</button></div>
    </div>`;
}
function renderCustomers(main){
  const list = DB.customers;
  const editing = editingCustomerId ? DB.customers.find(x=>x.id===editingCustomerId) : null;
  main.innerHTML = `
    <div class="panel">
      <h3>${editing?'Edit Customer':'New Customer'}</h3>
      <div class="frow g4">
        <div><label class="fl">Customer ID <span class="hint" style="position:static; font-size:9.5px;">(auto-generated, unique)</span></label>
          <input value="${editing?esc(editing.no):esc(previewNextCustomerId())}" disabled></div>
        <div><label class="fl">Customer Name</label><input id="cuName" placeholder="e.g. Sundaram Auto Components" value="${editing?esc(editing.name):''}"></div>
        <div><label class="fl">Short Name <span class="hint" style="position:static; font-size:9.5px;">(for screen display only)</span></label><input id="cuShortName" placeholder="e.g. Sundaram" value="${editing?esc(editing.shortName):''}"></div>
        <div><label class="fl">GSTIN</label><input id="cuGstin" placeholder="33XXXXX..." value="${editing?esc(editing.gstin):''}"></div>
        <div><label class="fl">HSN Code</label><input id="cuHsn" placeholder="e.g. 998898" value="${editing?esc(editing.hsn):''}"></div>
        <div><label class="fl">GST Rate <span class="hint" style="position:static; font-size:9.5px;">(defaults on Sales Invoice)</span></label>
          <select id="cuGstType">
            <option value="intra" ${(!editing||editing.gstType!=='inter')?'selected':''}>Intra-State — CGST 9% + SGST 9%</option>
            <option value="inter" ${(editing&&editing.gstType==='inter')?'selected':''}>Inter-State — IGST 18%</option>
          </select>
        </div>
      </div>
      <div class="hint" style="margin:2px 0 10px;">Short Name is only used to save space on-screen in the Customer list below — it never replaces the Full Customer Name in dropdowns, documents, invoices, reports, or anywhere else in the ERP.</div>
      <div class="frow g1">
        <div><label class="fl">Address (full address)</label><textarea id="cuAddress" class="addr-box" placeholder="Customer full address">${editing?esc(editing.address):''}</textarea></div>
      </div>
      <div class="section-total" style="margin-top:14px;"><h3 style="font-size:13px;">Contacts <span class="hint">Contact Person, Email ID &amp; Mobile Number — add as many as needed</span></h3></div>
      <div id="custContactsWrap">
        ${custContactsDraft.length ? custContactsDraft.map((row,i)=>custContactRowHtml(row,i)).join('') : '<div class="empty" style="padding:8px 0;">No contacts added yet — click "Add Contact" below.</div>'}
      </div>
      <button class="btn ghost small" style="margin:6px 0 14px;" onclick="addCustContactRow()">＋ Add Contact</button>
      <div>
        <button class="btn amber" onclick="${editing?'saveEditCustomer()':'addCustomer()'}">${editing?'💾 Save Changes':'💾 Save Customer'}</button>
        ${editing?`<button class="btn ghost" onclick="cancelEditCustomer()">Cancel</button>`:''}
      </div>
    </div>
    <div class="panel">
      <div class="section-total"><h3>Customers <span class="hint">${list.length} total</span></h3>
      </div>
      <div class="grid-box">
        ${list.slice().reverse().map(c=>`
          <div class="rec-card">
            <div class="rc-title">${esc(c.shortName)||esc(c.name)} <span class="hint" style="position:static; font-family:var(--mono);">${esc(c.no)||'—'}</span></div>
            <div class="rc-sub">${esc(c.gstin)||'—'}</div>
            ${c.shortName ? `<div class="rc-row"><span class="k">Full Name</span><span class="v">${esc(c.name)}</span></div>` : ''}
            <div class="rc-row"><span class="k">HSN Code</span><span class="v">${esc(c.hsn)||'—'}</span></div>
            <div class="rc-row"><span class="k">GST Rate</span><span class="v">
              <select onchange="setCustomerGstTypeInline('${c.id}', this.value)" style="padding:4px 8px; font-size:11.5px; border-radius:6px;">
                <option value="intra" ${c.gstType!=='inter'?'selected':''}>Intra-State — CGST 9%+SGST 9%</option>
                <option value="inter" ${c.gstType==='inter'?'selected':''}>Inter-State — IGST 18%</option>
              </select>
            </span></div>
            <div class="rc-row"><span class="k">Address</span><span class="v">${esc(c.address)||'—'}</span></div>
            ${(c.contacts||[]).length ? `<div class="rc-row" style="align-items:flex-start;"><span class="k">Contacts</span><span class="v">${c.contacts.map(cc=>`${esc(cc.name)||'—'}${cc.email?' · '+esc(cc.email):''}${cc.mobile?' · '+esc(cc.mobile):''}`).join('<br>')}</span></div>` : `<div class="rc-row"><span class="k">Contacts</span><span class="v">—</span></div>`}
            <div class="rc-actions">
              <button class="btn small ghost" onclick="editCustomer('${c.id}')">Edit</button>
              <button class="btn danger" onclick="deleteRow('customers','${c.id}')">Del</button>
            </div>
          </div>`).join('') || '<div class="empty">No customers added yet.</div>'}
      </div>
    </div>
  `;
}
// Contacts are only kept if at least one field was actually filled in — blank rows added by
// mistake (or left over from clicking "Add Contact" then not filling it) are dropped on save.
function cleanCustContacts(){
  return custContactsDraft
    .filter(r=>(r.name||'').trim() || (r.email||'').trim() || (r.mobile||'').trim())
    .map((r,i)=>({ id:r.id||('cc'+Date.now()+i), name:(r.name||'').trim(), email:(r.email||'').trim(), mobile:(r.mobile||'').trim() }));
}
function addCustContactRow(){ custContactsDraft.push({name:'',email:'',mobile:''}); render(); }
function updateCustContactField(i, field, val){ if(!custContactsDraft[i]) return; custContactsDraft[i][field] = val; }
function deleteCustContactRow(i){ custContactsDraft.splice(i,1); render(); }
function custContactsOf(customerId){
  const c = DB.customers.find(x=>x.id===customerId);
  return c && c.contacts ? c.contacts : [];
}
// First saved contact is treated as the primary — used wherever a doc needs one email/mobile
// (Quotation, Sales Order, Invoice, etc). Falls back to the customer-level Phone if no contact
// mobile is on file yet.
function custPrimaryContact(customerId){
  const c = DB.customers.find(x=>x.id===customerId);
  if(!c) return {name:'', email:'', mobile:''};
  const first = (c.contacts||[])[0];
  return { name:(first&&first.name)||c.contact||'', email:(first&&first.email)||'', mobile:(first&&first.mobile)||c.phone||'' };
}
// Phone / Contact Person used to be their own top-level fields; they're now derived from the
// first Contacts row so there's a single place to maintain this info (no more duplicate typing).
// Kept as plain c.phone/c.contact under the hood so every other module that already reads those
// fields (Invoice Bill To, etc.) keeps working unchanged.
function deriveCustPhoneContact(contacts){
  const first = contacts[0];
  return { phone:(first&&first.mobile)||'', contact:(first&&first.name)||'' };
}
// Screen-only preview of the Customer ID a new customer WILL receive on save (does not consume
// the counter — uid('cu') is only actually called inside addCustomer() at save time).
function previewNextCustomerId(){
  return 'CU-'+String(((DB.counters&&DB.counters.cu)||0)+1).padStart(4,'0');
}
// Lets an existing customer's GST Rate be corrected directly from their card in the list — no
// need to open full Edit for a one-field change. Used to backfill GST Rate on customers created
// before this field existed (they silently default to Intra-State until set here).
function setCustomerGstTypeInline(id, val){
  const c = DB.customers.find(x=>x.id===id);
  if(!c) return;
  c.gstType = val==='inter' ? 'inter' : 'intra';
  saveDB();
  toast(`GST Rate updated for ${c.name}`);
}
function addCustomer(){
  if(!requireAdminOffice()) return;
  const name = document.getElementById('cuName').value.trim();
  if(!name){ toast('Customer name is required'); return; }
  const contacts = cleanCustContacts();
  const pc = deriveCustPhoneContact(contacts);
  DB.customers.push({
    id:'cu'+Date.now(), no:uid('cu'), name,
    shortName:document.getElementById('cuShortName').value.trim(),
    gstin:document.getElementById('cuGstin').value.trim(),
    hsn:document.getElementById('cuHsn').value.trim(),
    gstType:document.getElementById('cuGstType').value||'intra',
    phone:pc.phone,
    contact:pc.contact,
    address:document.getElementById('cuAddress').value.trim(),
    contacts
  });
  custContactsDraft = [];
  saveDB(); toast('Customer added'); render();
}
function editCustomer(id){
  editingCustomerId = id;
  const c = DB.customers.find(x=>x.id===id);
  custContactsDraft = (c && c.contacts ? c.contacts : []).map(r=>({...r}));
  render();
}
function cancelEditCustomer(){ editingCustomerId = null; custContactsDraft = []; render(); }
function saveEditCustomer(){
  if(!requireAdminOffice()) return;
  const c = DB.customers.find(x=>x.id===editingCustomerId);
  if(!c) return;
  const name = document.getElementById('cuName').value.trim();
  if(!name){ toast('Customer name is required'); return; }
  c.name=name; c.shortName=document.getElementById('cuShortName').value.trim();
  c.gstin=document.getElementById('cuGstin').value.trim();
  c.hsn=document.getElementById('cuHsn').value.trim();
  c.gstType=document.getElementById('cuGstType').value||'intra';
  c.address=document.getElementById('cuAddress').value.trim();
  c.contacts=cleanCustContacts();
  const pc = deriveCustPhoneContact(c.contacts);
  c.phone=pc.phone; c.contact=pc.contact;
  editingCustomerId = null;
  custContactsDraft = [];
  saveDB(); toast('Customer updated'); render();
}
/* ==== Customer Data Relink / Repair =====
   Older records (created before Customer Master had an id-based link, or entered via "Other
   (type manually)") may only carry a typed customer NAME string with no customerId — so the
   Short Name / GSTIN from Customer Master never resolves for them (custDispById/ByName has
   nothing to look up). This scans every module that references a customer by name, and for
   any record missing a valid customerId, tries to match it to Customer Master by name (Full
   Name or Short Name, trimmed/case-insensitive) and backfills customerId + normalizes the
   stored name to the Full Name — Short Name display then works everywhere automatically.
   Never invents a link for a name that doesn't match anything in Customer Master. */
function relinkAllCustomerData(){
  if(!requireAdminOffice()) return;
  const byNameKey = {}, byShortKey = {};
  DB.customers.forEach(c=>{
    const nk = (c.name||'').trim().toLowerCase(); if(nk) byNameKey[nk] = c;
    const sk = (c.shortName||'').trim().toLowerCase(); if(sk) byShortKey[sk] = c;
  });
  function findCust(nameStr){
    const k = (nameStr||'').trim().toLowerCase();
    if(!k) return null;
    return byNameKey[k] || byShortKey[k] || null;
  }
  let fixed = 0, renamed = 0; const unmatched = new Set();
  function relinkCollection(arr, nameField){
    (arr||[]).forEach(r=>{
      const curId = r.customerId;
      const curName = r[nameField];
      const validId = curId && DB.customers.some(c=>c.id===curId);
      if(validId){
        const c = DB.customers.find(x=>x.id===curId);
        if(c && curName && curName.trim() && curName.trim()!==c.name){
          const loose = curName.trim().toLowerCase();
          if(loose===((c.shortName||'').trim().toLowerCase()) || loose===c.name.trim().toLowerCase()){
            r[nameField] = c.name; renamed++;
          }
        }
        return;
      }
      const match = findCust(curName);
      if(match){
        r.customerId = match.id;
        r[nameField] = match.name; // normalize stored text to Full Name so Short Name display resolves everywhere
        fixed++;
      } else if(curName && curName.trim()){
        unmatched.add(curName.trim());
      }
    });
  }
  relinkCollection(DB.quotation, 'customer');
  relinkCollection(DB.labourQuotation, 'customer');
  relinkCollection(DB.custPO, 'customer');
  relinkCollection(DB.labourPO, 'customer');
  relinkCollection(DB.labourMapping, 'customer');
  relinkCollection(DB.labourMaterialReceipt, 'customer');
  relinkCollection(DB.bom, 'customerName');
  relinkCollection(DB.controlPlans, 'customerName');
  saveDB();
  const parts = [];
  if(fixed) parts.push(`${fixed} record(s) newly linked to a Customer ID`);
  if(renamed) parts.push(`${renamed} name(s) normalized to Full Name`);
  if(!fixed && !renamed) parts.push('no unlinked records found — everything already matches Customer Master');
  let msg = 'Relink complete: ' + parts.join(', ') + '.';
  if(unmatched.size) msg += ` ${unmatched.size} customer name(s) had no match in Customer Master (check spelling or add them): ${Array.from(unmatched).slice(0,5).join(', ')}${unmatched.size>5?', …':''}`;
  toast(msg);
  render();
}
function printCustomers(){
  const list = DB.customers;
  const headers = ['Name','GSTIN','HSN Code','Contacts (Name: Email / Mobile)','Address'];
  const rows = list.map(c=>[esc(c.name), esc(c.gstin)||'—', esc(c.hsn)||'—', (c.contacts||[]).map(cc=>`${esc(cc.name)||'—'}: ${esc(cc.email)||'—'} / ${esc(cc.mobile)||'—'}`).join('; ')||'—', esc(c.address)||'—']);
  printReport('Customer Master List', headers, rows, {barRight:`Total Customers: ${list.length}`});
}
