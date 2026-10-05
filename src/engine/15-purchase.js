/* ---------------- PURCHASE ---------------- */
function setPurchaseSubTab(t){ purchaseSubTab = t; editingPOId=null; editingSupplierId=null; editingItemId=null; poItemsDraft=[]; editingMRId=null; poUnitSel = (currentUnit==='Unit-1'||currentUnit==='Unit-2') ? currentUnit : ''; scForm=null; render(); }
function setPurchaseMainTab(t){ purchaseMainTab = t; render(); }
function setCGSubTab(t){ cgSubTab = t; editingCGPOId=null; cgPOItemsDraft=[]; editingCGItemId=null; editingCGSupplierId=null; editingCGReceivingId=null; cgrSelectedPOId=null; cgPOUnitSel = (currentUnit==='Unit-1'||currentUnit==='Unit-2') ? currentUnit : ''; render(); }
// User picks the Unit (Unit-1/Unit-2) on the New/Edit Purchase Order form — mandatory first step,
// same pattern as the Sales module's onSaleUnitChange. Nothing else on the PO depends on which
// Unit is picked (Suppliers/Items are common masters), so no other draft state needs resetting —
// just re-render to unlock the rest of the form.
function onPOUnitChange(selEl){
  poUnitSel = selEl.value;
  render();
}

const STANDARD_PO_TERMS = `TERMS & CONDITIONS:
EXCISE: Nil
TAX: Extra 18.0% (CGST+SGST)
DELIVERY: By you
FREIGHT: By you
VARIATION: 5% for qty and value
CRACK DETECTION: 100% CD free from all defects
TEST CERTIFICATE: Along with material (Mill TC required)
PAYMENT: 60 Days from the date of receipt of material
COMMISSIONING: Nil
PACKING & FORWARDING: Yours

REMARKS: TC should contain chemical and mechanical properties, each rod should have colour code and the same should be mentioned in TC. Supply receipt as per our terms and conditions. RM required without any quality issue like streaks, pit and line marks, without rust, without bent, also without surface & internal crack & without delivery. Length of rod needed: 3 meter.

NOTE: Any quality-rejected rods will be rejected immediately at your cost along with CD testing charges. Please ensure correct size of the rod & 100% without bend, before dispatch.`;

function loadStandardTerms(){
  const ta = document.getElementById('poTerms');
  if(!ta) return;
  ta.value = STANDARD_PO_TERMS;
  toast('Standard terms loaded');
}
function setItemsTypeTab(t){ itemsTypeTab = t; editingItemId=null; render(); }

function renderPurchase(main){
  if(!subOK('purchase', purchaseMainTab)) purchaseMainTab = firstAllowedSub('purchase') || purchaseMainTab;
  main.innerHTML = `
    <div class="topbar"><div></div></div>
    ${flowline('purchase')}
    <div class="subtabs" style="margin-top:12px;">
      ${subOK('purchase','materials')?`<button class="${purchaseMainTab==='materials'?'active':''}" onclick="setPurchaseMainTab('materials')">📦 Materials</button>`:''}
      ${subOK('purchase','capitalGoods')?`<button class="${purchaseMainTab==='capitalGoods'?'active':''}" onclick="setPurchaseMainTab('capitalGoods')">🏭 Capital Goods</button>`:''}
    </div>
    <div id="purchaseMainSub"></div>
  `;
  const sub = document.getElementById('purchaseMainSub');
  if(purchaseMainTab==='capitalGoods') return renderCapitalGoods(sub);
  return renderMaterialsPurchase(sub);
}

/* ---- Materials (the existing Purchase flow — unchanged, just relocated under its own
   "Materials" sub-tab so Purchase now cleanly shows only two sub-modules: Materials
   and Capital Goods). Every screen below (Purchase Orders, Material Receiving, Raw
   Material Suppliers, Items) is exactly as it was before. ---- */
function renderMaterialsPurchase(main){
  main.innerHTML = `
    <div class="subtabs" style="margin-top:12px;">
      <button class="${purchaseSubTab==='orders'?'active':''}" onclick="setPurchaseSubTab('orders')">Purchase Orders</button>
      <button class="${purchaseSubTab==='materialReceiving'?'active':''}" onclick="setPurchaseSubTab('materialReceiving')">📥 Material Receiving</button>
      <button class="${purchaseSubTab==='suppliers'?'active':''}" onclick="setPurchaseSubTab('suppliers')">Raw Material Suppliers</button>
      <button class="${purchaseSubTab==='subcontract'?'active':''}" onclick="setPurchaseSubTab('subcontract')">🏗️ Subcontractor</button>
      <button class="${purchaseSubTab==='items'?'active':''}" onclick="setPurchaseSubTab('items')">Items</button>
    </div>
    <div id="purchaseSub"></div>
  `;
  const sub = document.getElementById('purchaseSub');
  if(purchaseSubTab==='suppliers') return renderSuppliers(sub);
  if(purchaseSubTab==='subcontract') return renderSubcontractorMaster(sub);
  if(purchaseSubTab==='items') return renderItems(sub);
  if(purchaseSubTab==='materialReceiving') return renderMaterialReceiving(sub);
  return renderPurchaseOrders(sub);
}

/* ====================================================================================
   CAPITAL GOODS MODULE (Purchase → Capital Goods)
   A separate purchase flow, parallel to Materials, following the same basic process:
   Capital Goods PO → Receiving → Item Master → Supplier.
   Item Master and Supplier both reuse the SAME shared masters as Materials (DB.items /
   DB.suppliers) — exactly the pattern Maintenance and Tools already use — just scoped to
   their own type ('CAPITAL GOODS' / 'Capital Goods Supplier'), so nothing in the Materials
   Purchase Orders / Material Receiving / Raw Material Suppliers / Items screens changes.
   ==================================================================================== */
function renderCapitalGoods(main){
  main.innerHTML = `
    <div class="subtabs" style="margin-top:12px;">
      <button class="${cgSubTab==='orders'?'active':''}" onclick="setCGSubTab('orders')">Capital Goods PO</button>
      <button class="${cgSubTab==='receiving'?'active':''}" onclick="setCGSubTab('receiving')">📥 Receiving</button>
      <button class="${cgSubTab==='items'?'active':''}" onclick="setCGSubTab('items')">Item Master</button>
      <button class="${cgSubTab==='suppliers'?'active':''}" onclick="setCGSubTab('suppliers')">Supplier</button>
    </div>
    <div id="cgSub"></div>
  `;
  const sub = document.getElementById('cgSub');
  if(cgSubTab==='suppliers') return renderCGSuppliers(sub);
  if(cgSubTab==='items') return renderCGItems(sub);
  if(cgSubTab==='receiving') return renderCGReceiving(sub);
  return renderCGPO(sub);
}

/* ---- Capital Goods Item Master (shared DB.items, type:'CAPITAL GOODS') ---- */
function cgItemsList(){ return DB.items.filter(x=>x.type==='CAPITAL GOODS'); }
function cgItemOptionsHtml(sel){
  return cgItemsList().map(it=>`<option value="${it.id}" ${sel===it.id?'selected':''} data-code="${esc(it.code)}" data-name="${esc(it.name)}" data-uom="${esc(it.uom)}" data-rate="${it.marketPrice||0}">${esc(it.code)} — ${esc(it.name)}</option>`).join('');
}
function nextCGItemCode(){ return nextSeqNo(cgItemsList(), 'code', 'CG'); }
function renderCGItems(main){
  const list = cgItemsList();
  const editing = editingCGItemId ? DB.items.find(x=>x.id===editingCGItemId) : null;
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <h3>${editing?'Edit Capital Goods Item':'New Capital Goods Item'} <span class="hint" style="position:static; font-size:9.5px;">(machine / capital equipment — shared Item Master)</span></h3>
      <div class="frow g4">
        <div><label class="fl">Item Code <span class="hint" style="position:static; font-size:9.5px;">(auto-generated)</span></label><input id="cgiCode" value="${editing?esc(editing.code):nextCGItemCode()}" disabled></div>
        <div style="grid-column:2/4;"><label class="fl">Item Name</label><input id="cgiName" placeholder="e.g. CNC Turning Center" value="${editing?esc(editing.name):''}"></div>
        <div><label class="fl">UOM</label><select id="cgiUom"><option value="">— select —</option><option value="Nos" ${editing&&editing.uom==='Nos'?'selected':''}>Nos</option><option value="Set" ${editing&&editing.uom==='Set'?'selected':''}>Set</option><option value="Unit" ${editing&&editing.uom==='Unit'?'selected':''}>Unit</option></select></div>
      </div>
      <div class="frow g2">
        <div><label class="fl">Description / Specification</label><input id="cgiDesc" placeholder="Model / specification" value="${editing?esc(editing.material):''}"></div>
        <div><label class="fl">Standard Rate (₹)</label><input id="cgiRate" type="number" placeholder="0.00" value="${editing?editing.marketPrice:''}"></div>
      </div>
      <button class="btn amber" onclick="${editing?'saveEditCGItem()':'addCGItem()'}">${editing?'💾 Save Changes':'💾 Save Item'}</button>
      ${editing?`<button class="btn ghost" onclick="cancelEditCGItem()">Cancel</button>`:''}
    </div>
    <div class="panel">
      <div class="section-total"><h3>Capital Goods Items <span class="hint">${list.length} total</span></h3></div>
      <div class="grid-box">
        ${list.slice().reverse().map(it=>`
          <div class="rec-card">
            <div class="rc-title">${esc(it.code)||'—'}</div>
            <div class="rc-sub">${esc(it.name)}</div>
            <div class="rc-row"><span class="k">Description</span><span class="v">${esc(it.material)||'—'}</span></div>
            <div class="rc-row"><span class="k">UOM</span><span class="v">${esc(it.uom)||'—'}</span></div>
            <div class="rc-row"><span class="k">Standard Rate</span><span class="v">${fmtMoney(it.marketPrice)}</span></div>
            <div class="rc-actions">
              <button class="btn small ghost" onclick="editCGItem('${it.id}')">Edit</button>
              <button class="btn danger" onclick="deleteRow('items','${it.id}')">Del</button>
            </div>
          </div>`).join('') || '<div class="empty">No Capital Goods items added yet.</div>'}
      </div>
    </div>
  `;
}
function addCGItem(){
  if(!requireAdminOffice()) return;
  const name = document.getElementById('cgiName').value.trim();
  if(!name){ toast('Item Name is required'); return; }
  DB.items.push({
    id:'it'+Date.now(), no:uid('it'), code:nextCGItemCode(), name, type:'CAPITAL GOODS',
    uom:document.getElementById('cgiUom').value.trim(), material:document.getElementById('cgiDesc').value.trim(),
    vqPrice:0, marketPrice:parseFloat(document.getElementById('cgiRate').value)||0,
    marketPriceEffDate:today(), marketPriceHistory:[]
  });
  saveDB(); toast('Capital Goods item added'); render();
}
function editCGItem(id){ editingCGItemId = id; render(); }
function cancelEditCGItem(){ editingCGItemId = null; render(); }
function saveEditCGItem(){
  if(!requireAdminOffice()) return;
  const it = DB.items.find(x=>x.id===editingCGItemId);
  if(!it) return;
  const name = document.getElementById('cgiName').value.trim();
  if(!name){ toast('Item Name is required'); return; }
  it.name=name; it.uom=document.getElementById('cgiUom').value.trim();
  it.material=document.getElementById('cgiDesc').value.trim();
  it.marketPrice=parseFloat(document.getElementById('cgiRate').value)||0;
  editingCGItemId = null;
  saveDB(); toast('Capital Goods item updated'); render();
}

/* ---- Capital Goods Supplier (shared DB.suppliers, type:'Capital Goods Supplier') ---- */
function cgSuppliersList(){ return DB.suppliers.filter(s=>s.type==='Capital Goods Supplier'); }
function cgSupplierOptionsHtml(sel){
  return cgSuppliersList().map(s=>`<option value="${esc(s.name)}" data-gstin="${esc(s.gstin)}" ${sel===s.name?'selected':''}>${esc(s.name)}</option>`).join('');
}
function renderCGSuppliers(main){
  const list = cgSuppliersList();
  const editing = editingCGSupplierId ? DB.suppliers.find(x=>x.id===editingCGSupplierId) : null;
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <h3>${editing?'Edit Capital Goods Supplier':'New Capital Goods Supplier'}</h3>
      <div class="frow g4">
        <div><label class="fl">Supplier Name</label><input id="cgsName" placeholder="e.g. Precision Machine Tools Pvt Ltd" value="${editing?esc(editing.name):''}"></div>
        <div><label class="fl">GSTIN</label><input id="cgsGstin" placeholder="33XXXXX..." value="${editing?esc(editing.gstin):''}"></div>
        <div><label class="fl">Phone</label><input id="cgsPhone" placeholder="+91 ..." value="${editing?esc(editing.phone):''}"></div>
        <div><label class="fl">Contact Person</label><input id="cgsContact" placeholder="Name" value="${editing?esc(editing.contact):''}"></div>
      </div>
      <div class="frow g2">
        <div><label class="fl">Email</label><input id="cgsEmail" type="email" placeholder="e.g. sales@supplier.com" value="${editing?esc(editing.email):''}"></div>
        <div><label class="fl">Address</label><textarea id="cgsAddress" class="addr-box" placeholder="Supplier address">${editing?esc(editing.address):''}</textarea></div>
      </div>
      <button class="btn amber" onclick="${editing?'saveEditCGSupplier()':'addCGSupplier()'}">${editing?'💾 Save Changes':'💾 Save Supplier'}</button>
      ${editing?`<button class="btn ghost" onclick="cancelEditCGSupplier()">Cancel</button>`:''}
    </div>
    <div class="panel">
      <div class="section-total"><h3>Capital Goods Suppliers <span class="hint">${list.length} total</span></h3></div>
      <div class="grid-box">
        ${list.slice().reverse().map(s=>`
          <div class="rec-card">
            <div class="rc-title">${esc(s.name)}</div>
            <div class="rc-sub">🏭 Capital Goods Supplier${s.gstin?' · '+esc(s.gstin):''}</div>
            <div class="rc-row"><span class="k">Phone</span><span class="v">${esc(s.phone)||'—'}</span></div>
            <div class="rc-row"><span class="k">Email</span><span class="v">${esc(s.email)||'—'}</span></div>
            <div class="rc-row"><span class="k">Contact</span><span class="v">${esc(s.contact)||'—'}</span></div>
            <div class="rc-row"><span class="k">Address</span><span class="v">${esc(s.address)||'—'}</span></div>
            <div class="rc-actions">
              <button class="btn small ghost" onclick="editCGSupplier('${s.id}')">Edit</button>
              <button class="btn danger" onclick="deleteRow('suppliers','${s.id}')">Del</button>
            </div>
          </div>`).join('') || '<div class="empty">No Capital Goods suppliers added yet.</div>'}
      </div>
    </div>
  `;
}
function addCGSupplier(){
  if(!requireAdminOffice()) return;
  const name = document.getElementById('cgsName').value.trim();
  if(!name){ toast('Supplier name is required'); return; }
  DB.suppliers.push({
    id:'sp'+Date.now(), no:uid('sp'), name, type:'Capital Goods Supplier',
    gstin:document.getElementById('cgsGstin').value.trim(),
    phone:document.getElementById('cgsPhone').value.trim(),
    email:document.getElementById('cgsEmail').value.trim(),
    contact:document.getElementById('cgsContact').value.trim(),
    address:document.getElementById('cgsAddress').value.trim()
  });
  saveDB(); toast('Capital Goods Supplier added'); render();
}
function editCGSupplier(id){ editingCGSupplierId = id; render(); }
function cancelEditCGSupplier(){ editingCGSupplierId = null; render(); }
function saveEditCGSupplier(){
  if(!requireAdminOffice()) return;
  const s = DB.suppliers.find(x=>x.id===editingCGSupplierId);
  if(!s) return;
  const name = document.getElementById('cgsName').value.trim();
  if(!name){ toast('Supplier name is required'); return; }
  s.name=name; s.type=s.type||'Capital Goods Supplier'; s.gstin=document.getElementById('cgsGstin').value.trim();
  s.phone=document.getElementById('cgsPhone').value.trim();
  s.email=document.getElementById('cgsEmail').value.trim();
  s.contact=document.getElementById('cgsContact').value.trim();
  s.address=document.getElementById('cgsAddress').value.trim();
  editingCGSupplierId = null;
  saveDB(); toast('Capital Goods Supplier updated'); render();
}

/* ---- Capital Goods PO (same basic structure/process as the Materials Purchase Order screen:
   Unit → Supplier → Line Items picked from the Capital Goods Item Master → Terms) ---- */
function renderCGPO(main){
  const list = DB.capitalGoodsPO.filter(x=>reportUnitMatch(x.unit));
  const editing = editingCGPOId ? DB.capitalGoodsPO.find(x=>x.id===editingCGPOId) : null;
  const draftTotal = cgPOItemsDraft.reduce((a,r)=>a+((r.qty||0)*(r.rate||0)),0);
  const unitLocked = currentUnit==='Unit-1' || currentUnit==='Unit-2';
  if(unitLocked) cgPOUnitSel = currentUnit;
  const noUnitYet = !cgPOUnitSel;
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <h3>${editing?'Edit Capital Goods PO':'New Capital Goods PO'} ${editing?`<span class="hint">${esc(editing.poNo)}</span>`:''}</h3>
      <div class="frow g5">
        <div><label class="fl">Unit <span class="hint" style="position:static; color:var(--red);">*required</span></label>
          <select id="cgpoUnitSel" onchange="onCGPOUnitChange(this)" ${unitLocked?'disabled':''}>
            <option value="">— select Unit —</option>
            <option value="Unit-1" ${cgPOUnitSel==='Unit-1'?'selected':''}>Unit 1 (G51-I)</option>
            <option value="Unit-2" ${cgPOUnitSel==='Unit-2'?'selected':''}>Unit 2 (S-48)</option>
          </select>
          ${unitLocked?`<input type="hidden" id="cgpoUnitLocked" value="${esc(currentUnit)}">`:''}
        </div>
        <div><label class="fl">PO No</label><input id="cgpoNo" value="${editing?esc(editing.poNo):nextSeqNo(DB.capitalGoodsPO,'poNo','cgpo')}"></div>
        <div><label class="fl">PO Date</label><input id="cgpoDate" type="date" value="${editing?editing.poDate:today()}"></div>
        <div><label class="fl">Supplier</label>
          <select id="cgpoSupplierSel" onchange="onCGPOSupplierChange()" ${noUnitYet?'disabled':''}>
            <option value="">— select Capital Goods supplier —</option>${cgSupplierOptionsHtml(editing?editing.supplier:'')}
            <option value="__other__">Other (type manually)</option>
          </select>
          <input id="cgpoSupplier" placeholder="${noUnitYet?'— select Unit above first —':'Supplier name'}" value="${editing?esc(editing.supplier):''}" ${noUnitYet?'disabled':''} style="margin-top:6px; display:${editing || cgSuppliersList().length===0 ?'block':'none'};">
        </div>
        <div><label class="fl">Supplier GSTIN</label><input id="cgpoGstin" placeholder="33XXXXX..." value="${editing?esc(editing.gstin):''}" ${noUnitYet?'disabled':''}></div>
      </div>

      <div class="section-total"><h3>Line Items</h3><span class="hint">${noUnitYet?'select the Unit above first':`${cgPOItemsDraft.length} item(s) — total ${fmtMoney(draftTotal)}`}</span></div>
      <div id="cgpoItemRows">
        ${cgPOItemsDraft.map((r,i)=>`
          <div class="po-row" data-row="${i}">
            <div class="po-row-head"><span class="po-row-num">Item ${i+1}</span></div>
            <div class="frow g5">
              <div><label class="fl">Item <span class="hint" style="position:static; font-size:9.5px;">(pick from Capital Goods Item Master)</span></label>
                <select onchange="fillCGPOItem(${i},this)" style="margin-bottom:6px;">
                  <option value="">— pick item —</option>${cgItemOptionsHtml(r.itemId)}
                  <option value="__other__" ${r.itemId==='__other__'?'selected':''}>Other (type manually)</option>
                </select>
                <input placeholder="Item name" value="${esc(r.itemName)}" oninput="updateCGPOItemRow(${i},'itemName',this.value)"></div>
              <div><label class="fl">UOM</label><select onchange="updateCGPOItemRow(${i},'uom',this.value)"><option value="">— select —</option><option value="Nos" ${r.uom==='Nos'?'selected':''}>Nos</option><option value="Set" ${r.uom==='Set'?'selected':''}>Set</option><option value="Unit" ${r.uom==='Unit'?'selected':''}>Unit</option></select></div>
              <div><label class="fl">Qty</label><input type="number" value="${r.qty||''}" oninput="updateCGPOItemRow(${i},'qty',this.value)"></div>
              <div><label class="fl">Rate (₹)</label><input type="number" value="${r.rate||''}" oninput="updateCGPOItemRow(${i},'rate',this.value)"></div>
              <div><label class="fl">Value</label><input value="${fmtMoney((r.qty||0)*(r.rate||0))}" disabled></div>
            </div>
            <div class="frow" style="justify-content:flex-end;"><button class="btn danger" onclick="removeCGPOItemRow(${i})">✕ Remove Row</button></div>
          </div>`).join('') || `<div class="empty">${noUnitYet?'Select the Unit above first.':'No line items yet — click "Add Item Row" below.'}</div>`}
      </div>
      <button class="btn ghost" style="margin:8px 0 16px;" onclick="addCGPOItemRow()" ${noUnitYet?'disabled':''}>+ Add Item Row</button>

      <div class="frow g2">
        <div><label class="fl">Terms / Remarks</label><textarea id="cgpoTerms" class="terms-box" placeholder="Payment terms, warranty, installation/commissioning, freight, etc.">${editing?esc(editing.terms):''}</textarea></div>
      </div>
      <button class="btn amber" onclick="${editing?'saveEditCGPO()':'addCGPO()'}" ${noUnitYet?'disabled':''}>💾 ${editing?'Save Changes':'Save Capital Goods PO'}</button>
      ${editing?`<button class="btn ghost" onclick="cancelEditCGPO()">Cancel</button>`:''}
    </div>
    <div class="panel">
      <div class="section-total"><h3>Capital Goods Purchase Orders <span class="hint">${list.length} total</span></h3></div>
      <div class="grid-box">
        ${list.slice().reverse().map(p=>`
          <div class="rec-card">
            <div class="rc-title">${esc(p.poNo)}</div>
            <div class="rc-sub">${esc(p.supplier)}</div>
            <span class="pill rc-pill ${p.status==='Received'?'done':'open'}">${p.status}</span>
            <div class="rc-row"><span class="k">PO Date</span><span class="v">${fmtDate(p.poDate)||'—'}</span></div>
            <div class="rc-row"><span class="k">Items</span><span class="v">${(p.items||[]).length}</span></div>
            <div class="rc-row"><span class="k">Total Value</span><span class="v">${fmtMoney((p.items||[]).reduce((a,r)=>a+((r.qty||0)*(r.rate||0)),0))}</span></div>
            <div class="rc-actions">
              <button class="btn small ghost" onclick="editCGPO('${p.id}')">Edit</button>
              <button class="btn small ghost" onclick="printCGPO('${p.id}')">Print</button>
              <button class="btn danger" onclick="deleteRow('capitalGoodsPO','${p.id}')">Del</button>
            </div>
          </div>`).join('') || '<div class="empty">No Capital Goods Purchase Orders yet.</div>'}
      </div>
    </div>
  `;
}
function onCGPOUnitChange(sel){ cgPOUnitSel = sel.value; render(); }
function onCGPOSupplierChange(){
  const sel = document.getElementById('cgpoSupplierSel');
  const manual = document.getElementById('cgpoSupplier');
  const gstin = document.getElementById('cgpoGstin');
  if(sel.value==='__other__'){ manual.style.display='block'; manual.value=''; manual.focus(); gstin.value=''; }
  else if(sel.value===''){ manual.style.display = cgSuppliersList().length? 'none':'block'; }
  else{
    manual.style.display='none'; manual.value = sel.value;
    const opt = sel.options[sel.selectedIndex];
    gstin.value = opt.dataset.gstin || '';
  }
}
function addCGPOItemRow(){ cgPOItemsDraft.push({itemId:'', itemCode:'', itemName:'', uom:'', qty:'', rate:''}); render(); }
function removeCGPOItemRow(i){ cgPOItemsDraft.splice(i,1); render(); }
function updateCGPOItemRow(i, field, val){
  if(!cgPOItemsDraft[i]) return;
  cgPOItemsDraft[i][field] = (field==='qty'||field==='rate') ? (parseFloat(val)||0) : val;
  render();
}
function fillCGPOItem(i, sel){
  if(!cgPOItemsDraft[i]) return;
  if(sel.value==='__other__' || sel.value===''){
    cgPOItemsDraft[i].itemId = sel.value;
    if(sel.value==='__other__'){ cgPOItemsDraft[i].itemCode=''; cgPOItemsDraft[i].itemName=''; }
    render(); return;
  }
  const opt = sel.options[sel.selectedIndex];
  cgPOItemsDraft[i].itemId = sel.value;
  cgPOItemsDraft[i].itemCode = opt.dataset.code || '';
  cgPOItemsDraft[i].itemName = opt.dataset.name || '';
  if(!cgPOItemsDraft[i].uom) cgPOItemsDraft[i].uom = opt.dataset.uom || '';
  if(!cgPOItemsDraft[i].rate) cgPOItemsDraft[i].rate = parseFloat(opt.dataset.rate)||0;
  render();
}
function readCGPOForm(){
  const unitSel = document.getElementById('cgpoUnitSel');
  const unit = unitSel ? unitSel.value : currentUnit;
  const poNo = document.getElementById('cgpoNo').value.trim();
  const supplier = document.getElementById('cgpoSupplier').value.trim();
  if(!unit){ toast('Select the Unit first'); return null; }
  if(!supplier){ toast('Supplier required'); return null; }
  if(cgPOItemsDraft.length===0){ toast('Add at least one line item'); return null; }
  for(const r of cgPOItemsDraft){ if(!r.itemName){ toast('Every line item needs an Item'); return null; } }
  return {
    unit, poNo, poDate: document.getElementById('cgpoDate').value, supplier,
    gstin: document.getElementById('cgpoGstin').value.trim(),
    items: cgPOItemsDraft.map(r=>({itemId:r.itemId, itemCode:r.itemCode, itemName:r.itemName, uom:r.uom, qty:r.qty, rate:r.rate})),
    terms: document.getElementById('cgpoTerms').value.trim()
  };
}
function addCGPO(){
  if(!requireWorkingUnit()) return;
  const data = readCGPOForm();
  if(!data) return;
  DB.capitalGoodsPO.push(Object.assign({id:'cgpo'+Date.now(), status:'Open'}, data));
  cgPOItemsDraft=[];
  saveDB(); toast('Capital Goods PO saved'); render();
}
function editCGPO(id){
  const p = DB.capitalGoodsPO.find(x=>x.id===id);
  if(!p) return;
  editingCGPOId = id; cgPOUnitSel = p.unit; cgPOItemsDraft = (p.items||[]).map(r=>Object.assign({},r));
  render();
}
function cancelEditCGPO(){ editingCGPOId = null; cgPOItemsDraft=[]; render(); }
function saveEditCGPO(){
  const p = DB.capitalGoodsPO.find(x=>x.id===editingCGPOId);
  if(!p) return;
  const data = readCGPOForm();
  if(!data) return;
  Object.assign(p, data);
  editingCGPOId = null; cgPOItemsDraft=[];
  saveDB(); toast('Capital Goods PO updated'); render();
}
function printCGPO(id){
  const p = DB.capitalGoodsPO.find(x=>x.id===id);
  if(!p) return;
  const headers = ['Item Code','Item Name','UOM','Qty','Rate','Value'];
  const rows = (p.items||[]).map(r=>[esc(r.itemCode)||'—', esc(r.itemName), esc(r.uom)||'—', esc(r.qty), fmtMoney(r.rate), fmtMoney((r.qty||0)*(r.rate||0))]);
  printReport('Capital Goods Purchase Order — '+p.poNo, headers, rows, {barLeft:`Unit: ${esc(unitLabel(p.unit))}`, barRight:`Supplier: ${esc(p.supplier)}`});
}

/* ---- Capital Goods Receiving (mirrors Material Receiving: log arrival against an Open
   Capital Goods PO). This IS the "linked to Item Master" step — every receiving entry carries
   itemId back to the shared Item Master, and the Supplier stays linked via the PO, the same
   way the Materials flow links Receiving → Item Master → Supplier. ---- */
function renderCGReceiving(main){
  const list = DB.capitalGoodsReceiving.filter(x=>reportUnitMatch(x.unit));
  const poOptions = DB.capitalGoodsPO.filter(x=>reportUnitMatch(x.unit) && x.status!=='Received');
  const editing = editingCGReceivingId ? DB.capitalGoodsReceiving.find(x=>x.id===editingCGReceivingId) : null;
  const po = editing ? DB.capitalGoodsPO.find(p=>p.id===editing.poId) : (cgrSelectedPOId ? DB.capitalGoodsPO.find(p=>p.id===cgrSelectedPOId) : null);
  let itemOptionsHtml = '<option value="">— select PO first —</option>';
  if(po){
    itemOptionsHtml = '<option value="">— select item —</option>' + (po.items||[]).map((r,idx)=>`<option value="${idx}" ${editing&&editing.itemIdx===idx?'selected':''}>${esc(r.itemCode)||''} ${esc(r.itemName)} (Qty: ${esc(r.qty)})</option>`).join('');
  }
  main.innerHTML = `
    <div class="panel" style="margin-top:12px;">
      <h3>${editing?'Edit':'Log'} Capital Goods Receiving</h3>
      <div class="frow g3">
        <div><label class="fl">Capital Goods PO</label>
          <select id="cgrPoSel" onchange="onCGRPOChange(this)" ${editing?'disabled':''}>
            <option value="">— select Open PO —</option>
            ${poOptions.map(p=>`<option value="${p.id}" ${po&&po.id===p.id?'selected':''}>${esc(p.poNo)} — ${esc(p.supplier)}</option>`).join('')}
          </select>
        </div>
        <div><label class="fl">Item</label><select id="cgrItemSel" ${editing?'disabled':''}>${itemOptionsHtml}</select></div>
        <div><label class="fl">Date Received</label><input id="cgrDate" type="date" value="${editing?editing.date:today()}"></div>
      </div>
      <div class="frow g3">
        <div><label class="fl">Qty Received</label><input id="cgrQty" type="number" value="${editing?editing.qtyReceived:''}"></div>
        <div><label class="fl">Invoice No</label><input id="cgrInvNo" value="${editing?esc(editing.invoiceNo):''}"></div>
        <div><label class="fl">Invoice Date</label><input id="cgrInvDate" type="date" value="${editing?esc(editing.invoiceDate):''}"></div>
      </div>
      <div class="frow g2">
        <div><label class="fl">Received By</label><input id="cgrBy" placeholder="Name" value="${editing?esc(editing.receivedBy):''}"></div>
        <div><label class="fl">Remarks</label><input id="cgrRemarks" value="${editing?esc(editing.remarks):''}"></div>
      </div>
      <button class="btn amber" onclick="${editing?'saveEditCGReceiving()':'addCGReceiving()'}">💾 ${editing?'Save Changes':'Save Receiving Entry'}</button>
      ${editing?`<button class="btn ghost" onclick="cancelEditCGReceiving()">Cancel</button>`:''}
    </div>
    <div class="panel">
      <h3>Capital Goods Receiving Records <span class="hint">${list.length} entries</span></h3>
      <div class="grid-box">
        ${list.slice().reverse().map(r=>{
          const p = DB.capitalGoodsPO.find(x=>x.id===r.poId);
          return `<div class="rec-card">
            <div class="rc-title">${esc(r.itemCode)||'—'} — ${esc(r.itemName)}</div>
            <div class="rc-sub">PO: ${p?esc(p.poNo):'—'} · ${fmtDate(r.date)}</div>
            <div class="rc-row"><span class="k">Supplier</span><span class="v">${p?esc(p.supplier):'—'}</span></div>
            <div class="rc-row"><span class="k">Qty Received</span><span class="v">${esc(r.qtyReceived)}</span></div>
            <div class="rc-row"><span class="k">Invoice No</span><span class="v">${esc(r.invoiceNo)||'—'}</span></div>
            <div class="rc-row"><span class="k">Received By</span><span class="v">${esc(r.receivedBy)||'—'}</span></div>
            <div class="rc-row"><span class="k">Remarks</span><span class="v">${esc(r.remarks)||'—'}</span></div>
            <div class="rc-actions">
              <button class="btn small ghost" onclick="editCGReceiving('${r.id}')">Edit</button>
              <button class="btn danger" onclick="deleteRow('capitalGoodsReceiving','${r.id}')">Del</button>
            </div>
          </div>`;
        }).join('') || '<div class="empty">No Capital Goods receiving records yet.</div>'}
      </div>
    </div>
  `;
}
function onCGRPOChange(sel){ cgrSelectedPOId = sel.value || null; render(); }
function addCGReceiving(){
  if(!requireWorkingUnit()) return;
  const poId = document.getElementById('cgrPoSel').value;
  const itemIdx = document.getElementById('cgrItemSel').value;
  if(!poId){ toast('Select a Capital Goods PO first'); return; }
  if(itemIdx===''){ toast('Select the item being received'); return; }
  const p = DB.capitalGoodsPO.find(x=>x.id===poId);
  if(!p) return;
  const row = p.items[itemIdx];
  const qtyReceived = parseFloat(document.getElementById('cgrQty').value)||0;
  if(qtyReceived<=0){ toast('Enter Qty Received'); return; }
  DB.capitalGoodsReceiving.push({
    id:'cgr'+Date.now(), poId, unit:p.unit, date:document.getElementById('cgrDate').value,
    itemId: row.itemId, itemIdx: parseInt(itemIdx,10), itemCode: row.itemCode, itemName: row.itemName, uom: row.uom,
    qtyOrdered: row.qty, qtyReceived,
    invoiceNo: document.getElementById('cgrInvNo').value.trim(), invoiceDate: document.getElementById('cgrInvDate').value,
    receivedBy: document.getElementById('cgrBy').value.trim(), remarks: document.getElementById('cgrRemarks').value.trim()
  });
  // Mark the PO Received once every line item has at least one receiving entry against it.
  const receivedIdxs = new Set(DB.capitalGoodsReceiving.filter(x=>x.poId===poId).map(x=>x.itemIdx));
  if((p.items||[]).every((_,idx)=>receivedIdxs.has(idx))) p.status='Received';
  cgrSelectedPOId = null;
  saveDB(); toast('Capital Goods receiving entry saved — linked to Item Master'); render();
}
function editCGReceiving(id){ editingCGReceivingId = id; render(); }
function cancelEditCGReceiving(){ editingCGReceivingId = null; render(); }
function saveEditCGReceiving(){
  const r = DB.capitalGoodsReceiving.find(x=>x.id===editingCGReceivingId);
  if(!r) return;
  const qtyReceived = parseFloat(document.getElementById('cgrQty').value)||0;
  if(qtyReceived<=0){ toast('Enter Qty Received'); return; }
  r.date = document.getElementById('cgrDate').value;
  r.qtyReceived = qtyReceived;
  r.invoiceNo = document.getElementById('cgrInvNo').value.trim();
  r.invoiceDate = document.getElementById('cgrInvDate').value;
  r.receivedBy = document.getElementById('cgrBy').value.trim();
  r.remarks = document.getElementById('cgrRemarks').value.trim();
  editingCGReceivingId = null;
  saveDB(); toast('Capital Goods receiving entry updated'); render();
}

function renderPurchaseOrders(main){
  const list = DB.purchase.filter(x=>reportUnitMatch(x.unit));
  const supplierOpts = DB.suppliers.map(s=>`<option value="${esc(s.name)}" data-gstin="${esc(s.gstin)}">${esc(s.name)}</option>`).join('');
  const editing = editingPOId ? DB.purchase.find(x=>x.id===editingPOId) : null;
  const draftTotal = poItemsDraft.reduce((a,r)=>a+((r.qty||0)*(r.rate||0)),0);
  // Unit is locked to the Active Unit whenever a specific production unit (not Admin Office) is
  // active — Admin Office must explicitly pick Unit-1 or Unit-2 per PO, same mandatory-first-step
  // pattern as the Sales module's Unit field.
  const unitLocked = currentUnit==='Unit-1' || currentUnit==='Unit-2';
  if(unitLocked) poUnitSel = currentUnit;
  const noUnitYet = !poUnitSel;
  main.innerHTML = `
    <div class="panel">
      <h3>${editing?'Edit Purchase Order':'New Purchase Order'} ${editing?`<span class="hint">${esc(editing.poNo)}</span>`:''}</h3>
      <div class="frow g5">
        <div><label class="fl">Unit <span class="hint" style="position:static; color:var(--red);">*required</span></label>
          <select id="poUnitSel" onchange="onPOUnitChange(this)" ${unitLocked?'disabled':''}>
            <option value="">— select Unit —</option>
            <option value="Unit-1" ${poUnitSel==='Unit-1'?'selected':''}>Unit 1 (G51-I)</option>
            <option value="Unit-2" ${poUnitSel==='Unit-2'?'selected':''}>Unit 2 (S-48)</option>
          </select>
          ${unitLocked?`<input type="hidden" id="poUnitLocked" value="${esc(currentUnit)}">`:''}
        </div>
        <div><label class="fl">PO No</label><input id="poNo" value="${editing?esc(editing.poNo):nextSeqNo(DB.purchase,'poNo','po')}"></div>
        <div><label class="fl">PO Date</label><input id="poDate" type="date" value="${editing?editing.poDate:today()}"></div>
        <div><label class="fl">Raw Material Supplier</label>
          <select id="poSupplierSel" onchange="onPOSupplierChange()" ${noUnitYet?'disabled':''}>
            <option value="">— select raw material supplier —</option>${supplierOpts}
            <option value="__other__">Other (type manually)</option>
          </select>
          <input id="poSupplier" placeholder="${noUnitYet?'— select Unit above first —':'Supplier name'}" value="${editing?esc(editing.supplier):''}" ${noUnitYet?'disabled':''} style="margin-top:6px; display:${editing || DB.suppliers.length===0 ?'block':'none'};">
        </div>
        <div><label class="fl">Supplier GSTIN</label><input id="poGstin" placeholder="33XXXXX..." value="${editing?esc(editing.gstin):''}" ${noUnitYet?'disabled':''}></div>
      </div>

      <div class="section-total"><h3>Line Items</h3><span class="hint">${noUnitYet?'select the Unit above first':`${poItemsDraft.length} item(s) — total ${fmtMoney(draftTotal)}`}</span></div>
      <div id="poItemRows">
        ${poItemsDraft.map((r,i)=>`
          <div class="po-row" data-row="${i}">
            <div class="po-row-head"><span class="po-row-num">Item ${i+1}</span></div>
            <div class="frow ${r.itemType==='BAR'?'g6':'g5'}">
              <div><label class="fl">Item Type <span class="hint" style="position:static; font-size:9.5px;">(required)</span></label>
                <select onchange="updatePOItemType(${i},this.value)">
                  <option value="">— select —</option>
                  <option value="BAR" ${r.itemType==='BAR'?'selected':''}>Bar</option>
                  <option value="FORGING" ${r.itemType==='FORGING'?'selected':''}>Forging</option>
                </select>
              </div>
              ${r.itemType==='BAR' ? `
              <div><label class="fl">Material <span class="hint" style="position:static; font-size:9.5px;">(required)</span></label>
                <select onchange="updatePOItemRow(${i},'material',this.value)">${barMaterialOptionsHtml(r.material||'Steel')}</select></div>
              <div><label class="fl">Shape <span class="hint" style="position:static; font-size:9.5px;">(required)</span></label>
                <select onchange="updatePOItemRow(${i},'shape',this.value)">${barShapeOptionsHtml(r.shape||'Round Bar')}</select></div>
              <div><label class="fl">Type <span class="hint" style="position:static; font-size:9.5px;">(from Item Master)</span></label>
                <select onchange="updatePOItemRow(${i},'barType',this.value)">${bomBarTypeListOptionsHtml(r.barType)}</select></div>
              <div><label class="fl">Size <span class="hint" style="position:static; font-size:9.5px;">(required — from Item Master)</span></label>
                <select onchange="updatePOItemRow(${i},'size',this.value)">${bomBarSizeListOptionsHtml(r.size)}</select></div>
              <div><label class="fl">Grade <span class="hint" style="position:static; font-size:9.5px;">(required — from Item Master)</span></label>
                <select onchange="updatePOItemRow(${i},'grade',this.value)">${bomBarGradeListOptionsHtml(r.grade)}</select></div>
              ` : r.itemType==='FORGING' ? `
              <div><label class="fl">Part No <span class="hint" style="position:static; font-size:9.5px;">(required — pick from Items list)</span></label>
                <select onchange="fillPOForgingPart(${i},this)" style="margin-bottom:6px;">
                  <option value="">— pick forging part —</option>${itemMasterOptionsHtmlByType('FORGING')}
                  <option value="__other__" ${r.partNo && !DB.items.find(x=>x.type==='FORGING'&&x.code===r.partNo)?'selected':''}>Other (type manually)</option>
                </select>
                <input placeholder="e.g. 2013452" value="${esc(r.partNo)}" oninput="updatePOItemRow(${i},'partNo',this.value)"></div>
              <div><label class="fl">Part Name <span class="hint" style="position:static; font-size:9.5px;">(required)</span></label><input placeholder="e.g. END CLEVIS" value="${esc(r.partName)}" oninput="updatePOItemRow(${i},'partName',this.value)"></div>
              <div><label class="fl">Qty</label><input type="number" value="${r.qty||''}" oninput="updatePOItemRow(${i},'qty',this.value)"></div>
              <div><label class="fl">Rate (₹)</label><input type="number" value="${r.rate||''}" oninput="updatePOItemRow(${i},'rate',this.value)"></div>
              ` : `
              <div style="grid-column: span 4; align-self:end; padding-bottom:8px;" class="hint">Select Bar or Forging above to enter part details.</div>
              `}
            </div>
            ${r.itemType==='BAR' ? `
            <div class="frow g6" style="margin-bottom:2px;">
              <div></div><div></div>
              <div>${poSuggestHintHtml(i, r, editing?editing.id:null)}</div>
              <div></div><div></div><div></div>
            </div>
            <div class="frow g5">
              <div><label class="fl">UOM <span class="hint" style="position:static; font-size:9.5px;">(required)</span></label><select onchange="updatePOItemRow(${i},'uom',this.value)"><option value="">— select —</option><option value="Nos" ${r.uom==='Nos'?'selected':''}>Nos</option><option value="Kg" ${r.uom==='Kg'?'selected':''}>Kg</option><option value="Mtr" ${r.uom==='Mtr'?'selected':''}>Mtr</option></select></div>
              <div><label class="fl">Qty</label><input type="number" value="${r.qty||''}" oninput="updatePOItemRow(${i},'qty',this.value)"></div>
              <div><label class="fl">Rate (₹)</label><input type="number" value="${r.rate||''}" oninput="updatePOItemRow(${i},'rate',this.value)"></div>
              <div><label class="fl">Value</label><input value="${fmtMoney((r.qty||0)*(r.rate||0))}" disabled></div>
              <div class="fl-actions"><button class="btn danger" style="width:100%;" onclick="removePOItemRow(${i})">✕ Remove Row</button></div>
            </div>` : `
            <div class="frow g4">
              <div><label class="fl">UOM <span class="hint" style="position:static; font-size:9.5px;">(required)</span></label><select onchange="updatePOItemRow(${i},'uom',this.value)"><option value="">— select —</option><option value="Nos" ${r.uom==='Nos'?'selected':''}>Nos</option><option value="Kg" ${r.uom==='Kg'?'selected':''}>Kg</option><option value="Mtr" ${r.uom==='Mtr'?'selected':''}>Mtr</option></select></div>
              ${r.itemType==='FORGING' ? `<div><label class="fl">Value</label><input value="${fmtMoney((r.qty||0)*(r.rate||0))}" disabled></div><div></div>` : `<div></div><div></div>`}
              <div class="fl-actions"><button class="btn danger" style="width:100%;" onclick="removePOItemRow(${i})">✕ Remove Row</button></div>
            </div>`}
          </div>`).join('') || `<div class="empty">${noUnitYet?'Select the Unit above first.':'No line items yet — click "Add Item Row" below.'}</div>`}
      </div>
      <button class="btn ghost" style="margin:8px 0 16px;" onclick="addPOItemRow()" ${noUnitYet?'disabled':''}>+ Add Item Row</button>

      <div class="frow g2">
        <div><label class="fl">Terms / Remarks <button class="btn ghost small" type="button" style="margin-left:8px;" onclick="loadStandardTerms()">📋 Load Standard Terms</button></label><textarea id="poTerms" class="terms-box" placeholder="Payment 60 days, freight by supplier, CD 100% etc.">${editing?esc(editing.terms):''}</textarea></div>
        <div><label class="fl">Status</label><select id="poStatus"><option ${editing&&editing.status==='Open'?'selected':''}>Open</option><option ${editing&&editing.status==='Closed'?'selected':''}>Closed</option></select></div>
      </div>
      <button class="btn amber" onclick="${editing?'saveEditPO()':'addPO()'}" ${noUnitYet?'disabled':''}>${editing?'💾 Save Changes':'💾 Save Purchase Order'}</button>
      ${editing?`<button class="btn ghost" onclick="cancelEditPO()">Cancel</button>`:''}
    </div>
    <div class="panel">
      <div class="section-total"><h3>Purchase Orders <span class="hint">${list.length} total</span></h3></div>
      <div class="grid-box">
        ${list.slice().reverse().map(p=>{
          const items = p.items||[];
          const totQty = items.reduce((a,r)=>a+(r.qty||0),0);
          const totVal = items.reduce((a,r)=>a+(r.qty||0)*(r.rate||0),0);
          const itemSummary = items.map(r=>esc(r.desc)).join(', ') || '—';
          const qtyByUom = {};
          items.forEach(r=>{ const u=r.uom||'—'; qtyByUom[u]=(qtyByUom[u]||0)+(r.qty||0); });
          const qtyDisplay = Object.keys(qtyByUom).length
            ? Object.entries(qtyByUom).map(([u,q])=>`${q}${u!=='—'?' '+esc(u):''}`).join(' + ')
            : totQty;
          return `
          <div class="rec-card">
            <div class="rc-title">${esc(p.poNo)}</div>
            <div class="rc-sub">${esc(p.supplier)||'—'} · ${fmtDate(p.poDate)}</div>
            <span class="pill rc-pill ${p.status==='Open'?'open':'done'}">${p.status}</span>
            <div class="rc-row"><span class="k">Items</span><span class="v" title="${itemSummary}">${items.length} item(s)</span></div>
            <div class="rc-row"><span class="k">Qty</span><span class="v">${qtyDisplay}</span></div>
            <div class="rc-row"><span class="k">Value</span><span class="v">${fmtMoney(totVal)}</span></div>
            <div class="rc-actions">
              <button class="btn small ghost" onclick="editPO('${p.id}')">Edit</button>
              <button class="btn small ghost" onclick="printPO('${p.id}')">🖨 Print</button>
              <button class="btn small ghost" onclick="togglePOStatus('${p.id}')">Toggle</button>
              <button class="btn danger" onclick="deleteRow('purchase','${p.id}')">Del</button>
            </div>
          </div>`;}).join('') || '<div class="empty">No purchase orders for this unit yet.</div>'}
      </div>
    </div>
  `;
}
function onPOSupplierChange(){
  const sel = document.getElementById('poSupplierSel');
  const manual = document.getElementById('poSupplier');
  const gstin = document.getElementById('poGstin');
  if(sel.value==='__other__'){ manual.style.display='block'; manual.value=''; manual.focus(); gstin.value=''; }
  else if(sel.value===''){ manual.style.display = DB.suppliers.length? 'none':'block'; }
  else{
    manual.style.display='none'; manual.value = sel.value;
    const opt = sel.options[sel.selectedIndex];
    gstin.value = opt.dataset.gstin || '';
  }
}
function addPOItemRow(){
  poItemsDraft.push({itemType:'', partNo:'', partName:'', material:'Steel', shape:'Round Bar', barType:'Black Bar', size:'', grade:'', qty:'', rate:'', uom:''});
  render();
}
function updatePOItemType(i, val){
  if(!poItemsDraft[i]) return;
  poItemsDraft[i].itemType = val;
  render();
}
function removePOItemRow(i){
  poItemsDraft.splice(i,1);
  render();
}
function fillPOForgingPart(i, sel){
  if(!poItemsDraft[i]) return;
  const row = document.querySelector(`#poItemRows [data-row="${i}"]`);
  if(sel.value==='__other__' || sel.value===''){
    if(sel.value==='__other__'){
      poItemsDraft[i].partNo=''; poItemsDraft[i].partName='';
      if(row){ const inputs = row.querySelectorAll('input'); if(inputs[0]) inputs[0].value=''; if(inputs[1]) inputs[1].value=''; if(inputs[0]) inputs[0].focus(); }
    }
    return;
  }
  const opt = sel.options[sel.selectedIndex];
  const code = opt.dataset.code || '';
  const name = opt.dataset.name || '';
  const rate = parseFloat(opt.dataset.rate)||0; // Today's Market Price
  const vqPrice = parseFloat(opt.dataset.vqprice)||0; // VIPL Quotation Price
  const uom = opt.dataset.uom || '';
  poItemsDraft[i].partNo = code;
  poItemsDraft[i].partName = name;
  if(!poItemsDraft[i].rate) poItemsDraft[i].rate = rate;
  if(!poItemsDraft[i].uom && uom) poItemsDraft[i].uom = uom;
  if(row){
    const inputs = row.querySelectorAll('input');
    if(inputs[0]) inputs[0].value = code;
    if(inputs[1]) inputs[1].value = name;
    row.querySelectorAll('.fl').forEach(lbl=>{
      if(/Rate/.test(lbl.textContent)){
        const inp = lbl.parentElement.querySelector('input');
        if(inp && rate>0 && !inp.value) inp.value = rate;
        let hint = lbl.parentElement.querySelector('.poVqHint');
        if(!hint){ hint = document.createElement('span'); hint.className='poVqHint hint'; hint.style.cssText='display:block; font-size:9px;'; lbl.parentElement.appendChild(hint); }
        hint.textContent = vqPrice ? `Material Cost per Kg: ₹${vqPrice} · Market: ₹${rate}` : `Market Price ₹${rate} (Material Cost per Kg not set)`;
      }
      if(/UOM/.test(lbl.textContent)){
        const inp = lbl.parentElement.querySelector('input');
        if(inp && uom && !inp.value) inp.value = uom;
      }
    });
    const inputsAll = row.querySelectorAll('input');
    const valInput = inputsAll[inputsAll.length-1];
    if(valInput) valInput.value = fmtMoney((poItemsDraft[i].qty||0)*(poItemsDraft[i].rate||0));
  }
}
function updatePOItemRow(i, field, val){
  if(!poItemsDraft[i]) return;
  poItemsDraft[i][field] = (field==='qty'||field==='rate') ? (parseFloat(val)||0) : val;
  const row = document.querySelector(`#poItemRows [data-row="${i}"]`);
  if(row){
    if(['material','shape','barType','size','grade'].includes(field) && poItemsDraft[i].itemType==='BAR'){
      const r = poItemsDraft[i];
      const {partNo} = buildBarPartNoName(r.material, r.shape, r.size, r.grade, r.barType);
      const match = DB.items.find(x=>x.type==='BAR' && x.code===partNo);
      if(match && match.marketPrice>0 && !poItemsDraft[i].rate){
        poItemsDraft[i].rate = match.marketPrice;
        row.querySelectorAll('.fl').forEach(lbl=>{
          if(/Rate/.test(lbl.textContent)){
            const inp = lbl.parentElement.querySelector('input');
            if(inp && !inp.value) inp.value = match.marketPrice;
          }
        });
      }
      if(match && match.uom && !poItemsDraft[i].uom){
        poItemsDraft[i].uom = match.uom;
        row.querySelectorAll('.fl').forEach(lbl=>{
          if(/UOM/.test(lbl.textContent)){
            const inp = lbl.parentElement.querySelector('input');
            if(inp && !inp.value) inp.value = match.uom;
          }
        });
      }
      const boxEl = document.getElementById('poSuggestBox'+i);
      if(boxEl && boxEl.parentElement) boxEl.parentElement.innerHTML = poSuggestHintHtml(i, r, editingPOId);
    }
    const inputs = row.querySelectorAll('input');
    const valInput = inputs[inputs.length-1];
    if(valInput) valInput.value = fmtMoney((poItemsDraft[i].qty||0)*(poItemsDraft[i].rate||0));
  }
}



/* ---- Raw Material Suppliers submodule (Purchase) ---- */

/* ============================================================
   Material Receiving submodule (Purchase)
   Workflow: Purchase Order → Material Receiving → Receiving Inspection → Stores Stock
   Logging a Material Receiving entry here auto-creates a matching (Pending) Receiving
   Inspection entry — no re-entry for the Quality team. Only when Quality marks that
   entry "Pass" does the accepted qty flow automatically into Stores Stock; Fail/Hold
   never touch Stores.
============================================================ */
function renderMaterialReceiving(main){
  const list = DB.materialReceiving.filter(x=>reportUnitMatch(x.unit));
  const poOptions = DB.purchase.filter(x=>reportUnitMatch(x.unit));
  const editing = editingMRId ? DB.materialReceiving.find(x=>x.id===editingMRId) : null;
  const po = editing ? DB.purchase.find(p=>p.id===editing.poId) : null;
  let itemOptionsHtml = '<option value="">— select PO first —</option>';
  if(po){
    const items = po.items||[];
    itemOptionsHtml = '<option value="">— select item —</option>' + items.map((r,i)=>`<option value="${i}" ${r.desc===editing.item?'selected':''}>${esc(r.desc)} (Qty ${r.qty||0})</option>`).join('');
  }
  main.innerHTML = `
    <div class="panel" style="margin-top:0;">
      <h3>📥 ${editing?'Edit Material Receiving Entry':'New Material Receiving Entry'} <span class="hint">Log material as soon as it physically arrives — this auto-creates the Receiving Inspection entry, nothing to re-type</span></h3>

      <div class="frow g3">
        <div><label class="fl">Against PO</label><select id="mrPO" onchange="onMRPOChange()">
          <option value="">— select —</option>${poOptions.map(p=>`<option value="${p.id}" ${editing&&editing.poId===p.id?'selected':''}>${esc(p.poNo)} — ${esc(p.supplier)}</option>`).join('')}
        </select></div>
        <div><label class="fl">Item</label><select id="mrItem" onchange="onMRItemChange()">${itemOptionsHtml}</select></div>
        <div><label class="fl">Date Received</label><input id="mrDate" type="date" value="${editing?esc(editing.date):today()}"></div>
      </div>

      <div id="mrPODetails">${materialReceivingPODetailsHtml(po, editing)}</div>

      <div class="frow g4">
        <div><label class="fl">Qty Received</label><input id="mrQtyRec" type="number" step="any" placeholder="Qty physically received" value="${editing?editing.qtyReceived:''}"></div>
        <div><label class="fl">Supplier Invoice No</label><input id="mrInvNo" placeholder="e.g. INV-1023" value="${editing?esc(editing.invoiceNo):''}"></div>
        <div><label class="fl">Invoice Date</label><input id="mrInvDate" type="date" value="${editing&&editing.invoiceDate?esc(editing.invoiceDate):''}"></div>
        <div><label class="fl">Received By</label><input id="mrRecBy" placeholder="Stores person name" value="${editing?esc(editing.receivedBy):''}"></div>
      </div>
      <div class="frow"><div><textarea id="mrRemarks" placeholder="Packing condition, visible damage, short/excess qty, etc.">${editing?esc(editing.remarks):''}</textarea></div></div>

      <div class="rowactions" style="justify-content:flex-start; margin-top:14px;">
        <button class="btn amber" onclick="addMaterialReceiving()">${editing?'💾 Update & Re-sync Inspection':'💾 Save &amp; Send to Inspection →'}</button>
        ${editing?`<button class="btn ghost" onclick="cancelEditMR()">Cancel Edit</button>`:''}
      </div>
    </div>

    <div class="panel">
      <h3>Material Receiving Log <span class="hint">${list.length} entries — each one auto-transferred to Receiving Inspection</span></h3>
      <div class="grid-box">
        ${list.slice().reverse().map(m=>{
          const p = DB.purchase.find(x=>x.id===m.poId);
          const g = m.grId ? DB.receiving.find(x=>x.id===m.grId) : null;
          return `<div class="rec-card">
            <div class="rc-title">${esc(m.item)||esc(m.partNo)||'—'}</div>
            <div class="rc-sub">PO: ${p?esc(p.poNo):'—'} · ${fmtDate(m.date)}${m.itemType?' · '+(m.itemType==='BAR'?'Bar':'Forging'):''}</div>
            <span class="pill ${g? (g.result==='Pass'?'pass':g.result==='Fail'?'fail':'open') : 'open'}">${g? '🔬 Inspection: '+g.result : '⏳ Pending Transfer'}</span>
            <div class="rc-row"><span class="k">Qty Ord./Rec.</span><span class="v">${m.qtyOrdered} / ${m.qtyReceived}</span></div>
            <div class="rc-row"><span class="k">UOM</span><span class="v">${esc(m.uom)||'—'}</span></div>
            <div class="rc-row"><span class="k">Received By</span><span class="v">${esc(m.receivedBy)||'—'}</span></div>
            <div class="rc-row"><span class="k">Supplier Invoice</span><span class="v">${esc(m.invoiceNo)||'—'}${m.invoiceDate?' ('+fmtDate(m.invoiceDate)+')':''}</span></div>
            <div class="rc-actions">
              <span class="hint" style="position:static;">${g?'✓ In Receiving Inspection':''}</span>
              <button class="btn small ghost" onclick="editMaterialReceiving('${m.id}')">Edit</button>
              <button class="btn danger" onclick="deleteRow('materialReceiving','${m.id}')">Del</button>
            </div>
          </div>`;
        }).join('') || '<div class="empty">No material receiving entries yet — log incoming material here as soon as it arrives against a PO.</div>'}
      </div>
    </div>
  `;
}
function materialReceivingPODetailsHtml(po, editing){
  if(!po) return '';
  return `<div class="mini-card" style="margin-bottom:2px;">
    <div class="mc-row"><span class="mc-k">Supplier</span><span class="mc-v">${esc(po.supplier)||'—'}</span></div>
    <div class="mc-row"><span class="mc-k">PO Date</span><span class="mc-v">${fmtDate(po.poDate)||'—'}</span></div>
    <div class="mc-row"><span class="mc-k">Item Type</span><span class="mc-v">${editing&&editing.itemType==='BAR'?'Bar':editing&&editing.itemType==='FORGING'?'Forging':'—'}</span></div>
    <div class="mc-row"><span class="mc-k">Qty Ordered</span><span class="mc-v">${editing?editing.qtyOrdered:'—'}${editing&&editing.uom?' '+esc(editing.uom):''}</span></div>
  </div>`;
}
function onMRPOChange(){
  const poId = document.getElementById('mrPO').value;
  const itemSel = document.getElementById('mrItem');
  const po = DB.purchase.find(p=>p.id===poId);
  const items = po ? (po.items||[]) : [];
  itemSel.innerHTML = '<option value="">— select item —</option>' + items.map((r,i)=>`<option value="${i}">${esc(r.desc)} (Qty ${r.qty||0})</option>`).join('');
  document.getElementById('mrPODetails').innerHTML = '';
}
function onMRItemChange(){
  const poId = document.getElementById('mrPO').value;
  const po = DB.purchase.find(p=>p.id===poId);
  const itemSel = document.getElementById('mrItem');
  const idx = itemSel.value;
  const item = (po && po.items && po.items[idx]) ? po.items[idx] : null;
  const pseudoEditing = item ? {itemType:item.itemType, qtyOrdered:item.qty, uom:item.uom} : null;
  document.getElementById('mrPODetails').innerHTML = materialReceivingPODetailsHtml(po, pseudoEditing);
  if(item && !document.getElementById('mrQtyRec').value) document.getElementById('mrQtyRec').value = item.qty||'';
}
function addMaterialReceiving(){
  if(!requireWorkingUnit()) return;
  const poId = document.getElementById('mrPO').value;
  if(!poId){ toast('Select a PO'); return; }
  const po = DB.purchase.find(p=>p.id===poId);
  const itemSel = document.getElementById('mrItem');
  const itemIdx = itemSel.value;
  const editingRow = editingMRId ? DB.materialReceiving.find(x=>x.id===editingMRId) : null;
  const poItem = (po && po.items && po.items[itemIdx]) ? po.items[itemIdx] : null;
  if(!poItem && !editingRow){ toast('Select an item'); return; }
  const itemDesc = poItem ? poItem.desc : (editingRow ? editingRow.item : '');
  const partNo = poItem ? (poItem.partNo||'') : (editingRow ? (editingRow.partNo||'') : '');
  const partName = poItem ? (poItem.partName||'') : (editingRow ? (editingRow.partName||'') : '');
  const itemType = poItem ? (poItem.itemType||'') : (editingRow ? (editingRow.itemType||'') : '');
  const uom = poItem ? (poItem.uom||'') : (editingRow ? (editingRow.uom||'') : '');
  const qtyOrdered = poItem ? (parseFloat(poItem.qty)||0) : (editingRow ? editingRow.qtyOrdered : 0);
  const qtyReceived = parseFloat(document.getElementById('mrQtyRec').value)||0;
  if(qtyReceived<=0){ toast('Enter a valid Qty Received'); return; }
  const data = {
    poId, item:itemDesc, partNo, partName, itemType, uom, unit:currentUnit,
    date:document.getElementById('mrDate').value||today(),
    qtyOrdered, qtyReceived,
    invoiceNo:document.getElementById('mrInvNo').value.trim(),
    invoiceDate:document.getElementById('mrInvDate').value,
    receivedBy:document.getElementById('mrRecBy').value.trim(),
    remarks:document.getElementById('mrRemarks').value.trim()
  };
  if(editingMRId){
    const m = DB.materialReceiving.find(x=>x.id===editingMRId);
    let synced = false;
    if(m){
      Object.assign(m, data);
      // keep the already-created Receiving Inspection entry in sync, as long as Quality
      // hasn't already recorded a final result for it
      let g = m.grId ? DB.receiving.find(x=>x.id===m.grId) : null;
      if(g && g.result==='Pending'){
        Object.assign(g, {item:m.item, partNo:m.partNo, partName:m.partName, itemType:m.itemType, uom:m.uom,
          qtyOrdered:m.qtyOrdered, qtyReceived:m.qtyReceived, date:m.date,
          invoiceNo:m.invoiceNo, invoiceDate:m.invoiceDate});
        synced = true;
      } else if(!g){
        // self-heal: this entry never got (or lost) its link to Receiving Inspection — create it now
        g = {
          id:'g'+Date.now(), unit:m.unit, poId:m.poId, item:m.item, partNo:m.partNo, partName:m.partName, itemType:m.itemType, uom:m.uom,
          date:m.date, qtyOrdered:m.qtyOrdered, qtyReceived:m.qtyReceived,
          inspector:'', result:'Pending', invoiceNo:m.invoiceNo, invoiceDate:m.invoiceDate,
          testCert:'', heatNo:'', remarks:'', pushedToStores:false, mrId:m.id
        };
        DB.receiving.push(g);
        m.grId = g.id;
        synced = true;
      }
    }
    editingMRId = null;
    saveDB(); toast(synced ? 'Material Receiving entry updated — linked Inspection entry synced' : 'Material Receiving entry updated'); render();
  }else{
    const mrId = 'mr'+Date.now();
    const newG = {
      id:'g'+Date.now(), unit:currentUnit, poId, item:itemDesc, partNo, partName, itemType, uom,
      date:data.date, dcNo:'', qtyOrdered, qtyReceived,
      inspector:'', result:'Pending', invoiceNo:data.invoiceNo, invoiceDate:data.invoiceDate,
      testCert:'', heatNo:'', remarks:'', pushedToStores:false, mrId
    };
    DB.receiving.push(newG);
    const newM = {id:mrId, ...data, pushedToInspection:true, grId:newG.id};
    DB.materialReceiving.push(newM);
    saveDB(); toast('Material Receiving saved — automatically sent to Receiving Inspection'); render();
  }
}
function editMaterialReceiving(id){
  editingMRId = id;
  render();
}
function cancelEditMR(){ editingMRId = null; render(); }


function renderSuppliers(main){
  const list = DB.suppliers;
  const editing = editingSupplierId ? DB.suppliers.find(x=>x.id===editingSupplierId) : null;
  main.innerHTML = `
    <div class="panel">
      <h3>${editing?'Edit Raw Material Supplier':'New Raw Material Supplier'}</h3>
      <div class="frow g4">
        <div><label class="fl">Supplier Name</label><input id="spName" placeholder="e.g. Anna Forgings Pvt Ltd" value="${editing?esc(editing.name):''}"></div>
        <div><label class="fl">GSTIN</label><input id="spGstin" placeholder="33XXXXX..." value="${editing?esc(editing.gstin):''}"></div>
        <div><label class="fl">Phone</label><input id="spPhone" placeholder="+91 ..." value="${editing?esc(editing.phone):''}"></div>
        <div><label class="fl">Contact Person</label><input id="spContact" placeholder="Name" value="${editing?esc(editing.contact):''}"></div>
      </div>
      <div class="frow g2">
        <div><label class="fl">Email</label><input id="spEmail" type="email" placeholder="e.g. sales@supplier.com" value="${editing?esc(editing.email):''}"></div>
        <div><label class="fl">Address</label><textarea id="spAddress" class="addr-box" placeholder="Supplier address">${editing?esc(editing.address):''}</textarea></div>
      </div>
      <button class="btn amber" onclick="${editing?'saveEditSupplier()':'addSupplier()'}">${editing?'💾 Save Changes':'💾 Save Supplier'}</button>
      ${editing?`<button class="btn ghost" onclick="cancelEditSupplier()">Cancel</button>`:''}
    </div>
    <div class="panel">
      <div class="section-total"><h3>Raw Material Suppliers <span class="hint">${list.length} total</span></h3>
      </div>
      <div class="grid-box">
        ${list.slice().reverse().map(s=>`
          <div class="rec-card">
            <div class="rc-title">${esc(s.name)}</div>
            <div class="rc-sub">🏷 Raw Material Supplier ${s.gstin?' · '+esc(s.gstin):''}</div>
            <div class="rc-row"><span class="k">Phone</span><span class="v">${esc(s.phone)||'—'}</span></div>
            <div class="rc-row"><span class="k">Email</span><span class="v">${esc(s.email)||'—'}</span></div>
            <div class="rc-row"><span class="k">Contact</span><span class="v">${esc(s.contact)||'—'}</span></div>
            <div class="rc-row"><span class="k">Address</span><span class="v">${esc(s.address)||'—'}</span></div>
            <div class="rc-actions">
              <button class="btn small ghost" onclick="editSupplier('${s.id}')">Edit</button>
              <button class="btn danger" onclick="deleteRow('suppliers','${s.id}')">Del</button>
            </div>
          </div>`).join('') || '<div class="empty">No raw material suppliers added yet.</div>'}
      </div>
    </div>
  `;
}
function addSupplier(){
  if(!requireAdminOffice()) return;
  const name = document.getElementById('spName').value.trim();
  if(!name){ toast('Supplier name is required'); return; }
  DB.suppliers.push({
    id:'sp'+Date.now(), no:uid('sp'), name, type:'Raw Material',
    gstin:document.getElementById('spGstin').value.trim(),
    phone:document.getElementById('spPhone').value.trim(),
    email:document.getElementById('spEmail').value.trim(),
    contact:document.getElementById('spContact').value.trim(),
    address:document.getElementById('spAddress').value.trim()
  });
  saveDB(); toast('Raw Material Supplier added'); render();
}
function editSupplier(id){ editingSupplierId = id; render(); }
function cancelEditSupplier(){ editingSupplierId = null; render(); }

function saveEditSupplier(){
  if(!requireAdminOffice()) return;
  const s = DB.suppliers.find(x=>x.id===editingSupplierId);
  if(!s) return;
  const name = document.getElementById('spName').value.trim();
  if(!name){ toast('Supplier name is required'); return; }
  s.name=name; s.type = s.type||'Raw Material'; s.gstin=document.getElementById('spGstin').value.trim();
  s.phone=document.getElementById('spPhone').value.trim();
  s.email=document.getElementById('spEmail').value.trim();
  s.contact=document.getElementById('spContact').value.trim();
  s.address=document.getElementById('spAddress').value.trim();
  editingSupplierId = null;
  saveDB(); toast('Raw Material Supplier updated'); render();
}
function printSuppliers(){
  const list = DB.suppliers;
  const headers = ['Name','GSTIN','Phone','Email','Contact Person','Address'];
  const rows = list.map(s=>[esc(s.name), esc(s.gstin)||'—', esc(s.phone)||'—', esc(s.email)||'—', esc(s.contact)||'—', esc(s.address)||'—']);
  printReport('Raw Material Supplier Master List', headers, rows, {barRight:`Total Suppliers: ${list.length}`});
}

/* ---- Items submodule (Forging / Bar) ---- */
function goToQuotationFromPurchase(){
  previousPage = currentPage;
  currentPage = 'quotation'; reportModuleOpen = null;
  render();
}
// Quotation ↔ Price Revision cross-link — Price Revision applies future price increases to
// existing Sales/Job Work Quotations, so it's reachable directly from the Quotation list, and
// "← Back to Quotation" (via computeBackContext/previousPage) returns you the same way.
function goToPriceRevision(){
  currentPage = 'quotation'; reportModuleOpen = null; quotationSubTab = 'priceRevision';
  render();
}
function renderItems(main){
  if(viewingItemPriceHistoryId){ main.innerHTML = itemPriceHistoryPanelHtml(); return; }
  const list = DB.items.filter(x=>x.type===itemsTypeTab);
  const editing = editingItemId ? DB.items.find(x=>x.id===editingItemId) : null;
  main.innerHTML = `
    <div class="typetabs">
      <button class="${itemsTypeTab==='FORGING'?'active':''}" onclick="setItemsTypeTab('FORGING')">Forging</button>
      <button class="${itemsTypeTab==='BAR'?'active':''}" onclick="setItemsTypeTab('BAR')">Bar</button>
      <button class="btn ghost small" style="margin-left:auto;" onclick="goToQuotationFromPurchase()" title="Material Cost per Kg is entered per line item in Quotation → Material Cost Working">🔗 View in Quotation</button>
    </div>
    <div class="panel">
      <h3>${editing?'Edit':'New'} ${itemsTypeTab==='FORGING'?'Forging':'Bar'} Item</h3>
      ${itemsTypeTab==='FORGING' ? `
      <div class="frow g4">
        <div><label class="fl">Part No</label><input id="itCode" placeholder="e.g. FRG-EC-D912" value="${editing?esc(editing.code):''}"></div>
        <div><label class="fl">Part Name</label><input id="itName" placeholder="e.g. END CLEVIS FORGING" value="${editing?esc(editing.name):''}"></div>
        <div><label class="fl">UOM</label><select id="itUom"><option value="">— select —</option><option value="Nos" ${editing&&editing.uom==='Nos'?'selected':''}>Nos</option><option value="Kg" ${editing&&editing.uom==='Kg'?'selected':''}>Kg</option><option value="Mtr" ${editing&&editing.uom==='Mtr'?'selected':''}>Mtr</option></select></div>
      </div>
      <div class="frow g4">
        <input type="hidden" id="itVqPrice" value="${editing?editing.vqPrice:0}">
        <div><label class="fl">Today's Market Price (₹) <span class="hint" style="position:static; font-size:9.5px;">(manual — for comparison/reporting only)</span></label>
          <input id="itMarketPrice" type="number" placeholder="0.00" value="${editing?editing.marketPrice:''}">
        </div>
        <div><label class="fl">Effective Date <span class="hint" style="position:static; font-size:9.5px;">(for the Market Price above)</span></label>
          <input id="itMarketEffDate" type="date" value="${editing&&editing.marketPriceEffDate?editing.marketPriceEffDate:today()}">
        </div>
      </div>` : `
      <div class="frow g5">
        <div><label class="fl">Material</label>
          <select id="itMaterial" onchange="onBarItemMaterialChange()">${barMaterialOptionsHtml(editing?editing.material:'Steel')}</select>
        </div>
        <div><label class="fl">Shape</label>
          <select id="itShape" onchange="updateBarItemPreview()">${barShapeOptionsHtml(editing?editing.shape:'Round Bar')}</select>
        </div>
        <div><label class="fl">Type</label>
          <select id="itType" onchange="updateBarItemPreview()">${barTypeOptionsHtml(editing?editing.barType:'Black Bar')}</select>
        </div>
        <div><label class="fl">Size <span class="hint" style="position:static; font-size:9.5px;">(Dia/Side/Across-Flats in mm — pick standard, or "Other" for Flat WxT e.g. 50x10)</span></label>
          <select id="itSizeSel" onchange="onItSizeSelChange()">${barSizeOptionsHtml(editing?editing.size:'')}</select>
          <input id="itSize" placeholder="e.g. 50x10" value="${editing?esc(editing.size):''}" oninput="updateBarItemPreview()" style="margin-top:6px; display:${(editing && editing.size && !RAW_MATERIAL_SIZES.includes(editing.size))?'block':'none'};">
        </div>
        <div><label class="fl">Grade <span class="hint" style="position:static; font-size:9.5px;">(depends on Material)</span></label>
          <select id="itGrade" onchange="handleGradeSelectChange('itGrade','itMaterial','updateBarItemPreview')">${materialGradeOptionsHtml(editing?editing.material:'Steel', editing?editing.grade:'')}</select></div>
      </div>
      <div class="frow g4">
        <div><label class="fl">Part No <span class="hint" style="position:static; font-size:9.5px;">(auto-generated)</span></label><input id="itCode" value="${esc(buildBarPartNoName(editing?editing.material:'Steel', editing?editing.shape:'Round Bar', editing?editing.size:'', editing?editing.grade:'', editing?editing.barType:'Black Bar').partNo)}" disabled></div>
        <div><label class="fl">Part Name <span class="hint" style="position:static; font-size:9.5px;">(auto-generated)</span></label><input id="itName" value="${esc(buildBarPartNoName(editing?editing.material:'Steel', editing?editing.shape:'Round Bar', editing?editing.size:'', editing?editing.grade:'', editing?editing.barType:'Black Bar').partName)}" disabled></div>
        <div><label class="fl">UOM</label><select id="itUom"><option value="">— select —</option><option value="Nos" ${editing&&editing.uom==='Nos'?'selected':''}>Nos</option><option value="Kg" ${editing&&editing.uom==='Kg'?'selected':''}>Kg</option><option value="Mtr" ${editing&&editing.uom==='Mtr'?'selected':''}>Mtr</option></select></div>
      </div>
      <div class="frow g4">
        <input type="hidden" id="itVqPrice" value="${editing?editing.vqPrice:0}">
        <div><label class="fl">Latest Price (₹) <span class="hint" style="position:static; font-size:9.5px;">(manual — for comparison/reporting only)</span></label>
          <input id="itMarketPrice" type="number" placeholder="0.00" value="${editing?editing.marketPrice:''}">
        </div>
        <div><label class="fl">Date &amp; Time <span class="hint" style="position:static; font-size:9.5px;">(auto-captured on save)</span></label>
          <input value="${editing&&editing.marketPriceEffDate?fmtDateTime(editing.marketPriceEffDate):'— will be set on save —'}" disabled>
        </div>
      </div>`}
      <button class="btn amber" onclick="${editing?'saveEditItem()':'addItem()'}">${editing?'💾 Save Changes':`💾 Save ${itemsTypeTab==='FORGING'?'Forging':'Bar'} Item`}</button>
      ${editing?`<button class="btn ghost" onclick="cancelEditItem()">Cancel</button>`:''}
    </div>
    <div class="panel">
      <div class="section-total"><h3>${itemsTypeTab==='FORGING'?'Forging':'Bar'} Items <span class="hint">${list.length} total</span></h3>
      </div>
      <div class="grid-box">
        ${list.slice().reverse().map(it=>`
          <div class="rec-card">
            <div class="rc-title">${esc(it.code)}</div>
            <div class="rc-sub">${esc(it.name)}</div>
            <span class="typepill rc-pill ${it.type==='FORGING'?'forging':'bar'}">${esc(it.type)}</span>
            ${it.type==='BAR' ? `
            <div class="rc-row"><span class="k">Material</span><span class="v">${esc(it.material)||'—'}</span></div>
            <div class="rc-row"><span class="k">Shape</span><span class="v">${esc(it.shape)||'—'}</span></div>
            <div class="rc-row"><span class="k">Type</span><span class="v">${esc(it.barType)||'Black Bar'}</span></div>
            <div class="rc-row"><span class="k">Size</span><span class="v">${esc(it.size)||'—'}</span></div>
            <div class="rc-row"><span class="k">Grade</span><span class="v">${esc(it.grade)||'—'}</span></div>` : ''}
            <div class="rc-row"><span class="k">UOM</span><span class="v">${esc(it.uom)||'—'}</span></div>
            <div class="rc-row"><span class="k">${it.type==='BAR'?'Latest Price':"Today's Market Price"}</span><span class="v">${fmtMoney(it.marketPrice)}</span></div>
            <div class="rc-row"><span class="k">Date &amp; Time</span><span class="v">${it.marketPriceEffDate?fmtDateTime(it.marketPriceEffDate):'—'}</span></div>
            <div class="rc-actions">
              <button class="btn small ghost" onclick="editItem('${it.id}')">Edit</button>
              <button class="btn small ghost" onclick="viewItemPriceHistory('${it.id}')">📜 Price History</button>
              <button class="btn danger" onclick="deleteRow('items','${it.id}')">Del</button>
            </div>
          </div>`).join('') || `<div class="empty">No ${itemsTypeTab==='FORGING'?'forging':'bar'} items added yet.</div>`}
      </div>
    </div>
  `;
}
const barShapeAbbr = {'Round Bar':'RD','Hexagonal Bar':'HEX','Square Bar':'SQ','Flat Bar':'FLT'};
/* Standard Raw Material Size list (mm), with common inch-fraction equivalents shown alongside —
   used for the Bar Item Master "Size" dropdown so sizes are picked from a fixed master list
   instead of free-typed (reduces typos/duplicate variants like "40" vs "40mm" vs "40 mm"). */
const RAW_MATERIAL_SIZES = [
  '5','6','6.35 (1/4")','7','8','9','9.53 (3/8")','10','11','12','12.70 (1/2")','13','14','15',
  '15.88 (5/8")','16','17','18','19','19.05 (3/4")','20','21','22','22.23 (7/8")','23','24','25',
  '25.40 (1")','26','27','28','28.58 (1-1/8")','30','31.75 (1-1/4")','32','34','34.93 (1-3/8")',
  '35','36','38','38.10 (1-1/2")','40','41.28 (1-5/8")','42','44','44.45 (1-3/4")','45','47',
  '47.63 (1-7/8")','48','50','50.80 (2")','52','55','57.15 (2-1/4")','60','63.50 (2-1/2")','65',
  '69.85 (2-3/4")','70','75','76.20 (3")','80','82.55 (3-1/4")','85','88.90 (3-1/2")','90'
];
function barSizeOptionsHtml(selected){
  const isKnown = !!selected && RAW_MATERIAL_SIZES.includes(selected);
  const opts = RAW_MATERIAL_SIZES.map(o=>`<option value="${esc(o)}" ${selected===o?'selected':''}>${esc(o)}</option>`).join('');
  return `<option value="">— select size —</option>${opts}<option value="__other__" ${selected&&!isKnown?'selected':''}>Other (type manually — e.g. 50x10 for Flat)</option>`;
}
function onItSizeSelChange(){
  const sel = document.getElementById('itSizeSel');
  const inp = document.getElementById('itSize');
  if(!sel || !inp) return;
  if(sel.value==='__other__'){ inp.style.display='block'; inp.value=''; inp.focus(); }
  else{ inp.style.display='none'; inp.value = sel.value; }
  updateBarItemPreview();
}
// Bar processing/finish "Type" (e.g. Round Bar can be Black, Bright, Peeled, Cold Drawn, Ground,
// Turned & Polished, or Hot Rolled). "Black Bar" is the default finish for raw/unprocessed bar
// stock, so it's the default selection wherever Type is chosen but not yet set.
const BAR_TYPE_OPTIONS = ['Black Bar','Bright Bar','Peeled Bar','Cold Drawn Bar','Ground Bar','Turned & Polished (T&P) Bar','Hot Rolled Bar'];
const barTypeAbbr = {'Black Bar':'BLK','Bright Bar':'BRT','Peeled Bar':'PLD','Cold Drawn Bar':'CD','Ground Bar':'GRD','Turned & Polished (T&P) Bar':'TP','Hot Rolled Bar':'HR'};
function barTypeOptionsHtml(selected){
  const sel = selected || 'Black Bar';
  return BAR_TYPE_OPTIONS.map(o=>`<option value="${esc(o)}" ${sel===o?'selected':''}>${esc(o)}</option>`).join('');
}
function buildBarPartNoName(material, shape, size, grade, barType){
  const shapeAbbr = barShapeAbbr[shape] || 'BAR';
  const sizeSlug = (size||'').trim().toUpperCase().replace(/\s+/g,'');
  const gradeSlug = (grade||'').trim().toUpperCase().replace(/\s+/g,'');
  const type = barType || 'Black Bar';
  // "Black Bar" is the default finish, so it's omitted from the Part No/Name to keep existing
  // part numbers unchanged for items that were created before Type existed (all defaulted to
  // Black Bar). Any other Type is appended so distinct finishes generate distinct part numbers.
  const typeAbbr = type!=='Black Bar' ? (barTypeAbbr[type] || '') : '';
  const partNo = ['BAR', shapeAbbr, sizeSlug, gradeSlug, typeAbbr].filter(Boolean).join('-');
  const partName = [size, shape, type!=='Black Bar'?type:'', grade].filter(Boolean).join(' ').trim().toUpperCase();
  return {partNo, partName};
}
function barMaterialOptionsHtml(selected){
  const opts = ['Steel','Mild Steel (MS)','Carbon Steel','Alloy Steel','Stainless Steel (SS)','Brass','Bronze','Copper','Aluminium','Gun Metal'];
  return opts.map(o=>`<option value="${esc(o)}" ${selected===o?'selected':''}>${esc(o)}</option>`).join('');
}
function barShapeOptionsHtml(selected){
  const opts = ['Round Bar','Hexagonal Bar','Square Bar','Flat Bar'];
  return opts.map(o=>`<option value="${esc(o)}" ${selected===o?'selected':''}>${esc(o)}</option>`).join('');
}
/* ===== Distinct Material / Shape / Size / Grade lists sourced ONLY from Purchase module's
   Item Master (DB.items, type='BAR') — used by Product Development BOM Bar Mapping so these
   4 fields are picked from what Purchase has actually defined, not free-typed or hardcoded. */
function distinctBarItemValues(field){
  const set = new Set();
  DB.items.filter(x=>x.type==='BAR').forEach(x=>{ const v=(x[field]||'').toString().trim(); if(v) set.add(v); });
  return Array.from(set).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}));
}
function bomBarFieldOptionsHtml(field, selected){
  const opts = distinctBarItemValues(field);
  if(!opts.length){
    return `<option value="">— no ${field} found in Purchase Item Master —</option>${selected?`<option value="${esc(selected)}" selected>${esc(selected)}</option>`:''}`;
  }
  return `<option value="">— select —</option>` +
    opts.map(o=>`<option value="${esc(o)}" ${selected===o?'selected':''}>${esc(o)}</option>`).join('') +
    (selected && !opts.includes(selected) ? `<option value="${esc(selected)}" selected>${esc(selected)}</option>` : '');
}
function bomBarMaterialListOptionsHtml(selected){ return bomBarFieldOptionsHtml('material', selected); }
function bomBarShapeListOptionsHtml(selected){ return bomBarFieldOptionsHtml('shape', selected); }
function bomBarSizeListOptionsHtml(selected){ return bomBarFieldOptionsHtml('size', selected); }
function bomBarGradeListOptionsHtml(selected){ return bomBarFieldOptionsHtml('grade', selected); }
// Bar "Type" (Black/Bright/Peeled/Cold Drawn/Ground/Turned & Polished/Hot Rolled) — sourced only
// from what's actually been defined against Bar Items in the Item Master, same pattern as
// Size/Grade above, so Purchase Order Type always matches real Item Master data.
function bomBarTypeListOptionsHtml(selected){ return bomBarFieldOptionsHtml('barType', selected||'Black Bar'); }
/* ===== Material density defaults (g/cm3) — used to auto-calc Bar Mapping piece weights ===== */
const materialDensityDefaults = {
  'Steel':7.85, 'Mild Steel (MS)':7.85, 'Carbon Steel':7.85, 'Alloy Steel':7.85,
  'Stainless Steel (SS)':7.93, 'Brass':8.44, 'Bronze':8.80, 'Copper':8.96,
  'Aluminium':2.70, 'Gun Metal':8.72
};
function defaultDensityForMaterial(material){
  return materialDensityDefaults[material] || 7.85;
}
/* ===== Material Grade master — the grades applicable to each Material Name, each with its own
   standard density (g/cm³). Drives the Quotation module's dependent Material Name → Material
   Grade → (auto, read-only) Density flow: pick Material, pick a Grade valid for it, and the
   Density fills in from this table — never typed by hand. ===== */
const MATERIAL_GRADES = {
  'Steel': [
    {grade:'EN8', density:7.85}, {grade:'EN9', density:7.85}, {grade:'EN19', density:7.85},
    {grade:'EN24', density:7.85}, {grade:'EN31', density:7.85}, {grade:'C45', density:7.85}
  ],
  'Mild Steel (MS)': [
    {grade:'IS 2062', density:7.85}, {grade:'Fe410', density:7.85}, {grade:'IS 1239', density:7.85}
  ],
  'Carbon Steel': [
    {grade:'C40', density:7.85}, {grade:'C45', density:7.85}, {grade:'C50', density:7.85}, {grade:'1045', density:7.85}
  ],
  'Alloy Steel': [
    {grade:'EN19', density:7.85}, {grade:'EN24', density:7.85}, {grade:'EN353', density:7.85},
    {grade:'SAE 4140', density:7.85}, {grade:'SAE 4340', density:7.85}
  ],
  'Stainless Steel (SS)': [
    {grade:'SS 304', density:8.00}, {grade:'SS 316', density:8.00}, {grade:'SS 410', density:7.70},
    {grade:'SS 420', density:7.70}, {grade:'SS 430', density:7.70}
  ],
  'Brass': [
    {grade:'CZ121', density:8.50}, {grade:'CZ122', density:8.50}, {grade:'C36000', density:8.50}
  ],
  'Bronze': [
    {grade:'PB1', density:8.80}, {grade:'PB2', density:8.80}, {grade:'C93200', density:8.80}
  ],
  'Copper': [
    {grade:'C101 (ETP)', density:8.96}, {grade:'C110', density:8.96}
  ],
  'Aluminium': [
    {grade:'6061', density:2.70}, {grade:'6063', density:2.70}, {grade:'7075', density:2.81}, {grade:'2014', density:2.80}
  ],
  'Gun Metal': [
    {grade:'LG2', density:8.72}, {grade:'LG4', density:8.72}
  ]
};
// User-added grades, layered on top of the built-in MATERIAL_GRADES master, keyed by Material
// Name. Persisted in DB so they survive reloads and are available everywhere the Grade dropdown
// appears (Bar Item Master, Quotation, BOM). Added via the "+ Add New Grade" option at the
// bottom of the Grade dropdown.
function allGradesForMaterial(material){
  if(!material) return [];
  const base = MATERIAL_GRADES[material] || [];
  const custom = (DB.customGrades && DB.customGrades[material]) || [];
  return base.concat(custom);
}
function materialGradeOptionsHtml(material, selected){
  const list = allGradesForMaterial(material);
  if(!material){
    return `<option value="">— select Material Name first —</option>`;
  }
  const opts = list.map(g=>`<option value="${esc(g.grade)}" ${selected===g.grade?'selected':''}>${esc(g.grade)}</option>`).join('');
  return `<option value="">— select grade —</option>` + opts +
    `<option value="__add_new_grade__" class="add-new-opt">+ Add New Grade…</option>`;
}
function densityForMaterialGrade(material, grade){
  const list = allGradesForMaterial(material);
  const hit = list.find(g=>g.grade===grade);
  return hit ? hit.density : defaultDensityForMaterial(material);
}
// Registers a brand-new Grade (with its density) under the given Material Name, persists it to
// DB, and makes it selectable everywhere immediately. Returns false (and toasts) if the material
// is missing, the grade name is blank, or that grade already exists for this material.
function addCustomGrade(material, grade, density){
  grade = (grade||'').trim();
  if(!material){ toast('Select a Material Name first'); return false; }
  if(!grade){ toast('Enter a grade name'); return false; }
  const existing = allGradesForMaterial(material);
  if(existing.some(g=>g.grade.toLowerCase()===grade.toLowerCase())){
    toast('That grade already exists for '+material); return false;
  }
  if(!DB.customGrades) DB.customGrades = {};
  if(!DB.customGrades[material]) DB.customGrades[material] = [];
  const dens = (density===''||density===null||density===undefined||isNaN(parseFloat(density))) ? defaultDensityForMaterial(material) : parseFloat(density);
  DB.customGrades[material].push({grade, density:dens});
  saveDB();
  toast('Grade "'+grade+'" added');
  return true;
}
// Opens a small "Add New Grade" modal for the given Material Name. On save, registers the grade,
// rebuilds the target <select>'s options, and selects the newly-added grade — then re-fires the
// select's change handling (if provided) so any dependent preview/calc fields update.
function openAddGradeModal(material, selectId){
  if(!material){ toast('Select a Material Name first'); return; }
  const old = document.getElementById('agModalOverlay'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'agModalOverlay'; ov.className = 'agOverlay';
  ov.innerHTML = `
    <div class="agBox">
      <h4>+ Add New Grade</h4>
      <div class="agSub">for Material: <b>${esc(material)}</b></div>
      <label>Grade Name</label>
      <input id="agGradeName" placeholder="e.g. EN36" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault(); document.getElementById('agDensity').focus();}">
      <label>Density (g/cm³) <span style="text-transform:none; letter-spacing:0;">— optional, defaults to ${defaultDensityForMaterial(material)}</span></label>
      <input id="agDensity" type="number" step="0.01" placeholder="${defaultDensityForMaterial(material)}" onkeydown="if(event.key==='Enter'){event.preventDefault(); submitAddGradeModal('${esc(material).replace(/'/g,"\\'")}','${selectId}');}">
      <div class="agErr" id="agErr"></div>
      <div class="agBtns">
        <button class="btn ghost" type="button" onclick="closeAddGradeModal()">Cancel</button>
        <button class="btn amber" type="button" onclick="submitAddGradeModal('${esc(material).replace(/'/g,"\\'")}','${selectId}')">💾 Save Grade</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e=>{ if(e.target===ov) closeAddGradeModal(); });
  setTimeout(()=>{ const el=document.getElementById('agGradeName'); if(el) el.focus(); }, 0);
}
function closeAddGradeModal(){
  const ov = document.getElementById('agModalOverlay'); if(ov) ov.remove();
}
function submitAddGradeModal(material, selectId){
  const nameEl = document.getElementById('agGradeName');
  const densEl = document.getElementById('agDensity');
  const errEl = document.getElementById('agErr');
  const grade = nameEl ? nameEl.value.trim() : '';
  if(!grade){ if(errEl){ errEl.textContent='Grade name is required'; errEl.style.display='block'; } if(nameEl) nameEl.focus(); return; }
  const existing = allGradesForMaterial(material);
  if(existing.some(g=>g.grade.toLowerCase()===grade.toLowerCase())){
    if(errEl){ errEl.textContent='That grade already exists for '+material; errEl.style.display='block'; }
    return;
  }
  const ok = addCustomGrade(material, grade, densEl?densEl.value:'');
  if(!ok) return;
  const sel = document.getElementById(selectId);
  if(sel){
    sel.innerHTML = materialGradeOptionsHtml(material, grade);
    sel.value = grade;
    // Re-dispatch 'change' so the select's own onchange (handleGradeSelectChange, still wired to
    // this select) picks up the real grade value now and runs the normal preview/calc handler.
    sel.dispatchEvent(new Event('change',{bubbles:true}));
  }
  closeAddGradeModal();
}
// Wraps a Grade <select>'s onchange: intercepts the "+ Add New Grade" sentinel option to open the
// modal instead of applying it as the grade, otherwise runs the normal handler unchanged.
function handleGradeSelectChange(selectId, materialSelectId, onChangeFn){
  const sel = document.getElementById(selectId);
  if(!sel) return;
  if(sel.value === '__add_new_grade__'){
    const matSel = document.getElementById(materialSelectId);
    const material = matSel ? matSel.value : '';
    sel.value = '';
    openAddGradeModal(material, selectId);
    return;
  }
  if(typeof onChangeFn === 'function') onChangeFn();
  else if(typeof onChangeFn === 'string' && typeof window[onChangeFn] === 'function') window[onChangeFn]();
}
// Reference-only hint for the Quotation module's Material Cost per Kg field: the most recently
// saved Purchase → Bar Item entry for this exact Material + Grade (by Date & Time), or null if
// none exists yet. Purely informational — it never fills or overrides the manually-entered
// Material Cost per Kg.
function latestPurchasePriceForMaterialGrade(material, grade){
  if(!material || !grade) return null;
  const matches = DB.items.filter(it=>it.type==='BAR' && it.material===material && it.grade===grade);
  if(!matches.length) return null;
  matches.sort((a,b)=> new Date(b.marketPriceEffDate||0) - new Date(a.marketPriceEffDate||0));
  const latest = matches[0];
  if(!latest.marketPrice) return null;
  return {price:latest.marketPrice, date:latest.marketPriceEffDate||null};
}
/* Cross-section area (mm^2) for a bar shape given its size text.
   Round/Square/Hexagonal: size is a single number (diameter / side / across-flats).
   Flat: size is "WIDTHxTHICKNESS", e.g. "50x10". */
function barSectionAreaMm2(shape, size){
  const s = (size||'').trim();
  if(!s) return 0;
  if(shape==='Flat Bar'){
    const m = s.match(/([\d.]+)\s*[xX×]\s*([\d.]+)/);
    if(!m) return 0;
    const w = parseFloat(m[1]), t = parseFloat(m[2]);
    if(!w || !t) return 0;
    return w*t;
  }
  const d = parseFloat(s);
  if(!d || isNaN(d)) return 0;
  if(shape==='Round Bar') return (Math.PI/4)*d*d;
  if(shape==='Square Bar') return d*d;
  if(shape==='Hexagonal Bar') return (Math.sqrt(3)/2)*d*d; // size = across-flats
  return d*d; // fallback for any other/custom shape — treat size as an equivalent square side
}
/* Piece weight (kg) = section area (mm^2) x cut length (mm) x density (g/cm3) / 1,000,000 */
function calcBarPieceWeightKg(shape, size, density, cutLengthMm){
  const area = barSectionAreaMm2(shape, size);
  const L = parseFloat(cutLengthMm);
  const rho = parseFloat(density);
  if(!area || !L || !rho) return 0;
  return Math.round((area * L * rho / 1e6) * 10000) / 10000;
}
function updateBarItemPreview(){
  const matEl = document.getElementById('itMaterial');
  const shapeEl = document.getElementById('itShape');
  const typeEl = document.getElementById('itType');
  const sizeEl = document.getElementById('itSize');
  const gradeEl = document.getElementById('itGrade');
  const codeEl = document.getElementById('itCode');
  const nameEl = document.getElementById('itName');
  if(!matEl || !shapeEl || !sizeEl || !gradeEl || !codeEl || !nameEl) return;
  const {partNo, partName} = buildBarPartNoName(matEl.value, shapeEl.value, sizeEl.value, gradeEl.value, typeEl?typeEl.value:'Black Bar');
  codeEl.value = partNo;
  nameEl.value = partName;
}
// Material changed → Grade list is specific to that Material (same Material → Grade logic as
// Quotation), so rebuild the Grade options, clearing any grade that no longer applies.
function onBarItemMaterialChange(){
  const matEl = document.getElementById('itMaterial');
  const gradeEl = document.getElementById('itGrade');
  if(matEl && gradeEl){
    const stillValid = allGradesForMaterial(matEl.value).some(g=>g.grade===gradeEl.value);
    gradeEl.innerHTML = materialGradeOptionsHtml(matEl.value, stillValid?gradeEl.value:'');
  }
  updateBarItemPreview();
}
function addItem(){
  if(!requireAdminOffice()) return;
  if(itemsTypeTab==='BAR'){
    const material = document.getElementById('itMaterial').value;
    const shape = document.getElementById('itShape').value;
    const barType = document.getElementById('itType').value || 'Black Bar';
    const size = document.getElementById('itSize').value.trim();
    const grade = document.getElementById('itGrade').value.trim(); if(grade==='__add_new_grade__'){ toast('Please finish adding the grade first'); return; }
    if(!size){ toast('Size is required'); return; }
    if(!grade){ toast('Grade is required'); return; }
    const density = densityForMaterialGrade(material, grade);
    const {partNo, partName} = buildBarPartNoName(material, shape, size, grade, barType);
    const entry = {
      id:'it'+Date.now(), no:uid('it'), code:partNo, name:partName, type:'BAR',
      uom:document.getElementById('itUom').value.trim(),
      vqPrice:parseFloat(document.getElementById('itVqPrice').value)||0,
      marketPrice:parseFloat(document.getElementById('itMarketPrice').value)||0,
      marketPriceEffDate:new Date().toISOString(), // auto-captured Date & Time — no manual entry
      marketPriceHistory:[],
      material, shape, barType, size, grade, density
    };
    DB.items.push(entry);
    saveDB(); toast('Bar item added'); render();
    return;
  }
  const name = document.getElementById('itName').value.trim();
  if(!name){ toast('Part Name is required'); return; }
  const entry = {
    id:'it'+Date.now(), no:uid('it'), code:document.getElementById('itCode').value.trim(),
    name, type:itemsTypeTab,
    uom:document.getElementById('itUom').value.trim(),
    vqPrice:parseFloat(document.getElementById('itVqPrice').value)||0,
    marketPrice:parseFloat(document.getElementById('itMarketPrice').value)||0,
    marketPriceEffDate:document.getElementById('itMarketEffDate').value||today(),
    marketPriceHistory:[]
  };
  DB.items.push(entry);
  saveDB(); toast('Item added'); render();
}
function editItem(id){ editingItemId = id; render(); }
function cancelEditItem(){ editingItemId = null; render(); }

function saveEditItem(){
  if(!requireAdminOffice()) return;
  const it = DB.items.find(x=>x.id===editingItemId);
  if(!it) return;
  if(itemsTypeTab==='BAR'){
    const material = document.getElementById('itMaterial').value;
    const shape = document.getElementById('itShape').value;
    const barType = document.getElementById('itType').value || 'Black Bar';
    const size = document.getElementById('itSize').value.trim();
    const grade = document.getElementById('itGrade').value.trim(); if(grade==='__add_new_grade__'){ toast('Please finish adding the grade first'); return; }
    if(!size){ toast('Size is required'); return; }
    if(!grade){ toast('Grade is required'); return; }
    const density = densityForMaterialGrade(material, grade);
    const {partNo, partName} = buildBarPartNoName(material, shape, size, grade, barType);
    it.code = partNo; it.name = partName;
    it.material = material; it.shape = shape; it.barType = barType; it.size = size; it.grade = grade; it.density = density;
    it.uom=document.getElementById('itUom').value.trim();
    it.vqPrice=parseFloat(document.getElementById('itVqPrice').value)||0;
    updateItemMarketPrice(it, document.getElementById('itMarketPrice').value, new Date().toISOString());
    editingItemId = null;
    saveDB(); toast('Bar item updated'); render();
    return;
  }
  const name = document.getElementById('itName').value.trim();
  if(!name){ toast('Part Name is required'); return; }
  it.code=document.getElementById('itCode').value.trim();
  it.name=name;
  it.uom=document.getElementById('itUom').value.trim();
  it.vqPrice=parseFloat(document.getElementById('itVqPrice').value)||0;
  updateItemMarketPrice(it, document.getElementById('itMarketPrice').value, document.getElementById('itMarketEffDate').value);
  editingItemId = null;
  saveDB(); toast('Item updated'); render();
}
function printItems(){
  const list = DB.items.filter(x=>x.type===itemsTypeTab);
  if(itemsTypeTab==='BAR'){
    const headers = ['Code','Description','Material','Shape','Size','Grade','UOM','Latest Price (₹)','Date & Time'];
    const rows = list.map(it=>[esc(it.code)||'—', esc(it.name), esc(it.material)||'—', esc(it.shape)||'—', esc(it.size)||'—', esc(it.grade)||'—', esc(it.uom)||'—', `<span class="num">${fmtMoney(it.marketPrice)}</span>`, it.marketPriceEffDate?fmtDateTime(it.marketPriceEffDate):'—']);
    printReport('Bar Item Master List', headers, rows, {barRight:`Total Items: ${list.length}`});
    return;
  }
  const headers = ['Code','Description','UOM','Material Cost per Kg (₹)','Market Price Today (₹)'];
  const rows = list.map(it=>[esc(it.code)||'—', esc(it.name), esc(it.uom)||'—', `<span class="num">${it.vqPrice?fmtMoney(it.vqPrice):'—'}</span>`, `<span class="num">${fmtMoney(it.marketPrice)}</span>`]);
  printReport('Forging Item Master List', headers, rows, {barRight:`Total Items: ${list.length}`});
}
function validatePOItems(){
  const clean = poItemsDraft.map(r=>{
      const itemType = (r.itemType||'').trim();
      const uom = (r.uom||'').trim();
      if(itemType==='BAR'){
        const material=(r.material||'').trim(), shape=(r.shape||'').trim(), barType=(r.barType||'Black Bar').trim(), size=(r.size||'').trim(), grade=(r.grade||'').trim();
        const {partNo, partName} = buildBarPartNoName(material, shape, size, grade, barType);
        return {itemType, material, shape, barType, size, grade, partNo, partName, uom, qty:parseFloat(r.qty)||0, rate:parseFloat(r.rate)||0};
      }
      return {itemType, partNo:(r.partNo||'').trim(), partName:(r.partName||'').trim(), uom, qty:parseFloat(r.qty)||0, rate:parseFloat(r.rate)||0};
    })
    .filter(r=>r.partNo && r.partName)
    .map(r=>({...r, desc: r.itemType==='BAR' ? r.partName : (r.partNo+' — '+r.partName)}));
  return clean;
}
function poItemsMissingType(){
  return poItemsDraft.some(r=>{
    const hasAnyData = r.itemType==='BAR' ? ((r.size||'').trim() || (r.grade||'').trim()) : ((r.partNo||'').trim() || (r.partName||'').trim());
    return hasAnyData && !(r.itemType||'').trim();
  });
}
function poItemsIncomplete(){
  return poItemsDraft.some(r=>{
    if(r.itemType==='BAR') return !(r.size||'').trim() || !(r.grade||'').trim() || !(r.uom||'').trim();
    if(r.itemType==='FORGING') return !(r.partNo||'').trim() || !(r.partName||'').trim() || !(r.uom||'').trim();
    return false;
  });
}
function addPO(){
  if(!requireWorkingUnit()) return;
  if(!poUnitSel){ toast('Select the Unit (Unit 1 / Unit 2) first'); return; }
  const poNo=document.getElementById('poNo').value.trim();
  if(poItemsMissingType()){ toast('Select Bar or Forging for every line item'); return; }
  if(poItemsIncomplete()){ toast('Fill all required fields — Bar needs Size, Grade & UOM; Forging needs Part No, Part Name & UOM'); return; }
  const items = validatePOItems();
  if(!poNo){ toast('PO No is required'); return; }
  if(!items.length){ toast('Add at least one line item'); return; }
  DB.purchase.push({
    id:'p'+Date.now(), poNo, poDate:document.getElementById('poDate').value,
    unit:poUnitSel, supplier:document.getElementById('poSupplier').value.trim(),
    gstin:document.getElementById('poGstin').value.trim(), items,
    terms:document.getElementById('poTerms').value.trim(),
    status:document.getElementById('poStatus').value
  });
  poItemsDraft = [];
  poUnitSel = (currentUnit==='Unit-1'||currentUnit==='Unit-2') ? currentUnit : '';
  saveDB(); toast('Purchase order saved'); render();
}
function editPO(id){
  editingPOId = id;
  const p = DB.purchase.find(x=>x.id===id);
  poItemsDraft = p ? JSON.parse(JSON.stringify(p.items||[])) : [];
  // Same pattern as startEditSale — load the record's own Unit into the picker so an existing
  // PO's Unit is pre-filled (and stays editable from Admin Office, locked from a production unit).
  poUnitSel = (p && (p.unit==='Unit-1'||p.unit==='Unit-2')) ? p.unit : '';
  render();
}
function cancelEditPO(){
  editingPOId = null; poItemsDraft = [];
  poUnitSel = (currentUnit==='Unit-1'||currentUnit==='Unit-2') ? currentUnit : '';
  render();
}
function saveEditPO(){
  const p = DB.purchase.find(x=>x.id===editingPOId);
  if(!p) return;
  if(!poUnitSel){ toast('Select the Unit (Unit 1 / Unit 2) first'); return; }
  const poNo=document.getElementById('poNo').value.trim();
  if(poItemsMissingType()){ toast('Select Bar or Forging for every line item'); return; }
  if(poItemsIncomplete()){ toast('Fill all required fields — Bar needs Size, Grade & UOM; Forging needs Part No, Part Name & UOM'); return; }
  const items = validatePOItems();
  if(!poNo){ toast('PO No is required'); return; }
  if(!items.length){ toast('Add at least one line item'); return; }
  p.poNo=poNo; p.poDate=document.getElementById('poDate').value;
  p.unit=poUnitSel;
  p.supplier=document.getElementById('poSupplier').value.trim();
  p.gstin=document.getElementById('poGstin').value.trim();
  p.items=items;
  p.terms=document.getElementById('poTerms').value.trim();
  p.status=document.getElementById('poStatus').value;
  editingPOId = null;
  poItemsDraft = [];
  poUnitSel = (currentUnit==='Unit-1'||currentUnit==='Unit-2') ? currentUnit : '';
  saveDB(); toast('Purchase order saved'); render();
}
function togglePOStatus(id){
  const p = DB.purchase.find(x=>x.id===id);
  p.status = p.status==='Open'?'Closed':'Open';
  saveDB(); render();
}
function formatTermsForPrint(text, title){
  title = title || 'Terms / Remarks';
  text = (text||'').trim();
  if(!text) return `<div class="ntTitle">${esc(title)}</div><div class="ntBody">—</div>`;
  const lines = text.split(/\r?\n/);
  let html = '';
  let tableRows = '';
  const flushTable = ()=>{ if(tableRows){ html += `<table>${tableRows}</table>`; tableRows=''; } };
  lines.forEach(line=>{
    const raw = line.trim();
    if(!raw){ return; }
    // Section heading, e.g. "TERMS & CONDITIONS:" with no value after colon
    const headingMatch = raw.match(/^([A-Z][A-Z0-9 &/]{2,40}):\s*$/);
    if(headingMatch){
      flushTable();
      html += `<div class="ntPara"><strong>${esc(headingMatch[1])}</strong></div>`;
      return;
    }
    // Key: value pair, e.g. "PAYMENT :- 60 Days..." or "PAYMENT: 60 Days..."
    const kvMatch = raw.match(/^([A-Za-z][A-Za-z0-9 &/()]{1,35}?)\s*:-?\s*(.+)$/);
    if(kvMatch && kvMatch[1].trim().length<36){
      const key = kvMatch[1].trim();
      const val = kvMatch[2].trim();
      // Treat long free-text remarks/notes as paragraphs, not table rows
      if(/^(remarks|note)$/i.test(key) || val.length>90){
        flushTable();
        html += `<div class="ntPara${/^note$/i.test(key)?' ntWarn':''}"><strong>${esc(key)}:</strong> ${esc(val)}</div>`;
      } else {
        tableRows += `<tr><td class="k">${esc(key)}</td><td class="v">${esc(val)}</td></tr>`;
      }
      return;
    }
    // Plain paragraph line
    flushTable();
    html += `<div class="ntPara">${esc(raw)}</div>`;
  });
  flushTable();
  return `<div class="ntTitle">${esc(title)}</div><div class="ntBody">${html}</div>`;
}
function printPO(id){
  const p = DB.purchase.find(x=>x.id===id);
  if(!p) return;
  const items = p.items||[];
  const totQty = items.reduce((a,r)=>a+(r.qty||0),0);
  const totVal = items.reduce((a,r)=>a+(r.qty||0)*(r.rate||0),0);
  // Part Name for BAR items is built as "SIZE SHAPE [TYPE] GRADE" (e.g. "42 ROUND BAR EN1A").
  // For the printed PO only, "mm" is inserted right after the Size value (e.g. "42mm ROUND BAR
  // EN1A") so the unit is unambiguous on the printout — the stored Part Name/desc elsewhere
  // (Item Master, BOM, Stores, etc.) is left exactly as-is.
  const poPrintDesc = r => {
    const desc = r.desc || '';
    if(r.itemType==='BAR' && r.size && desc.indexOf(r.size)===0){
      return esc(r.size)+'mm'+esc(desc.slice(r.size.length));
    }
    return esc(desc);
  };
  const rows = items.map((r,i)=>[i+1, poPrintDesc(r), r.itemType==='BAR'?(esc(r.barType)||'Black Bar'):'—', esc(r.uom)||'—', `<span class="num">${r.qty}</span>`, `<span class="num">${fmtMoney(r.rate)}</span>`, `<span class="num">${fmtMoney((r.qty||0)*(r.rate||0))}</span>`]);
  rows.push(['', '<strong>TOTAL</strong>', '', '', `<span class="num"><strong>${totQty}</strong></span>`, '', `<span class="num"><strong>${fmtMoney(totVal)}</strong></span>`]);
  const note = formatTermsForPrint(p.terms);
  // Full address fetched from the Supplier Master record matched by name, same pattern used
  // by other printed documents — so the complete supplier address always prints without retyping.
  const supRec = DB.suppliers.find(s=>s.name===p.supplier);
  const supAddr = supRec ? (supRec.address||'') : '';
  // Contact Person / Email / Phone are also pulled live from the Supplier Master — printing-only
  // addition, nothing stored on the PO record itself changes.
  const supContact = supRec ? (supRec.contact||'') : '';
  const supEmail = supRec ? (supRec.email||'') : '';
  const supPhone = supRec ? (supRec.phone||'') : '';
  const supContactLine = [
    supContact ? `Contact Person: <strong>${esc(supContact)}</strong>` : '',
    supEmail ? `Email: <strong>${esc(supEmail)}</strong>` : '',
    supPhone ? `Phone: <strong>${esc(supPhone)}</strong>` : ''
  ].filter(Boolean).join(' &nbsp;|&nbsp; ');
  // Supplier block for the printout: Name on its own row, GSTIN on the next row, and Contact
  // Person / Email / Phone (when available) on a third row below.
  const barLeft = `
    <div>Supplier: <strong>${esc(p.supplier)||'—'}</strong></div>
    <div>GSTIN: <strong>${esc(p.gstin)||'—'}</strong></div>
    ${supContactLine ? `<div>${supContactLine}</div>` : ''}
  `;
  // Company/Unit address printed at the top of the PO now follows the Unit selected on the PO
  // itself — Unit-1 POs print the Unit-1 address, Unit-2 POs print the Unit-2 address — same
  // logic as the Sales Invoice printout. Falls back to the Admin/Registered Office address if
  // the matching unit address hasn't been filled in yet, or if the PO isn't tagged to a specific
  // unit (e.g. legacy records / Admin Office POs).
  const poAddrSettings = (DB.settings.addresses||{});
  const poUnitAddr = (p.unit==='Unit-1' ? poAddrSettings.unit1 : p.unit==='Unit-2' ? poAddrSettings.unit2 : '') || poAddrSettings.office || '';
  // Header address formatting is shared with the Sales/Job Work Invoice print templates via
  // printHeaderAddrHtml() — same consistent line-break pattern across all three printouts.
  const poHeaderAddrHtml = poUnitAddr ? `<div class="sub office">${printHeaderAddrHtml(poUnitAddr)}</div>` : '';
  // PO Number and PO Date print as two clearly separated rows (Number first, Date directly
  // below), with the labels and values each aligned in their own fixed-width column so the two
  // rows line up neatly — rather than run inline — scoped to this Purchase Order printout only
  // via .poMetaRight, so no other printReport-based report is affected.
  const poMetaRight = `<div class="poMetaRight">
      <div class="poMetaRow"><span class="poMetaK">PO Number</span><span class="poMetaV">${esc(p.poNo)}</span></div>
      <div class="poMetaRow"><span class="poMetaK">PO Date</span><span class="poMetaV">${fmtDate(p.poDate)}</span></div>
      <div class="poMetaRow"><span class="poMetaK">Status</span><span class="poMetaV">${esc(p.status)}</span></div>
    </div>`;
  const poExtraCss = `
    .prBar{ align-items:flex-start; }
    .prBar .prBarRow > span:first-child{ display:flex; flex-direction:column; gap:2px; line-height:1.6; }
    .poMetaRight{ display:flex; flex-direction:column; gap:3px; text-align:right; }
    .poMetaRow{ display:flex; justify-content:flex-end; align-items:baseline; gap:8px; line-height:1.6; }
    .poMetaK{ color:#3d4b58; min-width:76px; text-align:right; }
    .poMetaV{ font-weight:700; color:var(--accent-dark); min-width:96px; text-align:left; }
    /* Compact spacing so a typical Purchase Order (a handful of line items) always fits on a
       single printed page — scoped to this printout only via extraCss, no other report is
       affected. */
    body{ padding:3mm 3mm; font-size:10.8px; }
    .prHead{ padding-bottom:8px; margin-bottom:10px; }
    .prHead h1{ font-size:17px; margin:0 0 3px; }
    .prTitle{ margin:0 0 8px; padding:6px 12px; font-size:12.5px; }
    .prBar{ margin-bottom:10px; padding:7px 10px; gap:4px; }
    table{ font-size:10.3px; }
    th, td{ padding:5px 7px; }
    .prNote{ margin-top:10px; }
    .prNote .ntBody{ padding:8px 11px 10px; }
    /* Enough blank space above the signature lines to actually sign, while the rest of the
       layout stays compact so the Purchase Order still fits on a single printed page. */
    .prFoot{ margin-top:60px; }
    .prFoot .sign{ padding-top:8px; }
  `;
  // "Verified By" removed from the signature row for this printout only — Prepared By and
  // Authorized Signatory remain (showSign:false suppresses the shared 3-signature default so
  // this custom 2-signature footer is used instead; no other printReport-based document changes).
  const poFooterHtml = `<div class="prFoot"><div class="sign">Prepared By</div><div class="sign">Authorized Signatory</div></div>`;
  printReport(`Purchase Order — ${p.poNo}`, ['Sl','Part Name','Bar Type','UOM','Qty','Rate (₹)','Value (₹)'], rows,
    {barLeft, barRight:poMetaRight, barAddr:supAddr, note, extraCss:poExtraCss, unitAddrOverride:poUnitAddr, headerAddrHtml:poHeaderAddrHtml, pageMargin:'10mm', footerHtml:poFooterHtml, showSign:false,
     showGstin:true, copies:['ORIGINAL COPY FOR SUPPLIER','OFFICE COPY']});
}
const ADMIN_ONLY_BUCKETS = ['suppliers','customers','items','bom','controlPlans','labourMapping','custPO','labourPO'];
function deleteRow(bucket,id){
  if(ADMIN_ONLY_BUCKETS.includes(bucket) && !requireAdminOffice()) return;
  if(bucket==='finalInsp'){
    // Keep the linked Final Inspection Card (if any) in sync when one of its generated reports is deleted.
    const f = DB.finalInsp.find(x=>x.id===id);
    if(f && f.fiCardId){
      const card = DB.finalInspCards.find(x=>x.id===f.fiCardId);
      if(card){ card.reportIds = (card.reportIds||[]).filter(rid=>rid!==id); recomputeFICardStatus(card.id); }
    }
  }
  DB[bucket] = DB[bucket].filter(x=>x.id!==id);
  if(bucket==='sales' && editingSaleId===id){ editingSaleId=null; saleItemRows=[emptySaleItemRow()]; }
  saveDB(); render();
}
