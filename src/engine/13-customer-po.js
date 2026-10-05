/* ---------------- CUSTOMER PO & PRODUCTION PLANNING ----------------
   The central link between Quotation → Purchase → Production → Sales: records the
   customer's own Purchase Order against a specific Quotation + Part, captures
   the ordered quantity, and lets production planning quantities be logged incrementally
   over time while continuously tracking the remaining balance (Ordered − Planned). */
function custPOSumPlans(plans){ return (plans||[]).reduce((a,p)=>a+(parseFloat(p.qty)||0),0); }
// Every existing Customer PO already on file for this Customer + Part No (this unit), most
// recent first — used both to warn the user in the entry form ("this part already has N PO(s)")
// and to group the list below by Part No so every PO No/Qty/Date raised against the same part
// is visible together instead of scattered across separate cards.
function existingCustPOsForPart(customerId, finPartNo, excludeId){
  if(!customerId || !(finPartNo||'').trim()) return [];
  const key = finPartNo.trim().toLowerCase();
  return DB.custPO.filter(x=>reportUnitMatch(x.unit) && x.customerId===customerId
    && (x.finPartNo||'').trim().toLowerCase()===key && x.id!==excludeId)
    .sort((a,b)=>(b.custPoDate||'').localeCompare(a.custPoDate||''));
}
function custPOExistingHintHtml(customerId, finPartNo, excludeId){
  const rows = existingCustPOsForPart(customerId, finPartNo, excludeId);
  if(!rows.length) return '';
  return `<div class="hint" style="display:block; margin-top:6px; padding:8px 10px; border:1px solid var(--amber-dim); border-left:3px solid var(--amber); border-radius:var(--r-sm); background:color-mix(in srgb, var(--amber) 8%, transparent);">
    ⚠ ${rows.length} existing PO(s) already on file for this Part — ${rows.map(r=>`<b>${esc(r.custPoNo)}</b> (Qty ${r.orderedQty||0}, ${fmtDate(r.custPoDate)||'—'}, ${esc(r.status)})`).join('; ')}.
    A different PO Number below will be added as a new entry for this Part — it will not overwrite these.
  </div>`;
}

// Customer Master list — same source and same value (customer.id) as the Quotation
// module's "Customer" dropdown, so both modules show identical names and stay in sync
// even before any quotation has been raised for that customer.
function custPOCustomerOptionsHtml(selectedCustomerId){
  if(!DB.customers.length) return '<option value="">— no customers in Customer Master —</option>';
  return '<option value="">— select customer —</option>' + DB.customers.map(c=>
    `<option value="${esc(c.id)}" ${selectedCustomerId===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
}
// Finished Part list scoped to the selected customer, pooled across ALL of that customer's
// quotations. Matches by customerId OR by a case-insensitive name match — the name match is
// not restricted to only quotations without a customerId, because duplicate/near-duplicate
// Customer Master records (same name typed twice, or a customer re-added later) can leave a
// quotation linked to a different customer.id than the one currently selected in this
// dropdown even though the visible name is identical; matching on name too keeps those
// parts visible instead of silently disappearing. Each option carries the owning quotation +
// price so selecting a part alone is enough to auto-fill Quotation Reference, Part Name and
// Price.
function custPOPartOptionsHtml(customerId, selectedKey){
  if(!customerId) return '<option value="">— select a Customer first —</option>';
  const cust = DB.customers.find(x=>x.id===customerId);
  const custKey = cust ? (cust.name||'').trim().toLowerCase() : '';
  const qs = DB.quotation.filter(x=>reportUnitMatch(x.unit) && (x.customerId===customerId || (custKey && (x.customer||'').trim().toLowerCase()===custKey)));
  const opts=[];
  qs.slice().reverse().forEach(q=>{
    (q.items||[]).forEach((it,idx)=>{
      if(!(it.partNo||'').trim()) return;
      const key = q.id+'::'+idx;
      const price = calcQuoteItem(it).unitRate;
      opts.push(`<option value="${key}" data-quoteid="${q.id}" data-quoteno="${esc(q.quoteNo)}" data-partno="${esc(it.partNo)}" data-partname="${esc(it.partName)}" data-price="${price.toFixed(2)}" ${key===selectedKey?'selected':''}>${esc(it.partNo)} — ${esc(it.partName)||'—'} (${esc(q.quoteNo)})</option>`);
    });
  });
  if(!opts.length) return '<option value="">— no quoted parts found for this customer —</option>';
  return '<option value="">— select part —</option>' + opts.join('');
}
// Customer changed → refresh Finished Part list to that customer's parts only, and clear
// everything downstream (Finished Part, Part Name, Quotation Reference, Price).
function onCustPOCustomerChange(){
  const sel = document.getElementById('cpCustomerSel');
  const partSel = document.getElementById('cpPartSel');
  if(partSel) partSel.innerHTML = custPOPartOptionsHtml(sel.value, '');
  const nameEl = document.getElementById('cpPartName'); if(nameEl) nameEl.value = '';
  const refEl = document.getElementById('cpQuoteRefDisp'); if(refEl) refEl.value = '';
  const priceEl = document.getElementById('cpPrice'); if(priceEl) priceEl.value = '';
  const hidEl = document.getElementById('cpQuotationId'); if(hidEl) hidEl.value = '';
  const idEl = document.getElementById('cpCustomerIdDisp');
  if(idEl){ const c = DB.customers.find(x=>x.id===sel.value); idEl.value = c ? (c.no||'') : ''; }
  const hintEl = document.getElementById('cpExistingHint'); if(hintEl) hintEl.innerHTML = '';
}
// Finished Part selected → auto-populate Part Name, Quotation Reference and Price together,
// so the customer only ever has to make ONE choice (the part) to pull in everything else.
// Also refreshes the "existing PO(s) for this part" warning box, so a new PO Number/Qty/Date
// for a part that already has open PO(s) is a deliberate, visible choice rather than a
// silent duplicate.
function onCustPOPartChange(){
  const partSel = document.getElementById('cpPartSel');
  const opt = partSel && partSel.selectedIndex>=0 ? partSel.options[partSel.selectedIndex] : null;
  const nameEl = document.getElementById('cpPartName'); if(nameEl) nameEl.value = opt ? (opt.dataset.partname||'') : '';
  const refEl = document.getElementById('cpQuoteRefDisp'); if(refEl) refEl.value = opt ? (opt.dataset.quoteno||'') : '';
  const priceEl = document.getElementById('cpPrice'); if(priceEl) priceEl.value = opt ? fmtMoney(parseFloat(opt.dataset.price)||0) : '';
  const hidEl = document.getElementById('cpQuotationId'); if(hidEl) hidEl.value = opt ? (opt.dataset.quoteid||'') : '';
  const hintEl = document.getElementById('cpExistingHint');
  if(hintEl){
    const custSel = document.getElementById('cpCustomerSel');
    const custId = custSel ? custSel.value : '';
    const finPartNo = opt ? (opt.dataset.partno||'') : '';
    hintEl.innerHTML = custPOExistingHintHtml(custId, finPartNo, editingCustPOId);
  }
}
function setCustPOSubTab(t){ custPOSubTab = t; custPOPrefill = null; render(); }
function renderCustPO(main){
  if(!subOK('custPO', custPOSubTab)) custPOSubTab = firstAllowedSub('custPO') || custPOSubTab;
  main.innerHTML = `
    <div class="topbar"><div></div></div>
    ${currentUnit!=='Admin' ? `<div class="panel" style="margin-top:12px; border-color:var(--amber);"><div class="empty">You're viewing Customer PO from ${esc(unitLabel())}. Switch the Active Unit to <b>Admin Office</b> to add, edit or change status — Customer PO entry is managed centrally from there.</div></div>` : ''}
    ${custPOFlowline()}
    <div class="subtabs" style="margin-top:12px;">
      ${subOK('custPO','salesPO')?`<button class="${custPOSubTab!=='labourPO'?'active':''}" onclick="setCustPOSubTab('salesPO')">Sales PO</button>`:''}
      ${subOK('custPO','labourPO')?`<button class="${custPOSubTab==='labourPO'?'active':''}" onclick="setCustPOSubTab('labourPO')">Job Work PO</button>`:''}
    </div>
    <div id="custPOSub"></div>
  `;
  const sub = document.getElementById('custPOSub');
  if(custPOSubTab==='labourPO') renderLabourPO(sub); else renderSalesPO(sub);
}
function renderSalesPO(main){
  let list = custPOFilteredList();
  const filterQuote = custPOQuoteFilterId ? DB.quotation.find(x=>x.id===custPOQuoteFilterId) : null;
  const editing = editingCustPOId ? DB.custPO.find(x=>x.id===editingCustPOId) : null;
  // Consume any pending prefill (set by "+ Add PO for this Part" on a grouped card below) —
  // it only preselects Customer + Part on THIS render, then clears so it doesn't stick around
  // and silently reappear the next time the form is opened for something else.
  const prefill = (!editing && custPOPrefill) ? custPOPrefill : null;
  custPOPrefill = null;
  const customerVal = editing ? editing.customerId : (prefill ? prefill.customerId : '');
  // Rebuild the selected part's key (quotationId::itemIndex) so an edit (or a prefill) reopens
  // with the same finished part already selected in the cascading dropdown.
  let selectedKey = '';
  if(editing && editing.quotationId){
    const q = DB.quotation.find(x=>x.id===editing.quotationId);
    if(q){ const idx=(q.items||[]).findIndex(it=>it.partNo===editing.finPartNo); if(idx>=0) selectedKey = editing.quotationId+'::'+idx; }
  } else if(prefill && prefill.quotationId){
    const q = DB.quotation.find(x=>x.id===prefill.quotationId);
    if(q){ const idx=(q.items||[]).findIndex(it=>it.partNo===prefill.finPartNo); if(idx>=0) selectedKey = prefill.quotationId+'::'+idx; }
  }
  const priceVal = editing ? fmtMoney(parseFloat(editing.price)||0) : '';
  const orderedQtyVal = editing ? (editing.orderedQty||0) : '';
  const existingHintPartNo = editing ? editing.finPartNo : (prefill ? prefill.finPartNo : '');
  main.innerHTML = `
    ${filterQuote ? `<div class="panel" style="margin-top:16px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
      <div>🔗 Showing Customer POs linked to Quotation <b>${esc(filterQuote.quoteNo)}</b> — ${esc(filterQuote.customer)||'—'}</div>
      <button class="btn ghost small" onclick="clearCustPOQuoteFilter()">✕ Clear Filter (show all)</button>
    </div>` : ''}
    <div class="panel" style="margin-top:12px;">
      <h3>${editing?'Edit Customer PO':'New Customer PO'} ${editing?`<span class="hint">${esc(editing.refNo)}</span>`:`<span class="hint">${nextSeqNo(DB.custPO,'refNo','cpp')}</span>`}</h3>
      ${prefill ? `<div class="hint" style="margin:2px 0 10px;">Adding a new PO for <b>${esc(prefill.finPartNo)}</b> — Customer and Part are pre-selected below; just fill in the new PO Number, Date and Quantity.</div>` : ''}

      <input type="hidden" id="cpQuotationId" value="${esc(editing?editing.quotationId:(prefill?prefill.quotationId:''))}">
      <div class="frow g4">
        <div><label class="fl">Customer Name <span class="hint" style="position:static; font-size:9.5px;">(type to search)</span></label>
          ${genericPickerHtml('cpCustomerDD','cpCustomerSel', DB.customers.map(c=>({value:c.id, label:c.name})), customerVal, '— select customer —', 'onCustPOCustomerChange()')}
        </div>
        <div><label class="fl">Customer ID <span class="hint" style="position:static; font-size:9.5px;">(auto, from Customer Master)</span></label>
          <input id="cpCustomerIdDisp" value="${esc((DB.customers.find(c=>c.id===customerVal)||{}).no||'')}" disabled></div>
        <div><label class="fl">Part Number <span class="hint" style="position:static; font-size:9.5px;">(filtered to this customer)</span></label>
          <select id="cpPartSel" onchange="onCustPOPartChange()">${custPOPartOptionsHtml(customerVal, selectedKey)}</select>
          <div id="cpExistingHint">${custPOExistingHintHtml(customerVal, existingHintPartNo, editingCustPOId)}</div>
        </div>
        <div><label class="fl">Part Name <span class="hint" style="position:static; font-size:9.5px;">(auto)</span></label>
          <input id="cpPartName" value="${editing?esc(editing.finPartName):(prefill?esc(prefill.finPartName):'')}" disabled></div>
      </div>
      <div class="frow g3">
        <div><label class="fl">Quotation Reference <span class="hint" style="position:static; font-size:9.5px;">(auto)</span></label>
          <input id="cpQuoteRefDisp" value="${editing?esc(editing.quoteNo):(prefill?esc(prefill.quoteNo):'')}" disabled></div>
        <div><label class="fl">Price <span class="hint" style="position:static; font-size:9.5px;">(auto, ₹/unit)</span></label>
          <input id="cpPrice" value="${priceVal||(prefill?fmtMoney(prefill.price||0):'')}" disabled></div>
        <div><label class="fl">Customer PO Number <span class="hint" style="position:static; font-size:9.5px; color:var(--amber-dim);">(new PO No for this part)</span></label>
          <input id="cpPoNo" placeholder="e.g. VPO-E000028/15" value="${editing?esc(editing.custPoNo):''}"></div>
      </div>
      <div class="frow g3">
        <div><label class="fl">Customer PO Date</label><input id="cpPoDate" type="date" value="${editing?editing.custPoDate:today()}"></div>
        <div><label class="fl">Customer Ordered Quantity <span class="hint" style="position:static; font-size:9.5px;">(PO Quantity)</span></label>
          <input id="cpOrderedQty" type="number" value="${orderedQtyVal}" oninput="refreshCustPOBalance()"></div>
        <div><label class="fl">Status</label>
          <select id="cpStatus"><option ${editing&&editing.status==='Open'?'selected':(!editing?'selected':'')}>Open</option><option ${editing&&editing.status==='Closed'?'selected':''}>Closed</option></select>
        </div>
      </div>

      <button class="btn amber" onclick="${editing?'saveEditCustPO()':'addCustPO()'}">${editing?'💾 Save Changes':'💾 Save Customer PO'}</button>
      ${editing?`<button class="btn ghost" onclick="cancelEditCustPO()">Cancel</button>`:''}
    </div>

    <div class="panel">
      <div class="section-total">
        <h3>Customer POs <span class="hint" id="custPOListCount">${list.length} total — grouped by Part No, so every PO raised against the same part stays together</span></h3>
        <input list="custPOPartSearchList" id="custPOPartFilterInp" value="${esc(custPOPartFilter)}" placeholder="🔍 Search / filter by Part Number" oninput="onCustPOPartFilterChange(this)" style="max-width:280px;">
        <datalist id="custPOPartSearchList">${custPOPartFilterOptionsHtml()}</datalist>
        <span id="custPOPartFilterClearWrap" style="display:${custPOPartFilter?'inline-flex':'none'};"><button class="btn ghost small" onclick="clearCustPOPartFilter()">✕ Clear</button></span>
      </div>
      <div id="custPOListBox">${custPOGroupedListHtml(list)}</div>
    </div>
  `;
}
// Every distinct Part No (with its Part Name) currently on file, this unit — feeds the
// datalist behind the Part Number search box so it also works as a quick picker, not just
// free-text search.
function custPOPartFilterOptionsHtml(){
  const seen = new Map();
  DB.custPO.filter(x=>reportUnitMatch(x.unit)).forEach(p=>{
    if(p.finPartNo && !seen.has(p.finPartNo)) seen.set(p.finPartNo, p.finPartName||'');
  });
  return Array.from(seen.entries()).map(([pn,name])=>`<option value="${esc(pn)}">${esc(name)}</option>`).join('');
}
// Filters the Customer PO list by Part No / Part Name as the user types. Updates only the list
// box + count (not the whole screen), so the search input never loses focus mid-keystroke.
function custPOFilteredList(){
  let list = DB.custPO.filter(x=>reportUnitMatch(x.unit));
  const filterQuote = custPOQuoteFilterId ? DB.quotation.find(x=>x.id===custPOQuoteFilterId) : null;
  if(filterQuote) list = list.filter(x=>x.quotationId===custPOQuoteFilterId);
  const partKey = custPOPartFilter.trim().toLowerCase();
  if(partKey) list = list.filter(x=>(x.finPartNo||'').toLowerCase().includes(partKey) || (x.finPartName||'').toLowerCase().includes(partKey));
  return list;
}
function renderCustPOListOnly(){
  const list = custPOFilteredList();
  const box = document.getElementById('custPOListBox'); if(box) box.innerHTML = custPOGroupedListHtml(list);
  const countEl = document.getElementById('custPOListCount'); if(countEl) countEl.textContent = `${list.length} total — grouped by Part No, so every PO raised against the same part stays together`;
  const clearWrap = document.getElementById('custPOPartFilterClearWrap'); if(clearWrap) clearWrap.style.display = custPOPartFilter ? 'inline-flex' : 'none';
}
function onCustPOPartFilterChange(inputEl){
  custPOPartFilter = inputEl.value;
  renderCustPOListOnly();
}
function clearCustPOPartFilter(){
  custPOPartFilter = '';
  const inp = document.getElementById('custPOPartFilterInp'); if(inp) inp.value = '';
  renderCustPOListOnly();
}
// Groups the flat DB.custPO list by Customer + Part No, so every Customer PO Number/Qty/Date
// ever raised against the same part shows together under one heading instead of scattered
// across separate, unrelated-looking cards. Each PO underneath is still its own independent
// record — Sales Plan commitments, Sales Invoice links and balance calculations all keep
// working exactly as before; this is purely how the list is presented.
function custPOGroupedListHtml(list){
  if(!list.length) return '<div class="empty">No Customer POs for this unit yet.</div>';
  const groups = new Map(); // key -> {customer, finPartNo, finPartName, rows:[]}
  list.forEach(p=>{
    const key = (p.customerId||p.customer||'')+'::'+(p.finPartNo||'').trim().toLowerCase();
    if(!groups.has(key)) groups.set(key, {customerId:p.customerId, customer:p.customer, finPartNo:p.finPartNo, finPartName:p.finPartName, rows:[]});
    groups.get(key).rows.push(p);
  });
  const groupList = Array.from(groups.values());
  groupList.forEach(g=>g.rows.sort((a,b)=>(b.custPoDate||'').localeCompare(a.custPoDate||'')));
  // Most-recently-touched part group first (by its newest PO date), matching the old
  // most-recent-first ordering of the flat list.
  groupList.sort((a,b)=>(b.rows[0].custPoDate||'').localeCompare(a.rows[0].custPoDate||''));
  return `<div class="grid-box" style="grid-template-columns:repeat(auto-fill,minmax(360px,1fr));">
    ${groupList.map(g=>{
      const totOrdered = g.rows.reduce((a,p)=>a+(p.orderedQty||0),0);
      return `
      <div class="rec-card" style="text-align:left;">
        <div class="rc-title">${esc(g.finPartNo)||'—'} <span class="hint">${esc(g.finPartName)||''}</span></div>
        <div class="rc-sub">${esc(custDispByName(g.customer))||'—'} · ${g.rows.length} PO(s) on file for this Part · Total Ordered ${totOrdered}</div>
        <div style="margin-top:8px; border-top:1px dashed var(--line); padding-top:8px;">
          ${g.rows.map(p=>{
            const planned = custPOSumPlans(p.plans);
            const balance = (p.orderedQty||0) - planned;
            return `
            <div style="padding:8px 0; border-bottom:1px dashed var(--line);">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div><b>${esc(p.custPoNo)}</b> <span class="hint">${esc(p.refNo)}</span></div>
                <span class="pill rc-pill ${p.status==='Open'?'open':'done'}">${esc(p.status)}</span>
              </div>
              <div class="rc-row"><span class="k">PO Date</span><span class="v">${fmtDate(p.custPoDate)||'—'}</span></div>
              <div class="rc-row"><span class="k">Ordered Qty</span><span class="v">${p.orderedQty||0}</span></div>
              <div class="rc-row"><span class="k">Planned Qty</span><span class="v">${planned} <span class="hint">(see Production Planning)</span></span></div>
              <div class="rc-row"><span class="k">Balance Qty</span><span class="v" style="${balance<0?'color:#b23b3b; font-weight:700;':''}">${balance}</span></div>
              <div class="rc-row"><span class="k">Quotation Ref</span><span class="v">${esc(p.quoteNo)||'—'}</span></div>
              <div class="rc-row"><span class="k">Price</span><span class="v">${fmtMoney(p.price||0)}</span></div>
              <div class="rc-actions">
                <button class="btn small ghost" onclick="editCustPO('${p.id}')">Edit</button>
                <button class="btn small ghost" onclick="toggleCustPOStatus('${p.id}')">Toggle</button>
                ${p.quotationId?`<button class="btn small ghost" onclick="viewQuotationFromCustPO('${p.quotationId}')">🔗 View Quotation</button>`:''}
                <button class="btn danger" onclick="deleteRow('custPO','${p.id}')">Del</button>
              </div>
            </div>`;
          }).join('')}
        </div>
        ${currentUnit==='Admin' ? `<button class="btn ghost small" style="margin-top:8px; width:100%;" onclick="quickAddCustPOForPart('${esc(g.customerId||'')}','${esc(g.finPartNo||'').replace(/'/g,"\\'")}')">➕ Add PO for this Part <span class="hint" style="position:static;">(new PO No / Qty / Date)</span></button>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}
// "+ Add PO for this Part" on a grouped card — sets the prefill state read by renderSalesPO
// on its next render, then jumps back into add mode (not edit) with Customer + Part already
// selected, so the only thing left to type is the new PO Number, Date and Quantity.
function quickAddCustPOForPart(customerId, finPartNo){
  if(!requireAdminOffice()) return;
  const sample = DB.custPO.find(x=>reportUnitMatch(x.unit) && x.customerId===customerId
    && (x.finPartNo||'').trim().toLowerCase()===(finPartNo||'').trim().toLowerCase());
  custPOPrefill = {
    customerId, finPartNo,
    finPartName: sample?sample.finPartName:'', quotationId: sample?sample.quotationId:'',
    quoteNo: sample?sample.quoteNo:'', price: sample?sample.price:0
  };
  editingCustPOId = null;
  render();
  setTimeout(()=>{ const el = document.getElementById('cpPoNo'); if(el){ el.scrollIntoView({behavior:'smooth', block:'center'}); el.focus(); } }, 30);
}
// Pulls customerId/customerName from the Customer select, and quotationId / finPartNo /
// finPartName / price straight off the selected Finished Part option's dataset — the
// single choice that drives every auto-filled field.
function custPOReadPartSelection(){
  const custSel = document.getElementById('cpCustomerSel');
  const customerId = custSel ? custSel.value : '';
  const customer = customerId ? ((DB.customers.find(c=>c.id===customerId)||{}).name||'') : '';
  const partSel = document.getElementById('cpPartSel');
  const opt = partSel && partSel.selectedIndex>=0 ? partSel.options[partSel.selectedIndex] : null;
  return {
    customerId, customer,
    quotationId: opt ? (opt.dataset.quoteid||'') : '',
    quoteNo: opt ? (opt.dataset.quoteno||'') : '',
    finPartNo: opt ? (opt.dataset.partno||'') : '',
    finPartName: opt ? (opt.dataset.partname||'') : '',
    price: opt ? (parseFloat(opt.dataset.price)||0) : 0
  };
}
function addCustPO(){
  if(!requireAdminOffice()) return;
  if(!requireWorkingUnit()) return;
  const sel = custPOReadPartSelection();
  const custPoNo = document.getElementById('cpPoNo').value.trim();
  if(!sel.customerId){ toast('Select a Customer'); return; }
  if(!sel.finPartNo){ toast('Select the Part Number'); return; }
  if(!custPoNo){ toast('Enter the Customer PO Number'); return; }
  const rec = {
    id:'cpp'+Date.now(), unit:currentUnit,
    refNo: nextSeqNo(DB.custPO,'refNo','cpp'),
    custPoNo, custPoDate: document.getElementById('cpPoDate').value,
    quotationId: sel.quotationId, quoteNo: sel.quoteNo,
    customerId: sel.customerId, customer: sel.customer,
    finPartNo: sel.finPartNo, finPartName: sel.finPartName, price: sel.price,
    orderedQty: parseFloat(document.getElementById('cpOrderedQty').value)||0,
    status: document.getElementById('cpStatus').value,
    plans: []
  };
  DB.custPO.push(rec);
  saveDB(); toast('Customer PO saved — enter Commitment Qty in Planning → Sales Plan'); render();
}
function editCustPO(id){
  editingCustPOId = id;
  custPOPrefill = null;
  render();
}
function cancelEditCustPO(){ editingCustPOId=null; render(); }
function saveEditCustPO(){
  if(!requireAdminOffice()) return;
  const rec = DB.custPO.find(x=>x.id===editingCustPOId);
  if(!rec) return;
  const sel = custPOReadPartSelection();
  const custPoNo = document.getElementById('cpPoNo').value.trim();
  if(!sel.customerId){ toast('Select a Customer'); return; }
  if(!sel.finPartNo){ toast('Select the Part Number'); return; }
  if(!custPoNo){ toast('Enter the Customer PO Number'); return; }
  Object.assign(rec, {
    custPoNo, custPoDate: document.getElementById('cpPoDate').value,
    quotationId: sel.quotationId, quoteNo: sel.quoteNo,
    customerId: sel.customerId, customer: sel.customer,
    finPartNo: sel.finPartNo, finPartName: sel.finPartName, price: sel.price,
    orderedQty: parseFloat(document.getElementById('cpOrderedQty').value)||0,
    status: document.getElementById('cpStatus').value
  });
  editingCustPOId=null;
  saveDB(); toast('Customer PO updated'); render();
}
function toggleCustPOStatus(id){
  if(!requireAdminOffice()) return;
  const rec = DB.custPO.find(x=>x.id===id);
  if(!rec) return;
  rec.status = rec.status==='Open' ? 'Closed' : 'Open';
  saveDB(); render();
}

/* ---------------- LABOUR PO (submodule of Customer PO) ----------------
   Full workflow: Customer → Job Work Quotation → Open PO → Monthly Schedule → Commitment Plan
   → Multiple Dispatches → Invoice.
   - Open PO header is raised ONCE against a Part quoted in an APPROVED Job Work
     Quotation for that customer; Part Name, Job Work Quotation Reference and Job Work Rate all
     auto-fill from that quotation — no manual price entry.
   - Any number of Monthly Schedules can be logged against the same Open PO over time.
   - Each Monthly Schedule has its own Commitment Plan: any number of dated delivery
     commitments whose quantities must add up to the schedule's Scheduled Quantity.
   - Each Commitment can carry multiple Dispatches; Scheduled / Committed / Dispatched /
     Balance / Pending quantities are all calculated automatically at every level. */
function labourPOCustomerOptionsHtml(selectedCustomerId){ return custPOCustomerOptionsHtml(selectedCustomerId); }
// Finished Part list scoped to the selected customer, pooled from that customer's APPROVED
// Job Work Quotations only (Job Work Rate must always come from an approved quotation — never
// typed manually). Matches by customerId OR case-insensitive name, same robustness as the
// Sales PO side, so duplicate Customer Master records don't hide valid parts.
// kept for reference/back-compat with any external caller; the live form now uses the
// searchable labourPOPartPickerHtml() below instead of a plain <select>.
function labourPOPartOptionsHtml(customerId, selectedKey){
  if(!customerId) return '<option value="">— select a Customer first —</option>';
  const cust = DB.customers.find(x=>x.id===customerId);
  const custKey = cust ? (cust.name||'').trim().toLowerCase() : '';
  const mappedParts = new Set(DB.labourMapping.filter(m=>m.customerId===customerId).map(m=>(m.finPartNo||'').trim().toLowerCase()));
  if(!mappedParts.size) return '<option value="">— no Job Work Mapping found for this customer (Product Development → Job Work Mapping) —</option>';
  const qs = DB.labourQuotation.filter(x=>reportUnitMatch(x.unit) && x.status==='Accepted' &&
    (x.customerId===customerId || (custKey && (x.customer||'').trim().toLowerCase()===custKey)));
  const opts=[];
  qs.slice().reverse().forEach(q=>{
    (q.items||[]).forEach((it,idx)=>{
      const pn = (it.partNo||'').trim();
      if(!pn || !mappedParts.has(pn.toLowerCase())) return;
      const key = q.id+'::'+idx;
      const rate = calcLabourItem(it, q.cncRate, q.vmcRate, q.profitPct).total;
      opts.push(`<option value="${key}" data-quoteid="${q.id}" data-quoteno="${esc(q.quoteNo)}" data-partno="${esc(it.partNo)}" data-partname="${esc(it.partName)}" data-price="${rate.toFixed(2)}" ${key===selectedKey?'selected':''}>${esc(it.partNo)} — ${esc(it.partName)||'—'} (${esc(q.quoteNo)})</option>`);
    });
  });
  if(!opts.length) return '<option value="">— no approved Job Work Quotation rate found for this customer\u2019s mapped parts —</option>';
  return '<option value="">— select part —</option>' + opts.join('');
}
// Candidate list for the searchable Part Number picker below: every (approved-quotation +
// Job-Work-Mapping-gated) Finished Part, keyed "<labourQuoteId>::<itemIndex>" exactly like
// labourPOPartOptionsHtml() above so the same key can be resolved back via
// labourPOResolvePartByKey(). When customerId is given, scoped to just that customer (used once
// a Customer has already been picked); when omitted/blank, scans EVERY customer that has a Job
// Work Mapping + an approved Job Work Quotation — this is what powers "type the Part Number
// only, no need to pick a Customer first".
function labourPOPartSearchOptions(customerId){
  const opts = [];
  const scanCustomers = customerId ? DB.customers.filter(c=>c.id===customerId) : DB.customers;
  scanCustomers.forEach(cust=>{
    const mappedParts = new Set(DB.labourMapping.filter(m=>m.customerId===cust.id).map(m=>(m.finPartNo||'').trim().toLowerCase()));
    if(!mappedParts.size) return;
    const custKey = (cust.name||'').trim().toLowerCase();
    const qs = DB.labourQuotation.filter(x=>reportUnitMatch(x.unit) && x.status==='Accepted' &&
      (x.customerId===cust.id || (custKey && (x.customer||'').trim().toLowerCase()===custKey)));
    qs.slice().reverse().forEach(q=>{
      (q.items||[]).forEach((it,idx)=>{
        const pn = (it.partNo||'').trim();
        if(!pn || !mappedParts.has(pn.toLowerCase())) return;
        opts.push({ value:q.id+'::'+idx, partNo:pn, partName:it.partName||'', customerId:cust.id, customerName:cust.name||'', quoteNo:q.quoteNo });
      });
    });
  });
  return opts;
}
// Resolves a picker key ("<labourQuoteId>::<itemIndex>") back into the full Part record
// (Part No / Name / Job Work Quotation Ref / Rate / Customer) — the single source of truth
// both the Part picker and the Customer auto-fill read from, so the two can never drift apart.
function labourPOResolvePartByKey(key){
  if(!key) return null;
  const sep = key.lastIndexOf('::');
  if(sep<0) return null;
  const quoteId = key.slice(0,sep);
  const itemIdx = parseInt(key.slice(sep+2),10);
  const q = DB.labourQuotation.find(x=>x.id===quoteId);
  if(!q || !q.items || !q.items[itemIdx]) return null;
  const it = q.items[itemIdx];
  let cust = DB.customers.find(c=>c.id===q.customerId);
  if(!cust){ const ck=(q.customer||'').trim().toLowerCase(); cust = DB.customers.find(c=>(c.name||'').trim().toLowerCase()===ck); }
  return {
    quoteId: q.id, quoteNo: q.quoteNo, partNo: it.partNo||'', partName: it.partName||'',
    price: calcLabourItem(it, q.cncRate, q.vmcRate, q.profitPct).total,
    customerId: cust ? cust.id : (q.customerId||''), customerName: cust ? cust.name : (q.customer||'')
  };
}
// Searchable Part Number picker for the Job Work PO form — same "type to search" widget used
// for Customer Name elsewhere, but here the search is driven by Part Number (Part Name is also
// matched, as a convenience, but typing the Part Number alone is always enough — no Customer,
// PO, or any other field needs to be filled in first). When customerId is blank it searches
// across every customer's approved Job Work Quotation parts at once.
function labourPOPartPickerHtml(ddId, hiddenId, customerId, selectedKey, onChangeCall){
  const opts = labourPOPartSearchOptions(customerId);
  const placeholder = 'Select Part Number';
  const labelFor = o => `${o.partNo}${customerId?'':' · '+(o.customerName||'—')}`;
  const current = opts.find(o=>o.value===selectedKey);
  const label = current ? labelFor(current) : placeholder;
  const rows = opts.map(o=>{
    const lbl = labelFor(o);
    const hay = (o.partNo+' '+(o.partName||'')+(customerId?'':' '+(o.customerName||''))).toLowerCase();
    return `<div class="srch-dd-item${o.value===selectedKey?' selected':''}" data-search="${esc(hay)}" onclick="selectSrchDDValue('${ddId}','${hiddenId}','${esc(o.value)}','${esc(lbl)}'); ${onChangeCall}">${esc(lbl)}</div>`;
  }).join('');
  return `
  <div class="srch-dd" id="${ddId}">
    <input type="hidden" id="${hiddenId}" value="${esc(selectedKey||'')}">
    <div class="srch-dd-display${current?'':' placeholder'}" onclick="toggleSrchDD('${ddId}')">
      <span>${esc(label)}</span><span class="srch-dd-arrow">▾</span>
    </div>
    <div class="srch-dd-panel" style="display:none;">
      <input type="text" class="srch-dd-search" placeholder="Type Part Number…" oninput="filterSrchDD('${ddId}', this.value)">
      <div class="srch-dd-list">${rows}<div class="srch-dd-empty">${opts.length?'No matching Part Number':'No approved Job Work Quotation parts found'+(customerId?' for this customer':'')}</div></div>
    </div>
  </div>`;
}
// Sets a searchable picker's hidden value + visible label directly (no dependency on a live
// click "event", unlike selectSrchDDValue) — used when one picker's selection needs to
// programmatically drive another picker's value, e.g. picking a Part auto-fills its Customer.
function setPickerValue(ddId, hiddenId, value, label){
  const hidden = document.getElementById(hiddenId); if(hidden) hidden.value = value;
  const dd = document.getElementById(ddId);
  if(dd){
    const dispWrap = dd.querySelector('.srch-dd-display');
    const dispText = dd.querySelector('.srch-dd-display span:first-child');
    if(dispText) dispText.textContent = label;
    if(dispWrap) dispWrap.classList.toggle('placeholder', value==='');
  }
}
function onLabourPOCustomerChange(){
  const sel = document.getElementById('lpCustomerSel');
  const customerId = sel ? sel.value : '';
  // Narrows the Part picker to this customer's parts (still fully searchable) — but the picker
  // remains usable with NO customer chosen at all, since it defaults to a global search.
  const partWrap = document.getElementById('lpPartDD');
  if(partWrap) partWrap.outerHTML = labourPOPartPickerHtml('lpPartDD','lpPartSel', customerId, '', 'onLabourPOPartPick()');
  const nameEl = document.getElementById('lpPartName'); if(nameEl) nameEl.value = '';
  const refEl = document.getElementById('lpQuoteRefDisp'); if(refEl) refEl.value = '';
  const priceEl = document.getElementById('lpPrice'); if(priceEl) priceEl.value = '';
  const hidEl = document.getElementById('lpLabourQuoteId'); if(hidEl) hidEl.value = '';
  const idEl = document.getElementById('lpCustomerIdDisp');
  if(idEl){ const c = DB.customers.find(x=>x.id===customerId); idEl.value = c ? (c.no||'') : ''; }
}
// Fires when a Part is picked from the searchable Part Number picker (whether or not a
// Customer had already been chosen). Fills Part Name / Job Work Quotation Ref / Rate as before,
// and — since the Part uniquely determines its Customer — also auto-fills the Customer field
// and Customer ID tag, so typing a Part Number alone is genuinely enough to complete the header.
function onLabourPOPartPick(){
  const hidden = document.getElementById('lpPartSel');
  const info = labourPOResolvePartByKey(hidden ? hidden.value : '');
  const nameEl = document.getElementById('lpPartName'); if(nameEl) nameEl.value = info ? info.partName : '';
  const refEl = document.getElementById('lpQuoteRefDisp'); if(refEl) refEl.value = info ? info.quoteNo : '';
  const priceEl = document.getElementById('lpPrice'); if(priceEl) priceEl.value = info ? fmtMoney(info.price||0) : '';
  const hidEl = document.getElementById('lpLabourQuoteId'); if(hidEl) hidEl.value = info ? info.quoteId : '';
  if(info && info.customerId){
    setPickerValue('lpCustomerDD','lpCustomerSel', info.customerId, info.customerName||'—');
    const idEl = document.getElementById('lpCustomerIdDisp');
    if(idEl){ const c = DB.customers.find(x=>x.id===info.customerId); idEl.value = c ? (c.no||'') : ''; }
  }
}
// Reads the Job Work PO entry form — one Customer + one Part per PO. PO Quantity is no longer
// captured here (removed per redesign); Monthly Customer Schedule, Commitment, Balance & Pending
// Qty continue to be managed entirely in Planning → Job Work Plan, same as before.
function labourPOReadPartSelection(){
  const custSel = document.getElementById('lpCustomerSel');
  const customerId = custSel ? custSel.value : '';
  const customer = customerId ? ((DB.customers.find(c=>c.id===customerId)||{}).name||'') : '';
  const partHidden = document.getElementById('lpPartSel');
  const info = labourPOResolvePartByKey(partHidden ? partHidden.value : '');
  return {
    customerId, customer,
    labourQuoteId: info ? info.quoteId : '',
    labourQuoteNo: info ? info.quoteNo : '',
    finPartNo: info ? info.partNo : '',
    finPartName: info ? info.partName : '',
    price: info ? info.price : 0
  };
}
// Saves a brand-new Job Work PO — one Customer + Part per PO, Rate always auto-filled from the
// selected approved Job Work Quotation (mandatory), Customer PO Number optional (can be filled
// in later from Stores → Job Work Stock → Customer Material Inward once the customer provides it).
function addLabourPO(){
  if(!requireAdminOffice()) return;
  const sel = labourPOReadPartSelection();
  const poNo = (document.getElementById('lpPoNo').value||'').trim();
  if(!sel.customerId){ toast('Select a Customer'); return; }
  if(!sel.finPartNo){ toast('Select the Part Number (from an approved Job Work Quotation)'); return; }
  if(!sel.labourQuoteId || !(parseFloat(sel.price)>0)){ toast('This Part has no Rate on file — select a Part linked to an approved Job Work Quotation'); return; }
  const poDate = document.getElementById('lpPoDate').value;
  const resolvedUnit = resolveLabourUnit(sel.customerId, sel.finPartNo);
  const rec = {
    id:'lpo'+Date.now()+Math.random().toString(36).slice(2,7), unit:resolvedUnit,
    refNo: nextSeqNo(DB.labourPO,'refNo','lpo'),
    poNo, poDate,
    labourQuoteId: sel.labourQuoteId, labourQuoteNo: sel.labourQuoteNo,
    customerId: sel.customerId, customer: sel.customer,
    finPartNo: sel.finPartNo, finPartName: sel.finPartName, price: sel.price,
    orderedQty: 0,
    status: 'Open',
    scheduleQtyEntries: [], commitments: []
  };
  DB.labourPO.push(rec);
  saveDB();
  toast(resolvedUnit==='Admin'
    ? 'Job Work PO saved — no Production Location mapped yet for this part, add one in Product Development → Job Work Mapping'
    : 'Job Work PO saved — enter this month\'s Customer Schedule in Planning → Job Work Plan');
  render();
}
function editLabourPO(id){ editingLabourPOId = id; render(); }
function cancelEditLabourPO(){ editingLabourPOId=null; render(); }
function saveEditLabourPO(){
  if(!requireAdminOffice()) return;
  const rec = DB.labourPO.find(x=>x.id===editingLabourPOId);
  if(!rec) return;
  const sel = labourPOReadPartSelection();
  const poNo = (document.getElementById('lpPoNo').value||'').trim();
  if(!sel.customerId){ toast('Select a Customer'); return; }
  if(!sel.finPartNo){ toast('Select the Part Number (from an approved Job Work Quotation)'); return; }
  if(!sel.labourQuoteId || !(parseFloat(sel.price)>0)){ toast('This Part has no Rate on file — select a Part linked to an approved Job Work Quotation'); return; }
  Object.assign(rec, {
    unit: resolveLabourUnit(sel.customerId, sel.finPartNo),
    poNo, poDate: document.getElementById('lpPoDate').value,
    labourQuoteId: sel.labourQuoteId, labourQuoteNo: sel.labourQuoteNo,
    customerId: sel.customerId, customer: sel.customer,
    finPartNo: sel.finPartNo, finPartName: sel.finPartName, price: sel.price,
    status: document.getElementById('lpStatus').value
  });
  editingLabourPOId=null;
  saveDB(); toast('Job Work PO updated'); render();
}
function toggleLabourPOStatus(id){
  if(!requireAdminOffice()) return;
  const rec = DB.labourPO.find(x=>x.id===id);
  if(!rec) return;
  rec.status = rec.status==='Open' ? 'Closed' : 'Open';
  saveDB(); render();
}
// Jumps from a Job Work PO record to its source Job Work Quotation (View mode), inside the
// Quotation module's "Job Work Quotation" tab.
function viewLabourQuoteFromLabourPO(labourQuoteId){
  if(!labourQuoteId) return;
  previousPage = currentPage;
  currentPage = 'quotation'; reportModuleOpen = null; quotationSubTab = 'labour';
  viewLabourQuote(labourQuoteId);
}

/* ---- Monthly Schedule + Commitment Plan (per Open PO) ----
   Dispatch quantities are NOT a separate transaction — raising a Job Work Invoice (Sales →
   Job Work Invoice) against a commitment IS the dispatch record. "Dispatched Qty" below is
   simply the total already invoiced against the whole Job Work PO. */
// Total already-invoiced Qty against a Job Work PO — Job Work Invoice links only to the PO
// itself (not a specific schedule/commitment), so this sums every Job Work Invoice line raised
// against it.
function labourPOInvoicedQty(po){ return DB.sales.filter(s=>s.invKind==='labour' && s.labourPOId===po.id).reduce((a,s)=>a+(parseFloat(s.qty)||0),0); }
// Customer Schedule Quantity — customers may send multiple schedules against the same Open
// PO over time, so this is the running total of every Schedule Qty entry logged for the part.
function labourScheduleQtyTotal(rec){ return (rec.scheduleQtyEntries||[]).reduce((a,s)=>a+(parseFloat(s.qty)||0),0); }
// Committed Qty — the running total of every dated Commitment entry logged for the part
// (multiple deliveries against the same Finished Part Number, on different dates).
function labourCommittedQtyTotal(rec){ return (rec.commitments||[]).reduce((a,c)=>a+(parseFloat(c.qty)||0),0); }
function labourPOTotals(rec){
  const scheduled = labourScheduleQtyTotal(rec);
  const committed = labourCommittedQtyTotal(rec);
  const dispatched = labourPOInvoicedQty(rec);
  return {scheduled, committed, dispatched, pending: scheduled-dispatched};
}

/* ---- Monthly scoping for the Job Work Plan screen (redesign) ----
   The Planning screen must always start a brand-new month with Customer Schedule Qty = 0 and
   wait for the planner to manually enter it — nothing carries forward from the previous month.
   Rather than change the underlying data model (each Schedule Qty / Commitment entry already
   carries its own .date), we simply scope every total and every list shown on the live Planning
   screen to the CURRENT calendar month. Older entries are never deleted — they just stop being
   counted or shown on the Planning screen and become historical data, visible only through the
   separate Planning Performance Report. */
function currentMonthKey(){ return today().slice(0,7); } // 'YYYY-MM'
function monthKeyOf(dateStr){ return (dateStr||'').slice(0,7); }
function monthKeyLabel(mk){
  if(!mk) return '—';
  const [y,m] = mk.split('-').map(Number);
  if(!y||!m) return mk;
  return new Date(y, m-1, 1).toLocaleDateString('en-IN', {month:'long', year:'numeric'});
}
// Every distinct month present anywhere in a Job Work PO's schedule/commitment/dispatch history,
// most-recent-first — used to build the Planning Performance Report.
function labourPOAllMonthKeys(rec){
  const set = new Set();
  (rec.scheduleQtyEntries||[]).forEach(s=>{ const mk=monthKeyOf(s.date); if(mk) set.add(mk); });
  (rec.commitments||[]).forEach(c=>{ const mk=monthKeyOf(c.date); if(mk) set.add(mk); });
  DB.sales.filter(s=>s.invKind==='labour' && s.labourPOId===rec.id).forEach(s=>{ const mk=monthKeyOf(s.invDate); if(mk) set.add(mk); });
  return Array.from(set).sort().reverse();
}
function labourScheduleQtyTotalForMonth(rec, mk){ return (rec.scheduleQtyEntries||[]).filter(s=>monthKeyOf(s.date)===mk).reduce((a,s)=>a+(parseFloat(s.qty)||0),0); }
function labourCommittedQtyTotalForMonth(rec, mk){ return (rec.commitments||[]).filter(c=>monthKeyOf(c.date)===mk).reduce((a,c)=>a+(parseFloat(c.qty)||0),0); }
function labourPOInvoicedQtyForMonth(rec, mk){ return DB.sales.filter(s=>s.invKind==='labour' && s.labourPOId===rec.id && monthKeyOf(s.invDate)===mk).reduce((a,s)=>a+(parseFloat(s.qty)||0),0); }
// Delivered qty against a given month's commitments is capped at what that month actually
// scheduled+committed, so a late dispatch invoiced into a later month still reads sensibly.
function labourPOMonthTotals(rec, mk){
  const scheduled = labourScheduleQtyTotalForMonth(rec, mk);
  const committed = labourCommittedQtyTotalForMonth(rec, mk);
  const dispatched = labourPOInvoicedQtyForMonth(rec, mk);
  return {scheduled, committed, dispatched, balance: scheduled-committed, pending: scheduled-dispatched};
}
function renderLabourPO(main){
  const list = labourPOFilteredList();
  const editing = editingLabourPOId ? DB.labourPO.find(x=>x.id===editingLabourPOId) : null;
  const customerVal = editing ? editing.customerId : '';
  let selectedKey = '';
  if(editing && editing.labourQuoteId){
    const q = DB.labourQuotation.find(x=>x.id===editing.labourQuoteId);
    if(q){ const idx=(q.items||[]).findIndex(it=>it.partNo===editing.finPartNo); if(idx>=0) selectedKey = editing.labourQuoteId+'::'+idx; }
  }
  const priceVal = editing ? fmtMoney(parseFloat(editing.price)||0) : '';
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <h3>${editing?'Edit Job Work PO':'New Job Work PO'} ${editing?`<span class="hint">${esc(editing.refNo)}</span>`:`<span class="hint">${nextSeqNo(DB.labourPO,'refNo','lpo')}</span>`}</h3>
      <div class="hint" style="position:static; display:block; margin:0 0 10px; font-size:10.5px;">One Job Work PO per Customer + Part. Customer PO Number is optional here — enter it now if the customer has already provided it, or leave it blank and add it later from Stores → Job Work Stock → Customer Material Inward (DC Receipt). Monthly Customer Schedule, Commitment, Balance &amp; Pending Qty are managed separately in Planning → Job Work Plan.</div>
      <input type="hidden" id="lpLabourQuoteId" value="${esc(editing?editing.labourQuoteId:'')}">
      <div class="frow g4">
        <div><label class="fl">Customer Name <span class="hint" style="position:static; font-size:9.5px;">(type to search)</span></label>
          ${genericPickerHtml('lpCustomerDD','lpCustomerSel', DB.customers.map(c=>({value:c.id, label:c.name})), customerVal, '— select customer —', 'onLabourPOCustomerChange()')}
        </div>
        <div><label class="fl">Customer ID <span class="hint" style="position:static; font-size:9.5px;">(auto, from Customer Master)</span></label>
          <input id="lpCustomerIdDisp" value="${esc((DB.customers.find(c=>c.id===customerVal)||{}).no||'')}" disabled></div>
        <div><label class="fl">Part Number <span class="hint" style="position:static; font-size:9.5px;">(type to search &amp; select a Part to raise this PO for — no need to pick Customer first)</span></label>
          ${labourPOPartPickerHtml('lpPartDD','lpPartSel', customerVal, selectedKey, 'onLabourPOPartPick()')}
        </div>
        <div><label class="fl">Part Name <span class="hint" style="position:static; font-size:9.5px;">(auto)</span></label>
          <input id="lpPartName" value="${editing?esc(editing.finPartName):''}" disabled></div>
      </div>
      <div class="frow g4" style="margin-top:10px;">
        <div><label class="fl">Customer PO Number <span class="hint" style="position:static; font-size:9.5px;">(optional)</span></label>
          <input id="lpPoNo" placeholder="if already available" value="${editing?esc(editing.poNo):''}"></div>
        <div><label class="fl">PO Date</label><input id="lpPoDate" type="date" value="${editing?editing.poDate:today()}"></div>
        <div><label class="fl">Quotation Reference <span class="hint" style="position:static; font-size:9.5px;">(auto)</span></label>
          <input id="lpQuoteRefDisp" value="${editing?esc(editing.labourQuoteNo):''}" disabled></div>
        <div><label class="fl">Rate <span class="hint" style="position:static; font-size:9.5px; color:var(--amber-dim);">(auto, ₹/unit — mandatory)</span></label>
          <input id="lpPrice" value="${priceVal}" disabled></div>
      </div>
      ${editing?`<div class="frow g4" style="margin-top:10px;">
        <div><label class="fl">Status</label>
          <select id="lpStatus"><option ${editing.status==='Open'?'selected':''}>Open</option><option ${editing.status==='Closed'?'selected':''}>Closed</option></select>
        </div>
      </div>`:''}

      <div style="margin-top:12px; display:flex; gap:8px;">
        <button class="btn amber" onclick="${editing?'saveEditLabourPO()':'addLabourPO()'}">${editing?'💾 Save Changes':'💾 Save Job Work PO'}</button>
        ${editing?`<button class="btn ghost" onclick="cancelEditLabourPO()">Cancel</button>`:''}
      </div>
    </div>

    <div class="panel">
      <div class="section-total">
        <h3>Job Work POs <span class="hint" id="labourPOListCount">${list.length} on file</span></h3>
        <input list="labourPOPartSearchList" id="labourPOPartFilterInp" value="${esc(labourPOPartFilter)}" placeholder="🔍 Search by Part No" oninput="onLabourPOPartFilterChange(this)" style="max-width:200px;">
        <datalist id="labourPOPartSearchList">${labourPOPartFilterOptionsHtml()}</datalist>
        <input list="labourPOCustSearchList" id="labourPOCustFilterInp" value="${esc(labourPOCustFilter)}" placeholder="🔍 Search by Customer Name" oninput="onLabourPOCustFilterChange(this)" style="max-width:200px;">
        <datalist id="labourPOCustSearchList">${labourPOCustFilterOptionsHtml()}</datalist>
        <span id="labourPOPartFilterClearWrap" style="display:${(labourPOPartFilter||labourPOCustFilter)?'inline-flex':'none'};"><button class="btn ghost small" onclick="clearLabourPOPartFilter()">✕ Clear</button></span>
      </div>
      <div id="labourPOListBox">${labourPOPartCardsHtml(list)}</div>
    </div>
  `;
}
// Every distinct Part No (with its Part Name) currently on file, this unit — feeds the
// datalist behind the Job Work PO list's Part No search box, same as Sales PO's, so it also
// works as a quick picker, not just free-text search.
function labourPOPartFilterOptionsHtml(){
  const seen = new Map();
  DB.labourPO.filter(x=>reportUnitMatch(x.unit)).forEach(p=>{
    if(p.finPartNo && !seen.has(p.finPartNo)) seen.set(p.finPartNo, p.finPartName||'');
  });
  return Array.from(seen.entries()).map(([pn,name])=>`<option value="${esc(pn)}">${esc(name)}</option>`).join('');
}
// Every distinct Customer Name currently on file, this unit — feeds the datalist behind the
// Job Work PO list's dedicated Customer Name search box.
function labourPOCustFilterOptionsHtml(){
  const seen = new Set();
  const opts = [];
  DB.labourPO.filter(x=>reportUnitMatch(x.unit)).forEach(p=>{
    const nm = (custDispByName(p.customer)||p.customer||'').trim();
    if(nm && !seen.has(nm)){ seen.add(nm); opts.push(nm); }
  });
  return opts.map(nm=>`<option value="${esc(nm)}"></option>`).join('');
}
// Filters the Job Work PO list by Part No / Part Name (Part No search box) AND Customer Name
// (Customer Name search box) — both filters apply together when both are filled in.
function labourPOFilteredList(){
  let list = DB.labourPO.filter(x=>reportUnitMatch(x.unit));
  const partKey = labourPOPartFilter.trim().toLowerCase();
  if(partKey) list = list.filter(x=>(x.finPartNo||'').toLowerCase().includes(partKey) || (x.finPartName||'').toLowerCase().includes(partKey));
  const custKey = labourPOCustFilter.trim().toLowerCase();
  if(custKey) list = list.filter(x=>(custDispByName(x.customer)||x.customer||'').toLowerCase().includes(custKey));
  return list;
}
// Updates only the list box + count (not the whole screen) as the user types, so the search
// input never loses focus mid-keystroke — mirrors renderCustPOListOnly().
function renderLabourPOListOnly(){
  const list = labourPOFilteredList();
  const box = document.getElementById('labourPOListBox'); if(box) box.innerHTML = labourPOPartCardsHtml(list);
  const countEl = document.getElementById('labourPOListCount');
  if(countEl) countEl.textContent = `${list.length} on file`;
  const clearWrap = document.getElementById('labourPOPartFilterClearWrap'); if(clearWrap) clearWrap.style.display = (labourPOPartFilter||labourPOCustFilter) ? 'inline-flex' : 'none';
}
function onLabourPOPartFilterChange(inputEl){
  labourPOPartFilter = inputEl.value;
  renderLabourPOListOnly();
}
function onLabourPOCustFilterChange(inputEl){
  labourPOCustFilter = inputEl.value;
  renderLabourPOListOnly();
}
function clearLabourPOPartFilter(){
  labourPOPartFilter = '';
  labourPOCustFilter = '';
  const inp = document.getElementById('labourPOPartFilterInp'); if(inp) inp.value = '';
  const custInp = document.getElementById('labourPOCustFilterInp'); if(custInp) custInp.value = '';
  renderLabourPOListOnly();
}
// One card per Part Number (Customer + Part) — every Job Work PO ever raised for that Part is
// listed inside it as a compact row (PO No / Quote Ref / Rate / Date / Status). No duplicate
// cards for the same Part, no separate views to reconcile. (The old inline "+ Add PO" card
// layout has been removed — one Job Work PO per Part is now created from the single form above.)
function labourPartGroupKey(customerId, customer, finPartNo){
  return (customerId||customer||'')+'::'+(finPartNo||'').trim().toLowerCase();
}
function labourPOPartCardsHtml(list){
  if(!list.length) return '<div class="empty">No Job Work POs for this unit yet.</div>';
  const groups = new Map(); // key -> {customerId, customer, finPartNo, finPartName, rows:[]}
  list.forEach(p=>{
    const key = labourPartGroupKey(p.customerId, p.customer, p.finPartNo);
    if(!groups.has(key)) groups.set(key, {key, customerId:p.customerId, customer:p.customer, finPartNo:p.finPartNo, finPartName:p.finPartName, rows:[]});
    groups.get(key).rows.push(p);
  });
  const groupList = Array.from(groups.values());
  groupList.forEach(g=>g.rows.sort((a,b)=>(b.poDate||'').localeCompare(a.poDate||'')));
  groupList.sort((a,b)=>(b.rows[0].poDate||'').localeCompare(a.rows[0].poDate||''));
  // Each PO is its own vertical stacked block (label above/beside its value, one field per
  // line) rather than a horizontal table row — long values like PO Numbers or Quote Refs
  // (e.g. "DEVELOPMENT-GOKULRAJ") get the full row width to themselves and never wrap/split.
  return `<div class="grid-box" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); align-items:start;">
    ${groupList.map(g=>`
      <div class="rec-card" style="text-align:left;">
        <div class="rc-title">${esc(g.finPartNo)||'—'} <span class="hint">${esc(g.finPartName)||''}</span></div>
        <div class="rc-sub">${esc(custDispByName(g.customer))||'—'} · ${g.rows.length} PO${g.rows.length>1?'s':''} on file</div>
        <div style="margin-top:8px;">
          ${g.rows.map(p=>`
            <div style="padding:10px 0; border-top:1px solid var(--line);">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px;">
                <div style="font-weight:700; font-size:13.5px; white-space:nowrap; overflow-x:auto;">PO No: ${p.poNo?esc(p.poNo):'<span class="hint" style="position:static;">— no PO No yet —</span>'}</div>
                <span class="pill rc-pill ${p.status==='Open'?'open':'done'}" style="flex-shrink:0;">${esc(p.status)}</span>
              </div>
              <div class="rc-row"><span class="k">Quotation Ref</span><span class="v" style="white-space:nowrap;">${esc(p.labourQuoteNo)||'—'}</span></div>
              <div class="rc-row"><span class="k">Rate</span><span class="v">${fmtMoney(p.price||0)}</span></div>
              <div class="rc-row"><span class="k">PO Date</span><span class="v">${fmtDate(p.poDate)||'—'}</span></div>
              <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
                <button class="btn small ghost" onclick="editLabourPO('${p.id}')">Edit</button>
                <button class="btn small ghost" onclick="goToLabourPlan('${p.id}')">📅 Job Work Plan</button>
                <button class="btn small ghost" onclick="toggleLabourPOStatus('${p.id}')">Toggle</button>
                <button class="btn danger" onclick="deleteRow('labourPO','${p.id}')">Del</button>
              </div>
            </div>`).join('')}
        </div>
      </div>`).join('')}
  </div>`;
}
