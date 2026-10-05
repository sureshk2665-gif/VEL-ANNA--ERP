/* ===== Standard Searchable Dropdown (srch-dd) engine — one consistent dropdown design
   reused across ERP modules. Uses a hidden <input> to hold the actual value (so any
   existing code that reads document.getElementById(hiddenId).value keeps working exactly
   as it did with a native <select>), plus a styled display box + searchable list on top. ===== */
function toggleSrchDD(ddId){
  const dd = document.getElementById(ddId);
  document.querySelectorAll('.srch-dd').forEach(d=>{
    if(d!==dd){ d.classList.remove('open','drop-up'); const p=d.querySelector('.srch-dd-panel'); if(p) p.style.display='none'; }
  });
  if(!dd) return;
  const panel = dd.querySelector('.srch-dd-panel');
  const isOpen = dd.classList.contains('open');
  if(isOpen){ dd.classList.remove('open','drop-up'); if(panel) panel.style.display='none'; return; }
  dd.classList.add('open');
  if(panel){
    panel.style.display='flex';
    // Flip the panel to open UPWARD instead of downward whenever there isn't enough room below
    // the trigger to show it in full (e.g. the picker sits near the bottom of the screen) — so the
    // list is always fully visible, with its own internal scrollbar, never cut off by the viewport.
    dd.classList.remove('drop-up');
    const rect = dd.getBoundingClientRect();
    const panelHeight = panel.offsetHeight || 290;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    if(spaceBelow < panelHeight && spaceAbove > spaceBelow) dd.classList.add('drop-up');
    const s = panel.querySelector('.srch-dd-search');
    if(s){ s.value=''; filterSrchDD(ddId,''); s.focus(); }
  }
}
function closeSrchDD(ddId){
  const dd = document.getElementById(ddId); if(!dd) return;
  dd.classList.remove('open','drop-up');
  const p = dd.querySelector('.srch-dd-panel'); if(p) p.style.display='none';
}
function filterSrchDD(ddId, q){
  const dd = document.getElementById(ddId); if(!dd) return;
  const query = (q||'').trim().toLowerCase();
  let any = false;
  dd.querySelectorAll('.srch-dd-item').forEach(it=>{
    const hay = (it.dataset.search||it.textContent||'').toLowerCase();
    const show = !query || hay.includes(query);
    it.style.display = show ? '' : 'none';
    if(show) any = true;
  });
  const empty = dd.querySelector('.srch-dd-empty');
  if(empty) empty.style.display = any ? 'none' : 'block';
}
// Sets the hidden input's value + updates the visible label, then closes the panel.
// Callers append their own existing onchange logic (e.g. setQuoteCustChange()) right after this.
function selectSrchDDValue(ddId, hiddenId, value, label){
  const hidden = document.getElementById(hiddenId);
  if(hidden) hidden.value = value;
  const dd = document.getElementById(ddId);
  if(dd){
    const dispWrap = dd.querySelector('.srch-dd-display');
    const dispText = dd.querySelector('.srch-dd-display span:first-child');
    if(dispText) dispText.textContent = label;
    if(dispWrap) dispWrap.classList.toggle('placeholder', value==='');
    dd.querySelectorAll('.srch-dd-item').forEach(it=>it.classList.remove('selected'));
    if(event && event.target){ const row = event.target.closest('.srch-dd-item'); if(row) row.classList.add('selected'); }
  }
  closeSrchDD(ddId);
}
document.addEventListener('click', function(e){
  document.querySelectorAll('.srch-dd').forEach(dd=>{
    if(!dd.contains(e.target)){ dd.classList.remove('open','drop-up'); const p=dd.querySelector('.srch-dd-panel'); if(p) p.style.display='none'; }
  });
});
// Standard Customer picker — used in place of a plain <select> for "Customer Name" fields
// throughout the ERP (Sales Quotation, Job Work Quotation, Bar/Forging Mapping, etc.), so
// every module shares the exact same dropdown look, behaviour, and search-as-you-type.
// onChangeCall: a string of JS to run right after selection (usually the module's existing
// onchange handler, e.g. "setQuoteCustChange()") so no other logic needs to change.
// Generic version of customerPickerHtml — works for ANY list of {value,label} options,
// not just customers. Same widget, same look, same search-as-you-type behavior.
// includeOther: whether to show the "Other (type manually)" row at the bottom.
function genericPickerHtml(ddId, hiddenId, items, selectedValue, placeholder, onChangeCall, includeOther){
  const current = items.find(x=>String(x.value)===String(selectedValue));
  const isOther = selectedValue==='__other__';
  const label = current ? current.label : (isOther ? 'Other (type manually)' : placeholder);
  const rows = [
    `<div class="srch-dd-item${(!selectedValue)?' selected':''}" data-search="" onclick="selectSrchDDValue('${ddId}','${hiddenId}','','${esc(placeholder)}'); ${onChangeCall}">${esc(placeholder)}</div>`,
    ...items.map(it=>`<div class="srch-dd-item${String(it.value)===String(selectedValue)?' selected':''}" data-search="${esc((it.label||'').toLowerCase())}" onclick="selectSrchDDValue('${ddId}','${hiddenId}','${esc(it.value)}','${esc(it.label)}'); ${onChangeCall}">${esc(it.label)}</div>`),
    includeOther ? `<div class="srch-dd-item muted${isOther?' selected':''}" data-search="other" onclick="selectSrchDDValue('${ddId}','${hiddenId}','__other__','Other (type manually)'); ${onChangeCall}">Other (type manually)</div>` : ''
  ].join('');
  return `
  <div class="srch-dd" id="${ddId}">
    <input type="hidden" id="${hiddenId}" value="${esc(selectedValue||'')}">
    <div class="srch-dd-display${(current||isOther)?'':' placeholder'}" onclick="toggleSrchDD('${ddId}')">
      <span>${esc(label)}</span><span class="srch-dd-arrow">▾</span>
    </div>
    <div class="srch-dd-panel" style="display:none;">
      <input type="text" class="srch-dd-search" placeholder="Search…" oninput="filterSrchDD('${ddId}', this.value)">
      <div class="srch-dd-list">${rows}<div class="srch-dd-empty">No matches</div></div>
    </div>
  </div>`;
}
// Keeps the small "Customer ID: CU-00xx" tag under every Customer picker in sync the instant a
// customer is (re)selected — Customer ID always comes from the one Customer Master record
// (DB.customers[].no, auto-generated when the customer was created) so it can never drift from
// the Customer Name shown in the same picker, across Quotation, Customer PO, or anywhere else.
function updateCustomerIdTag(hiddenId){
  const hidden = document.getElementById(hiddenId);
  const tag = document.getElementById(hiddenId+'_idTag');
  if(!hidden || !tag) return;
  if(hidden.value==='__other__'){ tag.textContent = 'Customer ID: — (manual entry, no master record)'; return; }
  const c = DB.customers.find(x=>x.id===hidden.value);
  tag.textContent = c ? `Customer ID: ${c.no||'—'}` : 'Customer ID: —';
}
function customerPickerHtml(ddId, hiddenId, selectedId, isOtherSelected, onChangeCall){
  // Screen-only display: dropdown rows/labels show Short Name (falling back to Full Name)
  // purely to save space, but the underlying value is always the customer's id, and every
  // save path resolves the real Full Name straight from DB.customers — the Short Name never
  // reaches saved data. Search matches both Short Name and Full Name so typing either works.
  const items = DB.customers.map(c=>({value:c.id, label:c.shortName||c.name, fullName:c.name, no:c.no||''}));
  const current = items.find(x=>x.value===selectedId);
  const label = current ? current.label : (isOtherSelected ? 'Other (type manually)' : '— select customer —');
  const idTagText = current ? `Customer ID: ${esc(current.no||'—')}` : (isOtherSelected ? 'Customer ID: — (manual entry, no master record)' : 'Customer ID: —');
  const rows = [
    `<div class="srch-dd-item${selectedId===''&&!isOtherSelected?' selected':''}" data-search="" onclick="selectSrchDDValue('${ddId}','${hiddenId}','','— select customer —'); updateCustomerIdTag('${hiddenId}'); ${onChangeCall}">— select customer —</div>`,
    ...items.map(it=>`<div class="srch-dd-item${it.value===selectedId?' selected':''}" data-search="${esc((it.label+' '+it.fullName).toLowerCase())}" onclick="selectSrchDDValue('${ddId}','${hiddenId}','${it.value}','${esc(it.label)}'); updateCustomerIdTag('${hiddenId}'); ${onChangeCall}">${esc(it.label)} <span class="srch-dd-idtag">${esc(it.no||'—')}</span></div>`),
    `<div class="srch-dd-item muted${isOtherSelected?' selected':''}" data-search="other" onclick="selectSrchDDValue('${ddId}','${hiddenId}','__other__','Other (type manually)'); updateCustomerIdTag('${hiddenId}'); ${onChangeCall}">Other (type manually)</div>`
  ].join('');
  return `
  <div class="srch-dd" id="${ddId}">
    <input type="hidden" id="${hiddenId}" value="${esc(selectedId||(isOtherSelected?'__other__':''))}">
    <div class="srch-dd-display${(current||isOtherSelected)?'':' placeholder'}" onclick="toggleSrchDD('${ddId}')">
      <span>${esc(label)}</span><span class="srch-dd-arrow">▾</span>
    </div>
    <div class="cust-id-tag" id="${hiddenId}_idTag">${idTagText}</div>
    <div class="srch-dd-panel" style="display:none;">
      <input type="text" class="srch-dd-search" placeholder="Search customer…" oninput="filterSrchDD('${ddId}', this.value)">
      <div class="srch-dd-list">${rows}<div class="srch-dd-empty">No matches</div></div>
    </div>
  </div>`;
}
document.addEventListener('click', function(e){
  document.querySelectorAll('.fdd').forEach(dd=>{
    if(!dd.contains(e.target)){
      const list = dd.querySelector('.fdd-list');
      if(list) list.style.display = 'none';
    }
  });
});
function setQuoteRowPartFromBOMCustom(i, finPartNo, name, el){
  setQuoteRowPartFromBOM(i, finPartNo, null, name);
  const dispEl = document.getElementById('qiFinPartDisplay'+i);
  if(dispEl) dispEl.value = finPartNo==='__other__' ? '' : finPartNo;
  const list = document.getElementById('qiFinPartList'+i);
  if(list) list.style.display = 'none';
}
function quotationFinPartPickerOptionsHtml(custId, custName){
  // Distinct Finished Part No's entered/picked in Sales Quotation & Job Work Quotation line items,
  // restricted to the selected Customer when one is chosen (else shows all customers' parts).
  const nameKey = (custName||'').trim().toLowerCase();
  const seen = {}; const opts = [];
  const collect = (list)=>{ (list||[]).forEach(q=>{
    if(custId){ if(q.customerId!==custId) return; }
    else if(nameKey){ if((q.customer||'').trim().toLowerCase()!==nameKey) return; }
    (q.items||[]).forEach(it=>{
      const key = (it.partNo||'').trim();
      if(key && !seen[key]){ seen[key]=1; opts.push({key, name:it.partName||''}); }
    });
  }); };
  collect(DB.quotation); collect(DB.labourQuotation);
  opts.sort((a,b)=>a.key.localeCompare(b.key));
  return opts.map(o=>`<option value="${esc(o.key)}" data-name="${esc(o.name)}">${esc(o.key)}</option>`).join('');
}
function fillBOMFinPartFromQuote(selEl){
  const opt = selEl.options[selEl.selectedIndex];
  const noEl = document.getElementById('bomFinNo');
  const nameEl = document.getElementById('bomFinName');
  if(!opt || !opt.value || opt.value==='__other__'){
    if(opt && opt.value==='__other__' && noEl){ noEl.value=''; noEl.focus(); }
    return;
  }
  if(noEl) noEl.value = opt.value;
  if(nameEl && !nameEl.value.trim()) nameEl.value = opt.getAttribute('data-name')||'';
}
function itemMasterOptionsHtml(){
  return DB.items.map(x=>`<option value="${x.id}" data-code="${esc(x.code)}" data-name="${esc(x.name)}">${esc(x.code)}</option>`).join('');
}
/* Finished Part No's used ONLY in the Job Work module (Cycle Time & Cost line items across all
   saved Job Work Quotations) — deliberately excludes the Item Master and Sales Quotation / BOM
   part numbers so the Job Work "pick part from list" dropdown never shows unrelated parts. */
function labourFinPartOptionsHtml(){
  const seen = {}; const opts = [];
  DB.labourQuotation.forEach(q=>{
    (q.items||[]).forEach(it=>{
      const key = (it.partNo||'').trim();
      if(key && !seen[key]){ seen[key]=1; opts.push({key, name:it.partName||''}); }
    });
  });
  opts.sort((a,b)=>a.key.localeCompare(b.key));
  return opts.map(o=>`<option value="${esc(o.key)}" data-name="${esc(o.name)}">${esc(o.key)}</option>`).join('');
}
// Same source list as labourFinPartOptionsHtml(), rendered as fdd-item rows for the
// searchable dropdown picker (same design as the Finished Part No picker in Sales Quotation).
function labourFinPartPickerItemsHtml(i){
  const custId = labourDraftCustomerId;
  const nameKey = (labourDraftCustomerName||'').trim().toLowerCase();
  const seen = {}; const opts = [];
  DB.labourMapping.forEach(m=>{
    if(custId){ if(m.customerId!==custId) return; }
    else if(nameKey){ if((m.customer||'').trim().toLowerCase()!==nameKey) return; }
    const key = (m.finPartNo||'').trim();
    if(key && !seen[key]){ seen[key]=1; opts.push({key, name:m.finPartName||''}); }
  });
  DB.labourQuotation.forEach(q=>{
    if(custId){ if(q.customerId!==custId) return; }
    else if(nameKey){ if((q.customer||'').trim().toLowerCase()!==nameKey) return; }
    (q.items||[]).forEach(it=>{
      const key = (it.partNo||'').trim();
      if(key && !seen[key]){ seen[key]=1; opts.push({key, name:it.partName||''}); }
    });
  });
  opts.sort((a,b)=>a.key.localeCompare(b.key));
  return opts.map(o=>`<div class="fdd-item" onclick="setLabourRowPartFromMasterCustom(${i},'${esc(o.key)}','${esc(o.name)}',this)">${esc(o.key)}</div>`).join('');
}
function itemMasterOptionsHtmlByType(type){
  return DB.items.filter(x=>x.type===type).map(x=>`<option value="${x.id}" data-code="${esc(x.code)}" data-name="${esc(x.name)}" data-uom="${esc(x.uom)}" data-rate="${x.marketPrice||0}" data-vqprice="${x.vqPrice||0}" data-material="${esc(x.material)||''}" data-shape="${esc(x.shape)||''}" data-size="${esc(x.size)||''}" data-grade="${esc(x.grade)||''}" data-density="${x.density||defaultDensityForMaterial(x.material)||''}">${esc(x.code)}</option>`).join('');
}
/* Distinct Finished Part No / Name list drawn from BOM mapping (Bar + Forging) — used to pick a Finished Part
   for Inspection Parameters, so the master lines up with the part that actually reaches Final Inspection. */
function finishedPartOptionsHtml(customerId, customerName){
  const seen = {}; const opts = [];
  const nameKey = (customerName||'').trim().toLowerCase();
  DB.bom.forEach(b=>{
    if(customerId || nameKey){
      const match = customerId ? b.customerId===customerId : (b.customerName||'').trim().toLowerCase()===nameKey;
      if(!match) return;
    }
    const key = (b.finPartNo||'').trim();
    if(key && !seen[key]){ seen[key]=1; opts.push({no:key, name:b.finPartName||''}); }
  });
  opts.sort((a,b)=>a.no.localeCompare(b.no));
  return opts.map(o=>`<option value="${esc(o.no)}" data-code="${esc(o.no)}" data-name="${esc(o.name)}">${esc(o.no)}</option>`).join('');
}
/* Finished Part No picker for Control Plan — combines Product Development (BOM mapping)
   parts with Part No's already used in Job Work Quotation line items,
   so labour-only parts (with no Bar/Forging BOM mapping) are also selectable.
   When customerId/customerName is given, only that customer's parts are listed. */
function cpFinishedPartOptions(customerId, customerName){
  const seen = {}; const opts = [];
  const nameKey = (customerName||'').trim().toLowerCase();
  const custMatch = (rowCustId, rowCustName)=>{
    if(!customerId && !nameKey) return true;
    if(customerId) return rowCustId===customerId;
    return (rowCustName||'').trim().toLowerCase()===nameKey;
  };
  DB.bom.forEach(b=>{
    if(!custMatch(b.customerId, b.customerName)) return;
    const key = (b.finPartNo||'').trim();
    if(key && !seen[key]){ seen[key]=1; opts.push({no:key, name:b.finPartName||''}); }
  });
  DB.labourQuotation.forEach(q=>{
    if(!custMatch(q.customerId, q.customer)) return;
    (q.items||[]).forEach(it=>{
      const key = (it.partNo||'').trim();
      if(key && !seen[key]){ seen[key]=1; opts.push({no:key, name:it.partName||''}); }
    });
  });
  opts.sort((a,b)=>a.no.localeCompare(b.no));
  return opts;
}
// Custom searchable-dropdown markup for the Control Plan "Pick Finished Part No" field —
// replaces the old native <select> so mobile browsers can't overlay their own native
// "N rows" option-count hint on top of it (that hint is OS/browser chrome tied to <select>,
// not something the page can suppress). Uses the shared srch-dd widget engine.
function cpFinishedPartPickerHtml(customerId, customerName){
  const opts = cpFinishedPartOptions(customerId, customerName);
  const items = opts.map(o=>({value:o.no, label:o.no}));
  return genericPickerHtml('cpFinPartDD','cpFinPartHidden', items, '', '— pick part from list —',
    "fillCPFromFinishedPartValue(document.getElementById('cpFinPartHidden').value)", true);
}
function fillCPFromFinishedPartValue(value){
  if(!cpDraft) return;
  if(!value || value==='__other__') return;
  captureCPForm();
  const partNo = value;
  cpDraft.header.finPartNo = partNo;
  const link = cpAutoLinkFromPart(partNo);
  if(link){
    cpDraft.header.finPartName = link.finPartName;
    if(!cpDraft.header.customerId && !cpDraft.header.customerName){
      cpDraft.header.customerId = link.customerId;
      cpDraft.header.customerName = link.customerName;
    }
    if(!cpDraft.header.pdRecordRef) cpDraft.header.pdRecordRef = link.pdRecordRef;
    if(link.materialGrade) cpDraft.header.materialGrade = link.materialGrade;
  }
  render();
}
/* Material Grade for a Finished Part No — resolved via its BOM mapping's Bar raw-material
   Part No, looked up against the Item Master (which carries the material grade). */
function materialGradeForPart(partNo){
  const key = (partNo||'').trim().toLowerCase();
  if(!key) return '';
  const bom = DB.bom.find(b=>(b.finPartNo||'').trim().toLowerCase()===key && b.purPartNo);
  if(!bom) return '';
  const item = DB.items.find(it=>it.type==='BAR' && (it.code||'').trim().toLowerCase()===(bom.purPartNo||'').trim().toLowerCase());
  return item ? (item.grade||'') : '';
}
function bomFinPartDatalistHtml(custId, custName, mapType){
  const seen = {}; const opts = [];
  const nameKey = (custName||'').trim().toLowerCase();
  DB.bom.forEach(b=>{
    if(mapType && b.mapType!==mapType) return;
    if(custId){ if(b.customerId!==custId) return; }
    else if(nameKey){ if((b.customerName||'').trim().toLowerCase()!==nameKey) return; }
    const key = (b.finPartNo||'').trim();
    if(key && !seen[key]){ seen[key]=1; opts.push(`<option value="${esc(key)}">${esc(b.finPartName)||''}</option>`); }
  });
  return `<datalist id="bomFinPartList">${opts.join('')}</datalist>`;
}
function replaceFinPartDatalist(custId, custName, mapType){
  const old = document.getElementById('bomFinPartList');
  const html = bomFinPartDatalistHtml(custId, custName, mapType);
  if(old){ old.outerHTML = html; }
}
/* Finished Part No datalist for the Job Work module — built from Finished Part No's already
   entered in Job Work Quotation line items, PLUS anything already set up in Product
   Development → Job Work Mapping for this customer (so a freshly-created mapping shows up
   here immediately, even before any quotation references that part yet), optionally scoped
   to a customer. Never pulls from the Item Master or Sales Quotation. */
function labourFinPartDatalistHtml(custId, custName){
  const seen = {}; const opts = [];
  const nameKey = (custName||'').trim().toLowerCase();
  DB.labourMapping.forEach(m=>{
    if(custId){ if(m.customerId!==custId) return; }
    else if(nameKey){ if((m.customer||'').trim().toLowerCase()!==nameKey) return; }
    const key = (m.finPartNo||'').trim();
    if(key && !seen[key]){ seen[key]=1; opts.push(`<option value="${esc(key)}">${esc(m.finPartName)||''}</option>`); }
  });
  DB.labourQuotation.forEach(q=>{
    if(custId){ if(q.customerId!==custId) return; }
    else if(nameKey){ if((q.customer||'').trim().toLowerCase()!==nameKey) return; }
    (q.items||[]).forEach(it=>{
      const key = (it.partNo||'').trim();
      if(key && !seen[key]){ seen[key]=1; opts.push(`<option value="${esc(key)}">${esc(it.partName)||''}</option>`); }
    });
  });
  return `<datalist id="labourFinPartList">${opts.join('')}</datalist>`;
}
function replaceLabourFinPartDatalist(custId, custName){
  const old = document.getElementById('labourFinPartList');
  const html = labourFinPartDatalistHtml(custId, custName);
  if(old){ old.outerHTML = html; }
}
function updateQuoteFinPartDatalist(){
  const sel = document.getElementById('qtCustSel');
  const manual = document.getElementById('qtCust');
  const custId = sel && sel.value && sel.value!=='__other__' ? sel.value : '';
  const custName = manual ? manual.value : '';
  replaceFinPartDatalist(custId, custName);
}
function refreshQuoteRowPartDatalist(i){
  const sel = document.getElementById('qtCustSel');
  const manual = document.getElementById('qtCust');
  const custId = sel && sel.value && sel.value!=='__other__' ? sel.value : '';
  const custName = manual ? manual.value : '';
  const mtEl = document.getElementById('qiMapType'+i);
  const mapType = mtEl ? mtEl.value : '';
  replaceFinPartDatalist(custId, custName, mapType);
}
function updateLabourFinPartDatalist(){
  const sel = document.getElementById('lqCustSel');
  const manual = document.getElementById('lqCust');
  const custId = sel && sel.value && sel.value!=='__other__' ? sel.value : '';
  const custName = manual ? manual.value : '';
  replaceLabourFinPartDatalist(custId, custName);
}
function refreshAllLabourRowPartPickers(){
  labourItemsDraft.forEach((it,i)=>{
    const list = document.getElementById('liFinPartList'+i);
    if(list){
      list.innerHTML = `<div class="fdd-item" onclick="setLabourRowPartFromMasterCustom(${i},'','',this)">— pick part from list —</div>`
        + labourFinPartPickerItemsHtml(i)
        + `<div class="fdd-item" onclick="setLabourRowPartFromMasterCustom(${i},'__other__','',this)">Other (type manually)</div>`;
    }
  });
}
function autoFillFinPartName(i, kind){
  const draft = kind==='quote' ? quoteItemsDraft : labourItemsDraft;
  if(!draft || !draft[i]) return;
  const noVal = (draft[i].partNo||'').trim().toLowerCase();
  if(!noVal) return;
  const custSel = document.getElementById(kind==='quote'?'qtCustSel':'lqCustSel');
  const custManual = document.getElementById(kind==='quote'?'qtCust':'lqCust');
  const custId = custSel && custSel.value && custSel.value!=='__other__' ? custSel.value : '';
  const custName = custManual ? (custManual.value||'').trim().toLowerCase() : '';
  let match = DB.bom.find(b=>(b.finPartNo||'').trim().toLowerCase()===noVal &&
    (custId ? b.customerId===custId : (custName ? (b.customerName||'').trim().toLowerCase()===custName : true)));
  if(!match) match = DB.bom.find(b=>(b.finPartNo||'').trim().toLowerCase()===noVal);
  if(match && match.finPartName){
    draft[i].partName = match.finPartName;
    const nameEl = document.getElementById((kind==='quote'?'qiPartName':'liPartName')+i);
    if(nameEl) nameEl.value = match.finPartName;
  }
  if(kind==='quote') autoCalcRawMaterialCost(i);
}
function bomPartNoDatalistHtml(mapType, listId){
  const field = mapType==='BAR' ? 'purPartNo' : 'forgPartNo';
  const nameField = mapType==='BAR' ? 'purPartName' : 'forgPartName';
  const seen = {}; const opts = [];
  DB.bom.forEach(b=>{
    if(b.mapType!==mapType) return;
    const key = (b[field]||'').trim();
    if(key && !seen[key]){ seen[key]=1; opts.push(`<option value="${esc(key)}">${esc(b[nameField])||''}</option>`); }
  });
  return `<datalist id="${listId}">${opts.join('')}</datalist>`;
}
function fillPartNameFromBOMList(mapType, partNoId, partNameId, unitWeightId, uomId){
  const field = mapType==='BAR' ? 'purPartNo' : 'forgPartNo';
  const nameField = mapType==='BAR' ? 'purPartName' : 'forgPartName';
  const noEl = document.getElementById(partNoId);
  const nameEl = document.getElementById(partNameId);
  if(!noEl || !nameEl) return;
  const val = noEl.value.trim().toLowerCase();
  if(!val) return;
  const match = DB.bom.find(b=>b.mapType===mapType && (b[field]||'').trim().toLowerCase()===val);
  if(match && match[nameField] && !nameEl.value.trim()) nameEl.value = match[nameField];
  if(unitWeightId && match && match.normWeight>0){
    const uw = document.getElementById(unitWeightId);
    if(uw && !uw.value){ uw.value = match.normWeight; toast('Unit weight auto-filled from BOM norm ('+match.normWeight+' Kg/Pc)'); }
  }
  if(uomId && match && match.uom){
    const uomEl = document.getElementById(uomId);
    if(uomEl && !uomEl.value.trim()) uomEl.value = match.uom;
  }
}
function bomLookupPanelHtml(searchId, resultId, title){
  return `<div class="panel">
    <h3>🔎 ${esc(title||'Part Lookup')} <span class="hint">Select / type a Part No to view its linked Purchased &amp; Forging Parts</span></h3>
    ${bomFinPartDatalistHtml()}
    <div class="frow g4">
      <div><label class="fl">Part No</label><input id="${searchId}" list="bomFinPartList" placeholder="Type or pick part no." oninput="renderBOMLookupResult('${searchId}','${resultId}')"></div>
    </div>
    <div id="${resultId}"></div>
  </div>`;
}
function renderBOMLookupResult(searchId, resultId){
  const box = document.getElementById(resultId);
  const inp = document.getElementById(searchId);
  if(!box || !inp) return;
  const val = (inp.value||'').trim().toLowerCase();
  if(!val){ box.innerHTML=''; return; }
  const rows = DB.bom.filter(b=>(b.finPartNo||'').toLowerCase().includes(val) || (b.finPartName||'').toLowerCase().includes(val));
  if(!rows.length){ box.innerHTML = '<div class="empty" style="margin-top:10px;">No BOM mapping found for this Part. Define it in Product Development — Bar/Forging Mapping.</div>'; return; }
  box.innerHTML = `<div style="margin-top:12px;">
    <div class="bom-lookup-head">Part: <strong>${esc(rows[0].finPartNo)} — ${esc(rows[0].finPartName)||'—'}</strong></div>
    <table class="bom-table">
      <thead><tr><th>Purchased Part No</th><th>Purchased Part Name</th><th>Forging Part No</th><th>Forging Part Name</th><th>Production Location</th><th>UOM</th></tr></thead>
      <tbody>
        ${rows.map(r=>`<tr><td>${esc(r.purPartNo)||'—'}</td><td>${esc(r.purPartName)||'—'}</td><td>${esc(r.forgPartNo)||'—'}</td><td>${esc(r.forgPartName)||'—'}</td><td>${esc(r.prodLocation)||'—'}</td><td>${esc(r.uom)||'—'}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}
function itemMasterPickerHtml(labelText, selectId, onchangeCall){
  return `<label class="fl">${labelText} <span class="hint" style="position:static; font-size:9.5px;">(from Item Master)</span></label>
    <select id="${selectId}" onchange="${onchangeCall}">
      <option value="">— pick part from list —</option>${itemMasterOptionsHtml()}
      <option value="__other__">Other (type manually)</option>
    </select>`;
}
function fillItemFromMaster(selEl, targetInputId, mode){
  const opt = selEl.options[selEl.selectedIndex];
  const target = document.getElementById(targetInputId);
  if(!target) return;
  if(!opt || !opt.value || opt.value==='__other__'){ if(opt && opt.value==='__other__'){ target.value=''; target.focus(); } return; }
  const code = opt.getAttribute('data-code')||'';
  const name = opt.getAttribute('data-name')||'';
  target.value = mode==='nameOnly' ? name : mode==='code' ? code : (code ? `${code} — ${name}` : name);
}
function fillFinPartPair(selEl, noId, nameId){
  const opt = selEl.options[selEl.selectedIndex];
  const noEl = document.getElementById(noId), nameEl = document.getElementById(nameId);
  if(!opt || !opt.value || opt.value==='__other__'){
    if(opt && opt.value==='__other__'){ if(noEl){noEl.value='';noEl.focus();} if(nameEl) nameEl.value=''; }
    return;
  }
  if(noEl) noEl.value = opt.getAttribute('data-code')||'';
  if(nameEl) nameEl.value = opt.getAttribute('data-name')||'';
}
function fillFinalInspFromMaster(selEl){
  const opt = selEl.options[selEl.selectedIndex];
  const pn=document.getElementById('fiPartNo'), ds=document.getElementById('fiDesc');
  if(!opt || !opt.value || opt.value==='__other__'){
    if(opt && opt.value==='__other__'){ if(pn){pn.value='';pn.focus();} if(ds) ds.value=''; }
    return;
  }
  const code = opt.getAttribute('data-code')||'';
  const name = opt.getAttribute('data-name')||'';
  if(pn) pn.value = code;
  if(ds) ds.value = name;
  if(!fiHeaderDraft) return;
  captureFIForm();
  fiHeaderDraft.partNo = code; fiHeaderDraft.desc = name;
  const mat = autoMaterialInfoForFinPart(code);
  if(mat.grade && !fiHeaderDraft.grade) fiHeaderDraft.grade = mat.grade;
  if(mat.supplier && !fiHeaderDraft.supplier) fiHeaderDraft.supplier = mat.supplier;
  if(mat.grir && !fiHeaderDraft.grir) fiHeaderDraft.grir = mat.grir;
  if(mat.cert && !fiHeaderDraft.cert) fiHeaderDraft.cert = mat.cert;
  const noneFilled = !fiCharsDraft || fiCharsDraft.every(c=>!c.name.trim());
  if(noneFilled){
    const autoChars = charsFromInspParams(code);
    if(autoChars) fiCharsDraft = autoChars;
  }
  render();
}
function reloadIPChars(){
  if(!fiHeaderDraft) return;
  captureFIForm();
  const autoChars = charsFromInspParams(fiHeaderDraft.partNo);
  if(!autoChars){ toast('No Inspection Parameters defined for this Part No — define them in Product Development → Inspection Parameters'); return; }
  fiCharsDraft = autoChars;
  toast('Characteristics reloaded from Inspection Parameters master');
  render();
}
/* Raw Material Cost auto-calc for Sales Quotation line items:
   Raw Material Cost (₹) = Material Cost per Kg (₹) × Piece Weight (kg), both entered directly on
   the Dimensions & Quotation Calc box for this line item (see rawMaterialDimsForFinPart /
   recalcQuoteDims below) — Quotation is the single entry point for Cut Length and Material Cost
   Price; only Material/Shape/Size/Grade/Density are still read from Product Development → BOM
   Mapping, since Production Calc there needs the same identification fields. */
// Read-only "Dimensions & Quotation Calc" preview shown on the Quotation line item, above Cost
// Summary — the Material/Shape/Size/Grade/Density/Cut Length/Piece Weight are always the ones
// on file in Product Development → BOM Mapping for this Part No (the one place they're
// maintained), so this box lets the person quoting SEE exactly what's driving the auto-calculated
// Raw Material Cost without leaving the Quotation screen, and can never fall out of sync with it.
/* Suggested Purchase Order Quantity + Stock hint for a BAR raw-material line item.
   Demand side: every Part No that maps (Product Development → Bar Mapping) to this
   raw material Bar Part No, weighted by its Piece Weight - Production (kg) [falls back to the
   Quotation piece weight if Production weight isn't set yet], multiplied by the OPEN Customer PO
   quantity still outstanding for that Part (Ordered − already Planned into production).
   Supply side: raw material of this same Bar Part No already on other OPEN Purchase Orders AND
   already sitting in Stores → Bar Stock is netted off, so the suggestion reflects what's still
   actually needed to buy, not the full gross demand.
   Always returns a status object (never null) so the hint box can render something useful even
   before there's a resolvable spec, a BOM mapping, or any open demand. */
function suggestedPOQtyForBarRow(material, shape, size, grade, excludePOId, barType){
  if(!size || !grade) return {status:'no-spec'};
  const {partNo} = buildBarPartNoName(material, shape, size, grade, barType);
  if(!partNo) return {status:'no-spec'};
  const partKey = partNo.trim().toLowerCase();
  const stockKg = Math.round((DB.storesBar||[]).filter(x=>reportUnitMatch(x.unit) && (x.partNo||'').trim().toLowerCase()===partKey)
    .reduce((a,x)=>a+(parseFloat(x.qty)||0),0)*100)/100;
  const boms = DB.bom.filter(b=>b.mapType==='BAR' && (b.purPartNo||'').trim().toLowerCase()===partKey);
  const allFinParts = Array.from(new Set(boms.map(b=>(b.finPartNo||'').trim()).filter(Boolean)));
  if(!boms.length) return {status:'no-mapping', partNo, stockKg, allFinParts};
  let demandKg = 0;
  const finParts = [];
  boms.forEach(b=>{
    const pieceWeight = parseFloat(b.prodPieceWeight)||parseFloat(b.pieceWeight)||0;
    if(!pieceWeight) return;
    DB.custPO.filter(c=>c.status==='Open' && (c.finPartNo||'').trim().toLowerCase()===(b.finPartNo||'').trim().toLowerCase())
      .forEach(c=>{
        const planned = custPOSumPlans(c.plans);
        const outstanding = Math.max(0, (parseFloat(c.orderedQty)||0) - planned);
        if(outstanding>0){ demandKg += outstanding*pieceWeight; finParts.push(b.finPartNo); }
      });
  });
  if(demandKg<=0) return {status:'no-demand', partNo, stockKg, allFinParts};
  let alreadyOnOrderKg = 0;
  DB.purchase.forEach(p=>{
    if(p.status!=='Open' || p.id===excludePOId) return;
    (p.items||[]).forEach(it=>{
      if(it.itemType!=='BAR') return;
      const built = buildBarPartNoName(it.material, it.shape, it.size, it.grade, it.barType).partNo;
      if(built.trim().toLowerCase()===partKey) alreadyOnOrderKg += parseFloat(it.qty)||0;
    });
  });
  const suggested = Math.round(Math.max(0, demandKg - alreadyOnOrderKg - stockKg)*100)/100;
  return {
    status:'ok', partNo, qty:suggested, finPartCount:new Set(finParts).size,
    demandKg:Math.round(demandKg*100)/100, alreadyOnOrderKg:Math.round(alreadyOnOrderKg*100)/100, stockKg,
    allFinParts
  };
}
/* Renders the hint box shown above the Qty field on a BAR line item — always visible,
   message adapts to how much is actually known yet (spec incomplete / no BOM mapping /
   no open demand / a real net suggestion), and always surfaces current Bar Stock on hand. */
function poSuggestHintHtml(i, r, excludePOId){
  const s = suggestedPOQtyForBarRow(r.material, r.shape, r.size, r.grade, excludePOId, r.barType);
  const box = (body, showUse)=>`
    <div id="poSuggestBox${i}" class="po-suggest-box">
      ${body}
      ${showUse ? `<button type="button" class="btn ghost small" style="margin-top:4px;" onclick="applySuggestedPOQty(${i})">↳ Use suggested qty</button>` : ''}
    </div>`;
  const finPartsLine = (list)=> (list && list.length)
    ? `<div style="margin-top:2px; font-size:12px; font-weight:600; color:#7c3aed;">Linked Part(s): ${list.map(fp=>esc(fp)).join(', ')}</div>`
    : '';
  if(s.status==='no-spec') return box(`<span class="hint">Enter Size &amp; Grade above to see the suggested purchase qty &amp; current stock.</span>`, false);
  if(s.status==='no-mapping') return box(`<span class="hint">No Part is mapped to <b>${esc(s.partNo)}</b> yet (Product Development → Bar Mapping).${s.stockKg?` Stock on hand: <b>${s.stockKg} kg</b>.`:' Stock on hand: 0 kg.'}</span>`, false);
  if(s.status==='no-demand') return box(`<span class="hint">No open Customer PO demand for <b>${esc(s.partNo)}</b> right now.${s.stockKg?` Stock on hand: <b>${s.stockKg} kg</b>.`:' Stock on hand: 0 kg.'}</span>${finPartsLine(s.allFinParts)}`, false);
  return box(`
    <div style="font-size:12px; font-weight:600; color:var(--amber,#b8860b);">💡 Suggested Order Qty: ${s.qty} kg</div>
    <div style="margin-top:4px; font-size:12px; font-weight:600; color:#2563eb;">Demand: ${s.demandKg} kg</div>
    <div style="margin-top:2px; font-size:12px; font-weight:600; color:#d97706;">On other open PO(s): ${s.alreadyOnOrderKg} kg</div>
    <div style="margin-top:2px; font-size:12px; font-weight:600; color:#059669;">In stock: ${s.stockKg} kg</div>
    <div style="margin-top:2px; font-size:12px; font-weight:600; color:#7c3aed;">Covers ${s.finPartCount} part(s)</div>
    ${finPartsLine(s.allFinParts)}
  `, s.qty>0);
}
function applySuggestedPOQty(i){
  if(!poItemsDraft[i]) return;
  const r = poItemsDraft[i];
  const s = suggestedPOQtyForBarRow(r.material, r.shape, r.size, r.grade, editingPOId, r.barType);
  if(s.status!=='ok' || !(s.qty>0)) return;
  updatePOItemRow(i, 'qty', s.qty);
  const row = document.querySelector(`#poItemRows [data-row="${i}"]`);
  if(row){ const inputs = row.querySelectorAll('input[type="number"]'); if(inputs[0]) inputs[0].value = s.qty; }
  render();
}

function autoCalcRawMaterialCost(i){
  if(!quoteItemsDraft[i]) return;
  recalcQuoteDims(i);
  const it = quoteItemsDraft[i];
  const rate = parseFloat(it.vqPrice)||0;
  const pieceWeight = parseFloat(it.pieceWeight)||0;
  if(!rate && !pieceWeight) return; // nothing entered yet in Dimensions & Quotation Calc above — leave as-is for manual entry
  const cost = Math.round(rate*pieceWeight*100)/100;
  it.rawMat = cost;
  const el = document.getElementById('qiRawMat'+i);
  if(el) el.value = cost;
  refreshQuoteCalcs();
}
function calcQuoteItem(it){
  const base = (parseFloat(it.rawMat)||0) + (parseFloat(it.machining)||0) + sumOthersCost(it);
  const pctSum = (parseFloat(it.adminPct)||0)+(parseFloat(it.invPct)||0)+(parseFloat(it.packPct)||0)+(parseFloat(it.marginPct)||0)+(parseFloat(it.transPct)||0);
  const unitRate = base + (base*pctSum/100);
  const qty = parseFloat(it.qty)||0;
  const moqQty = parseFloat(it.moqQty)||0;
  return {base, pctSum, unitRate, lineTotal: unitRate*qty, moqQty, moqValue: unitRate*moqQty};
}
// Machining Cost Working — same CNC/VMC cycle-time cost model as the Job Work Cost Working
// (Job Work Quotation) module, except Efficiency % replaces Profit %: instead of adding a
// profit margin on top, the raw CNC+VMC cost is grossed up for machine/operator efficiency
// (a lower efficiency % means more effective cost for the same cycle times).
function calcMachiningWorking(it){
  ensureMcwOps(it);
  // Quotation Cycle Time totals — these alone drive the Quotation cost math below, exactly
  // as before. Actual (shop-floor) Cycle Time totals are computed alongside for display/
  // comparison only; they never feed into the Quotation cost figures — Actual is the
  // Production module's concern, not the Quotation's (see computeMachiningCost / Production
  // Norms sourcing further down).
  const cncTime = it.mcwCncOps.reduce((a,r)=>a+(parseFloat(r.q)||0),0); // seconds — Quotation
  const vmcTime = it.mcwVmcOps.reduce((a,r)=>a+(parseFloat(r.q)||0),0); // seconds — Quotation
  const cncTimeActual = it.mcwCncOps.reduce((a,r)=>a+(parseFloat(r.a)||0),0); // seconds — Actual
  const vmcTimeActual = it.mcwVmcOps.reduce((a,r)=>a+(parseFloat(r.a)||0),0); // seconds — Actual
  const cncCost = (cncTime/60) * (parseFloat(it.mcwCncRate)||0);
  const vmcCost = (vmcTime/60) * (parseFloat(it.mcwVmcRate)||0);
  const totalCost = cncCost + vmcCost;
  const effPct = parseFloat(it.mcwEffPct)||0;
  const cncVmcTotal = effPct>0 ? totalCost / (effPct/100) : totalCost;
  const effAdj = cncVmcTotal - totalCost;
  // Cutting Cost, Grinding Cost and Rolling Cost are flat, directly-entered amounts —
  // they aren't time-based, so they're added after the CNC/VMC efficiency adjustment
  // rather than being grossed up by Efficiency %.
  const cuttingCost = parseFloat(it.mcwCuttingCost)||0;
  const grindingCost = parseFloat(it.mcwGrindingCost)||0;
  const rollingCost = parseFloat(it.mcwRollingCost)||0;
  // Negotiation Markup % is calculated on the Total Cost (CNC+VMC cost before efficiency
  // grossing) and added on top of everything else — e.g. entering 10 adds 10% of Total Cost;
  // entering 0 adds nothing.
  const negoPct = parseFloat(it.mcwNegoPct)||0;
  const negoAdj = totalCost * (negoPct/100);
  const total = cncVmcTotal + cuttingCost + grindingCost + rollingCost + negoAdj;
  return {cncTime, vmcTime, cncTimeActual, vmcTimeActual, cncCost, vmcCost, totalCost, effAdj, negoAdj, cuttingCost, grindingCost, rollingCost, total};
}
// Recomputes the Machining Cost Working total for item i and pushes it straight into that
// item's Machining Cost (₹) field — this is the single automatic link between the two, so
// the Machining Cost always reflects the latest Working calculation with no manual entry.
function computeMachiningCost(i){
  if(!quoteItemsDraft[i]) return;
  const w = calcMachiningWorking(quoteItemsDraft[i]);
  quoteItemsDraft[i].machining = w.total.toFixed(2);
  refreshQuoteCalcs();
}
function updateMachiningWorkingField(i, field, val){
  if(!quoteItemsDraft[i]) return;
  quoteItemsDraft[i][field] = val;
  computeMachiningCost(i);
}
function refreshAllQuoteRowPartPickers(){
  quoteItemsDraft.forEach((it,i)=>{
    const list = document.getElementById('qiFinPartList'+i);
    if(list){
      list.innerHTML = `<div class="fdd-item" onclick="setQuoteRowPartFromBOMCustom(${i},'','',this)">— pick part —</div>`
        + bomFinPartPickerItemsHtml(i)
        + `<div class="fdd-item" onclick="setQuoteRowPartFromBOMCustom(${i},'__other__','',this)">Other (type manually)</div>`;
    }
  });
}
function setQuoteCustChange(){
  const sel = document.getElementById('qtCustSel');
  const manual = document.getElementById('qtCust');
  const gstin = document.getElementById('qtGstin');
  const hsn = document.getElementById('qtHsn');
  const addr = document.getElementById('qtAddress');
  if(sel.value==='__other__'){ manual.style.display='block'; manual.value=''; manual.focus(); gstin.value=''; if(hsn) hsn.value=''; if(addr) addr.value=''; }
  else if(sel.value===''){ manual.style.display = DB.customers.length? 'none':'block'; }
  else{
    const c = DB.customers.find(x=>x.id===sel.value);
    manual.style.display='none'; manual.value = c?c.name:'';
    gstin.value = c?(c.gstin||''):'';
    if(hsn) hsn.value = c?(c.hsn||''):'';
    if(addr) addr.value = c?(c.address||''):'';
  }
  quoteDraftCustomerId = sel.value && sel.value!=='__other__' ? sel.value : '';
  quoteDraftCustomerName = manual ? manual.value : '';
  render();
}
function addQuoteItemRow(){ quoteItemsDraft.push(blankQuoteItem()); render(); }
function removeQuoteItemRow(i){ quoteItemsDraft.splice(i,1); render(); }
function setQuoteRowPartFromBOM(i, finPartNo, selEl, explicitName){
  if(!quoteItemsDraft[i]) return;
  if(finPartNo==='__other__'){
    quoteItemsDraft[i].partNo=''; quoteItemsDraft[i].partName='';
  }else if(finPartNo){
    const opt = selEl ? selEl.options[selEl.selectedIndex] : null;
    const name = explicitName!==undefined ? explicitName : (opt ? (opt.getAttribute('data-name')||'') : (DB.bom.find(b=>(b.finPartNo||'').trim()===finPartNo)||{}).finPartName || '');
    quoteItemsDraft[i].partNo = finPartNo;
    quoteItemsDraft[i].partName = name;
  }else{
    return;
  }
  const pnEl = document.getElementById('qiFinPartDisplay'+i);
  const pmEl = document.getElementById('qiPartName'+i);
  if(pnEl) pnEl.value = quoteItemsDraft[i].partNo;
  if(pmEl) pmEl.value = quoteItemsDraft[i].partName;
  if(finPartNo==='__other__' && pnEl) pnEl.focus();
  autoCalcRawMaterialCost(i);
}
function updateQuoteItemRow(i, field, val){
  if(!quoteItemsDraft[i]) return;
  // Keep the raw string as typed (don't coerce to a parsed float on every keystroke) —
  // coercing immediately was clobbering decimal points / cleared fields as the user typed,
  // which is why the price breakup looked "broken". calcQuoteItem() parses safely at calc-time.
  quoteItemsDraft[i][field] = val;
  refreshQuoteCalcs();
}
function refreshQuoteCalcs(){
  // Update only the computed/read-only fields in place, instead of rebuilding the whole
  // row's innerHTML on every keystroke — rebuilding was stealing input focus mid-type.
  quoteItemsDraft.forEach((it,i)=>{
    const row = document.querySelector(`#qtItemRows [data-qrow="${i}"]`);
    if(!row) return;
    const c = calcQuoteItem(it);
    const baseEl = row.querySelector('[data-calc="base"]');
    const rateEl = row.querySelector('[data-calc="unitRate"]');
    const totalEl = row.querySelector('[data-calc="lineTotal"]');
    const moqValEl = row.querySelector('[data-calc="moqValue"]');
    const machEl = row.querySelector('[data-calc="machining"]');
    const othersEl = row.querySelector('[data-calc="othersTotal"]');
    const rawMatDispEl = row.querySelector('[data-calc="rawMatDisplay"]');
    const ocBoxTotalEl = row.querySelector('.oc-box > div > span:last-child');
    const dcBoxTotalEl = row.querySelector('.dc-box > div > span:last-child');
    if(baseEl) baseEl.value = fmtMoney(c.base);
    if(rateEl) rateEl.value = c.unitRate.toFixed(2);
    if(totalEl) totalEl.value = fmtMoney(c.lineTotal);
    if(moqValEl) moqValEl.value = fmtMoney(c.moqValue);
    if(machEl) machEl.value = fmtMoney(parseFloat(it.machining)||0);
    if(othersEl) othersEl.value = fmtMoney(sumOthersCost(it));
    if(rawMatDispEl) rawMatDispEl.value = fmtMoney(parseFloat(it.rawMat)||0);
    if(ocBoxTotalEl) ocBoxTotalEl.textContent = `Total: ${fmtMoney(sumOthersCost(it))}`;
    if(dcBoxTotalEl) dcBoxTotalEl.textContent = `Total: ${fmtMoney(sumDevCost(it))}`;
    const w = calcMachiningWorking(it);
    const mcncEl = row.querySelector('[data-mcalc="cncTime"]');
    const mvmcEl = row.querySelector('[data-mcalc="vmcTime"]');
    const mcncActEl = row.querySelector('[data-mcalc="cncTimeActual"]');
    const mvmcActEl = row.querySelector('[data-mcalc="vmcTimeActual"]');
    const mcncCostEl = row.querySelector('[data-mcalc="cncCost"]');
    const mvmcCostEl = row.querySelector('[data-mcalc="vmcCost"]');
    const mtotCostEl = row.querySelector('[data-mcalc="totalCost"]');
    const meffAdjEl = row.querySelector('[data-mcalc="effAdj"]');
    const mnegoAdjEl = row.querySelector('[data-mcalc="negoAdj"]');
    const mtotalEl = row.querySelector('[data-mcalc="total"]');
    if(mcncActEl) mcncActEl.value = w.cncTimeActual;
    if(mvmcActEl) mvmcActEl.value = w.vmcTimeActual;
    if(mcncEl) mcncEl.value = w.cncTime;
    if(mvmcEl) mvmcEl.value = w.vmcTime;
    if(mcncCostEl) mcncCostEl.value = Math.round(w.cncCost);
    if(mvmcCostEl) mvmcCostEl.value = Math.round(w.vmcCost);
    if(mtotCostEl) mtotCostEl.value = w.totalCost.toFixed(2);
    if(meffAdjEl) meffAdjEl.value = w.effAdj.toFixed(2);
    if(mnegoAdjEl) mnegoAdjEl.value = w.negoAdj.toFixed(2);
    if(mtotalEl) mtotalEl.value = w.total.toFixed(2);
  });
  const grandEl = document.getElementById('qtGrandTotal');
  if(grandEl){
    const grand = quoteItemsDraft.reduce((a,it)=>a+calcQuoteItem(it).lineTotal,0);
    grandEl.textContent = fmtMoney(grand);
  }
}
// Updates a single Quotation ('q') or Actual ('a') cycle-time cell for one CNC/VMC
// operation row, then recomputes the Machining Cost (which is driven by Quotation time
// only — Actual time is not part of the Quotation cost, it feeds Production instead).
function updateMcwOpCell(i, kind, idx, part, val){
  if(!quoteItemsDraft[i]) return;
  ensureMcwOps(quoteItemsDraft[i]);
  const arr = kind==='cnc' ? quoteItemsDraft[i].mcwCncOps : quoteItemsDraft[i].mcwVmcOps;
  if(!arr[idx]) return;
  arr[idx][part] = val===''?'':Math.round(parseFloat(val))||0;
  computeMachiningCost(i);
}
// Adding/removing an operation row changes the row COUNT, so (unlike a plain value edit)
// this needs a full re-render of the item row, not just the lightweight field-value refresh
// that computeMachiningCost/refreshQuoteCalcs do. Both CNC and VMC arrays are always kept
// the same length so every OPN-n row shows all 4 columns together.
function addMcwOpRow(i){
  if(!quoteItemsDraft[i]) return;
  const it = quoteItemsDraft[i];
  ensureMcwOps(it);
  it.mcwCncOps.push(blankMcwOpRow());
  it.mcwVmcOps.push(blankMcwOpRow());
  computeMachiningCost(i);
  renderQuoteItemRows();
}
function removeMcwOpRow(i, idx){
  if(!quoteItemsDraft[i]) return;
  const it = quoteItemsDraft[i];
  ensureMcwOps(it);
  if(it.mcwCncOps.length<=1) return; // always keep at least one operation row
  it.mcwCncOps.splice(idx,1);
  if(it.mcwVmcOps[idx]!==undefined) it.mcwVmcOps.splice(idx,1);
  computeMachiningCost(i);
  renderQuoteItemRows();
}
// Renders the dynamic CNC/VMC Operation Cost table: one row per operation (the "OPN No."
// is the common field across the row) with four cells — CNC Quotation, CNC Actual, VMC
// Quotation, VMC Actual — all four side by side in the same row. Any number of rows can be
// added; both CNC and VMC columns always stay in sync on row count so OPN-n lines up.
function mcwOpsTableHtml(i, it){
  ensureMcwOps(it);
  const rows = Math.max(it.mcwCncOps.length, it.mcwVmcOps.length);
  while(it.mcwCncOps.length<rows) it.mcwCncOps.push(blankMcwOpRow());
  while(it.mcwVmcOps.length<rows) it.mcwVmcOps.push(blankMcwOpRow());
  const cell = (kind, idx, part, val) => `<input type="number" step="1" placeholder="sec" value="${val===0||val?Math.round(val):''}" style="width:100%;" oninput="updateMcwOpCell(${i},'${kind}',${idx},'${part}',this.value)">`;
  const rowsHtml = Array.from({length:rows}).map((_,idx)=>{
    const c = it.mcwCncOps[idx], v = it.mcwVmcOps[idx];
    return `<tr>
      <td class="pt-text ct-opn-col" style="font-weight:700; white-space:nowrap;">OPN-${idx+1}</td>
      <td class="ct-cnc-col">${cell('cnc',idx,'q',c.q)}</td>
      <td class="ct-cnc-col">${cell('cnc',idx,'a',c.a)}</td>
      <td class="ct-vmc-col">${cell('vmc',idx,'q',v.q)}</td>
      <td class="ct-vmc-col">${cell('vmc',idx,'a',v.a)}</td>
      <td style="text-align:center;">${rows>1?`<button type="button" class="btn small ghost" title="Remove this operation row" onclick="removeMcwOpRow(${i},${idx})">✕</button>`:''}</td>
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
  <button type="button" class="btn small ghost" onclick="addMcwOpRow(${i})">➕ Add Operation Row</button>`;
}
function renderQuoteItemRows(){
  const wrap = document.getElementById('qtItemRows');
  if(!wrap) return;
  wrap.innerHTML = quoteItemsDraft.map((it,i)=>quoteItemRowHtml(it,i)).join('') || '<div class="empty">No line items yet — click "Add Item" below.</div>';
  const totalEl = document.getElementById('qtGrandTotal');
  if(totalEl){
    const grand = quoteItemsDraft.reduce((a,it)=>a+calcQuoteItem(it).lineTotal,0);
    totalEl.textContent = fmtMoney(grand);
  }
}
// Others Cost section — one row per configured cost type (see OTHERS_COST_TYPES). Only
// checked items are counted in the totals and shown on print/PDF/customer copy. New cost
// types can be added later just by editing OTHERS_COST_TYPES — no markup changes needed here.
function othersCostSectionHtml(it,i){
  const items = ensureOthersCost(it);
  const rows = items.map(o=>{
    const isOther = o.key==='other';
    return `
    <div class="oc-row${o.enabled?' oc-on':''}" style="display:grid; grid-template-columns:22px 1fr 130px 1fr; gap:10px; align-items:center; padding:5px 4px; border-bottom:1px dashed var(--line-soft,#d9e0e6);">
      <input type="checkbox" ${o.enabled?'checked':''} onchange="updateOthersCostField(${i},'${o.key}','enabled',this.checked)" title="Enable ${esc(o.label)}">
      ${isOther
        ? `<input type="text" placeholder="Custom cost name" value="${esc(o.customLabel)}" ${o.enabled?'':'disabled'} oninput="updateOthersCostField(${i},'${o.key}','customLabel',this.value)" style="font-weight:600;">`
        : `<span style="font-weight:600; color:${o.enabled?'#a1700f':'var(--text-dim)'};">${esc(o.label)}</span>`}
      <input type="number" step="0.01" placeholder="Amount (₹)" value="${o.amount===0||o.amount?o.amount:''}" ${o.enabled?'':'disabled'} oninput="updateOthersCostField(${i},'${o.key}','amount',this.value)">
      <input type="text" placeholder="Remarks (optional)" value="${esc(o.remarks)}" ${o.enabled?'':'disabled'} oninput="updateOthersCostField(${i},'${o.key}','remarks',this.value)">
    </div>`;
  }).join('');
  return `
    <div class="oc-box" style="margin-top:10px; border:1px solid #ecd4a8; border-left:4px solid #c2860f; border-radius:4px; padding:8px 10px 10px; background:#fdf8ef;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; padding-bottom:6px; border-bottom:1px solid #ecd4a8;">
        <span class="fl" style="margin:0; color:#a1700f; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; font-size:11px;">➕ Others Cost <span class="hint" style="position:static; font-weight:400; text-transform:none; letter-spacing:0; font-size:9.5px; color:var(--text-dim);">(select only what applies to this item)</span></span>
        <span style="font-size:11.5px; font-weight:800; color:#a1700f;">Total: ${fmtMoney(sumOthersCost(it))}</span>
      </div>
      <div class="oc-rows-head" style="display:grid; grid-template-columns:22px 1fr 130px 1fr; gap:10px; padding:0 4px 4px; font-family:var(--mono); font-size:9.5px; text-transform:uppercase; letter-spacing:0.4px; color:#a1700f; opacity:.8;">
        <span></span><span>Cost Type</span><span>Amount (₹)</span><span>Remarks</span>
      </div>
      <div class="oc-rows">${rows}</div>
    </div>`;
}
function quoteItemRowHtml(it,i){
  const c = calcQuoteItem(it);
  const mw = calcMachiningWorking(it);
  return `
  <div class="qi-row" data-qrow="${i}">
    <div class="qi-row-head">
      <span class="qi-row-num">Item ${i+1}</span>
      <button class="btn danger small" onclick="removeQuoteItemRow(${i})">✕ Remove Item</button>
    </div>
    <div class="qsec qsec-slate">
      <div class="qsec-head"><span class="qsec-title">📦 Item Details</span></div>
      <div class="frow qflex">
      <div class="qw-wide"><label class="fl">Part No</label>
        <div class="fdd" id="qiFinPartDD${i}">
          <input type="text" id="qiFinPartDisplay${i}" value="${esc(it.partNo)}" placeholder="e.g. GM AJ 38 B594" onclick="toggleFddList('qiFinPartList${i}')" oninput="updateQuoteItemRow(${i},'partNo',this.value); autoFillFinPartName(${i},'quote')">
          <div class="fdd-list" id="qiFinPartList${i}" style="display:none;">
            <div class="fdd-item" onclick="setQuoteRowPartFromBOMCustom(${i},'','',this)">— pick part —</div>
            ${bomFinPartPickerItemsHtml(i)}
            <div class="fdd-item" onclick="setQuoteRowPartFromBOMCustom(${i},'__other__','',this)">Other (type manually)</div>
          </div>
        </div>
      </div>
      <div class="qw-wide"><label class="fl">Part Name</label><input id="qiPartName${i}" value="${esc(it.partName)}" placeholder="e.g. FLANGE FORGING" oninput="updateQuoteItemRow(${i},'partName',this.value)"></div>
      <div class="qw-narrow"><label class="fl">QTY (NOS)</label><input type="number" value="${it.qty||it.qty===0?it.qty:1}" oninput="updateQuoteItemRow(${i},'qty',this.value)"></div>
      <div class="qw-narrow"><label class="fl">Unit Rate (₹)</label><input data-calc="unitRate" value="${c.unitRate.toFixed(2)}" disabled></div>
      </div>
    </div>
    <div class="qsec qsec-amber">
      <div class="qsec-head"><span class="qsec-title">📐 Material Cost Working <span class="hint">(entered here — no dependency on Product Development or Purchase)</span></span></div>
      ${(()=>{
        const pre = (!it.rmMaterial && !it.rmShape && !it.rmSize && !it.cutLength && !it.vqPrice) ? rawMaterialDimsForFinPart(it.partNo) : null;
        const material = it.rmMaterial || (pre&&pre.material) || '';
        const shape = it.rmShape || (pre&&pre.shape) || '';
        const size = it.rmSize || (pre&&pre.size) || '';
        const grade = it.rmGrade || (pre&&pre.grade) || '';
        const density = grade ? densityForMaterialGrade(material, grade) : ((it.rmDensity===0||it.rmDensity) ? it.rmDensity : ((pre&&pre.density) || defaultDensityForMaterial(material||'Steel')));
        const cutVal = (it.cutLength===0||it.cutLength) ? it.cutLength : '';
        const vqVal = (it.vqPrice===0||it.vqPrice) ? it.vqPrice : ((pre&&pre.legacyVqPrice) || '');
        const isKnownSize = !!size && RAW_MATERIAL_SIZES.includes(size);
        const pieceWeight = it.pieceWeight || calcBarPieceWeightKg(shape, size, density, cutVal);
        return `
      <div class="frow qflex">
        <div class="dimcalc-field"><label class="fl">Material Name</label>
          <select id="qiMaterial${i}" onchange="onQuoteDimsMaterialChange(${i})">${barMaterialOptionsHtml(material)}</select></div>
        <div class="dimcalc-field"><label class="fl">Shape</label>
          <select id="qiShape${i}" onchange="recalcQuoteDims(${i})">${barShapeOptionsHtml(shape)}</select></div>
        <div class="dimcalc-field"><label class="fl">Size (mm; WxT for Flat)</label>
          <select id="qiSizeSel${i}" onchange="onQuoteSizeSelChange(${i})">${barSizeOptionsHtml(size)}</select>
          <input id="qiSize${i}" placeholder="e.g. 50x10" value="${esc(size)}" oninput="recalcQuoteDims(${i})" style="margin-top:6px; display:${(size && !isKnownSize)?'block':'none'};"></div>
        <div class="dimcalc-field"><label class="fl">Material Grade <span class="hint" style="position:static; font-size:9.5px;">(depends on Material Name)</span></label>
          <select id="qiGrade${i}" onchange="handleGradeSelectChange('qiGrade${i}','qiMaterial${i}', function(){recalcQuoteDims(${i})})">${materialGradeOptionsHtml(material, grade)}</select></div>
        <div class="dimcalc-field"><label class="fl">Density (g/cm³) <span class="hint" style="position:static; font-size:9.5px;">(auto, from Material Grade)</span></label>
          <input id="qiDensity${i}" value="${density}" disabled></div>
        <div class="dimcalc-field"><label class="fl">Cut Length (mm)</label>
          <input id="qiCutLength${i}" type="number" step="any" placeholder="e.g. 120" value="${esc(cutVal)}" oninput="recalcQuoteDims(${i})"></div>
        <div class="dimcalc-field"><label class="fl">Material Cost per Kg (₹)</label>
          ${(()=>{ const ref = latestPurchasePriceForMaterialGrade(material, grade); return ref ? `<span class="purchase-ref-hint" id="qiVqPriceHint${i}">📎 Latest Price: <span style="white-space:nowrap;">₹${ref.price}/Kg</span> | <span style="white-space:nowrap;">Date: ${ref.date?fmtDate(ref.date):'—'}</span></span>` : `<span class="purchase-ref-hint empty" id="qiVqPriceHint${i}">📎 No purchase entry found for this Material/Grade yet</span>`; })()}
          <input id="qiVqPrice${i}" type="number" step="0.01" placeholder="0.00" value="${esc(vqVal)}" oninput="recalcQuoteDims(${i})"></div>
        <div class="dimcalc-field"><label class="fl">Piece Weight (kg) <span class="hint" style="position:static; font-size:9.5px;">(auto)</span></label>
          <input id="qiPieceWeight${i}" value="${pieceWeight||'0'}" disabled style="font-weight:700;"></div>
        <div class="dimcalc-field rm-cost-field"><label class="fl">RM Cost per Piece (₹)</label>
          <input id="qiRawMat${i}" type="number" step="0.01" value="${it.rawMat===0||it.rawMat?it.rawMat:''}" oninput="updateQuoteItemRow(${i},'rawMat',this.value)">
          <div class="cost-row-sub" style="padding:0; margin-top:4px;"><span id="qiRawMatHint${i}">${(()=>{const rate=parseFloat(vqVal)||0; return (rate||pieceWeight) ? `= Material Cost per Kg ₹${rate} × Piece Wt ${pieceWeight} kg (auto-updates)` : 'Enter Cut Length & Material Cost per Kg above';})()}</span></div>
        </div>
      </div>
      `; })()}
    </div>
    <div class="frow" style="margin-top:10px; margin-bottom:0;">
      <label style="display:flex; align-items:center; gap:6px; font-weight:600; font-size:11.5px; color:#6935a3; cursor:pointer;">
        <input type="checkbox" ${it.devCostApplicable?'checked':''} onchange="updateDevCostApplicable(${i},this.checked)">
        Applicable for Development Cost
      </label>
    </div>
    ${devCostSectionHtml(it,i)}
    <div class="mcw-box" style="margin-top:10px; border:1px solid #cfe0ea; border-left:4px solid #1f5673; border-radius:4px; padding:8px 10px; background:#f5f9fb;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span class="fl" style="margin:0; color:#123a4e; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; font-size:11px;">⚙ Machining Cost Working</span>
        <button type="button" class="btn small amber" onclick="computeMachiningCost(${i})">🧮 Compute</button>
      </div>
      <div class="frow g3" style="margin-bottom:8px;">
        <div><label class="fl">CNC Rate (₹ / min)</label><input type="number" step="0.01" value="${it.mcwCncRate}" oninput="updateMachiningWorkingField(${i},'mcwCncRate',this.value)"></div>
        <div><label class="fl">VMC Rate (₹ / min)</label><input type="number" step="0.01" value="${it.mcwVmcRate}" oninput="updateMachiningWorkingField(${i},'mcwVmcRate',this.value)"></div>
        <div><label class="fl">Efficiency (%)</label><input type="number" step="0.01" value="${it.mcwEffPct}" oninput="updateMachiningWorkingField(${i},'mcwEffPct',this.value)"></div>
      </div>
      <div class="mcw-ops-wrap">
        ${mcwOpsTableHtml(i, it)}
      </div>
      <div class="frow g4" style="margin-top:6px; margin-bottom:8px;">
        <div><label class="fl">CNC Time — Quotation (sec) <span class="hint" style="position:static; font-size:9.5px;">(auto = sum of CNC Quotation column)</span></label><input data-mcalc="cncTime" value="${mw.cncTime}" disabled></div>
        <div><label class="fl">CNC Time — Actual (sec) <span class="hint" style="position:static; font-size:9.5px;">(→ feeds Production)</span></label><input data-mcalc="cncTimeActual" value="${mw.cncTimeActual}" disabled style="font-weight:700; color:#1f6b3b;"></div>
        <div><label class="fl">VMC Time — Quotation (sec) <span class="hint" style="position:static; font-size:9.5px;">(auto = sum of VMC Quotation column)</span></label><input data-mcalc="vmcTime" value="${mw.vmcTime}" disabled></div>
        <div><label class="fl">VMC Time — Actual (sec) <span class="hint" style="position:static; font-size:9.5px;">(→ feeds Production)</span></label><input data-mcalc="vmcTimeActual" value="${mw.vmcTimeActual}" disabled style="font-weight:700; color:#1f6b3b;"></div>
      </div>
      <div class="frow g5 mcw-breakdown-row" style="margin-top:8px;">
        <div><label class="fl">Cutting Cost (₹)</label><input type="number" step="0.01" value="${it.mcwCuttingCost===0||it.mcwCuttingCost?it.mcwCuttingCost:''}" oninput="updateMachiningWorkingField(${i},'mcwCuttingCost',this.value)"></div>
        <div><label class="fl">CNC Cost (₹)</label><input data-mcalc="cncCost" value="${Math.round(mw.cncCost)}" disabled></div>
        <div><label class="fl">VMC Cost (₹)</label><input data-mcalc="vmcCost" value="${Math.round(mw.vmcCost)}" disabled></div>
        <div><label class="fl">Grinding Cost (₹)</label><input type="number" step="0.01" value="${it.mcwGrindingCost===0||it.mcwGrindingCost?it.mcwGrindingCost:''}" oninput="updateMachiningWorkingField(${i},'mcwGrindingCost',this.value)"></div>
        <div><label class="fl">Rolling Cost (₹)</label><input type="number" step="0.01" value="${it.mcwRollingCost===0||it.mcwRollingCost?it.mcwRollingCost:''}" oninput="updateMachiningWorkingField(${i},'mcwRollingCost',this.value)"></div>
      </div>
      <div class="frow g5 mcw-total-row" style="margin-top:8px;">
        <div><label class="fl">Total Cost (₹)</label><input data-mcalc="totalCost" value="${mw.totalCost.toFixed(2)}" disabled></div>
        <div><label class="fl">Efficiency Adj. (₹)</label><input data-mcalc="effAdj" value="${mw.effAdj.toFixed(2)}" disabled></div>
        <div><label class="fl">Negotiation Markup (%) <span class="hint" style="position:static; font-size:9.5px;">(on Total Cost)</span></label><input type="number" step="0.01" value="${it.mcwNegoPct===0||it.mcwNegoPct?it.mcwNegoPct:''}" oninput="updateMachiningWorkingField(${i},'mcwNegoPct',this.value)"></div>
        <div><label class="fl">Negotiation Adj. (₹)</label><input data-mcalc="negoAdj" value="${mw.negoAdj.toFixed(2)}" disabled></div>
        <div><label class="fl">Machining Cost Total (₹)</label><input data-mcalc="total" value="${mw.total.toFixed(2)}" disabled></div>
      </div>
    </div>
    ${othersCostSectionHtml(it,i)}
    <div class="qsec qsec-teal">
      <div class="qsec-head"><span class="qsec-title">💰 Cost Summary</span></div>
      <div class="cost-row">
        <div class="cost-row-label">RM Cost per Piece (₹) <span class="hint">(from Material Cost Working above)</span></div>
        <div class="cost-row-value"><input data-calc="rawMatDisplay" value="${fmtMoney(parseFloat(it.rawMat)||0)}" disabled></div>
      </div>
      <div class="cost-row">
        <div class="cost-row-label">Machining Cost (₹) <span class="hint">(auto = Machining Cost Working total)</span></div>
        <div class="cost-row-value"><input data-calc="machining" value="${fmtMoney(parseFloat(it.machining)||0)}" disabled></div>
      </div>
      <div class="cost-row">
        <div class="cost-row-label">Others Cost (₹) <span class="hint">(sum of selected items below)</span></div>
        <div class="cost-row-value"><input data-calc="othersTotal" value="${fmtMoney(sumOthersCost(it))}" disabled></div>
      </div>
      <div class="cost-row cost-row-base">
        <div class="cost-row-label">Base Cost (₹)</div>
        <div class="cost-row-value"><input data-calc="base" value="${fmtMoney(c.base)}" disabled></div>
      </div>
    </div>
    <div class="qsec qsec-green">
      <div class="qsec-head"><span class="qsec-title">📊 Pricing, Margin &amp; Totals</span></div>
      <div class="frow qflex">
      <div class="qw-narrow"><label class="fl">Admin %</label><input type="number" step="0.01" value="${it.adminPct}" oninput="updateQuoteItemRow(${i},'adminPct',this.value)"></div>
      <div class="qw-narrow"><label class="fl">Inv. Carrying &amp; Rejection %</label><input type="number" step="0.01" value="${it.invPct}" oninput="updateQuoteItemRow(${i},'invPct',this.value)"></div>
      <div class="qw-narrow"><label class="fl">Packing %</label><input type="number" step="0.01" value="${it.packPct}" oninput="updateQuoteItemRow(${i},'packPct',this.value)"></div>
      <div class="qw-narrow"><label class="fl">Margin %</label><input type="number" step="0.01" value="${it.marginPct}" oninput="updateQuoteItemRow(${i},'marginPct',this.value)"></div>
      <div class="qw-narrow"><label class="fl">Transportation %</label><input type="number" step="0.01" value="${it.transPct}" oninput="updateQuoteItemRow(${i},'transPct',this.value)"></div>
      <div class="qw-narrow"><label class="fl">Line Total (₹)</label><input data-calc="lineTotal" value="${fmtMoney(c.lineTotal)}" disabled style="font-weight:800; color:#1f6b3b;"></div>
      <div class="qw-narrow"><label class="fl">MOQ QTY (NOS)</label><input type="number" value="${it.moqQty||it.moqQty===0?it.moqQty:1}" oninput="updateQuoteItemRow(${i},'moqQty',this.value)"></div>
      <div class="qw-narrow"><label class="fl">MOQ VALUE (₹)</label><input data-calc="moqValue" value="${fmtMoney(c.moqValue)}" disabled style="font-weight:800; color:#1f6b3b;"></div>
      </div>
    </div>
  </div>`;
}
function validateQuoteItems(){
  return quoteItemsDraft.filter(it=>(it.partNo||'').trim()!=='' && (it.partName||'').trim()!=='' && (parseFloat(it.qty)||0)>0)
    .map(it=>({...it, partNo:(it.partNo||'').trim(), partName:(it.partName||'').trim()}));
}
function quoteItemsMissingMapType(items){
  return (items||[]).filter(it=>it.mapType!=='BAR' && it.mapType!=='FORGING');
}
function setQuoteSubTab(t){ quotationSubTab = t; editingCustomerId=null; custContactsDraft=[]; render(); }
function renderQuotation(main){
  if(!subOK('quotation', quotationSubTab)) quotationSubTab = firstAllowedSub('quotation') || quotationSubTab;
  const list = DB.quotation.filter(x=>reportUnitMatch(x.unit));
  const custOpts = DB.customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const editing = editingQuoteId ? DB.quotation.find(x=>x.id===editingQuoteId) : null;
  if(!editing && !quoteItemsDraft.length && quoteViewId===null && editingQuoteId===null){
    // keep whatever draft exists; do nothing special
  }
  // Once a Customer is selected in the form above (New/Edit Quotation), the "Quotations"
  // list below is scoped to that customer only — other customers' quotations are hidden.
  const activeCustId = editing ? null : quoteDraftCustomerId;
  const activeCustName = (editing ? '' : (quoteDraftCustomerName||'')).trim().toLowerCase();
  main.innerHTML = `
    <div class="topbar"><div></div></div>
    ${flowline('quotation')}
    <div class="subtabs" style="margin-top:12px;">
      ${subOK('quotation','quotes')?`<button class="${quotationSubTab==='quotes'?'active':''}" onclick="setQuoteSubTab('quotes')">Sales Quotation</button>`:''}
      ${subOK('quotation','labour')?`<button class="${quotationSubTab==='labour'?'active':''}" onclick="setQuoteSubTab('labour')">Job Work Quotation</button>`:''}
      ${subOK('quotation','priceRevision')?`<button class="${quotationSubTab==='priceRevision'?'active':''}" onclick="setQuoteSubTab('priceRevision')">📈 Price Revision</button>`:''}
      ${subOK('quotation','customers')?`<button class="${quotationSubTab==='customers'?'active':''}" onclick="setQuoteSubTab('customers')">Customers</button>`:''}
    </div>
    <div id="qtSub" style="margin-top:12px;"></div>
  `;
  const sub = document.getElementById('qtSub');
  if(quotationSubTab==='customers') return renderCustomers(sub);
  if(quotationSubTab==='labour') return renderLabourQuotation(sub);
  if(quotationSubTab==='priceRevision') return renderPriceRevisionTab(sub);
  if(quoteHistorySearchOpen) return renderQuoteHistorySearch(sub);
  if(quoteCompareState) return renderCompareRevisions(sub);
  if(quoteRevisionViewRev) return renderQuoteRevisionView(sub);
  if(quoteHistoryId) return renderQuoteHistoryPanel(sub);
  if(quoteViewId) return renderQuoteReport(sub);
  if(editing) ensureQuoteRevisions(editing);
  const grand = quoteItemsDraft.reduce((a,it)=>a+calcQuoteItem(it).lineTotal,0);
  sub.innerHTML = `
    <div class="panel">
      <h3>${quoteRevisionMode?'Revise Quotation':(editing?'Edit Quotation':'New Quotation')} ${editing?`<span class="hint">${esc(quoteDisplayNo(editing))} ${quoteRevisionMode?'→ will become Rev-'+(editing.revNo+1):''}</span>`:''}</h3>
      ${quoteRevisionMode ? `
      <div class="frow g1" style="background:var(--panel2); border:1px solid var(--line); border-radius:var(--r-md); padding:12px 14px; margin-bottom:14px;">
        <div class="hint" style="margin-bottom:8px; text-transform:uppercase; letter-spacing:.4px;">Revision Details — required for the permanent audit trail</div>
      </div>
      <div class="frow g3">
        <div><label class="fl">Reason for Revision *</label><select id="qtRevReason"><option value="">— Select Reason —</option>${quoteRevisionReasonOptionsHtml('')}</select></div>
        <div><label class="fl">Customer Remarks</label><input id="qtRevCustRemarks" placeholder="e.g. Customer requested 5% price reduction"></div>
        <div><label class="fl">Internal Remarks</label><input id="qtRevIntRemarks" placeholder="Internal note for this revision"></div>
      </div>` : ''}
      ${bomFinPartDatalistHtml(editing?editing.customerId:quoteDraftCustomerId, editing?editing.customer:quoteDraftCustomerName)}
      <div class="frow g4">
        <div><label class="fl">Quote No</label><input id="qtNo" value="${editing?esc(editing.quoteNo):nextSeqNo(DB.quotation,'quoteNo','qt')+'-(2026-2027)'}" ${editing?'disabled title="Quote No never changes across revisions"':''}></div>
        <div><label class="fl">Quote Date</label><input id="qtDate" type="date" value="${editing?editing.quoteDate:today()}"></div>
        <div><label class="fl">Valid Until</label><input id="qtValid" type="date" value="${editing?editing.validUntil:today()}"></div>
        <div><label class="fl">Customer Name</label>
          ${customerPickerHtml('qtCustSelDD','qtCustSel', editing?editing.customerId:quoteDraftCustomerId, !!(editing&&!editing.customerId), 'setQuoteCustChange()')}
          <input id="qtCust" placeholder="Customer name" value="${editing?esc(editing.customer):esc(quoteDraftCustomerName)}" style="margin-top:6px; display:${editing || DB.customers.length===0 ?'block':'none'};" oninput="quoteDraftCustomerName=this.value; updateQuoteFinPartDatalist(); refreshAllQuoteRowPartPickers(); refreshQuoteListPanelOnly()">
        </div>
      </div>
      <div class="frow g3">
        <div><label class="fl">Status</label><select id="qtStatus"><option ${editing&&editing.status==='Draft'?'selected':''}>Draft</option><option ${editing&&editing.status==='Sent'?'selected':''}>Sent</option><option ${editing&&editing.status==='Accepted'?'selected':''}>Accepted</option><option ${editing&&editing.status==='Rejected'?'selected':''}>Rejected</option></select></div>
      </div>
      <!-- Customer GSTIN / HSN Code / Address are not asked for at quotation-creation stage — they're
           pulled automatically from the Customer Master record (single source of truth) and kept
           here as hidden fields purely so Print/View/Revision-diff, which already read #qtGstin /
           #qtHsn / #qtAddress, keep working unchanged. setQuoteCustChange() fills these in. -->
      <input type="hidden" id="qtGstin" value="${editing?esc(editing.gstin):esc((DB.customers.find(c=>c.id===quoteDraftCustomerId)||{}).gstin||'')}">
      <input type="hidden" id="qtHsn" value="${editing?esc(editing.hsn):esc((DB.customers.find(c=>c.id===quoteDraftCustomerId)||{}).hsn||'')}">
      <input type="hidden" id="qtAddress" value="${editing?esc(editing.address):esc((DB.customers.find(c=>c.id===quoteDraftCustomerId)||{}).address||'')}">

      <div class="section-total"><h3>Price Breakup — Line Items</h3><span class="hint">${quoteItemsDraft.length} item(s) — total <b id="qtGrandTotal">${fmtMoney(grand)}</b></span></div>
      <div id="qtItemRows">${quoteItemsDraft.map((it,i)=>quoteItemRowHtml(it,i)).join('') || '<div class="empty">No line items yet — click "Add Item" below.</div>'}</div>
      <button class="btn ghost" style="margin:8px 0 16px;" onclick="addQuoteItemRow()">+ Add Item</button>

      <div class="frow g1">
        <!-- Terms & Conditions isn't something the person filling out a quotation needs to see
             or edit — it's a fixed standard clause set that only ever needs to appear on the
             printed quotation. Kept as a hidden field (pre-filled with the standard text, or the
             saved text when editing) purely so Print / Revision-diff / everything downstream that
             already reads #qtTerms keeps working unchanged. -->
        <input type="hidden" id="qtTerms" value="${editing?esc(editing.terms):esc('1. Quotation Basis: This quotation is prepared based on the customer\'s approved drawing, specifications, and the agreed manufacturing operations.\n2. Payment Terms: Payment shall be made within 30 days from the date of invoice, unless otherwise mutually agreed in writing.\n3. Delivery Lead Time: Delivery will be within 4–5 weeks from the date of receipt of the customer\'s official Purchase Order (PO), subject to material availability.\n4. Quantity Variation: A quantity variation of ±10% against the Purchase Order quantity shall be considered acceptable and billable.')}">
      </div>
      <button class="btn amber" onclick="${editing?'saveEditQuote()':'addQuote()'}">💾 ${quoteRevisionMode?'Save as New Revision':(editing?'Save Changes':'Save Quotation')}</button>
      ${editing?`<button class="btn ghost" onclick="cancelEditQuote()">Cancel</button>`:''}
    </div>
    <div class="panel" id="qtListPanel">
      ${buildQuotationsListPanelHtml(list, activeCustId, activeCustName)}
    </div>
  `;
}
function buildQuotationsListPanelHtml(list, activeCustId, activeCustName){
  const custScopedList = (activeCustId || activeCustName) ? list.filter(q=>{
    if(activeCustId) return q.customerId===activeCustId;
    return (q.customer||'').trim().toLowerCase()===activeCustName;
  }) : list;
  const filteredList = custScopedList.filter(q=>{
    if(!qtFilterPartNo) return true;
    const needle = qtFilterPartNo.trim().toLowerCase();
    return (q.items||[]).some(it=>(it.partNo||'').toLowerCase().includes(needle));
  });
  return `
      <div class="section-total"><h3>Quotations <span class="hint">${(activeCustId||activeCustName)?`${filteredList.length} of ${custScopedList.length} total — filtered by customer`:`${filteredList.length} of ${list.length} total`}</span></h3>
        <button class="btn ghost small" onclick="openQuoteHistorySearch()">🔍 All Revisions</button>
        <button class="btn ghost small" onclick="goToPriceRevision()">📈 Price Revision</button>
      </div>
      <div class="frow g4" style="margin-bottom:14px;">
        <div><label class="fl">Filter — Part No <span class="hint" style="position:static; font-size:9.5px;">(type to search)</span></label>
          <input type="text" id="qtPartNoFilterInput" placeholder="e.g. NE121279" value="${esc(qtFilterPartNo)}" oninput="setQTFilter(this.value)"></div>
        <div style="align-self:end;">${qtFilterPartNo?`<button class="btn ghost" onclick="setQTFilter('')">✕ Clear Filter</button>`:''}</div>
      </div>
      <div class="grid-box">
        ${filteredList.slice().reverse().map(q=>{
          ensureQuoteRevisions(q);
          const items = q.items||[];
          const totVal = items.reduce((a,it)=>a+calcQuoteItem(it).lineTotal,0);
          const linkedPOs = custPOsForQuotation(q.id);
          const revCount = q.revisions.length;
          return `
          <div class="rec-card">
            <div class="rc-title">${esc(q.quoteNo)} <span class="pill rc-pill" style="background:var(--steel-dim); color:#fff;">Rev-${q.revNo}</span>${q.revNo>0?' <span class="hint">(Current Revision)</span>':''}</div>
            <div class="rc-sub">${esc(custDispByName(q.customer))||'—'} · ${fmtDate(q.quoteDate)}</div>
            <span class="pill rc-pill ${q.status==='Accepted'?'done':q.status==='Rejected'?'fail':q.status==='Sent'?'progress':'open'}">${q.status}</span>
            <div class="rc-row"><span class="k">Part No</span><span class="v">${esc(joinField(items,'partNo'))||'—'}</span></div>
            <div class="rc-row"><span class="k">Items</span><span class="v">${items.length} item(s)</span></div>
            <div class="rc-row"><span class="k">Value</span><span class="v">${fmtMoney(totVal)}</span></div>
            <div class="rc-row"><span class="k">Valid Until</span><span class="v">${fmtDate(q.validUntil)}</span></div>
            <div class="rc-row"><span class="k">Revisions</span><span class="v">${revCount} (Rev-0 → Rev-${q.revNo})</span></div>
            <div class="rc-row"><span class="k">Customer PO(s)</span><span class="v">${linkedPOs.length ? `${linkedPOs.length} linked` : 'None yet'}</span></div>
            <div class="rc-actions">
              <button class="btn small ghost" onclick="viewQuote('${q.id}')">View</button>
              <button class="btn small ghost" onclick="editQuote('${q.id}')">Edit</button>
              <button class="btn small" onclick="reviseQuote('${q.id}')">✎ Revise Quotation</button>
              <button class="btn small ghost" onclick="openQuoteHistory('${q.id}')">🕘 Revision History (${revCount})</button>
              <button class="btn small ghost" onclick="printQuotation('${q.id}')">🖨 Print</button>
              ${q.status!=='Accepted' && q.status!=='Rejected' ? `<button class="btn small" onclick="acceptQuotation('${q.id}')">✓ Accept</button><button class="btn small ghost" onclick="setQuoteStatus('${q.id}','Rejected')">✕ Reject</button>` : ''}
              <button class="btn small ghost" onclick="viewCustPOsForQuotation('${q.id}')">🔗 Customer PO${linkedPOs.length?` (${linkedPOs.length})`:''}</button>
              <button class="btn danger" onclick="deleteRow('quotation','${q.id}')">Del</button>
            </div>
          </div>`;}).join('') || (activeCustId||activeCustName ? '<div class="empty">No quotations found for this customer.</div>' : '<div class="empty">No quotations for this unit yet.</div>')}
      </div>`;
}
function refreshQuoteListPanelOnly(preserveFocus){
  const panel = document.getElementById('qtListPanel');
  if(!panel) return;
  let caret = null;
  if(preserveFocus){
    const active = document.activeElement;
    if(active && active.id==='qtPartNoFilterInput') caret = active.selectionStart;
  }
  const list = DB.quotation.filter(x=>reportUnitMatch(x.unit));
  const editing = editingQuoteId ? DB.quotation.find(x=>x.id===editingQuoteId) : null;
  const activeCustId = editing ? null : quoteDraftCustomerId;
  const activeCustName = (editing ? '' : (quoteDraftCustomerName||'')).trim().toLowerCase();
  panel.innerHTML = buildQuotationsListPanelHtml(list, activeCustId, activeCustName);
  if(caret!=null){
    const inp = document.getElementById('qtPartNoFilterInput');
    if(inp){ inp.focus(); inp.setSelectionRange(caret, caret); }
  }
}
function setQTFilter(val){
  qtFilterPartNo = val;
  refreshQuoteListPanelOnly(true);
}
function custPOsForQuotation(quotationId){
  return DB.custPO.filter(x=>x.quotationId===quotationId);
}
// Jumps from a Quotation straight into the Customer PO module, pre-filtered to only the
// Customer POs raised against this quotation — the live link between the two modules.
function viewCustPOsForQuotation(quotationId){
  custPOQuoteFilterId = quotationId;
  previousPage = currentPage;
  currentPage = 'custPO'; reportModuleOpen = null; editingCustPOId = null;
  render();
}
function clearCustPOQuoteFilter(){ custPOQuoteFilterId = null; render(); }
// Jumps from a Customer PO record back to its source Quotation (View mode).
function viewQuotationFromCustPO(quotationId){
  if(!quotationId) return;
  previousPage = currentPage;
  currentPage = 'quotation'; reportModuleOpen = null;
  quoteViewId = quotationId; editingQuoteId = null; quoteItemsDraft = [];
  render();
}
function syncQuoteItemsToProductDev(items, customerId, customerName){
  // Any Finished Part No where Bar/Forging was selected in a Quotation line item should
  // automatically appear as a mapping in Product Development (Bar Mapping / Forging Mapping),
  // scoped to the same Customer — no manual re-entry there.
  let added = 0;
  const custKey = (customerName||'').trim().toLowerCase();
  (items||[]).forEach(it=>{
    const finPartNo = (it.partNo||'').trim();
    const mapType = it.mapType==='BAR' || it.mapType==='FORGING' ? it.mapType : '';
    if(!finPartNo || !mapType) return; // only sync when Bar/Forging was actually selected in the quote row
    const exists = DB.bom.some(b=>{
      if((b.finPartNo||'').trim().toLowerCase()!==finPartNo.toLowerCase() || b.mapType!==mapType) return false;
      if(customerId) return b.customerId===customerId;
      return (b.customerName||'').trim().toLowerCase()===custKey;
    });
    if(exists) return;
    DB.bom.push({
      id:'bm'+Date.now()+Math.random().toString(36).slice(2,6),
      customerId: customerId||null, customerName: customerName||'',
      finPartNo, finPartName:(it.partName||'').trim(),
      mapType, prodLocation:'', uom:''
    });
    added++;
  });
  if(added) toast(added+' Part(s) auto-added to Product Development ('+(customerName||'—')+')');
}
