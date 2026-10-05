/* ---------------- FINAL INSPECTION ---------------- */
function blankChar(){ return {name:'',spec:'',usl:'',lsl:'',method:'',obs:['','','','',''],remark:''}; }
function blankFIHeader(){
  return {partNo:'',desc:'',date:today(),card:'',customer:'',invoice:'',lot:'',status:'ok',
    grade:'',supplier:'',grir:'',cert:'',preparedBy:'',approvedBy:'',deviationNote:''};
}
function toNum(v){ if(v===undefined||v===null||v==='') return null; const n=parseFloat(v); return isNaN(n)?null:n; }
function evaluateChar(c){
  const u=toNum(c.usl), l=toNum(c.lsl);
  const obsResults = c.obs.map(v=>{
    const s=(v===undefined||v===null)?'':String(v).trim();
    if(s==='') return 'empty';
    if(u!==null && l!==null){
      const min=Math.min(u,l), max=Math.max(u,l);
      const num=parseFloat(s.replace(/[^\d.\-]/g,''));
      if(isNaN(num)) return 'na';
      return (num>=min && num<=max) ? 'ok' : 'bad';
    }
    const up=s.toUpperCase();
    if(up==='OK') return 'ok';
    if(up==='NOT OK'||up==='NG'||up==='FAIL') return 'bad';
    return 'na';
  });
  const hasBad = obsResults.includes('bad');
  return hasBad ? 'bad' : 'ok';
}
function openNewFI(){
  editingFIId=null; fiHeaderDraft=blankFIHeader(); fiCharsDraft=[blankChar()]; fiViewId=null; fiCardReportForId=null;
  if(currentUser && currentUser.name) fiHeaderDraft.preparedBy = currentUser.name;
  render();
}
function openEditFI(id){
  const f = DB.finalInsp.find(x=>x.id===id); if(!f) return;
  editingFIId=id; fiViewId=null; fiCardReportForId=null;
  fiHeaderDraft={partNo:f.partNo||'',desc:f.desc||'',date:f.date||today(),card:f.card||'',customer:f.customer||'',
    invoice:f.invoice||'',lot:f.lot||'',status:f.status||'ok',grade:f.grade||'',supplier:f.supplier||'',
    grir:f.grir||'',cert:f.cert||'',preparedBy:f.preparedBy||'',approvedBy:f.approvedBy||'',deviationNote:f.deviationNote||''};
  fiCharsDraft = (f.chars&&f.chars.length) ? JSON.parse(JSON.stringify(f.chars)) : [blankChar()];
  render();
}
function cancelFI(){ editingFIId=null; fiHeaderDraft=null; fiCharsDraft=null; fiCardReportForId=null; render(); }
function captureFIForm(){
  if(!fiHeaderDraft) return;
  const g=id=>{const el=document.getElementById(id); return el?el.value:'';};
  fiHeaderDraft.partNo=g('fiPartNo').trim(); fiHeaderDraft.desc=g('fiDesc').trim();
  fiHeaderDraft.date=g('fiDate'); fiHeaderDraft.card=g('fiCard').trim();
  fiHeaderDraft.customer=g('fiCustomer').trim(); fiHeaderDraft.invoice=g('fiInvoice').trim();
  fiHeaderDraft.lot=g('fiLot').trim(); fiHeaderDraft.status=g('fiStatus');
  fiHeaderDraft.grade=g('fiGrade').trim(); fiHeaderDraft.supplier=g('fiMatSupplier').trim();
  fiHeaderDraft.grir=g('fiGrir').trim(); fiHeaderDraft.cert=g('fiCert').trim();
  fiHeaderDraft.preparedBy=g('fiPrep').trim(); fiHeaderDraft.approvedBy=g('fiAppr').trim();
  fiHeaderDraft.deviationNote=g('fiDeviation').trim();
  document.querySelectorAll('.charrow').forEach((row,idx)=>{
    if(!fiCharsDraft[idx]) return;
    const c=fiCharsDraft[idx];
    c.name=row.querySelector('.c_name').value.trim();
    c.spec=row.querySelector('.c_spec').value.trim();
    c.usl=row.querySelector('.c_usl').value.trim();
    c.lsl=row.querySelector('.c_lsl').value.trim();
    c.method=row.querySelector('.c_method').value.trim();
    c.obs=[0,1,2,3,4].map(i=>row.querySelector(`.c_obs${i}`).value.trim());
    c.remark=row.querySelector('.c_remark').value.trim();
  });
}
function addCharRow(){ captureFIForm(); fiCharsDraft.push(blankChar()); render(); }
function removeCharRow(idx){ captureFIForm(); if(fiCharsDraft.length>1) fiCharsDraft.splice(idx,1); render(); }
function saveFI(){
  if(!requireWorkingUnit()) return;
  captureFIForm();
  if(!fiHeaderDraft.partNo){ toast('Part No is required'); return; }
  if(!fiHeaderDraft.desc){ toast('Part Name is required'); return; }
  const chars = fiCharsDraft.map((c,i)=>({...c, sl:i+1, result:evaluateChar(c)}));
  const anyBad = chars.some(c=>c.result==='bad');
  const anyFilled = chars.some(c=>c.name.trim()!=='');
  const result = !anyFilled ? 'Pending' : (anyBad ? 'Fail' : 'Pass');
  const qty = parseFloat((fiHeaderDraft.lot.match(/[\d.]+/)||[0])[0])||0;
  // If this report is being generated from a Final Inspection Card's "OK Qty" entry, remember
  // which card it belongs to — the report stays a normal, separate Final Inspection Report record
  // (still linked to its Part No as always), just tagged so the card can track it (fiCardId).
  const linkCardId = fiCardReportForId;
  const record = {
    unit:currentUnit, partNo:fiHeaderDraft.partNo, desc:fiHeaderDraft.desc, qty,
    date:fiHeaderDraft.date, card:fiHeaderDraft.card, customer:fiHeaderDraft.customer,
    invoice:fiHeaderDraft.invoice, lot:fiHeaderDraft.lot, status:fiHeaderDraft.status,
    grade:fiHeaderDraft.grade, supplier:fiHeaderDraft.supplier, grir:fiHeaderDraft.grir, cert:fiHeaderDraft.cert,
    preparedBy:fiHeaderDraft.preparedBy, approvedBy:fiHeaderDraft.approvedBy, deviationNote:fiHeaderDraft.deviationNote,
    chars, result
  };
  if(linkCardId) record.fiCardId = linkCardId;
  let savedId;
  if(editingFIId){
    savedId = editingFIId;
    const idx = DB.finalInsp.findIndex(x=>x.id===editingFIId);
    DB.finalInsp[idx] = {...DB.finalInsp[idx], ...record};
    toast('Final inspection record updated');
  }else{
    const newFI = {id:'fi'+Date.now(), ...record};
    DB.finalInsp.push(newFI);
    savedId = newFI.id;
    toast('Final inspection record saved');
  }
  // Final Inspection Card linkage: attach this report to its card (once) and let the card
  // recompute its own Pending Qty / Open-Closed status from every report now linked to it.
  if(linkCardId){
    const card = DB.finalInspCards.find(x=>x.id===linkCardId);
    if(card && card.reportIds.indexOf(savedId)===-1) card.reportIds.push(savedId);
    recomputeFICardStatus(linkCardId);
  }
  fiCardReportForId = null;
  editingFIId=null; fiHeaderDraft=null; fiCharsDraft=null;
  saveDB();
  render();
}
function viewFI(id){ fiViewId=id; editingFIId=null; fiHeaderDraft=null; fiCharsDraft=null; fiCardReportForId=null; render(); }
function closeViewFI(){ fiViewId=null; render(); }
function printFI(){
  const f = DB.finalInsp.find(x=>x.id===fiViewId);
  if(!f) return;
  const rows = f.chars.map(c=>[c.sl, esc(c.name), esc(c.spec)||'—', esc(c.usl)||'—', esc(c.lsl)||'—', esc(c.method)||'—',
    ...c.obs.map(o=>esc(o)||'—'), c.result==='ok'?'OK':c.result==='bad'?'NOT OK':'—', esc(c.remark)||'—']);
  const note = `<strong>Customer:</strong> ${esc(f.customer)||'—'} &nbsp; <strong>Invoice No:</strong> ${esc(f.invoice)||'—'} &nbsp; <strong>Lot Qty:</strong> ${esc(f.lot)||'—'}<br>
    <strong>Material Grade:</strong> ${esc(f.grade)||'—'} &nbsp; <strong>Material Supplier:</strong> ${esc(f.supplier)||'—'} &nbsp; <strong>GRIR No./Date:</strong> ${esc(f.grir)||'—'}<br>
    <strong>Test Certificate No.:</strong> ${esc(f.cert)||'—'} &nbsp; <strong>Prepared By:</strong> ${esc(f.preparedBy)||'—'} &nbsp; <strong>Approved By:</strong> ${esc(f.approvedBy)||'—'}
    ${f.deviationNote?`<br><strong>Deviation Note:</strong> ${esc(f.deviationNote)}`:''}`;
  printReport(`Final Inspection Report — ${f.partNo}`,
    ['SL','Characteristic','Spec','USL','LSL','Method','Obs1','Obs2','Obs3','Obs4','Obs5','Result','Remark'],
    rows, {barLeft:`Part No: ${esc(f.partNo)} — ${esc(f.desc)||''}`, barRight:`Date: ${fmtDate(f.date)} · Card: ${esc(f.card)||'—'}`, note});
}

function fiSubtabsHtml(){
  return `<div class="subtabs" style="margin-top:12px;">
    ${subOK('finalInsp','cards')?`<button class="${fiCardsSubTab==='cards'?'active':''}" onclick="setFICardsSubTab('cards')">🗂 Final Inspection Cards</button>`:''}
    ${subOK('finalInsp','reports')?`<button class="${fiCardsSubTab==='reports'?'active':''}" onclick="setFICardsSubTab('reports')">📄 Final Inspection Reports</button>`:''}
  </div>`;
}
function setFICardsSubTab(t){ fiCardsSubTab = t; fiCardEntryId = null; fiCardEditId = null; render(); }
// Jumps from a Final Inspection Report (Reports tab / report view) back to the Final Inspection
// Card it was generated from, so the two stay easy to cross-reference.
function viewFICardFromReport(cardId){
  fiViewId=null; editingFIId=null; fiHeaderDraft=null; fiCharsDraft=null; fiCardReportForId=null;
  fiCardsSubTab='cards'; fiCardEntryId=null; fiCardEditId=null; render();
}
function renderFinalInsp(main){
  const list = DB.finalInsp.filter(x=>reportUnitMatch(x.unit));
  main.innerHTML = `
    <div class="topbar"><div></div></div>
    ${flowline('finalInsp')}
    ${fiSubtabsHtml()}
    <div id="fiSub" style="margin-top:12px;"></div>
  `;
  const sub = document.getElementById('fiSub');
  if(fiViewId) return renderFIReport(sub);
  if(fiHeaderDraft) return renderFIForm(sub);
  if(!subOK('finalInsp', fiCardsSubTab)) fiCardsSubTab = firstAllowedSub('finalInsp') || fiCardsSubTab;
  if(fiCardsSubTab==='cards') return renderFICards(sub);

  sub.innerHTML = `
    <div class="panel">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3 style="margin:0;">Final Inspection Records <span class="hint">${list.length} total</span></h3>
        <div>
          <button class="btn amber" onclick="openNewFI()">+ New Inspection Record</button>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="grid-box">
        ${list.slice().reverse().map(f=>`
          <div class="rec-card">
            <div class="rc-title">${esc(f.partNo)}</div>
            <div class="rc-sub">${esc(f.desc)||'—'} · ${esc(custDispByName(f.customer))||'—'}${f.quoteNo?` · Quote ${esc(f.quoteNo)}`:''}</div>
            <span class="badge rc-pill ${f.result==='Pass'?'ok':f.result==='Fail'?'bad':'dev'}">${f.result}</span>
            <div class="rc-row"><span class="k">Date</span><span class="v">${fmtDate(f.date)}</span></div>
            <div class="rc-row"><span class="k">Lot Qty</span><span class="v">${esc(f.lot)}</span></div>
            <div class="rc-actions">
              <button class="btn small ghost" onclick="viewFI('${f.id}')">View</button>
              <button class="btn small ghost" onclick="openEditFI('${f.id}')">Edit</button>
              ${f.fiCardId? `<button class="btn small ghost" onclick="viewFICardFromReport('${f.fiCardId}')">🗂 View Card</button>` : ''}
              <button class="btn danger" onclick="deleteRow('finalInsp','${f.id}')">Del</button>
            </div>
          </div>`).join('') || '<div class="empty">No final inspection records for this unit yet.</div>'}
      </div>
    </div>
  `;
}
// ---- Final Inspection Cards — Req.: Production → Final Inspection Qty → OK/Rework Qty entry →
// Final Inspection Report → Completed Report Copy → Final Inspection Card Closed. ----
function renderFICards(main){
  const list = DB.finalInspCards.filter(x=>reportUnitMatch(x.unit));
  const openCount = list.filter(c=>c.status!=='Closed').length;
  const entryCard = fiCardEntryId ? list.find(c=>c.id===fiCardEntryId) : null;
  const editCard = fiCardEditId ? list.find(c=>c.id===fiCardEditId) : null;
  main.innerHTML = `
    <div class="panel">
      <h3>Final Inspection Cards <span class="hint">${list.length} total — ${openCount} open</span></h3>
      <div class="hint" style="position:static; margin-bottom:0;">A card is created automatically the moment a completed Production quantity is sent to Final Inspection, carrying its Part No, Part Name and quantity across. It stays Open until its full quantity is inspected (OK + Rework = Production Qty) and every Final Inspection Report generated from it is completed — then it closes on its own. Once OK Qty reaches Finished Goods Stock, the card shows an ➡ Finished Goods mark.</div>
    </div>
    ${entryCard ? ficEntryPanelHtml(entryCard) : ''}
    ${editCard ? ficEditPanelHtml(editCard) : ''}
    <div class="panel">
      <div class="grid-box">
        ${list.length ? list.slice().reverse().map(c=>ficCardHtml(c)).join('') : '<div class="empty">No Final Inspection Cards yet — completed Production quantities sent to Final Inspection (Production → "→ Final Insp." or Stores → Material Issue — Next Stage) will appear here automatically.</div>'}
      </div>
    </div>
  `;
  if(entryCard || editCard){
    const panel = document.getElementById('ficEntryPanel') || document.getElementById('ficEditPanel');
    if(panel) panel.scrollIntoView({behavior:'smooth', block:'start'});
  }
}
function ficCardHtml(c){
  const isSel = c.id===fiCardEntryId;
  const isEditSel = c.id===fiCardEditId;
  const reports = ficReportsFor(c);
  const ficQtyInStock = ficInventoryFor(c).reduce((a,iv)=>a+(parseFloat(iv.qty)||0),0);
  const stockGap = Math.max(0, Math.round(((c.okQty||0)-ficQtyInStock)*10000)/10000);
  const fullyTransferred = ficQtyInStock>0 && stockGap<=0.0001;
  const closed = c.status==='Closed';
  return `<div class="rec-card" style="${closed?'opacity:0.78;':''} ${(isSel||isEditSel)?'border-color:var(--amber); box-shadow:0 0 0 2px var(--amber);':''}">
    <div class="rc-title">${esc(c.partNo)}</div>
    <div class="rc-sub">${esc(c.partName)||'—'} · ${esc(custDispByName(c.customer))||'—'}</div>
    <span class="badge rc-pill ${closed?'ok':'dev'}">${closed?'✓ Closed / Completed':'Open'}</span>
    ${fullyTransferred? `<span class="badge rc-pill ok" style="margin-left:6px;" title="OK Qty fully transferred to Finished Goods Stock">➡ Finished Goods</span>` : ''}
    ${c.cardNo?`<div class="rc-row"><span class="k">Card No</span><span class="v">${esc(c.cardNo)}</span></div>`:''}
    <div class="rc-row"><span class="k">Production Qty</span><span class="v">${c.prodQty}</span></div>
    <div class="rc-row"><span class="k">OK Qty</span><span class="v" style="color:var(--green);">${c.okQty}</span></div>
    <div class="rc-row"><span class="k">Rework Qty</span><span class="v" style="color:var(--amber);">${c.reworkQty}</span></div>
    <div class="rc-row"><span class="k">Pending Qty</span><span class="v" style="color:${c.pendingQty>0?'var(--red)':'inherit'}; font-weight:700;">${c.pendingQty}</span></div>
    <div class="rc-row"><span class="k">Date</span><span class="v">${fmtDate(c.date)}</span></div>
    ${reports.length? `<div class="rc-row"><span class="k">Reports</span><span class="v">${reports.map(r=>`<a href="javascript:void(0)" onclick="viewFI('${r.id}')" style="margin-right:8px;">${r.result==='Pass'?'✅':r.result==='Fail'?'❌':'⏳'} ${esc(r.lot)||esc(r.qty+'')}</a>`).join('')}</span></div>` : ''}
    ${ficQtyInStock>0? `<div class="rc-row"><span class="k">➡ Finished Stock</span><span class="v" style="color:var(--green); font-weight:700;">✓ ${ficQtyInStock} qty</span></div>` : ''}
    ${stockGap>0.0001? `<div class="rc-row"><span class="k">⚠ Not yet in Stock</span><span class="v" style="color:var(--red); font-weight:700;">${stockGap} qty</span></div>` : ''}
    <div class="rc-actions">
      ${closed ? `<span class="hint" style="position:static;">✓ Fully inspected &amp; reported</span>`
        : `<button class="btn small ${isSel?'':'ghost'}" onclick="toggleFICardEntry('${c.id}')">${isSel?'✓ Entry Open':'📝 Enter OK / Rework Qty'}</button>`}
      <button class="btn small ${isEditSel?'':'ghost'}" onclick="toggleFICardEdit('${c.id}')">${isEditSel?'✓ Edit Open':'✏️ Edit'}</button>
      ${ficQtyInStock>0? `<button class="btn small ghost" onclick="viewFICardStock('${c.id}')">📦 View in Finished Stock</button>` : ''}
      ${stockGap>0.0001? `<button class="btn small" onclick="syncFICardStock('${c.id}')">↻ Push ${stockGap} to Finished Stock</button>` : ''}
      ${(!closed && (c.okQty||0)===0 && (c.reworkQty||0)===0) ? `<button class="btn danger" onclick="deleteRow('finalInspCards','${c.id}')">Del</button>` : ''}
    </div>
  </div>`;
}
// Edit form — lets the team correct a card's own details (Part No/Name, Card No, Customer,
// Production Qty, OK Qty, Rework Qty) directly. Editing OK/Rework Qty here only corrects the
// figures recorded on the card; it does NOT move stock either way — use "Enter OK / Rework Qty"
// to send additional OK Qty to Finished Goods Stock, or the "↻ Push to Finished Stock" button if
// OK Qty and Finished Stock ever fall out of sync.
function ficEditPanelHtml(c){
  return `<div class="panel" id="ficEditPanel">
    <h3>✏️ Edit Final Inspection Card <span class="hint">${esc(c.partNo)}</span></h3>
    <div class="hint" style="position:static; margin-bottom:10px;">Correct the card's details directly. Changing OK Qty or Rework Qty here only corrects the recorded figures — it does not move Finished Goods Stock either way.</div>
    <div class="frow g4">
      <div><label class="fl">Part No.</label><input id="ficEditPartNo" value="${esc(c.partNo)}"></div>
      <div><label class="fl">Part Name</label><input id="ficEditPartName" value="${esc(c.partName)}"></div>
      <div><label class="fl">Card No.</label><input id="ficEditCardNo" value="${esc(c.cardNo)}"></div>
      <div><label class="fl">Customer</label><input id="ficEditCustomer" value="${esc(c.customer)}"></div>
    </div>
    <div class="frow g4">
      <div><label class="fl">Production Qty</label><input id="ficEditProdQty" type="number" value="${c.prodQty}"></div>
      <div><label class="fl">OK Qty</label><input id="ficEditOkQty" type="number" value="${c.okQty}"></div>
      <div><label class="fl">Rework Qty</label><input id="ficEditReworkQty" type="number" value="${c.reworkQty}"></div>
    </div>
    <div style="display:flex; gap:10px; margin-top:10px;">
      <button class="btn amber" onclick="saveFICardEdit('${c.id}')">💾 Save Changes</button>
      <button class="btn ghost" onclick="toggleFICardEdit('${c.id}')">Cancel</button>
    </div>
  </div>`;
}
function toggleFICardEdit(cardId){
  fiCardEditId = (fiCardEditId===cardId) ? null : cardId;
  fiCardEntryId = null;
  render();
}
function saveFICardEdit(cardId){
  const c = DB.finalInspCards.find(x=>x.id===cardId);
  if(!c){ toast('Final Inspection Card not found'); return; }
  const partNo = (document.getElementById('ficEditPartNo').value||'').trim();
  if(!partNo){ toast('Part No is required'); return; }
  c.partNo = partNo;
  c.partName = (document.getElementById('ficEditPartName').value||'').trim();
  c.cardNo = (document.getElementById('ficEditCardNo').value||'').trim();
  c.customer = (document.getElementById('ficEditCustomer').value||'').trim();
  c.prodQty = parseFloat(document.getElementById('ficEditProdQty').value)||0;
  c.okQty = parseFloat(document.getElementById('ficEditOkQty').value)||0;
  c.reworkQty = parseFloat(document.getElementById('ficEditReworkQty').value)||0;
  recomputeFICardStatus(cardId);
  fiCardEditId = null;
  saveDB();
  toast('Final Inspection Card updated');
  render();
}
// Jumps to Finished Goods Stock, so a Final Inspection Card's auto-created stock entries can be
// reviewed directly (the qty this card sent there, with no separate Model selection required).
function viewFICardStock(cardId){ goModule('inventory'); }
// Safety-net button: tops up Finished Goods Stock with whatever gap remains between this card's
// OK Qty and what has actually been pushed so far (see the auto-reconcile in init() for the
// same logic run automatically on every load) — for fixing a mismatch immediately, without a reload.
function syncFICardStock(cardId){
  const c = DB.finalInspCards.find(x=>x.id===cardId);
  if(!c){ toast('Final Inspection Card not found'); return; }
  const pushedQty = ficInventoryFor(c).reduce((a,iv)=>a+(parseFloat(iv.qty)||0),0);
  const gap = Math.round(((c.okQty||0)-pushedQty)*10000)/10000;
  if(gap<=0.0001){ toast('Already fully in Finished Goods Stock'); return; }
  pushOKQtyToFinishedStock(c, gap);
  saveDB();
  toast(`${gap} qty pushed to Finished Goods Stock (${c.partNo})`);
  render();
}
function ficEntryPanelHtml(c){
  return `<div class="panel" id="ficEntryPanel">
    <h3>Record Inspection Result <span class="hint">${esc(c.partNo)} — ${esc(c.partName)||''} — Pending ${c.pendingQty}</span></h3>
    <div class="hint" style="position:static; margin-bottom:10px;">Enter what this inspection round found. OK Qty is sent to Finished Goods Stock immediately on Save — automatically, against this same Part No (${esc(c.partNo)}), no Model re-selection needed. Rework Qty is only tracked here (it returns to Production separately). The Final Inspection Report opened afterwards is a separate QA document and does not affect stock.</div>
    <div class="frow g4">
      <div><label class="fl">OK Qty</label><input id="ficOkQty" type="number" placeholder="0" oninput="updateFICEntryTotal('${c.id}')"></div>
      <div><label class="fl">Rework Qty</label><input id="ficReworkQty" type="number" placeholder="0" oninput="updateFICEntryTotal('${c.id}')"></div>
      <div><label class="fl">Entry Total</label><input id="ficEntryTotalDisp" disabled value="0"></div>
      <div><label class="fl">Pending After Entry</label><input id="ficPendingAfterDisp" disabled value="${c.pendingQty}"></div>
    </div>
    <div style="display:flex; gap:10px; margin-top:10px;">
      <button class="btn amber" onclick="saveFICardEntry('${c.id}')">💾 Save &amp; Generate Final Inspection Report</button>
      <button class="btn ghost" onclick="toggleFICardEntry('${c.id}')">Cancel</button>
    </div>
  </div>`;
}
function toggleFICardEntry(cardId){
  fiCardEntryId = (fiCardEntryId===cardId) ? null : cardId;
  fiCardEditId = null;
  render();
}
function updateFICEntryTotal(cardId){
  const ok = parseFloat((document.getElementById('ficOkQty')||{}).value)||0;
  const rw = parseFloat((document.getElementById('ficReworkQty')||{}).value)||0;
  const total = Math.round((ok+rw)*10000)/10000;
  const disp = document.getElementById('ficEntryTotalDisp');
  if(disp) disp.value = total;
  const c = DB.finalInspCards.find(x=>x.id===cardId);
  const after = document.getElementById('ficPendingAfterDisp');
  if(after && c) after.value = Math.max(0, Math.round((c.pendingQty-total)*10000)/10000);
}
// Saves this round's OK/Rework Qty against the card. OK Qty is sent to Finished Goods Stock
// immediately (pushOKQtyToFinishedStock) — automatically, against the same Part No already on the
// card — completely independent of the Final Inspection Report below. The Report form is then
// opened purely as a separate QA document (prefilled from the card) for the team to fill in if
// they wish; saving or not saving it has no bearing on Finished Goods Stock, which is already updated.
function saveFICardEntry(cardId){
  const c = DB.finalInspCards.find(x=>x.id===cardId);
  if(!c){ toast('Final Inspection Card not found'); return; }
  const ok = parseFloat((document.getElementById('ficOkQty')||{}).value)||0;
  const rw = parseFloat((document.getElementById('ficReworkQty')||{}).value)||0;
  const total = Math.round((ok+rw)*10000)/10000;
  if(total<=0){ toast('Enter an OK Qty and/or Rework Qty'); return; }
  if(total - c.pendingQty > 0.0001){ toast(`Entry total (${total}) exceeds Pending Qty (${c.pendingQty})`); return; }
  c.okQty = Math.round(((c.okQty||0)+ok)*10000)/10000;
  c.reworkQty = Math.round(((c.reworkQty||0)+rw)*10000)/10000;
  ficRecomputePending(c);
  fiCardEntryId = null;
  if(ok>0){
    pushOKQtyToFinishedStock(c, ok);
    fiCardReportForId = cardId;
    editingFIId = null; fiViewId = null;
    fiHeaderDraft = blankFIHeader();
    fiHeaderDraft.partNo = c.partNo; fiHeaderDraft.desc = c.partName; fiHeaderDraft.card = c.cardNo;
    fiHeaderDraft.customer = c.customer; fiHeaderDraft.lot = ok+' NOS';
    fiHeaderDraft.grade = c.grade; fiHeaderDraft.supplier = c.supplier; fiHeaderDraft.grir = c.grir; fiHeaderDraft.cert = c.cert;
    if(currentUser && currentUser.name) fiHeaderDraft.preparedBy = currentUser.name;
    fiCharsDraft = (c.autoChars&&c.autoChars.length) ? JSON.parse(JSON.stringify(c.autoChars)) : [blankChar()];
    recomputeFICardStatus(cardId);
    saveDB();
    toast(`${ok} OK qty → Finished Goods Stock (${c.partNo})${rw>0?`, ${rw} Rework recorded`:''}. Optionally complete the Final Inspection Report below.`);
    render();
  } else {
    recomputeFICardStatus(cardId);
    saveDB();
    toast(`${rw} Rework Qty recorded against this card`);
    render();
  }
}

function renderFIForm(main){
  const h = fiHeaderDraft;
  main.innerHTML = `
    <div class="panel">
      <h3>${editingFIId?'Edit':'New'} Final Inspection Record</h3>
      <div class="frow g4">
        <div style="grid-column:1/-1;"><label class="fl">Pick Part <span class="hint" style="position:static; font-size:9.5px;">(from Product Development — Bar/Forging Mapping)</span></label>
          <select onchange="fillFinalInspFromMaster(this)">
            <option value="">— pick part from list —</option>${finishedPartOptionsHtml()}
            <option value="__other__">Other (type manually)</option>
          </select>
        </div>
        <div><label class="fl">Part No. / Rev No. <span class="hint" style="position:static; color:var(--red);">*required</span></label><input id="fiPartNo" value="${esc(h.partNo)}" placeholder="e.g. AH CL 26 D920" required></div>
        <div><label class="fl">Part Name <span class="hint" style="position:static; color:var(--red);">*required</span></label><input id="fiDesc" value="${esc(h.desc)}" placeholder="e.g. ROD END" required></div>
        <div><label class="fl">Date of Inspection</label><input id="fiDate" type="date" value="${h.date}"></div>
        <div><label class="fl">Card No.</label><input id="fiCard" value="${esc(h.card)}" placeholder="e.g. VIPL-07"></div>
      </div>
      <div class="frow g4">
        <div><label class="fl">Customer</label><input id="fiCustomer" value="${esc(h.customer)}" placeholder="e.g. SEA HYDRO SYSTEMS"></div>
        <div><label class="fl">Invoice No.</label><input id="fiInvoice" value="${esc(h.invoice)}" placeholder="e.g. S-16-(26-27)"></div>
        <div><label class="fl">Lot Quantity</label><input id="fiLot" value="${esc(h.lot)}" placeholder="e.g. 100 NOS"></div>
        <div><label class="fl">Status</label><select id="fiStatus"><option value="ok" ${h.status==='ok'?'selected':''}>OK — Cleared</option><option value="dev" ${h.status==='dev'?'selected':''}>Under Deviation Review</option></select></div>
      </div>
      <div class="frow g4">
        <div><label class="fl">Material Grade</label><input id="fiGrade" value="${esc(h.grade)}" placeholder="e.g. SAE 1018"></div>
        <div><label class="fl">Material Supplier</label><input id="fiMatSupplier" value="${esc(h.supplier)}" placeholder="e.g. RASHTRIYA ISPAT NIGAM LTD"></div>
        <div><label class="fl">GRIR No. / Date</label><input id="fiGrir" value="${esc(h.grir)}" placeholder="e.g. GIR06 / 20-06-2026"></div>
        <div><label class="fl">Test Certificate No.</label><input id="fiCert" value="${esc(h.cert)}" placeholder="Certificate reference"></div>
      </div>
      <div class="frow g2">
        <div><label class="fl">Prepared By</label><input id="fiPrep" value="${esc(h.preparedBy)}" placeholder="e.g. B. DEVARAJ"></div>
        <div><label class="fl">Approved By</label><input id="fiAppr" value="${esc(h.approvedBy)}" placeholder="e.g. C. VELMURUGAN"></div>
      </div>
      <div class="frow g1">
        <div><label class="fl">Deviation Note</label><textarea id="fiDeviation" placeholder="e.g. Deviation accepted — tolerance revised as per email approval">${esc(h.deviationNote)}</textarea></div>
      </div>
    </div>
    <div class="panel">
      <h3>Characteristics <span class="hint">${fiCharsDraft.some(c=>c.auto)? 'Spec / USL / LSL / Method auto-loaded from Inspection Parameters master — just enter the 5 observations' : 'Spec / USL / LSL / 5 observations — result auto-evaluated'}</span></h3>
      ${fiCharsDraft.some(c=>c.auto) ? `<div class="hint" style="margin-bottom:10px;">🔒 Auto-loaded fields are locked to prevent duplicate entry — only Observations &amp; Remark are editable. <button class="btn ghost small" onclick="reloadIPChars()" style="margin-left:6px;">↻ Reload from master</button></div>` : `<div class="hint" style="margin-bottom:10px;"><button class="btn ghost small" onclick="reloadIPChars()">↻ Load characteristics from Inspection Parameters master</button></div>`}
      <div class="tw">
        <div class="charrow-grid" style="font-family:var(--mono); font-size:9px; text-transform:uppercase; color:var(--text-dim); border-bottom:1px solid var(--line);">
          <div>Characteristic</div><div>Spec</div><div>USL</div><div>LSL</div><div>Method</div>
          <div>Obs 1</div><div>Obs 2</div><div>Obs 3</div><div>Obs 4</div><div>Obs 5</div><div>Remark</div><div></div>
        </div>
        ${fiCharsDraft.map((c,idx)=>`
          <div class="charrow" data-idx="${idx}">
            <div class="charrow-grid">
              <div><input class="c_name" value="${esc(c.name)}" placeholder="e.g. Outer Diameter-1" ${c.auto?'readonly style="background:var(--panel2); color:var(--text-dim);"':''}></div>
              <div><input class="c_spec" value="${esc(c.spec)}" placeholder="50.00" ${c.auto?'readonly style="background:var(--panel2); color:var(--text-dim);"':''}></div>
              <div><input class="c_usl" value="${esc(c.usl)}" placeholder="USL" ${c.auto?'readonly style="background:var(--panel2); color:var(--text-dim);"':''}></div>
              <div><input class="c_lsl" value="${esc(c.lsl)}" placeholder="LSL" ${c.auto?'readonly style="background:var(--panel2); color:var(--text-dim);"':''}></div>
              <div><input class="c_method" value="${esc(c.method)}" placeholder="Vernier" ${c.auto?'readonly style="background:var(--panel2); color:var(--text-dim);"':''}></div>
              ${[0,1,2,3,4].map(i=>`<div><input class="c_obs${i}" value="${esc(c.obs[i])}"></div>`).join('')}
              <div><input class="c_remark" value="${esc(c.remark)}" placeholder="—"></div>
              <div><button class="btn danger" onclick="removeCharRow(${idx})">✕</button></div>
            </div>
          </div>`).join('')}
      </div>
      <button class="btn ghost" onclick="addCharRow()">+ Add Characteristic Row</button>
    </div>
    <div class="panel">
      <button class="btn amber" onclick="saveFI()">💾 Save Inspection Record</button>
      <button class="btn ghost" onclick="cancelFI()">Cancel</button>
    </div>
  `;
}

function renderFIReport(main){
  const f = DB.finalInsp.find(x=>x.id===fiViewId);
  if(!f){ fiViewId=null; return renderFinalInsp(main.parentElement); }
  const okCount = f.chars.filter(c=>c.result==='ok').length;
  const badCount = f.chars.filter(c=>c.result==='bad').length;
  main.innerHTML = `
    <div class="panel">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
        <div><h3 style="margin:0;">${esc(f.partNo)} <span class="hint">${esc(f.desc)}</span></h3></div>
        <div>
          <span class="badge ${f.result==='Pass'?'ok':f.result==='Fail'?'bad':'dev'}">${f.result==='Pass'?'CLEARED — OK':f.result==='Fail'?'NOT OK':'PENDING'}</span>
          <button class="btn ghost small" onclick="printFI()">🖨 Print</button>
          ${f.fiCardId? `<button class="btn ghost small" onclick="viewFICardFromReport('${f.fiCardId}')">🗂 View Card</button>` : ''}
          <button class="btn ghost small" onclick="closeViewFI()">← Back</button>
        </div>
      </div>
      <div class="info-grid" style="margin-top:14px;">
        <div class="info-cell"><label>Date of Inspection</label><div class="val">${fmtDate(f.date)}</div></div>
        <div class="info-cell"><label>Card No.</label><div class="val">${esc(f.card)||'—'}</div></div>
        <div class="info-cell"><label>Customer</label><div class="val">${esc(custDispByName(f.customer))||'—'}</div></div>
        <div class="info-cell"><label>Invoice No.</label><div class="val">${esc(f.invoice)||'—'}</div></div>
        <div class="info-cell"><label>Lot Quantity</label><div class="val">${esc(f.lot)||'—'}</div></div>
        <div class="info-cell"><label>Material Grade</label><div class="val">${esc(f.grade)||'—'}</div></div>
        <div class="info-cell"><label>Material Supplier</label><div class="val">${esc(f.supplier)||'—'}</div></div>
        <div class="info-cell"><label>GRIR No. / Date</label><div class="val">${esc(f.grir)||'—'}</div></div>
      </div>
      <div class="tw"><table class="insp">
        <tr><th>SL</th><th>Characteristic</th><th>Spec</th><th>USL</th><th>LSL</th><th>Method</th><th>Obs 1</th><th>Obs 2</th><th>Obs 3</th><th>Obs 4</th><th>Obs 5</th><th>Result</th><th>Remark</th></tr>
        ${f.chars.map(c=>`
          <tr>
            <td>${c.sl}</td><td class="char">${esc(c.name)}</td><td>${esc(c.spec)||'—'}</td>
            <td>${esc(c.usl)||'—'}</td><td>${esc(c.lsl)||'—'}</td><td>${esc(c.method)||'—'}</td>
            ${c.obs.map(o=>`<td>${esc(o)||'—'}</td>`).join('')}
            <td><span class="badge ${c.result==='ok'?'ok':c.result==='bad'?'bad':'na'}">${c.result==='ok'?'OK':c.result==='bad'?'NOT OK':'—'}</span></td>
            <td class="remarks">${esc(c.remark)||'—'}</td>
          </tr>`).join('') || '<tr><td colspan="13"><div class="empty">No characteristics recorded.</div></td></tr>'}
      </table></div>
      ${f.deviationNote?`<div class="deviation-note"><b>Deviation Note:</b> ${esc(f.deviationNote)}</div>`:''}
      <div class="frow g3" style="margin-top:16px;">
        <div><label class="fl">Test Certificate No.</label><div>${esc(f.cert)||'—'}</div></div>
        <div><label class="fl">Prepared By</label><div>${esc(f.preparedBy)||'—'}</div></div>
        <div><label class="fl">Approved By</label><div>${esc(f.approvedBy)||'—'}</div></div>
      </div>
      <div class="cards" style="margin-top:16px;">
        <div class="card"><div class="v">${f.chars.length}</div><div class="l">Characteristics</div></div>
        <div class="card"><div class="v">${okCount}</div><div class="l">OK</div></div>
        <div class="card"><div class="v">${badCount}</div><div class="l">Not OK</div></div>
      </div>
    </div>
  `;
}

function pushToInventory(fiId, silent){
  if(!requireWorkingUnit()) return;
  const f = DB.finalInsp.find(x=>x.id===fiId);
  if(!f) return;
  if(f.pushedToInventory){ if(!silent) toast('Already moved to Inventory'); return; }
  DB.inventory.push({
    id:'iv'+Date.now(), unit:currentUnit, item:(f.partNo+(f.desc?' - '+f.desc:'')), partNo:f.partNo||'', partName:f.desc||'',
    qty:f.qty||0, source:'Final Insp. — '+(f.card||f.partNo), date:today(), fiId:f.id, finalInspCardId:f.fiCardId||null, customer:f.customer||'',
    quotationId:f.quotationId||null, quoteNo:f.quoteNo||'', quoteRate:f.quoteRate||0, cardNo:f.card||''
  });
  f.pushedToInventory = true;
  markJobCardComplete('finalInsp', f.id, today());
  logJobCard({cardNo:f.card||'', partNo:f.partNo||'', partName:f.desc||'', qty:f.qty||0, prevStage:'Final Inspection', stage:'Inventory', nextStage:'— Completed —',
    issueType:'', refType:'inventory', refId:'iv'+Date.now(), status:'Completed', completionDate:today(), remarks:'Accepted at Final Inspection — OK Qty moved to Finished Stock'+(f.fiCardId?(' (Final Inspection Card '+f.fiCardId+')'):'')});
  saveDB(); toast(silent?'Inspection Passed — OK Qty auto-moved to Finished Stock':'Moved to Finished Stock — ready for sale'); render();
}
// Sends a Stores WIP entry (goods returned from Production/Subcontract) to Final Inspection, once
// the Part's routing shows no more Production/Subcontract stages remain (Req. #5). A Part may pass
// through any number of Production/Subcontract stages first — each one returns to Stores in between
// — but the sequence always ends Final Inspection → Finished Goods → Sales.
function issueWIPToFinalInsp(stId){
  if(!requireWorkingUnit()) return;
  const s = DB.stores.find(x=>x.id===stId);
  if(!s){ toast('Stock item not found'); return; }
  const mat = autoMaterialInfoForFinPart(s.partNo);
  const autoChars = charsFromInspParams(s.partNo);
  const card = newFICardFrom({
    partNo:s.partNo||'', partName:s.partName||'', qty:s.qty||0, cardNo:s.cardNo||'',
    customer:custDispByName(s.customerName)||'',
    quotationId:s.quotationId||null, quoteNo:s.quoteNo||'', quoteRate:s.quoteRate||0,
    grade:mat.grade, supplier:mat.supplier, grir:mat.grir, cert:mat.cert, autoChars:autoChars||[]
  });
  markJobCardComplete('stores', s.id, today());
  logJobCard({cardNo:s.cardNo||'', partNo:s.partNo||'', partName:s.partName||'', qty:s.qty||0, prevStage:'Stores', stage:'Final Inspection', nextStage:'Finished Goods (on Pass)',
    issueType:'', refType:'finalInspCard', refId:card.id, status:'Open'});
  const idx = DB.stores.indexOf(s);
  if(idx>-1) DB.stores.splice(idx,1);
  saveDB(); toast('Sent to Final Inspection — Final Inspection Card created'); render();
}
// Creates a new Final Inspection Card — the live, trackable unit for one completed Production
// quantity moving through Final Inspection (Part No, Part Name, Production Qty, OK/Rework/Pending
// Qty, Status). Called the moment Production output is sent to Final Inspection, from either
// pushToFinalInsp (direct, job-work style) or issueWIPToFinalInsp (Stores WIP → Next Stage).
function newFICardFrom(o){
  const id = 'fic'+Date.now()+Math.floor(Math.random()*1000);
  const c = {
    id, unit: o.unit||currentUnit, partNo:o.partNo||'', partName:o.partName||'',
    prodQty:o.qty||0, okQty:0, reworkQty:0, pendingQty:o.qty||0, status:'Open',
    cardNo:o.cardNo||'', customer:o.customer||'', date:today(),
    quotationId:o.quotationId||null, quoteNo:o.quoteNo||'', quoteRate:o.quoteRate||0,
    grade:o.grade||'', supplier:o.supplier||'', grir:o.grir||'', cert:o.cert||'',
    autoChars: o.autoChars||[], reportIds:[], inventoryIds:[]
  };
  DB.finalInspCards.push(c);
  return c;
}
// Recomputes a card's Pending Qty from Production Qty − OK Qty − Rework Qty (never negative).
function ficRecomputePending(c){
  const p = Math.round(((c.prodQty||0)-(c.okQty||0)-(c.reworkQty||0))*10000)/10000;
  c.pendingQty = p<0 ? 0 : p;
  return c.pendingQty;
}
// The Final Inspection Report(s) (DB.finalInsp) generated against this card so far.
function ficReportsFor(c){ return (c.reportIds||[]).map(id=>DB.finalInsp.find(f=>f.id===id)).filter(Boolean); }
// The Finished Goods Stock entries (DB.inventory) created directly from this card's OK Qty entries.
function ficInventoryFor(c){ return (c.inventoryIds||[]).map(id=>DB.inventory.find(iv=>iv.id===id)).filter(Boolean); }
// OK Quantity entered on a Final Inspection Card → straight to Finished Goods Stock, automatically,
// against the SAME Part No / Model already on the card (no re-selecting a Finished Goods Model).
// This is the ONLY path that ever adds to Finished Goods Stock, and it is entirely independent of
// whether/when a Final Inspection Report is generated or what that report's result is — the Report
// stays a completely separate document (Req.: "Final Inspection Report must remain completely
// separate from this process"). Existing DB.inventory shape/fields and the Finished Goods Stock
// Ledger are untouched — this just adds one more receipt row the same way Final Inspection always did.
function pushOKQtyToFinishedStock(card, okQty){
  const ivId = 'iv'+Date.now()+Math.floor(Math.random()*1000);
  DB.inventory.push({
    id:ivId, unit:card.unit||currentUnit, item:(card.partNo+(card.partName?' - '+card.partName:'')),
    partNo:card.partNo||'', partName:card.partName||'', qty:okQty,
    source:'Final Insp. Card — '+(card.cardNo||card.partNo), date:today(),
    finalInspCardId:card.id, customer:card.customer||'',
    quotationId:card.quotationId||null, quoteNo:card.quoteNo||'', quoteRate:card.quoteRate||0, cardNo:card.cardNo||''
  });
  card.inventoryIds = card.inventoryIds||[];
  card.inventoryIds.push(ivId);
  markJobCardComplete('finalInspCard', card.id, today());
  logJobCard({cardNo:card.cardNo||'', partNo:card.partNo||'', partName:card.partName||'', qty:okQty, prevStage:'Final Inspection', stage:'Finished Goods Stock', nextStage:'— Completed —',
    issueType:'', refType:'inventory', refId:ivId, status:'Completed', completionDate:today(),
    remarks:'OK Qty entered on Final Inspection Card — auto-added to Finished Goods Stock against the same Part No, no Model re-selection'});
  return ivId;
}
// True once every report generated against this card has a final result (Pass/Fail) — i.e. none
// are still sitting mid-inspection ('Pending'). A card with no reports at all (e.g. fully reworked,
// nothing yet passed) counts as satisfied on this front — Pending Qty is what still gates it.
function ficAllReportsComplete(c){ return ficReportsFor(c).every(r=>r.result==='Pass'||r.result==='Fail'); }
// A Final Inspection Card stays Open until its full quantity has been inspected (Pending Qty = 0)
// AND every Final Inspection Report generated against it is completed — then it auto-closes.
function recomputeFICardStatus(cardId){
  const c = DB.finalInspCards.find(x=>x.id===cardId);
  if(!c) return;
  ficRecomputePending(c);
  c.status = (c.pendingQty<=0.0001 && ficAllReportsComplete(c)) ? 'Closed' : 'Open';
}
