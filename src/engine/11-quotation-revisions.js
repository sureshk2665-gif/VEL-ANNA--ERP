/* =====================================================================================
   QUOTATION REVISION HISTORY — complete, permanent audit trail.
   Every quotation is Rev-0 at creation. "Revise Quotation" always creates a NEW revision
   (Rev-1, Rev-2, ...) with its own snapshot; nothing already saved is ever overwritten or
   deleted. The quotation number (q.quoteNo) never changes — only q.revNo increases.
   ===================================================================================== */
const QUOTE_REVISION_REASONS = ['Price Reduction','Price Increase','Quantity Change','Delivery Change','Terms Change','Specification Change','Customer Request','Other'];
function quoteRevisionReasonOptionsHtml(sel){
  return QUOTE_REVISION_REASONS.map(r=>`<option value="${esc(r)}" ${sel===r?'selected':''}>${esc(r)}</option>`).join('');
}
// Snapshot = every field that can change between revisions. Deep-cloned so later edits to the
// live quotation object can never mutate a historical snapshot.
function quoteSnapshotOf(q){
  return {
    quoteDate:q.quoteDate, validUntil:q.validUntil, customerId:q.customerId, customer:q.customer,
    gstin:q.gstin, address:q.address, items:JSON.parse(JSON.stringify(q.items||[])),
    terms:q.terms, status:q.status
  };
}
// Back-fills revisions[] for quotations created before this feature existed, so every
// quotation — old or new — always has at least a Rev-0 history entry.
function ensureQuoteRevisions(q){
  if(!q.revisions || !q.revisions.length){
    q.revNo = 0;
    q.revisions = [{
      revNo:0, dateTime:(q.quoteDate?q.quoteDate+'T00:00:00':new Date().toISOString()),
      by:q.createdBy||'System', reason:'Original Quotation Created',
      customerRemarks:'', internalRemarks:'', snapshot:quoteSnapshotOf(q)
    }];
  }
  if(q.revNo===undefined || q.revNo===null) q.revNo = q.revisions[q.revisions.length-1].revNo;
  return q;
}
function quoteDisplayNo(q){ ensureQuoteRevisions(q); return `${q.quoteNo} Rev-${q.revNo}`; }
function quoteRevisionAt(q, revNo){
  ensureQuoteRevisions(q);
  return q.revisions.find(r=>r.revNo===revNo) || q.revisions[q.revisions.length-1];
}
// Field-by-field diff between two snapshots — drives both the auto comparison table shown
// under each revision and the manual Compare Revisions screen. Header-level + per-line-item.
function diffQuoteSnapshots(prev, cur){
  const header = [];
  const push=(label,before,after)=>header.push({label,before:(before===undefined||before===null||before==='')?'—':before,after:(after===undefined||after===null||after==='')?'—':after,changed:String(before??'')!==String(after??'')});
  const prevItems = prev.items||[], curItems = cur.items||[];
  let prevTotal=0, curTotal=0;
  prevItems.forEach(it=>prevTotal+=calcQuoteItem(it).lineTotal);
  curItems.forEach(it=>curTotal+=calcQuoteItem(it).lineTotal);
  push('Total Quotation Price', fmtMoney(prevTotal), fmtMoney(curTotal));
  header[0].isPrice = true; header[0].priceDiff = curTotal-prevTotal;
  push('Delivery / Valid Until', fmtDate(prev.validUntil), fmtDate(cur.validUntil));
  push('Status', prev.status, cur.status);
  push('Customer', prev.customer, cur.customer);
  push('Customer GSTIN', prev.gstin, cur.gstin);
  push('Customer HSN Code', prev.hsn, cur.hsn);
  push('Terms & Conditions', (prev.terms||'').trim()===(cur.terms||'').trim()?'(unchanged)':'(changed — see full text below)', (prev.terms||'').trim()===(cur.terms||'').trim()?'(unchanged)':'(changed — see full text below)');
  header[header.length-1].changed = (prev.terms||'').trim()!==(cur.terms||'').trim();
  const maxLen = Math.max(prevItems.length, curItems.length);
  const items = [];
  for(let i=0;i<maxLen;i++){
    const pi = prevItems[i], ci = curItems[i];
    const pc = pi ? calcQuoteItem(pi) : null, cc = ci ? calcQuoteItem(ci) : null;
    const fields = [];
    const pf=(label,before,after)=>fields.push({label,before:(before===undefined||before===null||before==='')?'—':before,after:(after===undefined||after===null||after==='')?'—':after,changed:String(before??'')!==String(after??'')});
    pf('Part No', pi?pi.partNo:'— (removed)', ci?ci.partNo:'— (removed)');
    pf('Qty', pi?pi.qty:'—', ci?ci.qty:'—');
    pf('Unit Rate', pi?fmtMoney(pc.unitRate):'—', ci?fmtMoney(cc.unitRate):'—');
    pf('Line Total', pi?fmtMoney(pc.lineTotal):'—', ci?fmtMoney(cc.lineTotal):'—');
    items.push({idx:i+1, partNo:(ci&&ci.partNo)||(pi&&pi.partNo)||'—', added:!pi&&!!ci, removed:!!pi&&!ci, fields, hasChange: fields.some(f=>f.changed)});
  }
  return {header, items, prevTotal, curTotal};
}
function addQuote(){
  if(!requireWorkingUnit()) return;
  const quoteNo=document.getElementById('qtNo').value.trim();
  const items = validateQuoteItems();
  if(!quoteNo){ toast('Quote No is required'); return; }
  if(!items.length){ toast('Add at least one line item with description & qty'); return; }
  const custSel = document.getElementById('qtCustSel').value;
  const customerId = (custSel && custSel!=='__other__') ? custSel : null;
  const customerName = document.getElementById('qtCust').value.trim();
  const byName = (currentUser && currentUser.name) || 'System';
  const q = {
    id:'qt'+Date.now(), quoteNo, quoteDate:document.getElementById('qtDate').value,
    validUntil:document.getElementById('qtValid').value, unit:currentUnit,
    customerId, customer:customerName,
    gstin:document.getElementById('qtGstin').value.trim(),
    hsn:document.getElementById('qtHsn').value.trim(),
    address:document.getElementById('qtAddress').value.trim(),
    items, terms:document.getElementById('qtTerms').value.trim(),
    status:document.getElementById('qtStatus').value,
    createdBy:byName, revNo:0
  };
  q.revisions = [{revNo:0, dateTime:new Date().toISOString(), by:byName, reason:'Original Quotation Created', customerRemarks:'', internalRemarks:'', snapshot:quoteSnapshotOf(q)}];
  DB.quotation.push(q);
  syncQuoteItemsToProductDev(items, customerId, customerName);
  quoteItemsDraft = [];
  quoteDraftCustomerId = ''; quoteDraftCustomerName = '';
  saveDB(); toast('Quotation saved as Rev-0'); render();
}
function editQuote(id){
  editingQuoteId = id; quoteViewId = null; quoteRevisionMode = false;
  const q = DB.quotation.find(x=>x.id===id);
  quoteItemsDraft = q ? JSON.parse(JSON.stringify(q.items||[])).map(it=>({
    ...blankQuoteItem(), ...it, partNo: it.partNo||'', partName: it.partName || it.desc || ''
  })) : [];
  quoteDraftCustomerId = q ? (q.customerId||'') : '';
  quoteDraftCustomerName = q ? (q.customer||'') : '';
  render();
}
// Launches the SAME edit form, but flagged as a revision: the original quotation data is
// never touched until Save — at which point a brand-new revision (Rev-N+1) is appended to
// history rather than overwriting the current one. Requires a Reason for Revision.
function reviseQuote(id){
  editingQuoteId = id; quoteViewId = null; quoteHistoryId = null; quoteRevisionMode = true;
  const q = DB.quotation.find(x=>x.id===id);
  if(q) ensureQuoteRevisions(q);
  quoteItemsDraft = q ? JSON.parse(JSON.stringify(q.items||[])).map(it=>({
    ...blankQuoteItem(), ...it, partNo: it.partNo||'', partName: it.partName || it.desc || ''
  })) : [];
  quoteDraftCustomerId = q ? (q.customerId||'') : '';
  quoteDraftCustomerName = q ? (q.customer||'') : '';
  render();
  setTimeout(()=>{ const el=document.getElementById('qtRevReason'); if(el) el.scrollIntoView({behavior:'smooth', block:'center'}); },50);
}
function cancelEditQuote(){ editingQuoteId=null; quoteItemsDraft=[]; quoteRevisionMode=false; quoteDraftCustomerId=''; quoteDraftCustomerName=''; render(); }
function saveEditQuote(){
  const q = DB.quotation.find(x=>x.id===editingQuoteId);
  if(!q) return;
  if(quoteRevisionMode) return saveRevisedQuote(q);
  const quoteNo=document.getElementById('qtNo').value.trim();
  const items = validateQuoteItems();
  if(!quoteNo){ toast('Quote No is required'); return; }
  if(!items.length){ toast('Add at least one line item with description & qty'); return; }
  const custSel = document.getElementById('qtCustSel').value;
  q.quoteNo=quoteNo; q.quoteDate=document.getElementById('qtDate').value;
  q.validUntil=document.getElementById('qtValid').value;
  q.customerId = (custSel && custSel!=='__other__') ? custSel : q.customerId;
  q.customer=document.getElementById('qtCust').value.trim();
  q.gstin=document.getElementById('qtGstin').value.trim();
  q.hsn=document.getElementById('qtHsn').value.trim();
  q.address=document.getElementById('qtAddress').value.trim();
  q.items=items; q.terms=document.getElementById('qtTerms').value.trim();
  q.status=document.getElementById('qtStatus').value;
  syncQuoteItemsToProductDev(items, q.customerId, q.customer);
  // Keep the current revision's stored snapshot (history) in sync with in-place corrections —
  // this does NOT create a new revision, it only refreshes what Rev-<current> looked like.
  ensureQuoteRevisions(q);
  q.revisions[q.revisions.length-1].snapshot = quoteSnapshotOf(q);
  editingQuoteId=null; quoteItemsDraft=[];
  quoteDraftCustomerId=''; quoteDraftCustomerName='';
  saveDB(); toast('Quotation saved'); render();
}
// Creates a brand-new, permanent revision. The quotation number never changes — only q.revNo
// increases (Rev-0 → Rev-1 → Rev-2 ...). Nothing from any earlier revision is ever deleted.
function saveRevisedQuote(q){
  const items = validateQuoteItems();
  if(!items.length){ toast('Add at least one line item with description & qty'); return; }
  const reason = (document.getElementById('qtRevReason').value||'').trim();
  if(!reason){ toast('Select a Reason for Revision'); return; }
  const custRemarks = (document.getElementById('qtRevCustRemarks').value||'').trim();
  const intRemarks = (document.getElementById('qtRevIntRemarks').value||'').trim();
  const custSel = document.getElementById('qtCustSel').value;
  ensureQuoteRevisions(q);
  const prevSnapshot = quoteSnapshotOf(q); // last-saved state, preserved forever in its own revision entry already
  const newQ = {
    quoteDate:document.getElementById('qtDate').value, validUntil:document.getElementById('qtValid').value,
    customerId:(custSel && custSel!=='__other__') ? custSel : q.customerId,
    customer:document.getElementById('qtCust').value.trim(), gstin:document.getElementById('qtGstin').value.trim(),
    hsn:document.getElementById('qtHsn').value.trim(),
    address:document.getElementById('qtAddress').value.trim(), items, terms:document.getElementById('qtTerms').value.trim(),
    status:document.getElementById('qtStatus').value
  };
  const byName = (currentUser && currentUser.name) || 'System';
  const newRevNo = q.revNo + 1;
  q.revisions.push({
    revNo:newRevNo, dateTime:new Date().toISOString(), by:byName, reason, customerRemarks:custRemarks, internalRemarks:intRemarks,
    snapshot:JSON.parse(JSON.stringify(newQ)), diffVsPrevious: null // computed on demand from stored snapshots — always accurate even if calc logic changes later
  });
  // Quote No (q.quoteNo) is untouched — identity never changes. Only the mirrored "current"
  // fields and revNo move forward; the OLD current-revision snapshot already sits permanently
  // in q.revisions[revNo-1] and is never overwritten.
  Object.assign(q, newQ);
  q.revNo = newRevNo;
  syncQuoteItemsToProductDev(items, q.customerId, q.customer);
  editingQuoteId=null; quoteItemsDraft=[]; quoteRevisionMode=false;
  quoteDraftCustomerId=''; quoteDraftCustomerName='';
  saveDB(); toast(`Revision saved — now ${q.quoteNo} Rev-${newRevNo}`); render();
}
/* ===== Price Revision (Quotation sub-module) =========================================
   APPROVAL-BASED WORKFLOW — this module only ever PREPARES a proposed price revision and
   tracks customer approval. It never touches the live Sales/Job Work Quotation price by itself.

     Price Revision → Customer Approval → Apply to Quotation      (the only allowed path)
     Price Revision → Automatically Change Quotation               (NEVER happens)

   Each "Save" below creates a DB.priceRevisions[] record with status 'Draft', holding the
   Original Price (read from the quotation, frozen at proposal time) and the Proposed Revised
   Price — the existing quotation item is NOT written to. The record then moves through
   Draft → Sent to Customer → Pending Customer Approval → Approved | Rejected via explicit user
   actions. Only when status is 'Approved' does the "✅ Apply to Quotation" button appear;
   pressing it is the single place that ever writes the revised price back into the quotation
   (reusing the same revisions[]/priceRevisions[] history mechanism as a manual edit), and stamps
   appliedDate so it can never be re-applied. Before that, the Original Price in the quotation is
   guaranteed untouched. */

// Customers who actually have at least one Sales or Job Work Quotation, for the Price Revision
// customer picker (no point showing customers with nothing to revise).
// Only customers who have at least one ACCEPTED Sales or Job Work Quotation show up here — Price
// Revision is a post-acceptance workflow, so Draft/Sent/Rejected quotations never surface a
// customer (or, further down, a Part No / Current Cost) in this module at all.
function prCustomerOptions(){
  const ids = new Set(), names = new Set();
  DB.quotation.filter(x=>reportUnitMatch(x.unit) && x.status==='Accepted').forEach(q=>{ if(q.customerId) ids.add(q.customerId); else if(q.customer) names.add(q.customer.trim().toLowerCase()); });
  DB.labourQuotation.filter(x=>reportUnitMatch(x.unit) && x.status==='Accepted').forEach(q=>{ if(q.customerId) ids.add(q.customerId); else if(q.customer) names.add(q.customer.trim().toLowerCase()); });
  return DB.customers.filter(c=>ids.has(c.id) || names.has((c.name||'').trim().toLowerCase()))
    .slice().sort((a,b)=>(a.name||'').localeCompare(b.name||''));
}
function setPRCustomer(custId){
  prCustomerId = custId;
  const c = DB.customers.find(x=>x.id===custId);
  prCustomerName = c ? c.name : '';
  prSalesRawSel = {}; prSalesMachSel = {}; prLabourMachSel = {};
  render();
}
function prMatchesCustomer(q){
  if(!prCustomerId && !prCustomerName) return false;
  if(prCustomerId && q.customerId===prCustomerId) return true;
  if(!q.customerId && q.customer) return q.customer.trim().toLowerCase()===prCustomerName.trim().toLowerCase();
  return false;
}
// Distinct Sales-Quotation Part Nos for the selected customer, with each part's CURRENT (i.e.
// Original/unmodified) Raw Material Cost / Machining Cost — read-only, never written by this
// module — plus every {quoteId, itemIndex} reference so an approved revision, once explicitly
// applied, knows exactly which line items to update.
// Every (Quotation, Part No) combination for the selected customer — ONLY from Accepted
// Sales Quotations (Draft/Sent/Rejected are excluded entirely, never even read). Part-wise AND
// quotation-wise linked: if the same Part No appears in more than one Sales Quotation, each
// quotation gets its OWN row with its OWN Current Cost, never merged/overwritten into a single
// "latest wins" value. Raw Material Cost / Machining Cost are read directly off that exact
// quotation's item — nothing here recalculates or derives a new figure.
function prSalesPartsForCustomer(){
  const list = DB.quotation.filter(x=>reportUnitMatch(x.unit) && x.status==='Accepted' && prMatchesCustomer(x))
    .slice().sort((a,b)=>(a.quoteDate||'').localeCompare(b.quoteDate||''));
  const map = {};
  list.forEach(q=>{
    (q.items||[]).forEach((it,idx)=>{
      const pn = (it.partNo||'').trim();
      if(!pn) return;
      const key = q.id+'::'+pn; // quotation-wise + part-wise key — never collapsed across quotations
      if(!map[key]) map[key] = {key, partNo:pn, partName:it.partName||'', quoteId:q.id, quoteNo:q.quoteNo, rawMat:parseFloat(it.rawMat)||0, machining:parseFloat(it.machining)||0, refs:[]};
      map[key].refs.push({quoteId:q.id, quoteNo:q.quoteNo, itemIndex:idx}); // same part repeated within the SAME quotation — additional line-item reference only, price above is unchanged
    });
  });
  return Object.values(map).sort((a,b)=> a.partNo.localeCompare(b.partNo) || a.quoteNo.localeCompare(b.quoteNo));
}
// Every (Job Work Quotation, Part No) combination for the selected customer — ONLY from Accepted
// Job Work Quotations (Draft/Sent/Rejected are excluded entirely, never even read). Same part-wise +
// quotation-wise linkage as above. Machining Cost is the exact CNC+VMC cost already computed
// for THAT quotation's own item using THAT quotation's own cncRate/vmcRate/profitPct — the same
// calcLabourItem formula the Job Work Quotation screen itself uses to show its "Total (₹)", not a
// separate recalculation.
function prLabourPartsForCustomer(){
  const list = DB.labourQuotation.filter(x=>reportUnitMatch(x.unit) && x.status==='Accepted' && prMatchesCustomer(x))
    .slice().sort((a,b)=>(a.quoteDate||'').localeCompare(b.quoteDate||''));
  const map = {};
  list.forEach(q=>{
    (q.items||[]).forEach((it,idx)=>{
      const pn = (it.partNo||'').trim();
      if(!pn) return;
      const key = q.id+'::'+pn;
      if(!map[key]){
        const c = calcLabourItem(it, q.cncRate, q.vmcRate, q.profitPct);
        // Use the item's full computed Total (₹) — the exact same figure the Job Work Quotation
        // card/list shows as "Value" — not just the raw CNC+VMC machining cost. That raw
        // component excludes Nego Adj % / Profit %, so it silently understated Current Cost
        // versus what the quotation actually shows (e.g. ₹16 vs the real ₹18).
        map[key] = {key, partNo:pn, partName:it.partName||'', quoteId:q.id, quoteNo:q.quoteNo, machining:c.total, refs:[]};
      }
      map[key].refs.push({quoteId:q.id, quoteNo:q.quoteNo, itemIndex:idx});
    });
  });
  return Object.values(map).sort((a,b)=> a.partNo.localeCompare(b.partNo) || a.quoteNo.localeCompare(b.quoteNo));
}
function prToggleSel(which, key){
  const store = which==='salesRaw'?prSalesRawSel : which==='salesMach'?prSalesMachSel : prLabourMachSel;
  if(store[key]) delete store[key]; else store[key] = true;
  render();
}
function prToggleSelAll(which){
  const parts = which==='labourMach' ? prLabourPartsForCustomer() : prSalesPartsForCustomer();
  const store = which==='salesRaw'?prSalesRawSel : which==='salesMach'?prSalesMachSel : prLabourMachSel;
  const allSelected = parts.length>0 && parts.every(p=>store[p.key]);
  parts.forEach(p=>{ if(allSelected) delete store[p.key]; else store[p.key]=true; });
  render();
}
function prSetMode(which, mode){
  if(which==='salesRaw') prSalesRawMode=mode; else if(which==='salesMach') prSalesMachMode=mode; else prLabourMachMode=mode;
  render();
}
function prSetVal(which, val){
  if(which==='salesRaw') prSalesRawVal=val; else if(which==='salesMach') prSalesMachVal=val; else prLabourMachVal=val;
  renderPriceRevisionTab(document.getElementById('qtSub')); // live-refresh the calculated preview table only, no full page re-render / no data written anywhere yet
}
// Given an Original Price + the entered proposal mode/value, returns the PROPOSED
// {revisedPrice, revisionPct, revisionAmt} — a preview only, nothing is saved until prSaveRevision().
function prCompute(currentPrice, mode, val){
  const v = parseFloat(val)||0;
  let revisedPrice, revisionAmt;
  if(mode==='amount'){ revisionAmt = v; revisedPrice = currentPrice + v; }
  else { revisedPrice = currentPrice*(1+v/100); revisionAmt = revisedPrice - currentPrice; }
  revisedPrice = Math.round(revisedPrice*100)/100; revisionAmt = Math.round(revisionAmt*100)/100;
  const revisionPct = currentPrice ? Math.round((revisionAmt/currentPrice)*10000)/100 : 0;
  return {revisedPrice, revisionPct, revisionAmt};
}
// ===== Step 1-4: Create & Save a proposed Price Revision — status starts at 'Draft'.
// This ONLY writes to DB.priceRevisions[]. The Sales/Job Work Quotation records are never touched
// here — Original Price stays exactly as-is (see prApplyApproved() for the one place that can
// ever change it, and only after status is 'Approved').
// If prEditingId is set (via prEditRevision below), this UPDATES that existing record in place
// instead of creating a new one — only allowed while it hasn't been Approved/Applied yet.
function prSaveRevision(which){ // which: 'salesRaw' | 'salesMach' | 'labourMach'
  const isLabour = which==='labourMach';
  const sel = which==='salesRaw' ? prSalesRawSel : which==='salesMach' ? prSalesMachSel : prLabourMachSel;
  const mode = which==='salesRaw' ? prSalesRawMode : which==='salesMach' ? prSalesMachMode : prLabourMachMode;
  const val = which==='salesRaw' ? prSalesRawVal : which==='salesMach' ? prSalesMachVal : prLabourMachVal;
  const module = isLabour ? 'Labour' : 'Sales';
  const costType = which==='salesRaw' ? 'Raw Material' : 'Machining';
  const allParts = isLabour ? prLabourPartsForCustomer() : prSalesPartsForCustomer();
  const parts = allParts.filter(p=>sel[p.key]);
  if(!parts.length){ toast('Tick at least one Part No'); return; }
  if(!parseFloat(val)){ toast('Enter a Price Increase (% or Fixed Amount)'); return; }
  const byName = (currentUser && currentUser.name) || 'System';
  const partsPayload = parts.map(p=>{
    const currentPrice = isLabour ? p.machining : (which==='salesRaw' ? p.rawMat : p.machining);
    const {revisedPrice, revisionPct, revisionAmt} = prCompute(currentPrice, mode, val);
    return {partNo:p.partNo, partName:p.partName, quoteId:p.quoteId, quoteNo:p.quoteNo, quoteRefs:p.refs, oldPrice:currentPrice, revisionPct, revisionAmt, revisedPrice};
  });
  if(prEditingId){
    const r = DB.priceRevisions.find(x=>x.id===prEditingId);
    if(!r){ prEditingId=null; toast('That Price Revision no longer exists'); return; }
    if(r.status==='Approved' || r.appliedDate){ prEditingId=null; toast('This Price Revision has already been Approved/Applied and can no longer be edited'); render(); return; }
    r.mode = mode; r.val = val; r.parts = partsPayload;
    r.customerId = prCustomerId; r.customer = prCustomerName;
    r.editedDate = new Date().toISOString(); r.editedBy = byName;
    prEditingId = null;
    if(which==='salesRaw'){ prSalesRawSel={}; prSalesRawVal=''; }
    else if(which==='salesMach'){ prSalesMachSel={}; prSalesMachVal=''; }
    else { prLabourMachSel={}; prLabourMachVal=''; }
    saveDB(); toast(`Price Revision updated — ${parts.length} part(s)`); render(); return;
  }
  const record = {
    id:'pr'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    module, costType, mode, val, unit:currentUnit,
    customerId:prCustomerId, customer:prCustomerName,
    createdDate:new Date().toISOString(), createdBy:byName,
    status:'Draft', sentDate:null, pendingDate:null, approvedDate:null, rejectedDate:null, appliedDate:null,
    parts: partsPayload
  };
  DB.priceRevisions.push(record);
  if(which==='salesRaw'){ prSalesRawSel={}; prSalesRawVal=''; }
  else if(which==='salesMach'){ prSalesMachSel={}; prSalesMachVal=''; }
  else { prLabourMachSel={}; prLabourMachVal=''; }
  saveDB(); toast(`Price Revision saved as Draft — ${parts.length} part(s), pending customer approval`); render();
}
// Which section ('salesRaw'|'salesMach'|'labourMach') a given saved record belongs to — used to
// route Edit back into the right form section.
function prWhichFor(r){ return r.module==='Labour' ? 'labourMach' : (r.costType==='Raw Material' ? 'salesRaw' : 'salesMach'); }
// ===== Edit an existing (not yet Approved/Applied) Price Revision: re-populates the Customer,
// the ticked Part Nos, and the Price Increase mode/value back into the matching form section so
// the user can change the selection/increase and Save — which then updates this SAME record
// (see prSaveRevision above) rather than creating a duplicate.
function prEditRevision(id){
  const r = DB.priceRevisions.find(x=>x.id===id);
  if(!r) return;
  if(r.status==='Approved' || r.appliedDate){ toast('Approved / applied Price Revisions cannot be edited'); return; }
  const which = prWhichFor(r);
  prCustomerId = r.customerId; prCustomerName = r.customer;
  prSalesRawSel = {}; prSalesMachSel = {}; prLabourMachSel = {};
  const store = which==='salesRaw'?prSalesRawSel : which==='salesMach'?prSalesMachSel : prLabourMachSel;
  r.parts.forEach(p=>{ store[(p.quoteId||'')+'::'+p.partNo] = true; });
  if(which==='salesRaw'){ prSalesRawMode=r.mode; prSalesRawVal=String(r.val); }
  else if(which==='salesMach'){ prSalesMachMode=r.mode; prSalesMachVal=String(r.val); }
  else { prLabourMachMode=r.mode; prLabourMachVal=String(r.val); }
  prEditingId = id;
  toast('Editing Price Revision — adjust the selection/increase below, then Save to update it');
  render();
}
function prCancelEdit(){
  prEditingId = null; prSalesRawSel={}; prSalesMachSel={}; prLabourMachSel={};
  prSalesRawVal=''; prSalesMachVal=''; prLabourMachVal='';
  render();
}
// ===== Delete a Price Revision — only while it hasn't been Approved/Applied yet, exactly like
// Edit. Deleting only removes the proposal record; it never touches the underlying quotation
// (which this module never wrote to in the first place, since it wasn't Approved).
function prDeleteRevision(id){
  const r = DB.priceRevisions.find(x=>x.id===id);
  if(!r) return;
  if(r.status==='Approved' || r.appliedDate){ toast('Approved / applied Price Revisions cannot be deleted'); return; }
  if(!confirm(`Delete this Price Revision — ${esc(r.customer)||'—'}, ${r.parts.map(p=>p.partNo).join(', ')}? This cannot be undone.`)) return;
  DB.priceRevisions = DB.priceRevisions.filter(x=>x.id!==id);
  if(prEditingId===id) prEditingId=null;
  saveDB(); toast('Price Revision deleted'); render();
}
// ===== Step 6: Approval-status lifecycle. Purely administrative — never writes to any
// quotation. Status can only ever move forward to 'Approved'/'Rejected' from here; the actual
// quotation price change happens separately, only via prApplyApproved() below.
function prSetRevisionStatus(id, status){
  const r = DB.priceRevisions.find(x=>x.id===id);
  if(!r) return;
  r.status = status;
  if(status==='Sent to Customer') r.sentDate = new Date().toISOString();
  if(status==='Pending Customer Approval') r.pendingDate = new Date().toISOString();
  if(status==='Approved') r.approvedDate = new Date().toISOString();
  if(status==='Rejected') r.rejectedDate = new Date().toISOString();
  saveDB(); toast(`Price Revision marked "${status}"`); render();
}
// ===== The ONLY function in this module allowed to write to DB.quotation / DB.labourQuotation.
// Requires status==='Approved' and not already applied. Uses the frozen revisedPrice values
// captured at proposal time — the Original Price is preserved forever via the quotation's own
// revisions[]/priceRevisions[] history, exactly like a manual quotation edit.
function prApplyApproved(id){
  const r = DB.priceRevisions.find(x=>x.id===id);
  if(!r) return;
  if(r.status!=='Approved'){ toast('Only an Approved Price Revision can be applied to the quotation'); return; }
  if(r.appliedDate){ toast('This Price Revision has already been applied'); return; }
  const byName = (currentUser && currentUser.name) || 'System';
  if(r.module==='Sales'){
    const touchedQuotes = {};
    const field = r.costType==='Raw Material' ? 'rawMat' : 'machining';
    r.parts.forEach(p=>{
      let lastRecalc = null;
      p.quoteRefs.forEach(ref=>{
        const q = DB.quotation.find(x=>x.id===ref.quoteId);
        if(!q || !q.items || !q.items[ref.itemIndex]) return;
        // Current Price is re-read from the quotation itself at the moment of applying — never
        // from a value cached back when the revision was drafted — so the increase is always
        // computed against whatever the Original Price actually is right now.
        const liveCurrentPrice = parseFloat(q.items[ref.itemIndex][field])||0;
        const recalced = prCompute(liveCurrentPrice, r.mode, r.val);
        if(!touchedQuotes[q.id]){ ensureQuoteRevisions(q); q.revisions[q.revisions.length-1].snapshot = quoteSnapshotOf(q); touchedQuotes[q.id]=q; }
        q.items[ref.itemIndex][field] = recalced.revisedPrice;
        lastRecalc = {oldPrice:liveCurrentPrice, ...recalced};
      });
      if(lastRecalc) Object.assign(p, lastRecalc); // keep the history row in sync with the price actually applied
    });
    Object.values(touchedQuotes).forEach(q=>{
      const newRevNo = q.revNo + 1;
      q.revisions.push({
        revNo:newRevNo, dateTime:new Date().toISOString(), by:byName,
        reason:`Price Revision (Customer-Approved) — ${r.costType} Cost Increase (${r.parts.map(p=>p.partNo).join(', ')})`,
        customerRemarks:'', internalRemarks:'', snapshot:{...quoteSnapshotOf(q), items:JSON.parse(JSON.stringify(q.items))}
      });
      q.revNo = newRevNo;
    });
  } else {
    // Job Work: Current Price (the CNC/VMC ₹/min rate) is re-read directly from the labour
    // quotation itself at apply time — the approved mode/val is re-applied to whatever that
    // live rate currently is, not a value cached when the revision was drafted.
    const touchedQuotes = {};
    const prevRates = {};
    r.parts.forEach(p=>p.quoteRefs.forEach(ref=>{ if(!touchedQuotes[ref.quoteId]) touchedQuotes[ref.quoteId]=DB.labourQuotation.find(x=>x.id===ref.quoteId); }));
    Object.values(touchedQuotes).filter(Boolean).forEach(q=>{
      if(!Array.isArray(q.priceRevisions)) q.priceRevisions = [];
      const prevCnc = parseFloat(q.cncRate)||0, prevVmc = parseFloat(q.vmcRate)||0;
      let newCnc, newVmc, pctForLog;
      if(r.mode==='amount'){
        const amt = parseFloat(r.val)||0;
        newCnc = Math.round((prevCnc+amt)*100)/100; newVmc = Math.round((prevVmc+amt)*100)/100;
        pctForLog = prevCnc ? Math.round((amt/prevCnc)*10000)/100 : 0;
      } else {
        const pct = parseFloat(r.val)||0;
        newCnc = Math.round(prevCnc*(1+pct/100)*100)/100; newVmc = Math.round(prevVmc*(1+pct/100)*100)/100;
        pctForLog = pct;
      }
      q.priceRevisions.push({
        revNo:q.priceRevisions.length+1, dateTime:new Date().toISOString(), by:byName, pct:pctForLog,
        previousCncRate:prevCnc, previousVmcRate:prevVmc, newCncRate:newCnc, newVmcRate:newVmc
      });
      prevRates[q.id] = {prevCnc, prevVmc};
      q.cncRate = newCnc; q.vmcRate = newVmc;
    });
    // Keep each part's history row in sync with the machining cost actually applied — recomputed
    // from the item's own quotation, using its rate just before and just after the change above.
    r.parts.forEach(p=>{
      const ref = p.quoteRefs[0]; if(!ref) return;
      const q = DB.labourQuotation.find(x=>x.id===ref.quoteId);
      const it = q && q.items && q.items[ref.itemIndex]; if(!q || !it) return;
      const pr = prevRates[q.id]; if(!pr) return;
      const before = calcLabourItem(it, pr.prevCnc, pr.prevVmc, q.profitPct);
      const after = calcLabourItem(it, q.cncRate, q.vmcRate, q.profitPct);
      const oldPrice = before.total, revisedPrice = Math.round(after.total*100)/100; // full Total (₹), matching the quotation card's "Value" — not just raw machining cost
      const revisionAmt = Math.round((revisedPrice-oldPrice)*100)/100;
      Object.assign(p, {oldPrice, revisedPrice, revisionAmt, revisionPct: oldPrice ? Math.round((revisionAmt/oldPrice)*10000)/100 : 0});
    });
  }
  r.appliedDate = new Date().toISOString();
  saveDB(); toast(`Approved revision applied to quotation — ${r.parts.length} part(s) updated`); render();
}
function prPartPreviewRowHtml(which, p, currentPrice, mode, val){
  const store = which==='salesRaw'?prSalesRawSel : which==='salesMach'?prSalesMachSel : prLabourMachSel;
  const checked = !!store[p.key];
  const {revisedPrice, revisionPct, revisionAmt} = checked && parseFloat(val) ? prCompute(currentPrice, mode, val) : {revisedPrice:currentPrice, revisionPct:0, revisionAmt:0};
  return `
    <tr>
      <td><input type="checkbox" ${checked?'checked':''} onchange="prToggleSel('${which}','${esc(p.key)}')"></td>
      <td>${esc(p.partNo)}</td>
      <td>${esc(p.partName)||'—'}</td>
      <td>${esc(p.quoteNo)}</td>
      <td>${fmtMoney(currentPrice)}</td>
      <td>${checked && parseFloat(val) ? fmtMoney(revisedPrice) : '—'}</td>
      <td>${checked && parseFloat(val) ? revisionPct+'%' : '—'}</td>
      <td>${checked && parseFloat(val) ? fmtMoney(revisionAmt) : '—'}</td>
    </tr>`;
}
function prSectionHtml(which, title, parts, mode, val, saveFn){
  const store = which==='salesRaw'?prSalesRawSel : which==='salesMach'?prSalesMachSel : prLabourMachSel;
  const selCount = parts.filter(p=>store[p.key]).length;
  const allSelected = parts.length>0 && parts.every(p=>store[p.key]);
  const editingThis = prEditingId && prWhichFor(DB.priceRevisions.find(x=>x.id===prEditingId)||{})===which;
  return `
    <div class="panel" ${editingThis?'style="border-color:#d9a03f;"':''}>
      <h3>${title} <span class="hint">${selCount} of ${parts.length} part(s) selected — this only PREPARES a proposal, the quotation is not changed</span></h3>
      ${editingThis ? `<div class="hint" style="position:static; color:#d9a03f; margin-bottom:8px;">✏️ Editing an existing Price Revision (Draft/not yet approved) — Save to update it, or <a href="javascript:void(0)" onclick="prCancelEdit()">Cancel Edit</a>.</div>` : ''}
      ${!parts.length ? `<div class="empty">No applicable Part Numbers found in this customer's Accepted Quotations.</div>` : `
      <div class="frow g3">
        <div><label class="fl">Price Increase</label>
          <select onchange="prSetMode('${which}', this.value)">
            <option value="pct" ${mode==='pct'?'selected':''}>Percentage (%)</option>
            <option value="amount" ${mode==='amount'?'selected':''}>Fixed Amount (₹)</option>
          </select>
        </div>
        <div><label class="fl">${mode==='amount'?'Fixed Amount (₹)':'Percentage (%)'}</label>
          <input type="number" step="0.01" value="${esc(val)}" placeholder="${mode==='amount'?'e.g. 50':'e.g. 5'}" oninput="prSetVal('${which}', this.value)"></div>
        <div style="align-self:end;"><button class="btn ghost small" onclick="prToggleSelAll('${which}')">${allSelected?'☐ Unselect All':'☑ Select All Part Numbers'}</button></div>
      </div>
      <div class="tw" style="margin-top:10px;">
        <table>
          <tr><th></th><th>Part No</th><th>Part Name</th><th>Quote No</th><th>Current Cost <span class="hint" style="position:static;">(from that Quotation — unaffected)</span></th><th>Proposed Revised Price</th><th>Revision %</th><th>Revision Amount</th></tr>
          ${parts.map(p=>prPartPreviewRowHtml(which, p, which==='labourMach'?p.machining:(which==='salesRaw'?p.rawMat:p.machining), mode, val)).join('')}
        </table>
      </div>
      <button class="btn amber" style="margin-top:12px;" onclick="${saveFn}">💾 ${editingThis?'Update Price Revision':'Save Price Revision (Draft)'}</button>
      ${editingThis?`<button class="btn ghost" style="margin-top:12px;" onclick="prCancelEdit()">Cancel</button>`:''}
      `}
    </div>`;
}
const PR_STATUS_FLOW = ['Draft','Sent to Customer','Pending Customer Approval','Approved','Rejected'];
function prStatusBadge(status){
  const colors = {Draft:'var(--steel-dim)', 'Sent to Customer':'#3a7bd5', 'Pending Customer Approval':'#d9a03f', Approved:'#2e9e5b', Rejected:'#c0392b'};
  return `<span class="pill" style="background:${colors[status]||'var(--steel-dim)'}; color:#fff;">${esc(status)}</span>`;
}
// Renders the record-level action buttons available for the record's current status —
// enforces the one-way Draft → Sent → Pending → Approved/Rejected → (Apply, if Approved) flow.
// Edit / Delete are offered for every record that hasn't been Approved (or already Applied) —
// i.e. any time before customer approval, exactly as required.
function prActionsHtml(r){
  const btns = [];
  const locked = r.status==='Approved' || !!r.appliedDate;
  if(!locked){
    btns.push(`<button class="btn small ghost" onclick="prEditRevision('${r.id}')">✏️ Edit</button>`);
    btns.push(`<button class="btn small ghost" style="border-color:#c0392b; color:#c0392b;" onclick="prDeleteRevision('${r.id}')">🗑 Delete</button>`);
  }
  if(r.status==='Draft') btns.push(`<button class="btn small ghost" onclick="prSetRevisionStatus('${r.id}','Sent to Customer')">📤 Mark Sent to Customer</button>`);
  if(r.status==='Sent to Customer') btns.push(`<button class="btn small ghost" onclick="prSetRevisionStatus('${r.id}','Pending Customer Approval')">⏳ Mark Pending Approval</button>`);
  if(r.status==='Pending Customer Approval'){
    btns.push(`<button class="btn small ghost" style="border-color:#2e9e5b; color:#2e9e5b;" onclick="prSetRevisionStatus('${r.id}','Approved')">✅ Customer Approved</button>`);
    btns.push(`<button class="btn small ghost" style="border-color:#c0392b; color:#c0392b;" onclick="prSetRevisionStatus('${r.id}','Rejected')">❌ Customer Rejected</button>`);
  }
  if(r.status==='Approved' && !r.appliedDate) btns.push(`<button class="btn small amber" onclick="prApplyApproved('${r.id}')">✅ Apply to Quotation</button>`);
  if(r.appliedDate) btns.push(`<span class="hint" style="position:static;">Applied to quotation on ${fmtDateTime(r.appliedDate)}</span>`);
  return btns.join(' ');
}
function renderPriceRevisionTab(sub){
  const custOpts = prCustomerOptions().map(c=>`<option value="${c.id}" ${c.id===prCustomerId?'selected':''}>${esc(c.name)}</option>`).join('');
  const salesParts = prSalesPartsForCustomer();
  const labourParts = prLabourPartsForCustomer();
  const histAll = DB.priceRevisions.filter(r=>r.unit===currentUnit || currentUnit==='Admin')
    .slice().sort((a,b)=> new Date(b.createdDate) - new Date(a.createdDate));
  const histRows = [];
  histAll.forEach(r=>r.parts.forEach(p=>histRows.push({r,p})));
  sub.innerHTML = `
    <div class="panel">
      <h3>Price Revision <span class="hint">Prepares a proposed revision for Customer Approval — the live quotation price is never changed here</span></h3>
      <div class="frow g4">
        <div><label class="fl">Customer *</label>
          <select id="prCustSel" onchange="setPRCustomer(this.value)"><option value="">— select customer —</option>${custOpts}</select></div>
      </div>
      <div class="hint" style="position:static; margin-top:2px;">Price Revision → Customer Approval → Apply to Quotation. The existing Sales/Job Work Quotation price stays exactly as-is until you explicitly click "Apply to Quotation" on an Approved revision below. Only <b>Accepted</b> Quotations are shown here — Draft, Sent, and Rejected quotations never appear.</div>
    </div>
    ${!prCustomerId ? `<div class="panel"><div class="empty">Select a Customer above to begin a Price Revision. Only customers with at least one Accepted Quotation are listed.</div></div>` : `
    <div class="section-total"><h3>📝 Sales Quotation — Price Revision</h3></div>
    ${prSectionHtml('salesRaw', '1. Raw Material Cost Price Increase', salesParts, prSalesRawMode, prSalesRawVal, "prSaveRevision('salesRaw')")}
    ${prSectionHtml('salesMach', '2. Machining Cost Price Increase', salesParts, prSalesMachMode, prSalesMachVal, "prSaveRevision('salesMach')")}
    <div class="section-total"><h3>👔 Job Work Quotation — Price Revision</h3></div>
    ${prSectionHtml('labourMach', 'Machining Cost Price Increase', labourParts, prLabourMachMode, prLabourMachVal, "prSaveRevision('labourMach')")}
    `}
    <div class="panel">
      <h3>Price Revision History <span class="hint">${histRows.length} entry(ies) — includes Draft, pending, approved and rejected proposals</span></h3>
      <div class="tw">
        <table>
          <tr><th>Revision Date</th><th>Customer</th><th>Module</th><th>Quote No</th><th>Part No</th><th>Cost Type</th><th>Previous Price</th><th>Proposed Revised Price</th><th>Revision %</th><th>Revision Amt</th><th>Approval Status</th><th>Actions</th><th>Customer Approval Date</th><th>Applied to Quotation Date</th></tr>
          ${histRows.length ? histRows.map(({r,p})=>`
            <tr>
              <td>${fmtDateTime(r.createdDate)}</td><td>${esc(r.customer)||'—'}</td><td>${esc(r.module)}</td><td>${esc(p.quoteNo)||'—'}</td><td>${esc(p.partNo)}</td>
              <td>${esc(r.costType)}</td><td>${fmtMoney(p.oldPrice)}</td><td>${fmtMoney(p.revisedPrice)}</td>
              <td>${p.revisionPct}%</td><td>${fmtMoney(p.revisionAmt)}</td>
              <td>${prStatusBadge(r.status)}</td>
              <td style="white-space:nowrap;">${prActionsHtml(r)}</td>
              <td>${r.approvedDate?fmtDateTime(r.approvedDate):'—'}</td>
              <td>${r.appliedDate?fmtDateTime(r.appliedDate):'—'}</td>
            </tr>`).join('') : `<tr><td colspan="14" class="empty">No price revisions created yet.</td></tr>`}
        </table>
      </div>
    </div>
  `;
}
function setQuoteStatus(id, status){
  const q = DB.quotation.find(x=>x.id===id);
  if(!q) return;
  q.status = status;
  saveDB(); toast('Quotation marked '+status); render();
}
function viewQuote(id){ quoteViewId=id; editingQuoteId=null; quoteItemsDraft=[]; render(); }
function closeViewQuote(){ quoteViewId=null; render(); }
function renderQuoteReport(main){
  const q = DB.quotation.find(x=>x.id===quoteViewId);
  if(!q){ quoteViewId=null; return renderQuotation(main.parentElement); }
  ensureQuoteRevisions(q);
  const items = q.items||[];
  const totVal = items.reduce((a,it)=>a+calcQuoteItem(it).lineTotal,0);
  main.innerHTML = `
    <div class="panel">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
        <div><h3 style="margin:0;">${esc(q.quoteNo)} <span class="pill rc-pill" style="background:var(--steel-dim); color:#fff;">Rev-${q.revNo}</span> <span class="badge ok" style="margin-left:4px;">CURRENT REVISION</span> <span class="hint">${esc(custDispByName(q.customer))}</span></h3></div>
        <div>
          <span class="badge ${q.status==='Accepted'?'ok':q.status==='Rejected'?'bad':'dev'}">${esc(q.status).toUpperCase()}</span>
          <button class="btn ghost small" onclick="reviseQuote('${q.id}')">✎ Revise Quotation</button>
          <button class="btn ghost small" onclick="openQuoteHistory('${q.id}')">🕘 Revision History (${q.revisions.length})</button>
          <button class="btn ghost small" onclick="printQuotation('${q.id}')">🖨 Print</button>
          <button class="btn ghost small" onclick="closeViewQuote()">← Back</button>
        </div>
      </div>
      <div class="info-grid" style="margin-top:14px;">
        <div class="info-cell"><label>Quote Date</label><div class="val">${fmtDate(q.quoteDate)}</div></div>
        <div class="info-cell"><label>Valid Until</label><div class="val">${fmtDate(q.validUntil)}</div></div>
        <div class="info-cell"><label>Customer GSTIN</label><div class="val">${esc(q.gstin)||'—'}</div></div>
        <div class="info-cell"><label>Customer HSN Code</label><div class="val">${esc(q.hsn)||'—'}</div></div>
        <div class="info-cell full"><label>Customer Address</label><div class="val addr-val">${addrLines(q.address)||'—'}</div></div>
      </div>
      <div class="tw"><table class="insp">
        <tr><th>SL</th><th>Part No</th><th>Part Name</th><th>QTY</th><th>Base Cost</th><th>Unit Rate</th><th>Line Total</th><th>MOQ QTY</th><th>MOQ VALUE</th></tr>
        ${items.map((it,i)=>{ const c=calcQuoteItem(it); return `<tr><td>${i+1}</td><td class="char">${esc(it.partNo)||'—'}</td><td class="char">${esc(it.partName||it.desc)}</td><td>${it.qty}</td><td>${fmtMoney(c.base)}</td><td>${fmtMoney(c.unitRate)}</td><td>${fmtMoney(c.lineTotal)}</td><td>${c.moqQty}</td><td>${fmtMoney(c.moqValue)}</td></tr>`; }).join('') || '<tr><td colspan="9"><div class="empty">No line items.</div></td></tr>'}
      </table></div>
      <div class="cards" style="margin-top:16px;">
        <div class="card"><div class="v">${items.length}</div><div class="l">Line Items</div></div>
        <div class="card"><div class="v">${fmtMoney(totVal)}</div><div class="l">Quotation Value</div></div>
      </div>
      <div class="section-total" style="margin-top:16px;"><h3>Linked Customer POs <span class="hint">${custPOsForQuotation(q.id).length} total</span></h3>
        <button class="btn ghost small" onclick="viewCustPOsForQuotation('${q.id}')">🔗 Open in Customer PO</button>
      </div>
      <div class="grid-box">
        ${custPOsForQuotation(q.id).map(p=>`
          <div class="rec-card">
            <div class="rc-title">${esc(p.custPoNo)} <span class="hint">${esc(p.refNo)}</span></div>
            <div class="rc-sub">${esc(p.finPartNo)||'—'} — ${esc(p.finPartName)||'—'}</div>
            <span class="pill rc-pill ${p.status==='Open'?'open':'done'}">${esc(p.status)}</span>
            <div class="rc-row"><span class="k">Ordered Qty</span><span class="v">${p.orderedQty||0}</span></div>
            <div class="rc-row"><span class="k">Delivery Date</span><span class="v">${p.deliveryDate?fmtDate(p.deliveryDate):'—'}</span></div>
          </div>`).join('') || '<div class="empty">No Customer PO has been raised against this quotation yet.</div>'}
      </div>
    </div>
  `;
}
function printQuotationsList(){
  const list = DB.quotation.filter(x=>reportUnitMatch(x.unit));
  const headers = ['Quote No','Date','Customer Name','Valid Until','Items','Value (₹)','Status'];
  const rows = list.map(q=>{
    const items = q.items||[];
    const totVal = items.reduce((a,it)=>a+calcQuoteItem(it).lineTotal,0);
    return [esc(q.quoteNo), fmtDate(q.quoteDate)||'—', esc(q.customer)||'—', fmtDate(q.validUntil)||'—', `<span class="num">${items.length}</span>`, `<span class="num">${fmtMoney(totVal)}</span>`, esc(q.status)];
  });
  printReport('Quotations List', headers, rows, {barLeft:`Unit: ${esc(reportScopeLabel())}`, barRight:`Total Quotations: ${list.length}`});
}
function printQuotation(id, revNo){
  const qOrig = DB.quotation.find(x=>x.id===id);
  if(!qOrig) return;
  ensureQuoteRevisions(qOrig);
  // When a specific revNo is given, print exactly that historical revision's permanent
  // snapshot (never the current data) — this is what "export/print any revision as PDF" means.
  const isHistorical = revNo!==undefined && revNo!==null && revNo!==qOrig.revNo;
  const rev = isHistorical ? quoteRevisionAt(qOrig, revNo) : null;
  const q = isHistorical ? Object.assign({}, qOrig, rev.snapshot) : qOrig;
  const revLabel = isHistorical ? ` — Rev-${revNo} (Historical Revision)` : ` — Rev-${qOrig.revNo} (Current Revision)`;
  const items = q.items||[];
  const totVal = items.reduce((a,it)=>a+calcQuoteItem(it).lineTotal,0);
  const rows = items.map((it,i)=>{
    const c = calcQuoteItem(it);
    return [i+1, esc(it.partNo)||'—', esc(it.partName||it.desc), `<span class="num">${it.qty}</span>`, `<span class="num">${fmtMoney(c.unitRate)}</span>`, `<span class="num">${fmtMoney(c.lineTotal)}</span>`, `<span class="num">${c.moqQty}</span>`];
  });
  rows.push(['', '', '<strong>TOTAL</strong>', '', '', `<span class="num"><strong>${fmtMoney(totVal)}</strong></span>`, '']);
  const breakup = items.map((it,i)=>{
    const c = calcQuoteItem(it);
    const oc = selectedOthersCost(it);
    const dc = it.devCostApplicable ? ensureDevCost(it).filter(d=>(d.name||'').trim()!=='' || (parseFloat(d.amount)||0)>0) : [];
    const dcBlock = dc.length ? `
      <div class="ocPrintBox" style="margin-top:${oc.length?'8px':'0'};">
        <div class="ocPrintHead">Development Cost <span class="ocPrintSub">— Fixturing / Tooling Charges</span></div>
        <table class="ocPrintTable">
          <tr><th style="text-align:left; padding:2px 10px; font-size:9px; color:var(--text-dim);">Item</th><th style="text-align:right; padding:2px 10px; font-size:9px; color:var(--text-dim);">Qty</th><th style="text-align:right; padding:2px 10px; font-size:9px; color:var(--text-dim);">Amount</th></tr>
          ${dc.map(d=>`<tr><td class="k">${esc(d.name)||'—'}</td><td class="v">${parseFloat(d.qty)||0}</td><td class="v">${fmtMoney((parseFloat(d.qty)||0)*(parseFloat(d.amount)||0))}</td></tr>`).join('')}
          <tr class="ocTotalRow"><td class="k" colspan="2"><strong>Total Development Cost</strong></td><td class="v"><strong>${fmtMoney(sumDevCost(it))}</strong></td></tr>
        </table>
      </div>` : '';
    const ocBlock = oc.length ? `
      <div class="ocPrintBox">
        <div class="ocPrintHead">Others Cost <span class="ocPrintSub">— Additional Processing Charges</span></div>
        <table class="ocPrintTable">
          ${oc.map(o=>`<tr><td class="k">${esc(othersCostLabel(o))}${o.remarks?` <span class="ocRemark">(${esc(o.remarks)})</span>`:''}</td><td class="v">${fmtMoney(o.amount)}</td></tr>`).join('')}
          <tr class="ocTotalRow"><td class="k"><strong>Total Others Cost</strong></td><td class="v"><strong>${fmtMoney(sumOthersCost(it))}</strong></td></tr>
        </table>
      </div>` : '';
    const brk = `<table class="brkTable">
      <tr><td class="k" colspan="2"><strong>Item ${i+1}: ${esc(it.partNo)||'—'} — ${esc(it.partName||it.desc)} — QTY ${it.qty} NOS — MOQ ${c.moqQty} NOS</strong></td></tr>
      <tr><td class="k">RM Cost per Piece${it.rmGrade ? ` (${esc(it.rmGrade)})` : ''}</td><td class="v">${fmtMoney(it.rawMat)}</td></tr>
      <tr><td class="k">Machining Cost</td><td class="v">${fmtMoney(it.machining)}</td></tr>
      ${oc.length ? `<tr><td class="k">Others Cost (see box)</td><td class="v">${fmtMoney(sumOthersCost(it))}</td></tr>` : ''}
      <tr><td class="k">Base Cost</td><td class="v">${fmtMoney(c.base)}</td></tr>
      <tr><td class="k">Admin @ ${it.adminPct}%</td><td class="v">${fmtMoney(c.base*it.adminPct/100)}</td></tr>
      <tr><td class="k">Inv. Carrying &amp; Rejection @ ${it.invPct}%</td><td class="v">${fmtMoney(c.base*it.invPct/100)}</td></tr>
      <tr><td class="k">Packing @ ${it.packPct}%</td><td class="v">${fmtMoney(c.base*it.packPct/100)}</td></tr>
      <tr><td class="k">Margin @ ${it.marginPct}%</td><td class="v">${fmtMoney(c.base*it.marginPct/100)}</td></tr>
      <tr><td class="k">Transportation @ ${it.transPct}%</td><td class="v">${fmtMoney(c.base*it.transPct/100)}</td></tr>
      <tr><td class="k"><strong>Unit Rate</strong></td><td class="v"><strong>${fmtMoney(c.unitRate)}</strong></td></tr>
    </table>`;
    // Price Breakup stays a single, un-split column; when Others Cost applies, it sits beside
    // it as its own clearly separate box (two-column layout), not mixed into the breakup rows.
    return (oc.length || dc.length)
      ? `<div class="brkWrap"><div class="brkCol">${brk}</div><div class="ocCol">${ocBlock}${dcBlock}</div></div>`
      : `<div class="brkWrap"><div class="brkCol brkColFull">${brk}</div></div>`;
  }).join('');
  const note = `<div class="ntTitle">Price Breakup</div><div class="ntBody">${breakup}</div>`;
  const termsHtml = formatTermsForPrint(q.terms, 'Terms &amp; Conditions');
  const custBlock = `<div class="ntTitle">Customer Details</div><div class="ntBody">
    <div class="custCard">
      <div class="custName">${esc(q.customer)||'—'}</div>
      <div class="custAddrBody">${addr3Lines(q.address, 'custAddrLine')||'<div class="custAddrLine">—</div>'}</div>
      <div class="custGst"><span class="custGstLbl">GSTIN</span><span>${esc(q.gstin)||'—'}</span></div>
      <div class="custGst"><span class="custGstLbl">HSN Code</span><span>${esc(q.hsn)||'—'}</span></div>
    </div>
  </div>`;
  const custCss = `
    body{ font-size:11px; line-height:1.35; }
    .prHead{ padding-bottom:9px; margin-bottom:11px; }
    .prHead h1{ font-size:16px; margin:0 0 2px; }
    .prHead .sub{ font-size:9.8px; }
    .prHead .meta{ font-size:9.8px; line-height:1.5; }
    .prTitle{ font-size:12px; padding:6px 12px; margin:0 0 8px; }
    .prBar{ font-size:10px; padding:5px 9px; margin-bottom:9px; }
    .prBar span{ line-height:1.5; }
    table th, table td{ padding:4px 7px; font-size:10.2px; }
    table th{ font-size:8.8px; padding:5px 7px; }
    .prNote.prNoteBefore{ margin-bottom:7px; }
    .prNote{ margin-top:7px; page-break-inside:avoid; }
    .prNote .ntTitle{ padding:5px 10px; font-size:9.8px; }
    .prNote .ntBody{ padding:6px 10px 7px; }
    .prNote .ntPara{ margin:3px 0 0; line-height:1.4; font-size:10px; }
    .brkWrap{ display:flex; gap:10px; align-items:flex-start; page-break-inside:avoid; }
    .brkCol{ flex:0 0 62%; max-width:62%; }
    .brkCol.brkColFull{ flex:1 1 100%; max-width:100%; }
    .ocCol{ flex:1 1 auto; min-width:0; }
    .brkTable{ width:100%; margin-bottom:4px; }
    .brkTable td{ padding:2px 6px; font-size:10px; }
    .brkTable td.k{ color:#3d4b58; }
    .brkTable td.v{ width:78px; text-align:right; font-family:var(--mono); white-space:nowrap; }
    .brkTable tr:first-child td{ background:var(--accent-dim,#e9f0f4); padding:4px 6px; border-bottom:1px solid var(--line-soft,#d9e0e6); }
    .custCard{ padding:0 0 0 8px; border-left:3px solid var(--accent,#1f5673); }
    .custName{ font-size:11.5px; font-weight:800; color:var(--accent-dark,#123a4e); letter-spacing:0.2px; margin-bottom:3px; }
    .custAddrBody{ font-size:10.2px; color:#232f3a; }
    .custAddrLine{ line-height:1.35; }
    .custGst{ margin-top:4px; padding-top:4px; border-top:1px dashed var(--line-soft,#d9e0e6); font-size:10px; }
    .custGstLbl{ font-weight:700; color:#3d4b58; margin-right:8px; }
    .prFoot{ margin-top:14px; font-size:10px; }
    .prFoot .sign{ padding-top:4px; width:140px; }
    .ocPrintBox{ margin:0 0 8px; border:1px solid var(--line-soft,#d9e0e6); border-left:3px solid var(--accent,#1f5673); border-radius:4px; background:#f6f9fb; page-break-inside:avoid; height:100%; }
    .ocPrintHead{ padding:4px 10px; font-size:9.6px; font-weight:800; text-transform:uppercase; letter-spacing:0.4px; color:var(--accent-dark,#123a4e); border-bottom:1px dashed var(--line-soft,#d9e0e6); }
    .ocPrintSub{ font-weight:500; text-transform:none; letter-spacing:0; color:var(--text-dim); font-size:8.8px; }
    .ocPrintTable{ width:100%; border-collapse:collapse; }
    .ocPrintTable td{ padding:2px 10px; font-size:10px; }
    .ocPrintTable td.k{ color:#3d4b58; }
    .ocPrintTable td.v{ text-align:right; font-family:var(--mono); white-space:nowrap; }
    .ocPrintTable .ocRemark{ font-weight:400; font-style:italic; color:var(--text-dim); font-size:9px; }
    .ocPrintTable .ocTotalRow td{ border-top:1px solid var(--line-soft,#d9e0e6); padding-top:4px; }
  `;
  // Terms & Conditions is appended last so it always renders at the very bottom of the
  // quotation, after the item table and price breakup, just above the signature block.
  printReport(`Quotation — ${q.quoteNo}${revLabel}`, ['Sl','Part No','Part Name','QTY','Unit Rate (₹)','Line Total (₹)','MOQ QTY'], rows,
    {barLeft:`Customer Name: ${esc(q.customer)||'—'} (GSTIN: ${esc(q.gstin)||'—'}, HSN: ${esc(q.hsn)||'—'})`, barRight:`Quote Date: ${fmtDate(q.quoteDate)} · Valid Until: ${fmtDate(q.validUntil)}`,
     note: custBlock, notePosition:'before',
     footerHtml:`<div class="prNote">${note}</div><div class="prNote">${termsHtml}</div><div class="prFoot"><div class="sign">Prepared By</div><div class="sign">Approved By</div></div>`,
     extraCss: custCss, pageMargin:'9mm', showSign:false});
}
function acceptQuotation(id){
  const q = DB.quotation.find(x=>x.id===id);
  if(!q) return;
  q.status = 'Accepted';
  saveDB(); toast('Quotation accepted'); render();
}

/* =====================================================================================
   QUOTATION REVISION HISTORY — UI panels: Timeline, Read-only revision viewer,
   Compare Revisions, and the cross-quotation searchable history log.
   ===================================================================================== */
function openQuoteHistory(id){ quoteHistoryId=id; quoteViewId=null; quoteRevisionViewRev=null; quoteCompareState=null; render(); }
function closeQuoteHistory(){ quoteHistoryId=null; render(); }
function diffBadgeHtml(f){
  if(!f.changed) return `<span>${esc(String(f.after))}</span>`;
  return `<span class="rev-before">${esc(String(f.before))}</span> <span class="rev-arrow">→</span> <span class="rev-after">${esc(String(f.after))}</span>`;
}
function renderQuoteHistoryPanel(main){
  const q = DB.quotation.find(x=>x.id===quoteHistoryId);
  if(!q){ quoteHistoryId=null; return renderQuotation(main.parentElement); }
  ensureQuoteRevisions(q);
  const revs = q.revisions.slice().sort((a,b)=>a.revNo-b.revNo); // chronological order
  main.innerHTML = `
    <div class="panel">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
        <div><h3 style="margin:0;">Revision History — ${esc(q.quoteNo)} <span class="hint">${esc(custDispByName(q.customer))||'—'} · Current: Rev-${q.revNo}</span></h3></div>
        <div>
          <button class="btn ghost small" onclick="startCompareRevisions('${q.id}')">⇄ Compare Revisions</button>
          <button class="btn ghost small" onclick="closeQuoteHistory()">← Back</button>
        </div>
      </div>

      <div class="section-total" style="margin-top:16px;"><h3>Timeline</h3></div>
      <div class="rev-timeline">
        ${revs.map(r=>`
          <div class="rev-tl-item">
            <div class="rev-tl-dot ${r.revNo===q.revNo?'current':''}"></div>
            <div class="rev-tl-body">
              <div class="rev-tl-head">
                <b>${r.revNo===0?'Original Quotation Created':'Rev-'+r.revNo+' — '+esc(r.reason)}</b>
                ${r.revNo===q.revNo?'<span class="badge ok">CURRENT</span>':''}
              </div>
              <div class="hint">${fmtDateTime(r.dateTime)} · by ${esc(r.by)||'—'}</div>
              ${r.customerRemarks?`<div class="rev-remark"><b>Customer Remarks:</b> ${esc(r.customerRemarks)}</div>`:''}
              ${r.internalRemarks?`<div class="rev-remark"><b>Internal Remarks:</b> ${esc(r.internalRemarks)}</div>`:''}
            </div>
          </div>`).join('')}
      </div>

      <div class="section-total" style="margin-top:12px;"><h3>All Revisions <span class="hint">${revs.length} total — permanently retained, nothing overwritten or deleted</span></h3></div>
      <div class="grid-box">
        ${revs.map(r=>{
          const prev = revs.find(x=>x.revNo===r.revNo-1);
          const diff = prev ? diffQuoteSnapshots(prev.snapshot, r.snapshot) : null;
          return `
          <div class="rec-card">
            <div class="rc-title">Rev-${r.revNo} ${r.revNo===q.revNo?'<span class="pill rc-pill" style="background:var(--green); color:#0a1a10;">Current</span>':''}</div>
            <div class="rc-sub">${fmtDateTime(r.dateTime)} · by ${esc(r.by)||'—'}</div>
            <div class="rc-row"><span class="k">Reason</span><span class="v">${esc(r.reason)||'—'}</span></div>
            <div class="rc-row"><span class="k">Status</span><span class="v">${esc(r.snapshot.status)}</span></div>
            <div class="rc-row"><span class="k">Value</span><span class="v">${fmtMoney((r.snapshot.items||[]).reduce((a,it)=>a+calcQuoteItem(it).lineTotal,0))}</span></div>
            ${r.customerRemarks?`<div class="rc-row"><span class="k">Customer Remarks</span><span class="v">${esc(r.customerRemarks)}</span></div>`:''}
            ${r.internalRemarks?`<div class="rc-row"><span class="k">Internal Remarks</span><span class="v">${esc(r.internalRemarks)}</span></div>`:''}
            ${diff ? `
            <div class="rev-diffbox">
              <div class="rev-diffbox-title">Changes vs Rev-${prev.revNo}</div>
              ${diff.header.filter(f=>f.changed).map(f=>`<div class="rev-diffrow"><span class="k">${esc(f.label)}</span><span class="v">${diffBadgeHtml(f)}</span></div>`).join('') || '<div class="hint">No header-level changes.</div>'}
              ${diff.items.filter(i=>i.hasChange).map(i=>`
                <div class="rev-diffrow-item">
                  <div class="hint">Item ${i.idx} — ${esc(i.partNo)}${i.added?' (NEW)':''}${i.removed?' (REMOVED)':''}</div>
                  ${i.fields.filter(f=>f.changed).map(f=>`<div class="rev-diffrow"><span class="k">${esc(f.label)}</span><span class="v">${diffBadgeHtml(f)}</span></div>`).join('')}
                </div>`).join('')}
            </div>` : ''}
            <div class="rc-actions">
              <button class="btn small ghost" onclick="viewQuoteRevision('${q.id}', ${r.revNo})">View (Read-Only)</button>
              <button class="btn small ghost" onclick="printQuotation('${q.id}', ${r.revNo})">🖨 Print / Export PDF</button>
            </div>
          </div>`;}).join('')}
      </div>
    </div>
  `;
}
function viewQuoteRevision(quoteId, revNo){ quoteRevisionViewRev = {quoteId, revNo}; render(); }
function closeQuoteRevisionView(){ const r=quoteRevisionViewRev; quoteRevisionViewRev=null; if(r) openQuoteHistory(r.quoteId); else render(); }
function renderQuoteRevisionView(main){
  const {quoteId, revNo} = quoteRevisionViewRev;
  const q = DB.quotation.find(x=>x.id===quoteId);
  if(!q){ quoteRevisionViewRev=null; return renderQuotation(main.parentElement); }
  ensureQuoteRevisions(q);
  const rev = quoteRevisionAt(q, revNo);
  const snap = rev.snapshot;
  const items = snap.items||[];
  const totVal = items.reduce((a,it)=>a+calcQuoteItem(it).lineTotal,0);
  const prev = q.revisions.find(x=>x.revNo===revNo-1);
  const diff = prev ? diffQuoteSnapshots(prev.snapshot, snap) : null;
  main.innerHTML = `
    <div class="panel" style="border:2px solid var(--amber-dim);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
        <div><h3 style="margin:0;">${esc(q.quoteNo)} <span class="pill rc-pill" style="background:var(--amber-dim); color:#fff;">Rev-${revNo}</span> <span class="badge dev">READ-ONLY — HISTORICAL REVISION</span></h3></div>
        <div>
          <button class="btn ghost small" onclick="printQuotation('${q.id}', ${revNo})">🖨 Print / Export PDF</button>
          <button class="btn ghost small" onclick="closeQuoteRevisionView()">← Back to History</button>
        </div>
      </div>
      <div class="hint" style="margin-top:6px;">${fmtDateTime(rev.dateTime)} · Revised By ${esc(rev.by)||'—'} · Reason: ${esc(rev.reason)||'—'}</div>
      ${rev.customerRemarks?`<div class="rev-remark"><b>Customer Remarks:</b> ${esc(rev.customerRemarks)}</div>`:''}
      ${rev.internalRemarks?`<div class="rev-remark"><b>Internal Remarks:</b> ${esc(rev.internalRemarks)}</div>`:''}
      <div class="info-grid" style="margin-top:14px;">
        <div class="info-cell"><label>Quote Date</label><div class="val">${fmtDate(snap.quoteDate)}</div></div>
        <div class="info-cell"><label>Valid Until</label><div class="val">${fmtDate(snap.validUntil)}</div></div>
        <div class="info-cell"><label>Customer GSTIN</label><div class="val">${esc(snap.gstin)||'—'}</div></div>
        <div class="info-cell"><label>Customer HSN Code</label><div class="val">${esc(snap.hsn)||'—'}</div></div>
        <div class="info-cell full"><label>Customer Address</label><div class="val addr-val">${addrLines(snap.address)||'—'}</div></div>
      </div>
      <div class="tw"><table class="insp">
        <tr><th>SL</th><th>Part No</th><th>Part Name</th><th>QTY</th><th>Base Cost</th><th>Unit Rate</th><th>Line Total</th><th>MOQ QTY</th><th>MOQ VALUE</th></tr>
        ${items.map((it,i)=>{ const c=calcQuoteItem(it); return `<tr><td>${i+1}</td><td class="char">${esc(it.partNo)||'—'}</td><td class="char">${esc(it.partName||it.desc)}</td><td>${it.qty}</td><td>${fmtMoney(c.base)}</td><td>${fmtMoney(c.unitRate)}</td><td>${fmtMoney(c.lineTotal)}</td><td>${c.moqQty}</td><td>${fmtMoney(c.moqValue)}</td></tr>`; }).join('') || '<tr><td colspan="9"><div class="empty">No line items.</div></td></tr>'}
      </table></div>
      <div class="cards" style="margin-top:16px;">
        <div class="card"><div class="v">${items.length}</div><div class="l">Line Items</div></div>
        <div class="card"><div class="v">${fmtMoney(totVal)}</div><div class="l">Quotation Value (this revision)</div></div>
      </div>
      ${diff ? `
      <div class="section-total" style="margin-top:16px;"><h3>Comparison vs Rev-${prev.revNo}</h3></div>
      <div class="tw"><table class="insp">
        <tr><th>Field</th><th>Previous (Rev-${prev.revNo})</th><th>New (Rev-${revNo})</th></tr>
        ${diff.header.map(f=>`<tr><td>${esc(f.label)}</td><td class="rev-before">${esc(String(f.before))}</td><td class="rev-after">${esc(String(f.after))}</td></tr>`).join('')}
      </table></div>` : `<div class="hint" style="margin-top:10px;">This is the original quotation (Rev-0) — no prior revision to compare against.</div>`}
    </div>
  `;
}
// ---- Compare any two revisions side by side ----
function startCompareRevisions(quoteId){
  const q = DB.quotation.find(x=>x.id===quoteId); if(!q) return;
  ensureQuoteRevisions(q);
  quoteCompareState = {quoteId, revA: 0, revB: q.revNo};
  quoteHistoryId = null; render();
}
function closeCompare(){ const st=quoteCompareState; quoteCompareState=null; if(st) openQuoteHistory(st.quoteId); else render(); }
function setCompareRev(which, val){ if(quoteCompareState) quoteCompareState[which] = parseInt(val,10); render(); }
function renderCompareRevisions(main){
  const st = quoteCompareState;
  const q = DB.quotation.find(x=>x.id===st.quoteId);
  if(!q){ quoteCompareState=null; return renderQuotation(main.parentElement); }
  ensureQuoteRevisions(q);
  const revOpts = q.revisions.map(r=>`<option value="${r.revNo}">Rev-${r.revNo}${r.revNo===0?' (Original)':''}</option>`).join('');
  const revA = quoteRevisionAt(q, st.revA), revB = quoteRevisionAt(q, st.revB);
  const diff = diffQuoteSnapshots(revA.snapshot, revB.snapshot);
  main.innerHTML = `
    <div class="panel">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <h3 style="margin:0;">Compare Revisions — ${esc(q.quoteNo)}</h3>
        <button class="btn ghost small" onclick="closeCompare()">← Back to History</button>
      </div>
      <div class="frow g2" style="margin-top:12px;">
        <div><label class="fl">Revision A (baseline)</label><select onchange="setCompareRev('revA', this.value)">${revOpts.replace(`value="${st.revA}"`, `value="${st.revA}" selected`)}</select></div>
        <div><label class="fl">Revision B (compare to)</label><select onchange="setCompareRev('revB', this.value)">${revOpts.replace(`value="${st.revB}"`, `value="${st.revB}" selected`)}</select></div>
      </div>
      <div class="section-total" style="margin-top:16px;"><h3>Header-Level Comparison</h3></div>
      <div class="tw"><table class="insp">
        <tr><th>Field</th><th>Rev-${revA.revNo}</th><th>Rev-${revB.revNo}</th></tr>
        ${diff.header.map(f=>`<tr><td>${esc(f.label)}</td><td class="${f.changed?'rev-before':''}">${esc(String(f.before))}</td><td class="${f.changed?'rev-after':''}">${esc(String(f.after))}</td></tr>`).join('')}
      </table></div>
      <div class="section-total" style="margin-top:16px;"><h3>Line-Item Comparison</h3></div>
      <div class="tw"><table class="insp">
        <tr><th>Item</th><th>Field</th><th>Rev-${revA.revNo}</th><th>Rev-${revB.revNo}</th></tr>
        ${diff.items.map(i=>i.fields.map((f,fi)=>`<tr><td>${fi===0?'Item '+i.idx+' — '+esc(i.partNo):''}</td><td>${esc(f.label)}</td><td class="${f.changed?'rev-before':''}">${esc(String(f.before))}</td><td class="${f.changed?'rev-after':''}">${esc(String(f.after))}</td></tr>`).join('')).join('') || '<tr><td colspan="4"><div class="empty">No line items.</div></td></tr>'}
      </table></div>
    </div>
  `;
}
// ---- Cross-quotation searchable revision log (Requirement 15: filter by Customer,
// Quotation Number, Revision Number, Date Range, User) ----
function openQuoteHistorySearch(){ quoteHistorySearchOpen = true; render(); }
function closeQuoteHistorySearch(){ quoteHistorySearchOpen = false; render(); }
function updateQuoteHistoryFilter(field, val){ quoteHistoryFilters[field] = val; render(); }
function allQuoteRevisionRows(){
  const rows = [];
  DB.quotation.filter(x=>reportUnitMatch(x.unit)).forEach(q=>{
    ensureQuoteRevisions(q);
    q.revisions.forEach(r=>rows.push({q, r}));
  });
  return rows;
}
function renderQuoteHistorySearch(main){
  const f = quoteHistoryFilters;
  let rows = allQuoteRevisionRows();
  if(f.customer) rows = rows.filter(x=>(x.q.customer||'').toLowerCase().includes(f.customer.toLowerCase()));
  if(f.quoteNo) rows = rows.filter(x=>(x.q.quoteNo||'').toLowerCase().includes(f.quoteNo.toLowerCase()));
  if(f.revNo!=='' && f.revNo!==undefined && f.revNo!==null) rows = rows.filter(x=>String(x.r.revNo)===String(f.revNo));
  if(f.dateFrom) rows = rows.filter(x=>(x.r.dateTime||'').slice(0,10) >= f.dateFrom);
  if(f.dateTo) rows = rows.filter(x=>(x.r.dateTime||'').slice(0,10) <= f.dateTo);
  if(f.user) rows = rows.filter(x=>(x.r.by||'').toLowerCase().includes(f.user.toLowerCase()));
  rows.sort((a,b)=> (b.r.dateTime||'').localeCompare(a.r.dateTime||''));
  main.innerHTML = `
    <div class="panel">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <h3 style="margin:0;">All Quotation Revisions <span class="hint">${rows.length} of ${allQuoteRevisionRows().length} total</span></h3>
        <button class="btn ghost small" onclick="closeQuoteHistorySearch()">← Back</button>
      </div>
      <div class="frow g5" style="margin-top:12px;">
        <div><label class="fl">Customer</label><input value="${esc(f.customer)}" oninput="updateQuoteHistoryFilter('customer', this.value)" placeholder="Search customer"></div>
        <div><label class="fl">Quotation No</label><input value="${esc(f.quoteNo)}" oninput="updateQuoteHistoryFilter('quoteNo', this.value)" placeholder="e.g. QT-000125"></div>
        <div><label class="fl">Revision No</label><input value="${esc(f.revNo)}" oninput="updateQuoteHistoryFilter('revNo', this.value)" placeholder="e.g. 2"></div>
        <div><label class="fl">Date From</label><input type="date" value="${f.dateFrom}" onchange="updateQuoteHistoryFilter('dateFrom', this.value)"></div>
        <div><label class="fl">Date To</label><input type="date" value="${f.dateTo}" onchange="updateQuoteHistoryFilter('dateTo', this.value)"></div>
      </div>
      <div class="frow g2">
        <div><label class="fl">Revised By (User)</label><input value="${esc(f.user)}" oninput="updateQuoteHistoryFilter('user', this.value)" placeholder="Search user name"></div>
      </div>
      <div class="tw" style="margin-top:14px;"><table class="insp">
        <tr><th>Quote No</th><th>Rev</th><th>Date &amp; Time</th><th>Revised By</th><th>Reason</th><th>Customer</th><th>Value</th><th>Status</th><th></th></tr>
        ${rows.map(({q,r})=>`
          <tr>
            <td>${esc(q.quoteNo)}</td>
            <td><span class="pill rc-pill ${r.revNo===q.revNo?'done':'open'}">Rev-${r.revNo}</span></td>
            <td>${fmtDateTime(r.dateTime)}</td>
            <td>${esc(r.by)||'—'}</td>
            <td>${esc(r.reason)||'—'}</td>
            <td>${esc(custDispByName(q.customer))||'—'}</td>
            <td>${fmtMoney((r.snapshot.items||[]).reduce((a,it)=>a+calcQuoteItem(it).lineTotal,0))}</td>
            <td>${esc(r.snapshot.status)}</td>
            <td><button class="btn small ghost" onclick="closeQuoteHistorySearch(); viewQuoteRevision('${q.id}', ${r.revNo});">View</button></td>
          </tr>`).join('') || '<tr><td colspan="9"><div class="empty">No revisions match these filters.</div></td></tr>'}
      </table></div>
    </div>
  `;
}
