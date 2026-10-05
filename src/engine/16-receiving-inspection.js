/* ---------------- RECEIVING INSPECTION ---------------- */
function renderReceiving(main){
  if(!subOK('receiving', receivingSubTab)) receivingSubTab = firstAllowedSub('receiving') || receivingSubTab;
  main.innerHTML = `
    <div class="topbar"><div></div></div>
    <div class="subtabs" style="margin-top:12px;">
      ${subOK('receiving','material')?`<button class="${receivingSubTab==='material'?'active':''}" onclick="setReceivingSubTab('material')">📦 Raw Material Inspection</button>`:''}
      ${subOK('receiving','subcontract')?`<button class="${receivingSubTab==='subcontract'?'active':''}" onclick="setReceivingSubTab('subcontract')">🏗️ Subcontract Inspection</button>`:''}
    </div>
    <div id="recvSub"></div>
  `;
  const sub = document.getElementById('recvSub');
  if(receivingSubTab==='subcontract') return renderReceivingSubcontract(sub);
  return renderReceivingMaterial(sub);
}
function setReceivingSubTab(t){ receivingSubTab = t; editingGRId=null; manualGRMode=false; editingSubInspId=null; render(); }
function renderReceivingMaterial(main){
  const list = DB.receiving.filter(x=>reportUnitMatch(x.unit));
  const poOptions = DB.purchase.filter(x=>reportUnitMatch(x.unit));
  const editing = editingGRId ? DB.receiving.find(x=>x.id===editingGRId) : null;
  const pendingCount = list.filter(x=>x.result==='Pending').length;

  let formHtml;
  if(editing){
    const po = DB.purchase.find(p=>p.id===editing.poId);
    formHtml = `
    <div class="panel" style="margin-top:12px;">
      <h3>🔬 Record Inspection Result <span class="hint">${editing.mrId?'🔗 Material data auto-filled from Material Receiving':'Manual/direct entry'}</span></h3>

      <div class="mini-card" style="margin-bottom:14px;">
        <div class="mc-row"><span class="mc-k">Item</span><span class="mc-v">${esc(editing.item)||esc(editing.partNo)||'—'}${editing.itemType?' ('+(editing.itemType==='BAR'?'Bar':'Forging')+')':''}</span></div>
        <div class="mc-row"><span class="mc-k">Against PO</span><span class="mc-v">${po?esc(po.poNo)+' — '+esc(po.supplier):'—'}</span></div>
        <div class="mc-row"><span class="mc-k">Date Received</span><span class="mc-v">${fmtDate(editing.date)||'—'}</span></div>
        <div class="mc-row"><span class="mc-k">Qty Received</span><span class="mc-v"><strong>${editing.qtyReceived||0} ${esc(editing.uom)||''}</strong> <span class="hint" style="position:static;">(Ordered: ${editing.qtyOrdered||0})</span></span></div>
        <div class="mc-row"><span class="mc-k">Supplier Invoice</span><span class="mc-v">${esc(editing.invoiceNo)||'—'}${editing.invoiceDate?' ('+fmtDate(editing.invoiceDate)+')':''}</span></div>
      </div>

      <div class="frow g4">
        <div><label class="fl">Inspector</label><select id="grInspector">${hrInspectorNameOptionsHtml(editing.inspector||'')}</select></div>
        <div><label class="fl">Result <span class="hint" style="position:static; font-size:9.5px;">(only Pass adds to Stores)</span></label><select id="grResult">
          <option ${editing.result==='Pending'?'selected':''}>Pending</option>
          <option ${editing.result==='Pass'?'selected':''}>Pass</option>
          <option ${editing.result==='Hold'?'selected':''}>Hold</option>
          <option ${editing.result==='Fail'?'selected':''}>Fail</option>
        </select></div>
        <div><label class="fl">Test Certificate No</label><input id="grTC" placeholder="TC / mill certificate no." value="${esc(editing.testCert)||''}"></div>
        <div><label class="fl">Heat No</label><input id="grHeat" placeholder="Heat / batch no." value="${esc(editing.heatNo)||''}"></div>
      </div>
      <div class="frow"><div><textarea id="grRemarks" placeholder="Crack detection, TC verified, size/rust checks, etc.">${esc(editing.remarks)||''}</textarea></div></div>

      <div class="rowactions" style="justify-content:flex-start; margin-top:14px;">
        <button class="btn amber" onclick="addGR()">💾 Save Inspection Result</button>
        <button class="btn ghost" onclick="cancelEditGR()">Cancel</button>
      </div>
    </div>`;
  } else {
    formHtml = `
    <div class="panel" style="margin-top:12px;">
      <div class="empty">${pendingCount>0?`${pendingCount} entr${pendingCount===1?'y':'ies'} awaiting inspection`+' — select "🔬 Inspect" on an entry below.':'No entries awaiting inspection right now — new material logged via Material Receiving will appear here automatically.'}</div>
      <div style="margin-top:10px;"><button class="btn ghost small" onclick="toggleManualGR()">${manualGRMode?'✕ Cancel Direct Entry':'+ Direct Entry (no Material Receiving record)'}</button></div>
      ${manualGRMode?manualGRFormHtml(poOptions):''}
    </div>`;
  }

  main.innerHTML = `
    ${flowline('receiving')}
    ${formHtml}
    <div class="panel">
      <h3>Receiving Log <span class="hint">${list.length} entries</span></h3>
      <div class="grid-box">
        ${list.slice().reverse().map(g=>{
          const po = DB.purchase.find(p=>p.id===g.poId);
          return `<div class="rec-card">
            ${g.mrId ? `<div class="link-badge">🔗 Auto-filled from Material Receiving</div>` : ''}
            <div class="rc-title">${esc(g.item)||esc(g.partNo)||'—'}</div>
            <div class="rc-sub">PO: ${po?esc(po.poNo):'—'} · ${fmtDate(g.date)}${g.itemType?' · '+(g.itemType==='BAR'?'Bar':'Forging'):''}</div>
            <span class="pill rc-pill ${g.result==='Pass'?'pass':g.result==='Fail'?'fail':g.result==='Hold'?'hold':'open'}">${g.result}</span>
            <div class="rc-row"><span class="k">Qty Ord./Rec.</span><span class="v">${g.qtyOrdered} / ${g.qtyReceived}</span></div>
            <div class="rc-row"><span class="k">UOM</span><span class="v">${esc(g.uom)||'—'}</span></div>
            <div class="rc-row"><span class="k">Inspector</span><span class="v">${esc(g.inspector)||'—'}</span></div>
            <div class="rc-row"><span class="k">Supplier Invoice</span><span class="v">${esc(g.invoiceNo)||'—'}${g.invoiceDate?' ('+fmtDate(g.invoiceDate)+')':''}</span></div>
            <div class="rc-row"><span class="k">Test Certificate</span><span class="v">${esc(g.testCert)||'—'}</span></div>
            <div class="rc-row"><span class="k">Heat No</span><span class="v">${esc(g.heatNo)||'—'}</span></div>
            <div class="rc-actions">
              ${g.result==='Pass'? (g.pushedToStores? `<span class="hint" style="position:static;">✓ In Stores</span>` : `<button class="btn small" onclick="pushToStores('${g.id}')">→ Stores</button>`) : (g.result==='Hold' ? `<span class="hint" style="position:static; color:var(--amber);">On Hold — not in Stores</span>` : g.result==='Fail' ? `<span class="hint" style="position:static; color:var(--red);">Rejected — not in Stores</span>` : '')}
              <button class="btn small ${g.result==='Pending'?'amber':'ghost'}" onclick="editGR('${g.id}')">${g.result==='Pending'?'🔬 Inspect':'Edit'}</button>
              <button class="btn danger" onclick="deleteRow('receiving','${g.id}')">Del</button>
            </div>
          </div>`;
        }).join('') || '<div class="empty">No receiving entries for this unit yet — these are created automatically from Purchase → Material Receiving.</div>'}
      </div>
    </div>
  `;
}
function manualGRFormHtml(poOptions){
  return `
    <div style="margin-top:14px; padding-top:14px; border-top:1px dashed var(--line);">
      <div class="hint" style="position:static; margin-bottom:8px;">For material that arrived without a Material Receiving log entry. Prefer logging it there instead whenever possible.</div>
      <div class="frow g4">
        <div><label class="fl">Against PO</label><select id="grPO" onchange="onGRPOChange()"><option value="">— select —</option>${poOptions.map(p=>`<option value="${p.id}">${esc(p.poNo)} — ${esc(p.supplier)}</option>`).join('')}</select></div>
        <div><label class="fl">Item</label><select id="grItem" onchange="onGRItemChange()"><option value="">— select PO first —</option></select></div>
        <div><label class="fl">UOM</label><select id="grUom"><option value="">— select —</option><option value="Nos">Nos</option><option value="Kg">Kg</option><option value="Mtr">Mtr</option></select></div>
        <div><label class="fl">Date Received</label><input id="grDate" type="date" value="${today()}"></div>
      </div>
      <div class="frow g4">
        <div><label class="fl">DC / Challan No</label><input id="grDCNo" placeholder="e.g. DC-4521"></div>
        <div><label class="fl">Qty Received</label><input id="grQtyRec" type="number"></div>
        <div><label class="fl">Inspector</label><select id="grInspector">${hrInspectorNameOptionsHtml('')}</select></div>
        <div><label class="fl">Result</label><select id="grResult"><option>Pending</option><option>Pass</option><option>Hold</option><option>Fail</option></select></div>
      </div>
      <div class="frow g4">
        <div><label class="fl">Supplier Invoice No</label><input id="grInvNo" placeholder="e.g. INV-1023"></div>
        <div><label class="fl">Invoice Date</label><input id="grInvDate" type="date"></div>
        <div><label class="fl">Test Certificate No</label><input id="grTC" placeholder="TC / mill certificate no."></div>
        <div><label class="fl">Heat No</label><input id="grHeat" placeholder="Heat / batch no."></div>
      </div>
      <div class="frow"><div><textarea id="grRemarks" placeholder="Crack detection, TC verified, size/rust checks, etc."></textarea></div></div>
      <input type="hidden" id="grQtyOrd" value="">
      <div class="rowactions" style="justify-content:flex-start; margin-top:14px;">
        <button class="btn amber" onclick="addGR()">💾 Save Receiving Entry</button>
      </div>
    </div>`;
}
function toggleManualGR(){ manualGRMode = !manualGRMode; render(); }
function editGR(id){
  editingGRId = id;
  manualGRMode = false;
  render();
}
function cancelEditGR(){
  editingGRId = null;
  manualGRMode = false;
  render();
}
function onGRPOChange(){
  const poId = document.getElementById('grPO').value;
  const itemSel = document.getElementById('grItem');
  const po = DB.purchase.find(p=>p.id===poId);
  const items = po ? (po.items||[]) : [];
  itemSel.innerHTML = '<option value="">— select item —</option>' + items.map((r,i)=>`<option value="${i}" data-qty="${r.qty||0}" data-uom="${esc(r.uom)||''}">${esc(r.desc)} (Qty ${r.qty||0})</option>`).join('');
  document.getElementById('grQtyOrd').value = '';
  document.getElementById('grUom').value = '';
}
function onGRItemChange(){
  const itemSel = document.getElementById('grItem');
  const opt = itemSel.options[itemSel.selectedIndex];
  document.getElementById('grQtyOrd').value = opt && opt.dataset.qty ? opt.dataset.qty : '';
  const uomEl = document.getElementById('grUom');
  if(uomEl && opt && opt.dataset.uom) uomEl.value = opt.dataset.uom;
}
function addGR(){
  if(!requireWorkingUnit()) return;
  if(editingGRId){
    // Inspecting an existing entry — material/quantity data is auto-populated from Material
    // Receiving and is not re-collected here; only inspection-specific fields are saved.
    const g = DB.receiving.find(x=>x.id===editingGRId);
    if(!g){ editingGRId = null; render(); return; }
    const wasPushed = g.pushedToStores;
    const oldQty = g.qtyReceived||0;
    const oldResult = g.result;
    g.inspector = document.getElementById('grInspector').value.trim();
    g.result = document.getElementById('grResult').value;
    g.testCert = document.getElementById('grTC').value.trim();
    g.heatNo = document.getElementById('grHeat').value.trim();
    g.remarks = document.getElementById('grRemarks').value.trim();
    if(g.result==='Pass' && !g.pushedToStores){
      routeReceivingToStores(g.id);
    } else if(wasPushed && g.pushedToStores && oldResult==='Pass' && g.result==='Pass'){
      // already pushed earlier — reconcile the linked stock qty in case it was corrected upstream
      reconcilePushedStockQty(g, oldQty, g.qtyReceived||0);
    }
    editingGRId = null;
    saveDB(); toast(g.pushedToStores && g.pushedToBucket ? 'Inspection result saved — moved to '+g.pushedToBucket : 'Inspection result saved'); render();
    return;
  }
  // Manual / direct entry — no linked Material Receiving record, so material details are collected here.
  const poId=document.getElementById('grPO').value;
  const itemSel = document.getElementById('grItem');
  const itemIdx = itemSel.value;
  const po = DB.purchase.find(p=>p.id===poId);
  const poItem = (po && po.items && po.items[itemIdx]) ? po.items[itemIdx] : null;
  if(!poId){ toast('Select a PO'); return; }
  if(!poItem){ toast('Select an item'); return; }
  const uom = document.getElementById('grUom').value.trim();
  if(!uom){ toast('UOM is required'); return; }
  const data = {
    poId, item:poItem.desc, partNo:poItem.partNo||'', partName:poItem.partName||'', itemType:poItem.itemType||'', uom, unit:currentUnit, date:document.getElementById('grDate').value,
    dcNo:(document.getElementById('grDCNo')||{value:''}).value.trim(),
    inspector:document.getElementById('grInspector').value.trim(),
    qtyOrdered:parseFloat(poItem.qty)||0,
    qtyReceived:parseFloat(document.getElementById('grQtyRec').value)||0,
    result:document.getElementById('grResult').value,
    invoiceNo:document.getElementById('grInvNo').value.trim(),
    invoiceDate:document.getElementById('grInvDate').value,
    testCert:document.getElementById('grTC').value.trim(),
    heatNo:document.getElementById('grHeat').value.trim(),
    remarks:document.getElementById('grRemarks').value.trim()
  };
  const newG = {id:'g'+Date.now(), pushedToStores:false, ...data};
  DB.receiving.push(newG);
  if(newG.result==='Pass'){ routeReceivingToStores(newG.id); }
  manualGRMode = false;
  saveDB(); toast(newG.pushedToStores && newG.pushedToBucket ? 'Receiving entry saved — auto-moved to '+newG.pushedToBucket : 'Receiving entry saved'); render();
}

function bomMasterLookup(partNo){
  if(!partNo) return null;
  const p = partNo.trim().toLowerCase();
  let row = DB.bom.find(b=>b.mapType==='BAR' && (b.purPartNo||'').trim().toLowerCase()===p);
  if(row) return {itemType:'BAR', finPartNo:row.finPartNo||'', finPartName:row.finPartName||'', customerId:row.customerId||null, customerName:row.customerName||'', uom:row.uom||'', unitWeight: row.prodPieceWeight||row.pieceWeight||0};
  row = DB.bom.find(b=>b.mapType==='FORGING' && (b.forgPartNo||'').trim().toLowerCase()===p);
  if(row) return {itemType:'FORGING', finPartNo:row.finPartNo||'', finPartName:row.finPartName||'', customerId:row.customerId||null, customerName:row.customerName||'', uom:row.uom||'', unitWeight:0};
  return null;
}
function reconcilePushedStockQty(g, oldQty, newQty){
  const delta = Math.round((newQty - oldQty) * 10000) / 10000;
  if(!delta) return;
  const partNo = g.partNo||'';
  const masterItem = partNo ? DB.items.find(i=>(i.code||'').trim().toLowerCase()===partNo.trim().toLowerCase()) : null;
  const bomMatch = bomMasterLookup(partNo);
  const itemType = (g.itemType==='BAR'||g.itemType==='FORGING') ? g.itemType : (masterItem ? masterItem.type : (bomMatch?bomMatch.itemType:null));
  let s = null;
  if(itemType==='BAR'){
    s = DB.storesBar.find(x=>unitMatch(x.unit) && x.kind!=='converted' && x.partNo===partNo && (!bomMatch||!bomMatch.customerId||x.customerId===bomMatch.customerId));
  } else if(itemType==='FORGING'){
    s = DB.storesForging.find(x=>unitMatch(x.unit) && x.kind!=='finished' && x.partNo===partNo && (!bomMatch||!bomMatch.customerId||x.customerId===bomMatch.customerId));
  } else {
    s = DB.stores.find(x=>unitMatch(x.unit) && !x.labourQuotationId && ((partNo && x.partNo===partNo) || x.item===g.item || x.partName===g.item));
  }
  if(!s) return;
  s.qty = Math.round(((s.qty||0) + delta) * 10000) / 10000;
  if('receivedQty' in s) s.receivedQty = Math.round(((s.receivedQty||0) + delta) * 10000) / 10000;
  if(!s.history) s.history = [];
  pushStockHistory(s, delta>0?'purchase':'adjust', delta, `Receiving entry corrected — Inv ${g.invoiceNo||'—'} (Qty Received ${oldQty} → ${g.qtyReceived||0})`);
}
function routeReceivingToStores(grId){
  if(!requireWorkingUnit()) return;
  const g = DB.receiving.find(x=>x.id===grId);
  if(!g) return;
  if(g.result!=='Pass'){ return; }
  if(g.pushedToStores){ return; }
  const qty = g.qtyReceived||0;
  const source = 'GRN — Inv '+(g.invoiceNo||'—')+(g.dcNo?(' / DC '+g.dcNo):'');
  const partNo = g.partNo||'';
  const partName = g.partName||g.item||'Item';
  const masterItem = partNo ? DB.items.find(i=>(i.code||'').trim().toLowerCase()===partNo.trim().toLowerCase()) : null;
  // Bar/Forging Mapping (Product Development) is the authoritative source for these raw materials —
  // fall back to it whenever the PO item / item master doesn't already say BAR or FORGING, so incoming
  // material never silently lands in the generic Issue-to-Production pool instead of Bar/Forging Stock.
  const bomMatch = bomMasterLookup(partNo);
  const itemType = (g.itemType==='BAR'||g.itemType==='FORGING') ? g.itemType : (masterItem ? masterItem.type : (bomMatch?bomMatch.itemType:null)); // 'BAR' | 'FORGING' | null

  if(itemType==='BAR'){
    let s = DB.storesBar.find(x=>unitMatch(x.unit) && x.kind!=='converted' && x.partNo===partNo && (!bomMatch||!bomMatch.customerId||x.customerId===bomMatch.customerId));
    if(s){
      s.qty = Math.round(((s.qty||0) + qty) * 10000) / 10000;
      s.receivedQty = Math.round(((s.receivedQty||0) + qty) * 10000) / 10000;
      s.source = source;
      if(partName) s.partName = partName;
      if(bomMatch){
        if(bomMatch.finPartNo){ s.finPartNo = bomMatch.finPartNo; s.finPartName = bomMatch.finPartName; }
        if(bomMatch.customerId && !s.customerId){ s.customerId = bomMatch.customerId; s.customerName = bomMatch.customerName; }
        if(bomMatch.unitWeight>0 && !s.unitWeight) s.unitWeight = bomMatch.unitWeight;
      }
      pushStockHistory(s, 'purchase', qty, `Received — Inv ${g.invoiceNo||'—'}, TC ${g.testCert||'—'}, Heat ${g.heatNo||'—'}`);
    }else{
      s = {
        id:'bar'+Date.now(), unit:currentUnit, kind:'bar', partNo, partName, qty, receivedQty:qty, issuedQty:0, uom:(bomMatch&&bomMatch.uom)||g.uom||'Kg', source, history:[],
        customerId:(bomMatch&&bomMatch.customerId)||null, customerName:(bomMatch&&bomMatch.customerName)||'',
        finPartNo:(bomMatch&&bomMatch.finPartNo)||'', finPartName:(bomMatch&&bomMatch.finPartName)||'',
        unitWeight:(bomMatch&&bomMatch.unitWeight>0)?bomMatch.unitWeight:undefined
      };
      pushStockHistory(s, 'purchase', qty, `Received — Inv ${g.invoiceNo||'—'}, TC ${g.testCert||'—'}, Heat ${g.heatNo||'—'}`);
      DB.storesBar.push(s);
    }
  } else if(itemType==='FORGING'){
    let s = DB.storesForging.find(x=>unitMatch(x.unit) && x.kind!=='finished' && x.partNo===partNo && (!bomMatch||!bomMatch.customerId||x.customerId===bomMatch.customerId));
    if(s){
      s.qty = Math.round(((s.qty||0) + qty) * 10000) / 10000;
      s.receivedQty = Math.round(((s.receivedQty||0) + qty) * 10000) / 10000;
      s.source = source;
      if(partName) s.partName = partName;
      if(bomMatch && bomMatch.customerId && !s.customerId){ s.customerId = bomMatch.customerId; s.customerName = bomMatch.customerName; }
      pushStockHistory(s, 'purchase', qty, `Received — Inv ${g.invoiceNo||'—'}, TC ${g.testCert||'—'}, Heat ${g.heatNo||'—'}`);
    }else{
      s = {
        id:'forg'+Date.now(), unit:currentUnit, kind:'forging', partNo, partName, qty, receivedQty:qty, issuedQty:0, uom:(bomMatch&&bomMatch.uom)||g.uom||'Nos', source, history:[],
        customerId:(bomMatch&&bomMatch.customerId)||null, customerName:(bomMatch&&bomMatch.customerName)||''
      };
      pushStockHistory(s, 'purchase', qty, `Received — Inv ${g.invoiceNo||'—'}, TC ${g.testCert||'—'}, Heat ${g.heatNo||'—'}`);
      DB.storesForging.push(s);
    }
  } else {
    // Not matched to a Bar/Forging item master entry — fall back to general Stores (Issue to Production pool)
    let s = DB.stores.find(x=>unitMatch(x.unit) && !x.labourQuotationId && ((partNo && x.partNo===partNo) || x.item===g.item || x.partName===g.item));
    if(s){
      s.qty = Math.round(((s.qty||0) + qty) * 10000) / 10000;
      s.source = source;
      if(partNo) s.partNo = partNo;
      if(partName) s.partName = partName;
      if(g.invoiceNo) s.invoiceNo = g.invoiceNo;
      if(g.invoiceDate) s.invoiceDate = g.invoiceDate;
      if(g.testCert) s.testCert = g.testCert;
      if(g.heatNo) s.heatNo = g.heatNo;
      if(!s.history) s.history = [];
      s.history.push({date:g.date||today(), cardNo:'GRN', qty, balanceAfter:s.qty, note:`Received — Inv ${g.invoiceNo||'—'}, TC ${g.testCert||'—'}, Heat ${g.heatNo||'—'}`});
    }else{
      s = {
        id:'s'+Date.now(), unit:currentUnit, item:g.item||'Item', partNo, partName,
        qty, issuedQty:0, history:[{date:g.date||today(), cardNo:'GRN', qty, balanceAfter:qty, note:`Received — Inv ${g.invoiceNo||'—'}, TC ${g.testCert||'—'}, Heat ${g.heatNo||'—'}`}],
        location:'Raw Material Store', source,
        invoiceNo:g.invoiceNo||'', invoiceDate:g.invoiceDate||'', testCert:g.testCert||'', heatNo:g.heatNo||''
      };
      DB.stores.push(s);
    }
  }
  g.pushedToStores = true;
  g.pushedToBucket = itemType==='BAR' ? 'Bar Stock' : itemType==='FORGING' ? 'Forging Stock' : 'Issue to Production stock';
}
function pushToStores(grId){
  const g = DB.receiving.find(x=>x.id===grId);
  if(!g) return;
  if(g.result!=='Pass'){ toast('Only Pass (OK) inspection results can be pushed to Stores'); return; }
  if(g.pushedToStores){ toast('Already moved to Stores for this entry'); return; }
  routeReceivingToStores(grId);
  saveDB(); toast('Stores stock updated from receiving entry (OK / Pass part) — routed to '+(g.pushedToBucket||'Stores')); render();
}

function printReceiving(){
  const list = DB.receiving.filter(x=>reportUnitMatch(x.unit));
  const headers = ['Date','Item','PO No','UOM','Supplier Inv. No','Inv. Date','Test Cert. No','Heat No','Qty Ord.','Qty Rec.','Inspector','Result','Remarks'];
  const rows = list.map(g=>{
    const po = DB.purchase.find(p=>p.id===g.poId);
    return [fmtDate(g.date), esc(g.item)||'—', po?esc(po.poNo):'—', esc(g.uom)||'—', esc(g.invoiceNo)||'—', fmtDate(g.invoiceDate)||'—', esc(g.testCert)||'—', esc(g.heatNo)||'—', `<span class="num">${g.qtyOrdered}</span>`, `<span class="num">${g.qtyReceived}</span>`, esc(g.inspector)||'—', esc(g.result), esc(g.remarks)||'—'];
  });
  printReport('Receiving Inspection Log', headers, rows, {barLeft:`Unit: ${esc(reportScopeLabel())}`, barRight:`Total Entries: ${list.length}`});
}

/* ---- Receiving Inspection → Subcontract Inspection (job-work material returning from a Subcontractor) ----
   Populated automatically when a Subcontract Job (Job Card Tracking → Subcontract Jobs) is marked
   "✅ Received" — mirrors the Raw Material Inspection tab's Pending → Pass/Hold/Fail → Stores flow,
   except the source is a Subcontractor's return (job work) instead of a Purchase PO delivery. */
function editSubInsp(id){ editingSubInspId = id; render(); }
function cancelEditSubInsp(){ editingSubInspId = null; render(); }
function addSubInsp(){
  if(!requireWorkingUnit()) return;
  if(!editingSubInspId) return;
  const insp = DB.subInspection.find(x=>x.id===editingSubInspId);
  if(!insp){ editingSubInspId = null; render(); return; }
  insp.inspector = document.getElementById('siInspector').value.trim();
  insp.result = document.getElementById('siResult').value;
  insp.remarks = document.getElementById('siRemarks').value.trim();
  if(insp.result==='Pass' && !insp.pushedToStores){
    routeSubInspToStores(insp.id);
  }
  editingSubInspId = null;
  saveDB();
  toast(insp.pushedToStores ? `Inspection result saved — moved to Stores (WIP), Next Stage: ${insp.nextStage||'—'}` : 'Inspection result saved');
  render();
}
// Moves a Passed Subcontract Inspection entry into Stores (WIP), exactly like a raw-material GR
// Pass — the Part's saved routing decides what the Next Stage should be from here.
function routeSubInspToStores(id){
  const insp = DB.subInspection.find(x=>x.id===id);
  if(!insp) return;
  if(insp.result!=='Pass') return;
  if(insp.pushedToStores) return;
  markJobCardComplete('subInspection', insp.id, today());
  const we = returnQtyToStoresWIP({partNo:insp.partNo, partName:insp.partName, qty:insp.qtyReceived, cardNo:insp.cardNo, fromStage:'Subcontract', routeIndex:insp.routeIndex});
  insp.pushedToStores = true;
  insp.returnedToStoreId = we.id;
  insp.nextStage = we.nextStage;
}
function pushSubInspToStores(id){
  const insp = DB.subInspection.find(x=>x.id===id);
  if(!insp) return;
  if(insp.result!=='Pass'){ toast('Only Pass (OK) inspection results can be pushed to Stores'); return; }
  if(insp.pushedToStores){ toast('Already moved to Stores for this entry'); return; }
  routeSubInspToStores(id);
  saveDB(); toast('Stores (WIP) updated from Subcontract Inspection — Next Stage: '+(insp.nextStage||'—')); render();
}
function renderReceivingSubcontract(main){
  const list = DB.subInspection.filter(x=>reportUnitMatch(x.unit));
  const editing = editingSubInspId ? DB.subInspection.find(x=>x.id===editingSubInspId) : null;
  const pendingCount = list.filter(x=>x.result==='Pending').length;

  let formHtml;
  if(editing){
    formHtml = `
    <div class="panel" style="margin-top:12px;">
      <h3>🔬 Record Inspection Result <span class="hint">🔗 Job data auto-filled from Subcontract Jobs receipt</span></h3>

      <div class="mini-card" style="margin-bottom:14px;">
        <div class="mc-row"><span class="mc-k">Part No / Name</span><span class="mc-v">${esc(editing.partNo)}${editing.partName?' — '+esc(editing.partName):''}</span></div>
        <div class="mc-row"><span class="mc-k">Job No / Card No</span><span class="mc-v">${esc(editing.jobNo)||'—'} · <span style="color:var(--amber);">${esc(editing.cardNo)||'—'}</span></span></div>
        <div class="mc-row"><span class="mc-k">Subcontractor</span><span class="mc-v">${esc(editing.subcontractorName)||'—'}</span></div>
        <div class="mc-row"><span class="mc-k">Operation/Stage</span><span class="mc-v">${esc(editing.operation)||'—'}</span></div>
        <div class="mc-row"><span class="mc-k">DC No.</span><span class="mc-v">${esc(editing.dcNo)||'—'}${editing.dcDate?' ('+fmtDate(editing.dcDate)+')':''}</span></div>
        <div class="mc-row"><span class="mc-k">Qty Received</span><span class="mc-v"><strong>${editing.qtyReceived||0}</strong></span></div>
        <div class="mc-row"><span class="mc-k">Date Received</span><span class="mc-v">${fmtDate(editing.date)||'—'}</span></div>
      </div>

      <div class="frow g4">
        <div><label class="fl">Inspector</label><select id="siInspector">${hrInspectorNameOptionsHtml(editing.inspector||'')}</select></div>
        <div><label class="fl">Result <span class="hint" style="position:static; font-size:9.5px;">(only Pass adds to Stores)</span></label><select id="siResult">
          <option ${editing.result==='Pending'?'selected':''}>Pending</option>
          <option ${editing.result==='Pass'?'selected':''}>Pass</option>
          <option ${editing.result==='Hold'?'selected':''}>Hold</option>
          <option ${editing.result==='Fail'?'selected':''}>Fail</option>
        </select></div>
      </div>
      <div class="frow"><div><textarea id="siRemarks" placeholder="Dimension checks, visual inspection, process verification, etc.">${esc(editing.remarks)||''}</textarea></div></div>

      <div class="rowactions" style="justify-content:flex-start; margin-top:14px;">
        <button class="btn amber" onclick="addSubInsp()">💾 Save Inspection Result</button>
        <button class="btn ghost" onclick="cancelEditSubInsp()">Cancel</button>
      </div>
    </div>`;
  } else {
    formHtml = `
    <div class="panel" style="margin-top:12px;">
      <div class="empty">${pendingCount>0?`${pendingCount} entr${pendingCount===1?'y':'ies'} awaiting inspection`+' — select "🔬 Inspect" on an entry below.':'No entries awaiting inspection right now — material marked "✅ Received" in Job Card Tracking → Subcontract Jobs will appear here automatically.'}</div>
    </div>`;
  }

  main.innerHTML = `
    ${formHtml}
    <div class="panel">
      <h3>Subcontract Inspection Log <span class="hint">${list.length} entries</span></h3>
      <div class="grid-box">
        ${list.slice().reverse().map(g=>`<div class="rec-card">
            <div class="link-badge">🔗 Received from Subcontractor</div>
            <div class="rc-title">${esc(g.partNo)}</div>
            <div class="rc-sub">${esc(g.partName)||''} · Job ${esc(g.jobNo)||'—'} · ${fmtDate(g.date)}</div>
            <span class="pill rc-pill ${g.result==='Pass'?'pass':g.result==='Fail'?'fail':g.result==='Hold'?'hold':'open'}">${g.result}</span>
            <div class="rc-row"><span class="k">Card No</span><span class="v" style="color:var(--amber);">${esc(g.cardNo)||'—'}</span></div>
            <div class="rc-row"><span class="k">Subcontractor</span><span class="v">${esc(g.subcontractorName)||'—'}</span></div>
            <div class="rc-row"><span class="k">Operation/Stage</span><span class="v">${esc(g.operation)||'—'}</span></div>
            <div class="rc-row"><span class="k">DC No.</span><span class="v">${esc(g.dcNo)||'—'}${g.dcDate?' ('+fmtDate(g.dcDate)+')':''}</span></div>
            <div class="rc-row"><span class="k">Qty Received</span><span class="v">${g.qtyReceived}</span></div>
            <div class="rc-row"><span class="k">Inspector</span><span class="v">${esc(g.inspector)||'—'}</span></div>
            <div class="rc-actions">
              ${g.result==='Pass'? (g.pushedToStores? `<span class="hint" style="position:static;">✓ In Stores (Next: ${esc(g.nextStage)||'—'})</span>` : `<button class="btn small" onclick="pushSubInspToStores('${g.id}')">→ Stores</button>`) : (g.result==='Hold' ? `<span class="hint" style="position:static; color:var(--amber);">On Hold — not in Stores</span>` : g.result==='Fail' ? `<span class="hint" style="position:static; color:var(--red);">Rejected — not in Stores</span>` : '')}
              <button class="btn small ${g.result==='Pending'?'amber':'ghost'}" onclick="editSubInsp('${g.id}')">${g.result==='Pending'?'🔬 Inspect':'Edit'}</button>
              <button class="btn danger" onclick="deleteRow('subInspection','${g.id}')">Del</button>
            </div>
          </div>`).join('') || '<div class="empty">No Subcontract Inspection entries for this unit yet — these are created automatically when a Subcontract Job is marked "✅ Received".</div>'}
      </div>
    </div>
  `;
}
function printSubInsp(){
  const list = DB.subInspection.filter(x=>reportUnitMatch(x.unit));
  const headers = ['Date','Part No','Part Name','Job No','Card No','Subcontractor','Operation','DC No.','Qty Rec.','Inspector','Result','Remarks'];
  const rows = list.map(g=>[fmtDate(g.date), esc(g.partNo)||'—', esc(g.partName)||'—', esc(g.jobNo)||'—', esc(g.cardNo)||'—', esc(g.subcontractorName)||'—', esc(g.operation)||'—', esc(g.dcNo)||'—', `<span class="num">${g.qtyReceived}</span>`, esc(g.inspector)||'—', esc(g.result), esc(g.remarks)||'—']);
  printReport('Subcontract Inspection Log', headers, rows, {barLeft:`Unit: ${esc(reportScopeLabel())}`, barRight:`Total Entries: ${list.length}`});
}
