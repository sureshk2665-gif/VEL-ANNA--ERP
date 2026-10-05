/* ---------------- PRODUCTION PLANNING (standalone module, after Product Development) ----------------
   Plans out production quantities, in incremental dated batches, against an existing Customer PO
   (captured in the Customer PO module). Continuously tracks Ordered − Planned balance so planning
   never exceeds what the customer actually ordered. */
// Jumps into Planning → Sales Plan with the given Customer PO's row scrolled into view and
// its Commitment Qty field focused — every part is already listed on the grid, so there is
// nothing to "open", just a row to jump to.
function openProdPlan(id){
  previousPage = currentPage;
  currentPage = 'prodPlan'; reportModuleOpen = null; planningSubTab = 'salesPlan';
  highlightPlanRowId = id;
  render();
}
// Jumps into Planning → Job Work Plan with the given Job Work Open PO's row scrolled into view
// and its Commitment Qty field focused.
function goToLabourPlan(id){
  previousPage = currentPage;
  currentPage = 'prodPlan'; reportModuleOpen = null; planningSubTab = 'labourPlan';
  highlightPlanRowId = id;
  render();
}
function setPlanningSubTab(t){ planningSubTab = t; highlightPlanRowId = null; render(); }
function renderProductionPlanning(main){
  if(!subOK('prodPlan', planningSubTab)) planningSubTab = firstAllowedSub('prodPlan') || planningSubTab;
  main.innerHTML = `
    <div class="topbar"><div></div></div>
    ${flowline('prodPlan')}
    <div class="subtabs" style="margin-top:12px;">
      ${subOK('prodPlan','salesPlan')?`<button class="${planningSubTab==='salesPlan'?'active':''}" onclick="setPlanningSubTab('salesPlan')">Sales Plan</button>`:''}
      ${subOK('prodPlan','labourPlan')?`<button class="${planningSubTab==='labourPlan'?'active':''}" onclick="setPlanningSubTab('labourPlan')">Job Work Plan</button>`:''}
      ${subOK('prodPlan','perfReport')?`<button class="${planningSubTab==='perfReport'?'active':''}" onclick="setPlanningSubTab('perfReport')">📊 Planning Performance Report</button>`:''}
      ${subOK('prodPlan','custPerfGraph')?`<button class="${planningSubTab==='custPerfGraph'?'active':''}" onclick="setPlanningSubTab('custPerfGraph')">📈 Planning Performance Graph</button>`:''}
    </div>
    <div id="planningSub"></div>
  `;
  const sub = document.getElementById('planningSub');
  if(planningSubTab==='labourPlan') renderLabourPlan(sub);
  else if(planningSubTab==='perfReport') renderLabourPlanPerformanceReport(sub);
  else if(planningSubTab==='custPerfGraph') renderPlanningCustomerPerfGraph(sub);
  else renderSalesPlan(sub);
}
// Scrolls/focuses the row named by highlightPlanRowId (set when arriving here from a "Plan" /
// "Schedule" shortcut elsewhere in the ERP) — also pre-selects that part's customer, since the
// grid only shows one customer's parts at a time. Clears itself so it only happens once.
function focusHighlightedPlanRow(kind){
  if(!highlightPlanRowId) return;
  const id = highlightPlanRowId; highlightPlanRowId = null;
  const rec = kind==='sales' ? DB.custPO.find(x=>x.id===id) : DB.labourPO.find(x=>x.id===id);
  if(rec){
    if(kind==='sales') salesPlanCustomerId = rec.customerId || rec.customer || '';
    else labourPlanCustomerId = rec.customerId || rec.customer || '';
    if(kind==='sales') renderSalesPlanListOnly(); else renderLabourPlanListOnly();
  }
  setTimeout(()=>{
    const row = document.getElementById((kind==='sales'?'sp_row_':'lp_row_')+id);
    const qtyEl = document.getElementById((kind==='sales'?'sp_qty_':'lp_qty_')+id);
    if(row){ row.classList.add('highlight'); row.scrollIntoView({block:'center'}); }
    if(qtyEl) qtyEl.focus();
    setTimeout(()=>{ if(row) row.classList.remove('highlight'); }, 2200);
  }, 30);
}
// Builds the "— select customer —" dropdown options from whichever customers actually have
// records in the given list (Customer PO or Job Work Open PO), keyed by customerId (falling back
// to the plain name for older records saved without one).
function planCustomerOptionsHtml(list, selectedId){
  const seen = new Set(); const opts = [];
  list.forEach(p=>{
    const key = p.customerId || p.customer || '';
    if(!key || seen.has(key)) return;
    seen.add(key);
    opts.push(`<option value="${esc(key)}" ${key===selectedId?'selected':''}>${esc(custDispByName(p.customer))||'—'}</option>`);
  });
  opts.sort((a,b)=>a.localeCompare(b));
  return '<option value="">— select customer —</option>' + opts.join('');
}
function planRecCustomerKey(p){ return p.customerId || p.customer || ''; }

/* ==== SALES PLAN (Customer PO side) ====
   Pick a Customer, then plan every one of that customer's Part Numbers. Sales PO
   Quantity is always fetched from the Customer PO. Planning happens by logging as many dated
   Commitment entries as needed — a part is usually supplied across several deliveries on
   different dates — and the running Committed/Balance totals make it obvious when the PO
   Quantity has been fully planned. The total Committed Qty can never exceed the Sales PO
   Quantity: entries that would push it over are rejected with a validation message. */
function filteredSalesPlanList(list){
  let out = salesPlanCustomerId ? list.filter(p=>planRecCustomerKey(p)===salesPlanCustomerId) : [];
  const q = (salesPlanPartFilter||'').trim().toLowerCase();
  if(q) out = out.filter(p=>(p.finPartNo||'').toLowerCase().includes(q));
  return out;
}
function renderSalesPlan(main){
  const list = DB.custPO.filter(x=>reportUnitMatch(x.unit));
  main.innerHTML = `
    <div class="panel" style="margin-top:8px;">
      <div class="plan-toolbar">
        <div class="right">
          <label class="fl">Customer</label>
          <select id="salesPlanCustomerSel" onchange="setSalesPlanCustomer(this.value)" style="min-width:220px;">${planCustomerOptionsHtml(list, salesPlanCustomerId)}</select>
          <input type="text" id="salesPlanPartSearch" placeholder="🔍 Search Part No" value="${esc(salesPlanPartFilter)}" oninput="salesPlanPartFilter=this.value; renderSalesPlanListOnly();" ${salesPlanCustomerId?'':'disabled'}>
        </div>
        <div class="right">
          <label class="fl">Month <span class="hint" style="position:static; font-size:9px;">(scopes Committed-this-month &amp; Entries)</span></label>
          <input type="month" id="salesPlanMonthSel" value="${esc(salesPlanMonth)}" onchange="setSalesPlanMonth(this.value)">
        </div>
        <div class="right">
          <label class="fl">Commitment Date <span class="hint" style="position:static; font-size:9px;">(for new entries)</span></label>
          <input type="date" id="salesPlanQuickDate" value="${esc(planQuickDate)}" onchange="setSalesPlanQuickDate(this.value)">
        </div>
      </div>
      <div class="hint" style="position:static; display:block; margin:0 0 10px;">Type the Commitment Qty for a part and press <b>Enter</b> to log that delivery and jump to the next part. A part can take multiple Commitment entries on different dates — click "Entries" to see or edit all of them, right up until the PO Quantity is fully planned. <b>Committed (Total)</b> / <b>Balance</b> below track the whole Sales PO; <b>Committed (${esc(monthKeyLabel(salesPlanMonth))})</b> and the Entries panel are scoped to the Month selected above.</div>
      <div id="salesPlanGridBox">${salesPlanGridHtml(list)}</div>
    </div>
  `;
  focusHighlightedPlanRow('sales');
}
function setSalesPlanCustomer(v){ salesPlanCustomerId = v; salesPlanPartFilter=''; renderSalesPlanListOnly();
  const s = document.getElementById('salesPlanPartSearch'); if(s){ s.disabled = !v; s.value=''; } }
function setSalesPlanMonth(v){ salesPlanMonth = v || today().slice(0,7); renderSalesPlanListOnly(); }
// Re-renders just the grid box (search keystrokes, quick-date changes, entry-history toggles)
// so the rest of the screen and any in-progress typing elsewhere isn't disturbed.
function renderSalesPlanListOnly(){
  const box = document.getElementById('salesPlanGridBox');
  const list = DB.custPO.filter(x=>reportUnitMatch(x.unit));
  if(box) box.innerHTML = salesPlanGridHtml(list);
}
function salesPlanGridHtml(list){
  if(!salesPlanCustomerId) return '<div class="empty">Select a Customer above to see their Part Numbers.</div>';
  const filtered = filteredSalesPlanList(list);
  if(!filtered.length) return '<div class="empty">No Part found for this customer.</div>';
  const rows = filtered.slice();
  window.__salesPlanRowOrder = rows.map(p=>p.id);
  return `
  <div class="plan-table-wrap">
  <table class="plan-table">
    <thead><tr>
      <th>Part No</th><th>Part Name (Auto)</th>
      <th>Sales PO Qty</th><th>Committed (Total)</th><th>Balance</th><th>Committed (${esc(monthKeyLabel(salesPlanMonth))})</th>
      <th>Commitment Date</th><th>Commitment Qty</th><th>Entries</th>
    </tr></thead>
    <tbody>
      ${rows.map(p=>{
        const committed = custPOSumPlans(p.plans);
        const bal = (p.orderedQty||0) - committed;
        const committedMonth = (p.plans||[]).filter(pl=>monthKeyOf(pl.date)===salesPlanMonth).reduce((a,pl)=>a+(parseFloat(pl.qty)||0),0);
        const entryCount = (p.plans||[]).length;
        const isOpen = !!salesPlanHistoryOpen[p.id];
        return `
        <tr class="plan-row" id="sp_row_${p.id}">
          <td class="pt-text"><b>${esc(p.finPartNo)||'—'}</b></td>
          <td class="pt-text rt-truncate" title="${esc(p.finPartName)}">${esc(p.finPartName)||'—'}</td>
          <td class="pt-text">${p.orderedQty||0}</td>
          <td class="pt-text" id="sp_committed_${p.id}">${committed}</td>
          <td class="pt-text" id="sp_balance_${p.id}" style="${bal<0?'color:#b23b3b;font-weight:700;':''}">${bal}</td>
          <td class="pt-text">${committedMonth}</td>
          <td><input type="date" id="sp_date_${p.id}" value="${esc(planQuickDate)}"></td>
          <td class="pt-qty"><input type="number" id="sp_qty_${p.id}" placeholder="Qty" oninput="clearPlanQtyError(this)" onkeydown="handleSalesPlanKey(event,'${p.id}')"><span class="plan-qty-err" id="sp_qtyerr_${p.id}"></span></td>
          <td class="pt-text"><button class="btn ghost small" onclick="toggleSalesPlanHistory('${p.id}')">${entryCount} entr${entryCount===1?'y':'ies'} ${isOpen?'▲':'▼'}</button></td>
        </tr>
        ${isOpen ? `<tr class="history-row"><td colspan="9">${salesPlanHistoryHtml(p)}</td></tr>` : ''}
        `;
      }).join('')}
    </tbody>
  </table>
  </div>`;
}
function salesPlanHistoryHtml(p){
  const monthEntries = (p.plans||[]).map((e,i)=>({...e, _i:i})).filter(e=>monthKeyOf(e.date)===salesPlanMonth);
  const rowsHtml = monthEntries.length ? monthEntries.map(e=>`
    <div class="oc-row" style="display:grid; grid-template-columns:150px 130px 34px; gap:8px; align-items:center; padding:4px;">
      <input type="date" value="${esc(e.date)}" onchange="editSalesPlanEntry('${p.id}',${e._i},'date',this.value)">
      <input type="number" value="${e.qty}" onchange="editSalesPlanEntry('${p.id}',${e._i},'qty',this.value)">
      <button type="button" class="btn danger small" title="Remove" onclick="removeSalesPlanEntry('${p.id}',${e._i})">✕</button>
    </div>`).join('') : `<div class="empty">No commitment entries for ${esc(monthKeyLabel(salesPlanMonth))}.</div>`;
  return `<div class="fl" style="margin-bottom:6px;">Commitment entries for ${esc(p.finPartNo)||'this part'} — ${esc(monthKeyLabel(salesPlanMonth))} <span class="hint" style="position:static;">(change the Month filter above to see other months)</span></div>${rowsHtml}`;
}
function toggleSalesPlanHistory(id){ salesPlanHistoryOpen[id] = !salesPlanHistoryOpen[id]; renderSalesPlanListOnly(); }
// Edits made in the entry history are validated exactly like new entries — the total can
// never be pushed past the Sales PO Quantity.
function editSalesPlanEntry(id, i, field, val){
  const rec = DB.custPO.find(x=>x.id===id); if(!rec || !rec.plans || !rec.plans[i]) return;
  if(field==='qty'){
    const newQty = parseFloat(val)||0;
    const otherTotal = rec.plans.reduce((a,pl,idx)=>idx===i?a:a+(parseFloat(pl.qty)||0),0);
    const poQty = rec.orderedQty||0;
    if(otherTotal + newQty > poQty){
      toast(`Exceeds PO Qty (${poQty}) — only ${Math.max(poQty-otherTotal,0)} remaining to commit`);
      renderSalesPlanListOnly();
      return;
    }
  }
  rec.plans[i][field] = field==='qty' ? (parseFloat(val)||0) : val;
  saveDB(); refreshSalesPlanRowTotals(id);
}
function removeSalesPlanEntry(id, i){
  const rec = DB.custPO.find(x=>x.id===id); if(!rec || !rec.plans) return;
  rec.plans.splice(i,1);
  saveDB(); renderSalesPlanListOnly();
}
function refreshSalesPlanRowTotals(id){
  const rec = DB.custPO.find(x=>x.id===id); if(!rec) return;
  const committed = custPOSumPlans(rec.plans);
  const bal = (rec.orderedQty||0) - committed;
  const cEl = document.getElementById('sp_committed_'+id); if(cEl) cEl.textContent = committed;
  const bEl = document.getElementById('sp_balance_'+id);
  if(bEl){ bEl.textContent = bal; bEl.style.color = bal<0?'#b23b3b':''; bEl.style.fontWeight = bal<0?'700':''; }
  renderSalesPlanListOnly();
}
function setSalesPlanQuickDate(v){ planQuickDate = v || today(); renderSalesPlanListOnly(); }
function handleSalesPlanKey(e, id){
  if(e.key!=='Enter') return;
  e.preventDefault();
  commitSalesPlanRow(id);
}
// Shared validation-message helpers for both Planning grids: mark the Qty field invalid,
// show the reason right underneath it, and keep focus there until the user corrects it.
function showPlanQtyError(qtyEl, errEl, msg){
  if(qtyEl){ qtyEl.classList.add('input-error'); qtyEl.title = msg; qtyEl.focus(); qtyEl.select(); }
  if(errEl) errEl.textContent = msg;
  toast(msg);
}
function clearPlanQtyError(el){
  el.classList.remove('input-error'); el.title = '';
  const errEl = document.getElementById(el.id.replace(/^(sp_qty_|lp_qty_)/, m=>m==='sp_qty_'?'sp_qtyerr_':'lp_qtyerr_'));
  if(errEl) errEl.textContent = '';
}
// Saves one Commitment Date + Qty entry against this Finished Part Number (in addition to any
// already logged) and immediately jumps to the next row's Qty field. Mandatory validation: the
// cumulative Committed Qty (existing entries + this one) can never exceed the Sales PO
// Quantity — over-committing is blocked until the entry is corrected.
function commitSalesPlanRow(id){
  const rec = DB.custPO.find(x=>x.id===id); if(!rec) return;
  const dateEl = document.getElementById('sp_date_'+id);
  const qtyEl = document.getElementById('sp_qty_'+id);
  const errEl = document.getElementById('sp_qtyerr_'+id);
  const qty = parseFloat(qtyEl.value)||0;
  if(qty<=0){ showPlanQtyError(qtyEl, errEl, 'Enter a Commitment Qty'); return; }
  const poQty = rec.orderedQty||0;
  const alreadyCommitted = custPOSumPlans(rec.plans);
  if(alreadyCommitted + qty > poQty){
    const remaining = Math.max(poQty - alreadyCommitted, 0);
    showPlanQtyError(qtyEl, errEl, `Exceeds PO Qty (${poQty}) — only ${remaining} remaining to commit`);
    return;
  }
  clearPlanQtyError(qtyEl);
  const date = dateEl.value || today();
  if(!rec.plans) rec.plans = [];
  rec.plans.push({id:'pl'+Date.now()+Math.random().toString(36).slice(2,6), date, qty, note:''});
  planQuickDate = date;
  saveDB();
  refreshSalesPlanRowTotals(id);
  toast('Commitment saved');
  focusNextPlanRow('sales', id);
}
// Moves focus to the next row's Commitment Qty field (carrying forward the shared Commitment
// Date), so a whole batch of parts can be planned by pressing Enter repeatedly.
function focusNextPlanRow(kind, id){
  const order = kind==='sales' ? (window.__salesPlanRowOrder||[]) : (window.__labourPlanRowOrder||[]);
  const idx = order.indexOf(id);
  const nextId = idx>=0 && idx<order.length-1 ? order[idx+1] : null;
  if(!nextId) return;
  const qtyPrefix = kind==='sales' ? 'sp_qty_' : 'lp_qty_';
  const datePrefix = kind==='sales' ? 'sp_date_' : 'lp_date_';
  const dEl = document.getElementById(datePrefix+nextId); if(dEl) dEl.value = planQuickDate;
  const qEl = document.getElementById(qtyPrefix+nextId);
  if(qEl){ qEl.focus(); qEl.select(); qEl.scrollIntoView({block:'center'}); }
}

/* ==== LABOUR PLAN (Job Work Open PO side) ====
   Pick a Customer, then plan every one of that customer's Part Numbers. Customers
   often send multiple schedules against the same Open PO over time, so the Customer Schedule
   Quantity itself is a running total of however many Schedule Qty entries have been logged —
   and, just like Sales Plan, delivery Commitment entries (date + qty) can be logged multiple
   times on different dates. The total Committed Qty can never exceed the total Customer
   Schedule Quantity. */
function filteredLabourPlanList(list){
  let out = labourPlanCustomerId ? list.filter(p=>planRecCustomerKey(p)===labourPlanCustomerId) : [];
  const q = (labourPlanPartFilter||'').trim().toLowerCase();
  if(q) out = out.filter(p=>(p.finPartNo||'').toLowerCase().includes(q));
  return out;
}
function renderLabourPlan(main){
  const list = DB.labourPO.filter(x=>reportUnitMatch(x.unit));
  const mk = labourPlanMonth;
  main.innerHTML = `
    <div class="panel" style="margin-top:8px;">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
        <div><b style="font-size:15px;">📅 Planning for ${esc(monthKeyLabel(mk))}</b> <span class="hint" style="position:static;">— use the Month field below to switch months</span></div>
        <span class="hint" style="position:static;">Looking for a rolled-up historical view instead? Open the <a href="#" onclick="setPlanningSubTab('perfReport'); return false;" style="color:var(--steel);">Planning Performance Report</a>.</span>
      </div>
      <div class="plan-toolbar">
        <div class="right">
          <label class="fl">Customer</label>
          <select id="labourPlanCustomerSel" onchange="setLabourPlanCustomer(this.value)" style="min-width:220px;">${planCustomerOptionsHtml(list, labourPlanCustomerId)}</select>
          <input type="text" id="labourPlanPartSearch" placeholder="🔍 Search Part No" value="${esc(labourPlanPartFilter)}" oninput="labourPlanPartFilter=this.value; renderLabourPlanListOnly();" ${labourPlanCustomerId?'':'disabled'}>
        </div>
        <div class="right">
          <label class="fl">Month <span class="hint" style="position:static; font-size:9px;">(Schedule/Committed/Balance below are for this month)</span></label>
          <input type="month" id="labourPlanMonthSel" value="${esc(labourPlanMonth)}" onchange="setLabourPlanMonth(this.value)">
        </div>
        <div class="right">
          <label class="fl">Commitment Date <span class="hint" style="position:static; font-size:9px;">(for new entries)</span></label>
          <input type="date" id="labourPlanQuickDate" value="${esc(planQuickDate)}" onchange="setLabourPlanQuickDate(this.value)">
        </div>
      </div>
      <div class="plan-toolbar" style="margin-top:-4px;">
        <div class="right">
          <label class="fl">Approved By <span class="hint" style="position:static; font-size:9px;">(for print)</span></label>
          <input type="text" id="labourPlanApprovedBy" placeholder="Name" value="${esc(labourPlanApprovedBy)}" oninput="labourPlanApprovedBy=this.value;" style="width:150px;">
        </div>
        <div class="right">
          <button class="btn small" ${labourPlanCustomerId?'':'disabled'} onclick="printLabourCustomerSchedule()" style="background:var(--steel); color:#fff; border-color:var(--steel); font-weight:700;" title="${labourPlanCustomerId?'Print this customer\'s schedule as PDF':'Select a Customer first'}">🖨 Print Customer Schedule (PDF)</button>
        </div>
      </div>
      <div class="hint" style="position:static; display:block; margin:0 0 6px;">Every month starts with Customer Schedule Qty = 0 for that month — enter this month's Schedule Qty for a part before planning it. Type the Commitment Qty and press <b>Enter</b> to log that delivery and jump to the next part. Click "Entries" to log another Schedule Qty (customers may send several over time) or to view/edit this month's Commitment entries.</div>
      <div class="cell-legend">
        <span class="lg-item"><span class="lg-swatch io"></span> Editable input cell</span>
        <span class="lg-item"><span class="lg-swatch saved"></span> Saved entry</span>
        <span class="lg-item"><span class="lg-swatch calc"></span> System-calculated (read-only)</span>
      </div>
      <div id="labourPlanGridBox">${labourPlanGridHtml(list)}</div>
    </div>
  `;
  focusHighlightedPlanRow('labour');
}
function setLabourPlanCustomer(v){ labourPlanCustomerId = v; labourPlanPartFilter=''; renderLabourPlanListOnly();
  const s = document.getElementById('labourPlanPartSearch'); if(s){ s.disabled = !v; s.value=''; } }
function setLabourPlanMonth(v){ labourPlanMonth = v || today().slice(0,7); renderLabourPlanListOnly(); }
function renderLabourPlanListOnly(){
  const box = document.getElementById('labourPlanGridBox');
  const list = DB.labourPO.filter(x=>reportUnitMatch(x.unit));
  if(box) box.innerHTML = labourPlanGridHtml(list);
}
function labourPlanGridHtml(list){
  if(!labourPlanCustomerId) return '<div class="empty">Select a Customer above to see their Part Numbers.</div>';
  const filtered = filteredLabourPlanList(list);
  if(!filtered.length) return '<div class="empty">No Part found for this customer.</div>';
  const rows = filtered.slice();
  window.__labourPlanRowOrder = rows.map(p=>p.id);
  const mk = labourPlanMonth;
  return `
  <div class="plan-table-wrap">
  <table class="plan-table">
    <thead><tr>
      <th>Part No</th><th>Part Name (Auto)</th>
      <th>Customer Schedule Qty <span class="hint" style="position:static; font-size:9px;">(selected month)</span></th><th>Committed</th><th>Balance</th>
      <th>Commitment Date</th><th>Commitment Qty</th><th>Entries</th>
    </tr></thead>
    <tbody>
    ${rows.map(p=>{
      const t = labourPOMonthTotals(p, mk);
      const scheduleCount = (p.scheduleQtyEntries||[]).filter(s=>monthKeyOf(s.date)===mk).length;
      const commitCount = (p.commitments||[]).filter(c=>monthKeyOf(c.date)===mk).length;
      const isOpen = !!labourPlanHistoryOpen[p.id];
      const notScheduledYet = t.scheduled<=0;
      const lastCommit = (p.commitments||[]).filter(c=>monthKeyOf(c.date)===mk).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')).pop();
      return `
      <tr class="plan-row" id="lp_row_${p.id}">
        <td class="pt-text"><b>${esc(p.finPartNo)||'—'}</b></td>
        <td class="pt-text rt-truncate" title="${esc(p.finPartName)}">${esc(p.finPartName)||'—'}</td>
        <td class="pt-text ${notScheduledYet?'cell-io':'cell-calc'}" id="lp_scheduled_${p.id}">
          ${notScheduledYet ? `
          <div style="display:flex; gap:4px; align-items:center; padding:5px 8px;">
            <input type="number" id="lp_startsched_${p.id}" placeholder="Enter Schedule Qty" style="width:110px; height:32px;" onkeydown="if(event.key==='Enter'){event.preventDefault(); startLabourPlanSchedule('${p.id}');}">
            <button type="button" class="btn small" title="Start planning this month" onclick="startLabourPlanSchedule('${p.id}')" style="background:var(--steel); color:#fff; border-color:var(--steel);">Start ▸</button>
          </div>` : `<span class="cc-val">${t.scheduled}</span><span class="cc-lbl">this month</span>`}
        </td>
        <td class="pt-text cell-calc" id="lp_committed_${p.id}"><span class="cc-val">${t.committed}</span><span class="cc-lbl">committed</span></td>
        <td class="pt-text cell-calc" id="lp_balance_${p.id}"><span class="cc-val" style="${t.balance<0?'color:#b23b3b;':t.balance===0&&t.scheduled>0?'color:var(--green,#278449);':''}">${t.balance}</span><span class="cc-lbl">balance</span></td>
        <td class="cell-io"><input type="date" id="lp_date_${p.id}" value="${esc(planQuickDate)}" ${notScheduledYet?'disabled':''}></td>
        <td class="pt-qty cell-io"><input type="number" id="lp_qty_${p.id}" placeholder="${notScheduledYet?'Enter schedule first':'Type Qty ↵'}" ${notScheduledYet?'disabled':''} oninput="clearPlanQtyError(this)" onkeydown="handleLabourPlanKey(event,'${p.id}')"><span class="plan-qty-err" id="lp_qtyerr_${p.id}"></span><div class="qty-recent" id="lp_recent_${p.id}">${lastCommit?`✓ Last logged: ${esc(fmtDate(lastCommit.date))} → ${lastCommit.qty}`:''}</div></td>
        <td class="pt-text"><button class="btn ghost small" onclick="toggleLabourPlanHistory('${p.id}')">📋 ${scheduleCount} sched · ${commitCount} commit ${isOpen?'▲':'▼'}</button></td>
      </tr>
      ${isOpen ? `<tr class="history-row"><td colspan="8">${labourPlanHistoryHtml(p)}</td></tr>` : ''}
      `;
    }).join('')}
    </tbody>
  </table>
  </div>`;
}
// One-click "start planning this month" — logs the first Schedule Qty entry for the selected
// month against this part (dated today if the selected month is the current month, otherwise
// the 1st of the selected month) so the row unlocks for Commitment entry.
function startLabourPlanSchedule(id){
  const rec = DB.labourPO.find(x=>x.id===id); if(!rec) return;
  const qtyEl = document.getElementById('lp_startsched_'+id);
  const qty = parseFloat(qtyEl && qtyEl.value)||0;
  if(qty<=0){ toast('Enter a Customer Schedule Qty to start planning'); return; }
  if(!rec.scheduleQtyEntries) rec.scheduleQtyEntries = [];
  const entryDate = labourPlanMonth===currentMonthKey() ? today() : labourPlanMonth+'-01';
  rec.scheduleQtyEntries.push({id:'sq'+Date.now()+Math.random().toString(36).slice(2,6), date:entryDate, qty});
  saveDB();
  toast('Customer Schedule Qty logged — planning started for '+monthKeyLabel(labourPlanMonth));
  renderLabourPlanListOnly();
}
// Entries panel: two independent running lists, both scoped to the SELECTED month —
// Customer Schedule Qty entries (what the customer has told us to expect this month, logged in
// as many batches as they send) and Commitment entries (this month's dated delivery plan
// against that total). Use the Month field above the grid to switch months.
function labourPlanHistoryHtml(p){
  const mk = labourPlanMonth;
  // Newest-first — whatever the user just logged shows at the TOP of its list, immediately
  // visible without scrolling, instead of getting buried below older entries.
  const schedEntries = (p.scheduleQtyEntries||[]).map((s,i)=>({...s, _i:i})).filter(s=>monthKeyOf(s.date)===mk)
    .sort((a,b)=> (b.date||'').localeCompare(a.date||'') || b._i-a._i);
  const commitEntries = (p.commitments||[]).map((c,i)=>({...c, _i:i})).filter(c=>monthKeyOf(c.date)===mk)
    .sort((a,b)=> (b.date||'').localeCompare(a.date||'') || b._i-a._i);
  const schedTotal = schedEntries.reduce((a,s)=>a+(parseFloat(s.qty)||0),0);
  const commitTotal = commitEntries.reduce((a,c)=>a+(parseFloat(c.qty)||0),0);
  const schedRows = schedEntries.length ? schedEntries.map(s=>`
    <div class="entry-row${labourPlanJustAdded.sched===s.id?' commit-flash':''}">
      <input type="date" value="${esc(s.date)}" onchange="editLabourScheduleEntry('${p.id}',${s._i},'date',this.value)">
      <input type="number" value="${s.qty}" onchange="editLabourScheduleEntry('${p.id}',${s._i},'qty',this.value)">
      <button type="button" class="er-del" title="Remove" onclick="removeLabourScheduleEntry('${p.id}',${s._i})">✕</button>
    </div>`).join('') : '<div class="entry-empty">No Customer Schedule Qty logged yet for this month.</div>';
  const commitRows = commitEntries.length ? commitEntries.map(c=>`
    <div class="entry-row${labourPlanJustAdded.commit===c.id?' commit-flash':''}">
      <input type="date" value="${esc(c.date)}" onchange="editLabourCommitmentEntry('${p.id}',${c._i},'date',this.value)">
      <input type="number" value="${c.qty}" onchange="editLabourCommitmentEntry('${p.id}',${c._i},'qty',this.value)">
      <button type="button" class="er-del" title="Remove" onclick="removeLabourCommitmentEntry('${p.id}',${c._i})">✕</button>
    </div>`).join('') : '<div class="entry-empty">No commitment entries yet for this month for this part.</div>';
  return `
  <div class="entry-wrap">
    <div class="entry-card sched">
      <div class="ec-head">
        <span class="ec-title">🔵 Customer Schedule Qty — ${esc(monthKeyLabel(mk))}</span>
        <span class="ec-total">Total: ${schedTotal}</span>
      </div>
      <div class="entry-addrow">
        <input type="date" id="lp_newsched_date_${p.id}" value="${esc(planQuickDate)}">
        <input type="number" id="lp_newsched_qty_${p.id}" placeholder="New Schedule Qty — type & press Enter" onkeydown="if(event.key==='Enter'){event.preventDefault(); addLabourScheduleEntry('${p.id}');}">
        <button type="button" title="Add" onclick="addLabourScheduleEntry('${p.id}')">+</button>
      </div>
      <div class="entry-list">${schedRows}</div>
    </div>
    <div class="entry-card commit">
      <div class="ec-head">
        <span class="ec-title">🟢 Commitment Entries — ${esc(monthKeyLabel(mk))}</span>
        <span class="ec-total">Total: ${commitTotal}</span>
      </div>
      <div class="entry-list">${commitRows}</div>
    </div>
  </div>`;
}
function toggleLabourPlanHistory(id){ labourPlanHistoryOpen[id] = !labourPlanHistoryOpen[id]; renderLabourPlanListOnly(); }
function addLabourScheduleEntry(id){
  const rec = DB.labourPO.find(x=>x.id===id); if(!rec) return;
  const dateEl = document.getElementById('lp_newsched_date_'+id);
  const qtyEl = document.getElementById('lp_newsched_qty_'+id);
  const qty = parseFloat(qtyEl.value)||0;
  if(qty<=0){ toast('Enter a Schedule Qty'); return; }
  if(!rec.scheduleQtyEntries) rec.scheduleQtyEntries = [];
  const newId = 'sq'+Date.now()+Math.random().toString(36).slice(2,6);
  rec.scheduleQtyEntries.push({id:newId, date:dateEl.value||today(), qty});
  labourPlanHistoryOpen[id] = true;
  labourPlanJustAdded = {sched:newId, commit:null};
  saveDB();
  toast('Customer Schedule Qty logged: '+qty);
  renderLabourPlanListOnly();
  const freshQtyEl = document.getElementById('lp_newsched_qty_'+id);
  if(freshQtyEl) freshQtyEl.focus();
  setTimeout(()=>{ labourPlanJustAdded.sched=null; }, 1400);
}
function editLabourScheduleEntry(id, i, field, val){
  const rec = DB.labourPO.find(x=>x.id===id); if(!rec || !rec.scheduleQtyEntries || !rec.scheduleQtyEntries[i]) return;
  rec.scheduleQtyEntries[i][field] = field==='qty' ? (parseFloat(val)||0) : val;
  saveDB(); renderLabourPlanListOnly();
}
function removeLabourScheduleEntry(id, i){
  const rec = DB.labourPO.find(x=>x.id===id); if(!rec || !rec.scheduleQtyEntries) return;
  rec.scheduleQtyEntries.splice(i,1);
  saveDB(); renderLabourPlanListOnly();
}
// Edits made to commitment history are validated exactly like new entries — within the current
// month, the total can never be pushed past that month's total Customer Schedule Qty.
function editLabourCommitmentEntry(id, i, field, val){
  const rec = DB.labourPO.find(x=>x.id===id); if(!rec || !rec.commitments || !rec.commitments[i]) return;
  if(field==='qty'){
    const mk = monthKeyOf(rec.commitments[i].date) || currentMonthKey();
    const newQty = parseFloat(val)||0;
    const scheduled = labourScheduleQtyTotalForMonth(rec, mk);
    const otherCommitted = rec.commitments.reduce((a,c,idx)=>(idx===i||monthKeyOf(c.date)!==mk)?a:a+(parseFloat(c.qty)||0),0);
    if(otherCommitted + newQty > scheduled){
      toast(`Exceeds ${monthKeyLabel(mk)}'s Customer Schedule Qty (${scheduled}) — only ${Math.max(scheduled-otherCommitted,0)} remaining to commit`);
      renderLabourPlanListOnly();
      return;
    }
  }
  rec.commitments[i][field] = field==='qty' ? (parseFloat(val)||0) : val;
  saveDB(); renderLabourPlanListOnly();
}
function removeLabourCommitmentEntry(id, i){
  const rec = DB.labourPO.find(x=>x.id===id); if(!rec || !rec.commitments) return;
  rec.commitments.splice(i,1);
  saveDB(); renderLabourPlanListOnly();
}
function handleLabourPlanKey(e, id){
  if(e.key!=='Enter') return;
  e.preventDefault();
  commitLabourPlanRow(id);
}
// Saves one Commitment Date + Qty entry against this Finished Part Number for the CURRENT
// month (in addition to any already logged this month) and immediately jumps to the next row's
// Qty field. Mandatory validation: planning cannot start until a Schedule Qty has been entered
// for this month, and the cumulative Committed Qty can never exceed this month's total
// Customer Schedule Qty — an entry that would exceed it is rejected until corrected.
function commitLabourPlanRow(id){
  const rec = DB.labourPO.find(x=>x.id===id); if(!rec) return;
  const dateEl = document.getElementById('lp_date_'+id);
  const qtyEl = document.getElementById('lp_qty_'+id);
  const errEl = document.getElementById('lp_qtyerr_'+id);
  const mk = labourPlanMonth;
  const scheduled = labourScheduleQtyTotalForMonth(rec, mk);
  if(scheduled<=0){ showPlanQtyError(qtyEl, errEl, `Enter this month's Customer Schedule Qty first`); return; }
  const qty = parseFloat(qtyEl.value)||0;
  if(qty<=0){ showPlanQtyError(qtyEl, errEl, 'Enter a Commitment Qty'); return; }
  const alreadyCommitted = labourCommittedQtyTotalForMonth(rec, mk);
  if(alreadyCommitted + qty > scheduled){
    const remaining = Math.max(scheduled - alreadyCommitted, 0);
    showPlanQtyError(qtyEl, errEl, `Exceeds this month's Customer Schedule Qty (${scheduled}) — only ${remaining} remaining to commit`);
    return;
  }
  clearPlanQtyError(qtyEl);
  const date = dateEl.value || (labourPlanMonth===currentMonthKey() ? today() : labourPlanMonth+'-01');
  if(!rec.commitments) rec.commitments = [];
  const newId = 'lc'+Date.now()+Math.random().toString(36).slice(2,6);
  rec.commitments.push({id:newId, date, qty});
  planQuickDate = date;
  labourPlanJustAdded = {sched:null, commit:newId};
  saveDB();
  toast(`✓ Committed ${qty} for ${fmtDate(date)}`);
  renderLabourPlanListOnly();
  // Show a persistent, clearly-visible confirmation right under the Qty cell — the value the
  // user just typed never simply vanishes, even though the input clears for the next entry.
  const recentEl = document.getElementById('lp_recent_'+id);
  if(recentEl){ recentEl.classList.add('flash'); setTimeout(()=>recentEl.classList.remove('flash'), 1200); }
  setTimeout(()=>{ labourPlanJustAdded.commit=null; }, 1400);
  focusNextPlanRow('labour', id);
}
function setLabourPlanQuickDate(v){ planQuickDate = v || today(); renderLabourPlanListOnly(); }

/* ==== Customer-facing print: "Customer Schedule & Delivery Commitment" ====
   A premium, corporate A4 document for the currently selected customer's CURRENT-month Job Work
   Plan — built to be emailed straight to the customer. Uses the same company name/logo/address
   already configured centrally in Settings so it always stays in sync with every other printed
   document in the system.
   A Part with several Commitment dates (customers routinely receive their total
   Schedule Qty across multiple dated deliveries) is rendered as ONE merged block — Part
   Number / Part Name / Schedule Qty / Balance Qty / Remarks span every commitment row for that
   part (via rowspan), while each Commitment Date + Commitment Qty gets its own row underneath,
   exactly like a real delivery schedule sent to a customer. */
function labourCustomerScheduleRows(customerId, mk){
  const list = DB.labourPO.filter(x=>reportUnitMatch(x.unit) && planRecCustomerKey(x)===customerId);
  return list.map(p=>{
    const t = labourPOMonthTotals(p, mk);
    const commits = (p.commitments||[]).filter(c=>monthKeyOf(c.date)===mk).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    let remarks;
    if(t.scheduled<=0) remarks = 'Schedule not yet received';
    else if(t.committed>=t.scheduled) remarks = 'Fully Committed';
    else if(t.committed>0) remarks = `${t.balance} Qty pending commitment`;
    else remarks = 'Commitment pending';
    return {
      partNo: p.finPartNo||'—', partName: p.finPartName||'—',
      scheduled: t.scheduled, committed: t.committed, balance: t.balance, remarks,
      commits: commits.map(c=>({date: fmtDate(c.date), qty: c.qty}))
    };
  }).filter(r=>r.scheduled>0 || r.committed>0); // only show parts actually scheduled/committed this month
}
// Each part's merged commitment block is kept together across a page break by being rendered
// as its own <tbody> below (see labourCustomerScheduleTableRowsHtml) rather than by guessing
// how many rows fit on a page.
// block across two pages. Each part becomes its own <tbody> further down — the browser's
// native pagination (not a JS row-count guess) decides where pages actually break, so there's
// no risk of leftover blank space from a mis-estimated budget.
function labourCustomerScheduleTableRowsHtml(parts, startSno){
  let html = '';
  parts.forEach((r, idx)=>{
    const sno = startSno + idx;
    const n = Math.max(1, r.commits.length);
    const firstCommit = r.commits[0] || {date:'—', qty:'—'};
    html += `<tbody class="partBlock">
    <tr>
      <td class="num" rowspan="${n}">${sno}</td>
      <td class="char" rowspan="${n}">${esc(r.partNo)}</td>
      <td rowspan="${n}">${esc(r.partName)}</td>
      <td class="num" rowspan="${n}">${r.scheduled}</td>
      <td class="center">${esc(firstCommit.date)}</td>
      <td class="num">${firstCommit.qty}</td>
      <td class="num" rowspan="${n}" style="${r.balance>0?'color:#b23b3b; font-weight:700;':''}">${r.balance}</td>
      <td rowspan="${n}">${esc(r.remarks)}</td>
    </tr>`;
    for(let i=1;i<r.commits.length;i++){
      html += `<tr><td class="center">${esc(r.commits[i].date)}</td><td class="num">${r.commits[i].qty}</td></tr>`;
    }
    html += `</tbody>`;
  });
  return html;
}
function printLabourCustomerSchedule(){
  if(!labourPlanCustomerId){ toast('Select a Customer first'); return; }
  const mk = labourPlanMonth;
  const rows = labourCustomerScheduleRows(labourPlanCustomerId, mk);
  const custRec = DB.labourPO.find(x=>planRecCustomerKey(x)===labourPlanCustomerId);
  const customerName = custRec ? (custRec.customer||'—') : '—';
  const co = DB.settings.company || {name:'VISALAM INDUSTRIES PVT LTD', logo:''};
  const officeAddr = (DB.settings.addresses||{}).office || '';
  const preparedBy = (currentUser && currentUser.name) || '';
  const approvedBy = labourPlanApprovedBy || '';
  const reportDate = fmtDate(today());
  const w = window.open('', '_blank', 'width=950,height=1100');
  if(!w){ alert('Popup blocked — please allow popups for this site to print.'); return; }

  const totalSched = rows.reduce((a,r)=>a+r.scheduled,0);
  const totalCommit = rows.reduce((a,r)=>a+r.committed,0);
  const totalBal = rows.reduce((a,r)=>a+r.balance,0);

  // Header block lives inside <thead> and the footer inside <tfoot> — both repeat
  // AUTOMATICALLY on every physical page the browser creates (native table pagination),
  // so there's no manual "page 1 header vs page 2+ mini-header" bookkeeping to get wrong.
  const theadHtml = `<thead>
    <tr class="csHeadRow"><th colspan="8">
      <div class="csHead">
        <div class="brandBlock">
          ${co.logo ? `<img src="${co.logo}" alt="logo">` : ''}
          <div>
            <h1>${esc(co.name||'VISALAM INDUSTRIES PVT LTD')}</h1>
            ${officeAddr ? `<div class="addr">${addrLines(officeAddr)}</div>` : ''}
          </div>
        </div>
        <div class="meta"><div>Report Date: <b>${esc(reportDate)}</b></div></div>
      </div>
      <div class="csTitle">Customer Schedule &amp; Delivery Commitment</div>
      <div class="csInfo">
        <div class="cell"><div class="lbl">Customer Name</div><div class="val">${esc(customerName)}</div></div>
        <div class="cell"><div class="lbl">Month &amp; Year</div><div class="val">${esc(monthKeyLabel(mk))}</div></div>
        <div class="cell"><div class="lbl">Report Date</div><div class="val">${esc(reportDate)}</div></div>
        <div class="cell"><div class="lbl">Prepared By</div><div class="val">${esc(preparedBy)||'—'}</div></div>
        <div class="cell"><div class="lbl">Approved By</div><div class="val">${esc(approvedBy)||'—'}</div></div>
      </div>
    </th></tr>
    <tr class="csColHead">
      <th class="num">S.No</th><th>Part Number</th><th>Part Name</th>
      <th class="num">Customer Schedule Qty</th><th class="center">Commitment Date</th>
      <th class="num">Commitment Qty</th><th class="num">Balance Qty</th><th>Remarks</th>
    </tr>
  </thead>`;

  const tfootHtml = `<tfoot><tr><td colspan="8">
    <div class="csFooter"><span>${esc(co.name||'VISALAM INDUSTRIES PVT LTD')}</span><span>Customer Schedule &amp; Delivery Commitment — ${esc(customerName)}</span><span>Printed: ${esc(reportDate)}</span></div>
  </td></tr></tfoot>`;

  const bodyRows = rows.length ? labourCustomerScheduleTableRowsHtml(rows, 1)
    : `<tbody><tr><td colspan="8" style="text-align:center; padding:16px; color:#888;">No schedule entered yet for ${esc(monthKeyLabel(mk))}</td></tr></tbody>`;

  const totalsAndSignHtml = rows.length ? `<tbody class="closingBlock">
      <tr class="csTotalRow">
        <td colspan="3" style="text-align:right;">Total</td><td class="num">${totalSched}</td><td></td>
        <td class="num">${totalCommit}</td><td class="num">${totalBal}</td><td></td>
      </tr>
      <tr class="csSignRowTr"><td colspan="8">
        <div class="csSignRow">
          <div class="sign">Prepared By<div class="who">${esc(preparedBy)||'&nbsp;'}</div></div>
          <div class="sign">Approved By<div class="who">${esc(approvedBy)||'&nbsp;'}</div></div>
        </div>
      </td></tr>
    </tbody>` : '';

  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Customer Schedule &amp; Delivery Commitment — ${esc(customerName)}</title>
  <style>
    @page{
      size:A4 portrait; margin:16mm 14mm 18mm;
      @bottom-right{ content:"Page " counter(page) " of " counter(pages); font-size:8.5px; color:#5b6b7a; }
    }
    *{ box-sizing:border-box; }
    :root{ --accent:#1f5673; --accent-dark:#123a4e; --accent-dim:#e9f0f4; --ink:#1c2b3a; --sub-ink:#5b6b7a; --line-soft:#d9e0e6; }
    html,body{ margin:0; padding:0; }
    body{ font-family:'Segoe UI',Arial,sans-serif; color:var(--ink); font-size:11.5px; line-height:1.45; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .csHead{ display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2.5px solid var(--accent); padding-bottom:10px; margin-bottom:12px; gap:14px; }
    .csHead .brandBlock{ display:flex; align-items:flex-start; gap:12px; }
    .csHead .brandBlock img{ max-height:50px; max-width:130px; object-fit:contain; }
    .csHead h1{ font-size:17px; margin:0 0 4px; letter-spacing:0.3px; font-weight:800; color:var(--accent-dark); }
    .csHead .addr{ font-size:10px; color:var(--sub-ink); line-height:1.4; }
    .csHead .meta{ text-align:right; font-size:10px; color:#3d4b58; line-height:1.5; }
    .csTitle{ font-size:14px; font-weight:800; margin:0 0 10px; text-transform:uppercase; letter-spacing:0.8px; color:#fff; background:linear-gradient(135deg,var(--accent),var(--accent-dark)); padding:7px 14px; border-radius:4px; text-align:center; }
    .csInfo{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:0; border:1px solid var(--line-soft); border-radius:4px; margin-bottom:2px; overflow:hidden; }
    .csInfo .cell{ padding:6px 12px; border-right:1px solid var(--line-soft); border-bottom:1px solid var(--line-soft); }
    .csInfo .cell:nth-child(3n){ border-right:none; }
    .csInfo .cell:nth-child(n+4){ border-bottom:none; }
    .csInfo .cell .lbl{ font-size:8.5px; text-transform:uppercase; letter-spacing:0.5px; color:var(--sub-ink); font-weight:700; margin-bottom:2px; }
    .csInfo .cell .val{ font-size:11.5px; font-weight:600; color:var(--ink); }
    table.dat{ width:100%; border-collapse:collapse; table-layout:fixed; }
    table.dat th, table.dat td{ border:1px solid var(--line-soft); padding:7px 9px; font-size:11px; vertical-align:middle; text-align:center; word-wrap:break-word; }
    table.dat thead th{ border:none; padding:0; background:transparent; }
    table.dat .csHeadRow th{ padding:0 0 10px; }
    table.dat .csColHead th{ background:var(--accent); color:#fff; text-transform:uppercase; letter-spacing:0.3px; font-size:9.5px; text-align:center; font-weight:700; border:1px solid var(--line-soft); padding:7px 9px; }
    table.dat td.num{ font-variant-numeric:tabular-nums; }
    table.dat td.char{ font-weight:700; color:var(--accent-dark); }
    table.dat tbody.partBlock:nth-of-type(even) td{ background:#f4f8fa; }
    table.dat tr.csTotalRow td{ font-weight:800; background:var(--accent-dim) !important; border-top:1.6px solid var(--accent); }
    table.dat tr.csSignRowTr td{ border:none; padding-top:14px; }
    table.dat tr, table.dat tbody.partBlock, table.dat tbody.closingBlock{ page-break-inside:avoid; break-inside:avoid; }
    table.dat thead{ display:table-header-group; }
    table.dat tfoot{ display:table-footer-group; }
    .csSignRow{ margin-top:26px; display:flex; justify-content:space-between; font-size:11px; }
    .csSignRow .sign{ border-top:1px solid #333; padding-top:6px; width:190px; text-align:center; color:#333; }
    .csSignRow .sign .who{ font-weight:700; margin-top:2px; }
    .csFooter{ display:flex; justify-content:space-between; font-size:9px; color:var(--sub-ink); border-top:1px solid var(--line-soft); padding-top:5px; margin-top:2px; }
    @media print{ .noPrint{ display:none; } }
    .noPrint{ text-align:center; margin:16px 0; }
    .noPrint button{ padding:8px 18px; font-size:13px; cursor:pointer; margin:0 4px; border-radius:3px; border:1px solid #ccc; background:#fff; }
    .noPrint button:first-child{ background:var(--accent); color:#fff; border-color:var(--accent); }
  </style></head><body>
    <table class="dat">
      ${theadHtml}
      ${bodyRows}
      ${totalsAndSignHtml}
      ${tfootHtml}
    </table>
    <div class="noPrint">
      <button onclick="window.print()">🖨 Print / Save as PDF</button>
      <button onclick="window.close()">Close</button>
    </div>
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(()=>{ try{ w.print(); }catch(e){} }, 300);
}
/* ==== PLANNING PERFORMANCE REPORT (Job Work Plan, month-wise history) ====
   The live Planning screen only ever shows the current month. Every month that closes moves
   its Schedule/Commitment/Dispatch data here — this report reads the exact same underlying
   records (nothing is duplicated or archived separately) but breaks them out one row per
   Part per month, so past months remain fully analyzable without ever reappearing on
   the current Planning screen. */
function setPerfReportCustomer(v){ perfReportCustomerId = v; renderLabourPlanPerfReportOnly(); }
function setPerfReportMonth(v){ perfReportMonth = v; renderLabourPlanPerfReportOnly(); }
function renderLabourPlanPerfReportOnly(){
  const box = document.getElementById('perfReportBox');
  if(box) box.innerHTML = salesPlanPerfReportHtml() + labourPlanPerfReportHtml();
  const failBox = document.getElementById('failureRootCauseBox');
  if(failBox) failBox.innerHTML = failureRootCauseSectionHtml();
}
function labourPlanPerfRows(){
  const list = DB.labourPO.filter(x=>reportUnitMatch(x.unit) && (!perfReportCustomerId || planRecCustomerKey(x)===perfReportCustomerId));
  const rows = [];
  list.forEach(p=>{
    const months = labourPOAllMonthKeys(p).filter(mk=>!perfReportMonth || mk===perfReportMonth);
    months.forEach(mk=>{
      const t = labourPOMonthTotals(p, mk);
      if(t.scheduled<=0 && t.committed<=0 && t.dispatched<=0) return; // nothing happened that month for this part
      const deliveryPct = t.scheduled>0 ? Math.round((t.dispatched/t.scheduled)*1000)/10 : 0;
      let analysis;
      if(t.scheduled<=0) analysis = 'No schedule entered';
      else if(t.dispatched>=t.scheduled) analysis = '✅ Delivered in full';
      else if(t.committed<t.scheduled) analysis = `⚠️ Under-committed (${t.scheduled-t.committed} not yet committed)`;
      else if(t.dispatched<t.committed) analysis = `🔴 Delay — ${t.committed-t.dispatched} committed but not dispatched`;
      else analysis = '⏳ In progress';
      rows.push({p, mk, customer: p.customer || planRecCustomerKey(p), t, deliveryPct, analysis});
    });
  });
  rows.sort((a,b)=> b.mk.localeCompare(a.mk) || (a.p.finPartNo||'').localeCompare(b.p.finPartNo||''));
  return rows;
}
function labourPlanPerfMonthSummary(rows){
  const byMonth = {};
  rows.forEach(r=>{
    if(!byMonth[r.mk]) byMonth[r.mk] = {mk:r.mk, scheduled:0, committed:0, dispatched:0};
    byMonth[r.mk].scheduled += r.t.scheduled;
    byMonth[r.mk].committed += r.t.committed;
    byMonth[r.mk].dispatched += r.t.dispatched;
  });
  return Object.values(byMonth).sort((a,b)=>b.mk.localeCompare(a.mk)).map(m=>({
    ...m, pending: m.scheduled - m.dispatched, deliveryPct: m.scheduled>0 ? Math.round((m.dispatched/m.scheduled)*1000)/10 : 0
  }));
}
/* ---- Visual helpers for the redesigned Planning Performance Report ---- */
function perfPctClass(pct){ return pct>=95 ? 'good' : pct>=70 ? 'warn' : 'bad'; }
function perfDeliveryBarHtml(pct, hasSchedule){
  if(!hasSchedule) return `<span class="hint" style="position:static;">—</span>`;
  const cls = perfPctClass(pct);
  const w = Math.max(0, Math.min(100, pct));
  return `<div class="dv-wrap">
    <div class="dv-track"><div class="dv-fill ${cls}" style="width:${w}%;"></div></div>
    <span class="dv-pct ${cls}">${pct}%</span>
  </div>`;
}
function perfAnalysisPillHtml(analysis){
  let cls='progress', icon='⏳', label=analysis;
  if(analysis.startsWith('✅')){ cls='done'; icon='✅'; label='Delivered in full'; }
  else if(analysis.startsWith('🔴')){ cls='fail'; icon='🔴'; label=analysis.replace('🔴 ',''); }
  else if(analysis.startsWith('⚠️')){ cls='hold'; icon='⚠️'; label=analysis.replace('⚠️ ',''); }
  else if(analysis.startsWith('No schedule') || analysis.startsWith('No PO Quantity')){ cls='na'; icon='—'; label=analysis; }
  else { label=analysis.replace('⏳ ',''); }
  return `<span class="pill ${cls}" style="white-space:normal; text-transform:none; font-family:inherit; line-height:1.4; padding:4px 9px;">${icon} ${esc(label)}</span>`;
}
// Shared status/analysis logic — used identically for both Job Work Plan (month-scoped) rows
// and Sales Plan (whole-PO) rows below, so the same wording and thresholds apply everywhere.
function perfAnalysisFor(scheduled, committed, dispatched, noScheduleLabel){
  if(scheduled<=0) return noScheduleLabel || 'No schedule entered';
  if(dispatched>=scheduled) return '✅ Delivered in full';
  if(committed<scheduled) return `⚠️ Under-committed (${scheduled-committed} not yet committed)`;
  if(dispatched<committed) return `🔴 Delay — ${committed-dispatched} committed but not dispatched`;
  return '⏳ In progress';
}
function labourPlanPerfReportHtml(){
  const rows = labourPlanPerfRows();
  const summary = labourPlanPerfMonthSummary(rows);

  // ---- Overall snapshot cards (respects the active Customer/Month filters) ----
  const overall = summary.reduce((a,m)=>({scheduled:a.scheduled+m.scheduled, committed:a.committed+m.committed, dispatched:a.dispatched+m.dispatched}), {scheduled:0,committed:0,dispatched:0});
  const overallPending = overall.scheduled - overall.dispatched;
  const overallPct = overall.scheduled>0 ? Math.round((overall.dispatched/overall.scheduled)*1000)/10 : 0;
  const delayedCount = rows.filter(r=>r.analysis.startsWith('🔴')).length;
  const underCommittedCount = rows.filter(r=>r.analysis.startsWith('⚠️')).length;
  const deliveredCount = rows.filter(r=>r.analysis.startsWith('✅')).length;
  const cardsHtml = rows.length ? `
    <div class="cards" style="margin-bottom:16px;">
      <div class="card perf-card"><div class="v">${overall.scheduled}</div><div class="l">Total Scheduled</div></div>
      <div class="card perf-card"><div class="v">${overall.committed}</div><div class="l">Total Committed</div></div>
      <div class="card perf-card good"><div class="v">${overall.dispatched}</div><div class="l">Total Delivered</div></div>
      <div class="card perf-card ${overallPending>0?'bad':''}"><div class="v">${overallPending}</div><div class="l">Total Pending</div></div>
      <div class="card perf-card ${perfPctClass(overallPct)}"><div class="v">${overallPct}%</div><div class="l">Overall Delivery Rate</div></div>
      <div class="card perf-card ${delayedCount>0?'bad':''}"><div class="v">${delayedCount}</div><div class="l">Delayed Items</div></div>
    </div>
    <div class="perf-legend">
      <span class="lg-item"><span class="lg-swatch" style="background:var(--green);"></span>Delivered in full (${deliveredCount})</span>
      <span class="lg-item"><span class="lg-swatch" style="background:var(--steel);"></span>In progress</span>
      <span class="lg-item"><span class="lg-swatch" style="background:var(--amber);"></span>Under-committed (${underCommittedCount})</span>
      <span class="lg-item"><span class="lg-swatch" style="background:var(--red);"></span>Delayed — committed but not dispatched (${delayedCount})</span>
      <span class="lg-item"><span class="lg-swatch" style="background:var(--text-dim);"></span>No schedule entered</span>
    </div>` : '';

  const summaryHtml = summary.length ? `
    <div class="perf-subhead"><span class="psh-badge">Job Work Plan</span><h3>Month-wise Performance Summary</h3><span class="hint">${summary.length} month(s)</span></div>
    <div class="plan-table-wrap">
    <table class="plan-table">
      <thead><tr>
        <th>Month</th><th class="pt-num-h">Scheduled</th><th class="pt-num-h">Committed</th><th class="pt-num-h">Delivered</th><th class="pt-num-h">Pending</th><th>Delivery Rate</th>
      </tr></thead>
      <tbody>
      ${summary.map(m=>`
        <tr>
          <td class="pt-text"><b>${esc(monthKeyLabel(m.mk))}</b></td>
          <td class="pt-text pt-num">${m.scheduled}</td>
          <td class="pt-text pt-num">${m.committed}</td>
          <td class="pt-text pt-num">${m.dispatched}</td>
          <td class="pt-text pt-num">${m.pending>0?`<span class="badge bad">${m.pending}</span>`:'<span class="badge ok">0</span>'}</td>
          <td class="pt-text">${perfDeliveryBarHtml(m.deliveryPct, m.scheduled>0)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr style="font-weight:700;">
          <td class="pt-text">Grand Total</td>
          <td class="pt-text pt-num">${overall.scheduled}</td>
          <td class="pt-text pt-num">${overall.committed}</td>
          <td class="pt-text pt-num">${overall.dispatched}</td>
          <td class="pt-text pt-num">${overallPending}</td>
          <td class="pt-text">${perfDeliveryBarHtml(overallPct, overall.scheduled>0)}</td>
        </tr>
      </tfoot>
    </table>
    </div>` : '';

  // ---- Part / Month detail, grouped visually by month (rows already sorted month desc, part asc) ----
  let detailHtml = '';
  if(rows.length){
    const monthTotalsByKey = {}; summary.forEach(m=>monthTotalsByKey[m.mk]=m);
    let lastMonth = null;
    const bodyRows = rows.map(r=>{
      let groupHeader = '';
      if(r.mk !== lastMonth){
        lastMonth = r.mk;
        const mt = monthTotalsByKey[r.mk];
        groupHeader = `
        <tr class="perf-month-row"><td colspan="10">
          <div class="pmr-inner">
            <span class="pmr-title">📅 ${esc(monthKeyLabel(r.mk))}</span>
            <span class="pmr-stat">Scheduled <b>${mt?mt.scheduled:0}</b></span>
            <span class="pmr-stat">Committed <b>${mt?mt.committed:0}</b></span>
            <span class="pmr-stat">Delivered <b>${mt?mt.dispatched:0}</b></span>
            <span class="pmr-stat">Pending <b style="${mt&&mt.pending>0?'color:var(--red);':''}">${mt?mt.pending:0}</b></span>
            <span class="pmr-stat">Delivery Rate <b style="color:var(--${mt?perfPctClass(mt.deliveryPct):'text'});">${mt?mt.deliveryPct:0}%</b></span>
          </div>
        </td></tr>`;
      }
      return groupHeader + `
        <tr class="plan-row">
          <td class="pt-text">${esc(custDispByName(r.customer))||'—'}</td>
          <td class="pt-text"><b>${esc(r.p.finPartNo)||'—'}</b></td>
          <td class="pt-text rt-truncate" title="${esc(r.p.finPartName)}">${esc(r.p.finPartName)||'—'}</td>
          <td class="pt-text pt-num">${r.t.scheduled}</td>
          <td class="pt-text pt-num">${r.t.committed}</td>
          <td class="pt-text pt-num">${r.t.dispatched}</td>
          <td class="pt-text pt-num">${r.t.balance<0?`<span class="badge bad">${r.t.balance}</span>`:r.t.balance}</td>
          <td class="pt-text pt-num">${r.t.pending>0?`<span class="badge bad">${r.t.pending}</span>`:'<span class="badge ok">0</span>'}</td>
          <td class="pt-text">${perfDeliveryBarHtml(r.deliveryPct, r.t.scheduled>0)}</td>
          <td class="pt-text">${perfAnalysisPillHtml(r.analysis)}</td>
        </tr>`;
    }).join('');
    detailHtml = `
    <div class="perf-subhead"><span class="psh-badge">Job Work Plan</span><h3>Part / Month Detail</h3><span class="hint">${rows.length} row(s), grouped by month</span></div>
    <div class="plan-table-wrap">
    <table class="plan-table">
      <thead><tr>
        <th>Customer</th><th>Part No</th><th>Part Name</th>
        <th class="pt-num-h">Scheduled</th><th class="pt-num-h">Committed</th><th class="pt-num-h">Delivered</th><th class="pt-num-h">Balance</th><th class="pt-num-h">Pending</th>
        <th>Delivery Rate</th><th>Status</th>
      </tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    </div>`;
  } else {
    detailHtml = '<div class="empty">No Job Work Plan history found for these filters.</div>';
  }
  return cardsHtml + summaryHtml + detailHtml;
}

/* ==== SALES PLAN PERFORMANCE (Sales PO Quantity, Customer/Part-wise) ====
   Sales Plan (Customer PO) works differently from Job Work Plan: the Sales PO Quantity
   (custPO.orderedQty) is set ONCE per Customer PO — it is not re-entered month by month like
   the Job Work Plan's Schedule Qty is. So this section is shown per Customer + Part
   (the natural grain of a Sales PO), not month-by-month. It reads the exact same underlying
   DB.custPO records and the exact same existing helper functions used everywhere else in the
   app (custPOSumPlans for Committed Qty, salesInvoicedQtyForCustPO for Delivered Qty) — no
   calculation or planning logic is changed, this only adds a read-only summary view of it. */
function salesPlanPerfRows(){
  const list = DB.custPO.filter(x=>reportUnitMatch(x.unit) && (!perfReportCustomerId || planRecCustomerKey(x)===perfReportCustomerId));
  return list.map(p=>{
    const scheduled = p.orderedQty||0;           // Sales PO Quantity
    const committed = custPOSumPlans(p.plans);    // existing helper — unchanged
    const dispatched = salesInvoicedQtyForCustPO(p.id); // existing helper — unchanged
    const balance = scheduled - committed;
    const pending = scheduled - dispatched;
    const deliveryPct = scheduled>0 ? Math.round((dispatched/scheduled)*1000)/10 : 0;
    const analysis = perfAnalysisFor(scheduled, committed, dispatched, 'No PO Quantity entered');
    return { p, customer: p.customer || planRecCustomerKey(p), scheduled, committed, dispatched, balance, pending, deliveryPct, analysis };
  }).sort((a,b)=> (a.customer||'').localeCompare(b.customer||'') || (a.p.finPartNo||'').localeCompare(b.p.finPartNo||''));
}
function salesPlanPerfReportHtml(){
  const rows = salesPlanPerfRows();
  if(!rows.length) return `
    <div class="perf-subhead"><span class="psh-badge">Sales Plan</span><h3>Customer PO Performance — Sales PO Quantity</h3></div>
    <div class="empty">No Sales Plan (Customer PO) history found for these filters.</div>`;
  const overall = rows.reduce((a,r)=>({scheduled:a.scheduled+r.scheduled, committed:a.committed+r.committed, dispatched:a.dispatched+r.dispatched}), {scheduled:0,committed:0,dispatched:0});
  const overallPending = overall.scheduled - overall.dispatched;
  const overallPct = overall.scheduled>0 ? Math.round((overall.dispatched/overall.scheduled)*1000)/10 : 0;
  return `
    <div class="perf-subhead"><span class="psh-badge">Sales Plan</span><h3>Customer PO Performance — Sales PO Quantity</h3><span class="hint">${rows.length} PO / Part combination(s) — Sales PO Qty is set once per Customer PO, so this table is Customer/Part-wise rather than month-wise</span></div>
    <div class="plan-table-wrap">
    <table class="plan-table">
      <thead><tr>
        <th>Customer</th><th>Part No</th><th>Part Name</th>
        <th class="pt-num-h">Sales PO Qty</th><th class="pt-num-h">Committed</th><th class="pt-num-h">Delivered</th><th class="pt-num-h">Balance</th><th class="pt-num-h">Pending</th>
        <th>Delivery Rate</th><th>Status</th>
      </tr></thead>
      <tbody>
      ${rows.map(r=>`
        <tr class="plan-row">
          <td class="pt-text">${esc(custDispByName(r.customer))||'—'}</td>
          <td class="pt-text"><b>${esc(r.p.finPartNo)||'—'}</b></td>
          <td class="pt-text rt-truncate" title="${esc(r.p.finPartName)}">${esc(r.p.finPartName)||'—'}</td>
          <td class="pt-text pt-num">${r.scheduled}</td>
          <td class="pt-text pt-num">${r.committed}</td>
          <td class="pt-text pt-num">${r.dispatched}</td>
          <td class="pt-text pt-num">${r.balance<0?`<span class="badge bad">${r.balance}</span>`:r.balance}</td>
          <td class="pt-text pt-num">${r.pending>0?`<span class="badge bad">${r.pending}</span>`:'<span class="badge ok">0</span>'}</td>
          <td class="pt-text">${perfDeliveryBarHtml(r.deliveryPct, r.scheduled>0)}</td>
          <td class="pt-text">${perfAnalysisPillHtml(r.analysis)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr style="font-weight:700;">
          <td class="pt-text" colspan="3">Grand Total</td>
          <td class="pt-text pt-num">${overall.scheduled}</td>
          <td class="pt-text pt-num">${overall.committed}</td>
          <td class="pt-text pt-num">${overall.dispatched}</td>
          <td class="pt-text pt-num"></td>
          <td class="pt-text pt-num">${overallPending}</td>
          <td class="pt-text" colspan="2">${perfDeliveryBarHtml(overallPct, overall.scheduled>0)}</td>
        </tr>
      </tfoot>
    </table>
    </div>`;
}
/* ==== FAILURE ITEMS & ROOT CAUSE ANALYSIS ====
   Bottom-of-page section on the Planning Performance Report: auto-filters every Sales Plan
   and Job Work Plan row (across both tables above) down to just the ones with Pending > 0,
   and lets the user record why via a fixed-option dropdown, saved per-row in DB.failureReasons. */
const FAILURE_REASON_OPTIONS = [
  'Raw Material Delay','Machine Breakdown','Power Outage / Utility Issue','Manpower Shortage',
  'Quality / Rework Issue','Customer Schedule Change','Transport / Logistics Delay','Others'
];
function failureReasonKey(kind, customer, finPartNo, mk){
  const parts = [kind, (customer||'').trim().toLowerCase(), (finPartNo||'').trim().toLowerCase()];
  if(mk) parts.push(mk);
  return parts.join('||');
}
function onFailureReasonChange(key, val){
  if(!DB.failureReasons) DB.failureReasons = {};
  const existing = DB.failureReasons[key] || {};
  DB.failureReasons[key] = {reason: val, other: val==='Others' ? (existing.other||'') : ''};
  saveDB();
  const box = document.getElementById('failureRootCauseBox');
  if(box) box.innerHTML = failureRootCauseSectionHtml();
}
function onFailureReasonOtherChange(key, val){
  if(!DB.failureReasons) DB.failureReasons = {};
  const existing = DB.failureReasons[key] || {reason:'Others'};
  DB.failureReasons[key] = {reason: existing.reason||'Others', other: val};
  saveDB();
  const chartBox = document.getElementById('failureParetoChartBox');
  if(chartBox) chartBox.innerHTML = failureParetoChartHtml();
}
function failureRootCauseRowHtml(kind, customer, finPartNo, finPartName, monthLabel, mk, pending){
  const key = failureReasonKey(kind, customer, finPartNo, mk);
  const saved = (DB.failureReasons && DB.failureReasons[key]) || {reason:'', other:''};
  return `
    <tr class="plan-row">
      <td class="pt-text">${esc(custDispByName(customer))||'—'}</td>
      <td class="pt-text"><b>${esc(finPartNo)||'—'}</b></td>
      <td class="pt-text rt-truncate" title="${esc(finPartName)}">${esc(finPartName)||'—'}</td>
      <td class="pt-text">${monthLabel?esc(monthLabel):'<span class="hint" style="position:static;">—</span>'}</td>
      <td class="pt-text pt-num"><span class="badge bad">${pending}</span></td>
      <td class="pt-text">
        <select onchange="onFailureReasonChange('${esc(key)}', this.value)" style="min-width:200px;">
          <option value="">— select reason —</option>
          ${FAILURE_REASON_OPTIONS.map(o=>`<option value="${esc(o)}" ${saved.reason===o?'selected':''}>${esc(o)}</option>`).join('')}
        </select>
        ${saved.reason==='Others' ? `
        <input type="text" placeholder="Please specify…" value="${esc(saved.other||'')}" style="margin-top:6px; min-width:200px;" onchange="onFailureReasonOtherChange('${esc(key)}', this.value)">` : ''}
      </td>
    </tr>`;
}
/* ---- Pareto Chart: Failure/Pending Qty by Root Cause — pure inline SVG, no external chart
   library needed. Bars = total Pending Qty per Reason (descending), line = cumulative %,
   with the classic 80% reference line so the "vital few" causes are obvious at a glance. */
function failureParetoData(){
  const salesRows = salesPlanPerfRows().filter(r=>r.pending>0);
  const labourRows = labourPlanPerfRows().filter(r=>r.t.pending>0);
  const buckets = {};
  const addTo = (reasonLabel, qty)=>{ buckets[reasonLabel] = (buckets[reasonLabel]||0) + qty; };
  salesRows.forEach(r=>{
    const key = failureReasonKey('sales', r.customer, r.p.finPartNo, '');
    const saved = (DB.failureReasons && DB.failureReasons[key]) || {};
    const label = saved.reason ? (saved.reason==='Others' && saved.other ? `Others — ${saved.other}` : saved.reason) : 'Not Yet Classified';
    addTo(label, r.pending);
  });
  labourRows.forEach(r=>{
    const key = failureReasonKey('labour', r.customer, r.p.finPartNo, r.mk);
    const saved = (DB.failureReasons && DB.failureReasons[key]) || {};
    const label = saved.reason ? (saved.reason==='Others' && saved.other ? `Others — ${saved.other}` : saved.reason) : 'Not Yet Classified';
    addTo(label, r.t.pending);
  });
  const total = Object.values(buckets).reduce((a,v)=>a+v,0);
  const arr = Object.entries(buckets).map(([label,qty])=>({label,qty}))
    .sort((a,b)=> b.qty-a.qty || a.label.localeCompare(b.label));
  let running = 0;
  arr.forEach(x=>{ running += x.qty; x.cumPct = total>0 ? Math.round((running/total)*1000)/10 : 0; });
  return {items:arr, total};
}
function failureParetoChartHtml(){
  const {items, total} = failureParetoData();
  if(!items.length || total<=0) return '';
  const W = 760, H = 300, padL = 56, padR = 46, padT = 18, padB = 74;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxQty = Math.max(...items.map(x=>x.qty));
  const n = items.length;
  const bandW = plotW / n;
  const barW = Math.min(52, bandW*0.6);
  const yQty = v => padT + plotH - (maxQty>0 ? (v/maxQty)*plotH : 0);
  const yPct = p => padT + plotH - (p/100)*plotH;
  const colorFor = (label,i)=> label==='Not Yet Classified' ? 'var(--text-dim)' : ['#c0433a','#d9863a','#c9a13a','#5a8f5a','#3a7fa3','#6a5aa3','#a35a8f','#8f8f3a'][i%8];
  const bars = items.map((x,i)=>{
    const cx = padL + bandW*i + bandW/2;
    const y = yQty(x.qty);
    const h = (padT+plotH) - y;
    return `
      <rect x="${(cx-barW/2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" rx="3" fill="${colorFor(x.label,i)}" opacity="0.88"></rect>
      <text x="${cx.toFixed(1)}" y="${(y-6).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text)">${x.qty}</text>
      <text x="${cx.toFixed(1)}" y="${(padT+plotH+16).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--text-dim)" transform="rotate(-32 ${cx.toFixed(1)} ${(padT+plotH+16).toFixed(1)})">${esc(x.label.length>22?x.label.slice(0,21)+'…':x.label)}</text>`;
  }).join('');
  const linePts = items.map((x,i)=> `${(padL+bandW*i+bandW/2).toFixed(1)},${yPct(x.cumPct).toFixed(1)}`).join(' ');
  const dots = items.map((x,i)=>{
    const cx = padL+bandW*i+bandW/2, cy = yPct(x.cumPct);
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.2" fill="var(--amber)"></circle>
      <text x="${cx.toFixed(1)}" y="${(cy-9).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="700" fill="var(--amber)">${x.cumPct}%</text>`;
  }).join('');
  const y80 = yPct(80);
  // Left axis ticks (Qty)
  const qtyTicks = [0,0.25,0.5,0.75,1].map(f=>{
    const v = Math.round(maxQty*f);
    const y = yQty(v);
    return `<line x1="${padL-4}" y1="${y.toFixed(1)}" x2="${padL}" y2="${y.toFixed(1)}" stroke="var(--line)"></line>
      <text x="${padL-8}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--text-dim)">${v}</text>`;
  }).join('');
  // Right axis ticks (Cumulative %)
  const pctTicks = [0,20,40,60,80,100].map(p=>{
    const y = yPct(p);
    return `<line x1="${padL+plotW}" y1="${y.toFixed(1)}" x2="${padL+plotW+4}" y2="${y.toFixed(1)}" stroke="var(--line)"></line>
      <text x="${padL+plotW+8}" y="${(y+3).toFixed(1)}" text-anchor="start" font-size="9.5" fill="var(--text-dim)">${p}%</text>`;
  }).join('');
  return `
    <div style="overflow-x:auto;">
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px; min-width:520px; display:block;" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="${H}" fill="none"></rect>
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT+plotH}" stroke="var(--line)"></line>
      <line x1="${padL}" y1="${padT+plotH}" x2="${padL+plotW}" y2="${padT+plotH}" stroke="var(--line)"></line>
      <line x1="${padL+plotW}" y1="${padT}" x2="${padL+plotW}" y2="${padT+plotH}" stroke="var(--line)"></line>
      <line x1="${padL}" y1="${y80.toFixed(1)}" x2="${padL+plotW}" y2="${y80.toFixed(1)}" stroke="var(--red)" stroke-dasharray="4 3" opacity="0.6"></line>
      <text x="${padL+plotW+8}" y="${(y80+3).toFixed(1)}" font-size="9" fill="var(--red)">80%</text>
      ${qtyTicks}
      ${pctTicks}
      ${bars}
      <polyline points="${linePts}" fill="none" stroke="var(--amber)" stroke-width="2"></polyline>
      ${dots}
      <text x="${(padL-40).toFixed(1)}" y="${(padT+plotH/2).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--text-dim)" transform="rotate(-90 ${(padL-40).toFixed(1)} ${(padT+plotH/2).toFixed(1)})">Pending Qty</text>
      <text x="${(padL+plotW+40).toFixed(1)}" y="${(padT+plotH/2).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--text-dim)" transform="rotate(90 ${(padL+plotW+40).toFixed(1)} ${(padT+plotH/2).toFixed(1)})">Cumulative %</text>
    </svg>
    </div>`;
}
function failureRootCauseSectionHtml(){
  const salesRows = salesPlanPerfRows().filter(r=>r.pending>0);
  const labourRows = labourPlanPerfRows().filter(r=>r.t.pending>0);
  const totalCount = salesRows.length + labourRows.length;
  if(!totalCount){
    return `
    <div class="perf-subhead"><span class="psh-badge" style="background:var(--red);">⚠️ Failure Analysis</span><h3>Failure Items &amp; Root Cause Analysis</h3></div>
    <div class="empty">No pending items for these filters — nothing to analyze right now.</div>`;
  }
  const bodyRows = [
    ...salesRows.map(r=>failureRootCauseRowHtml('sales', r.customer, r.p.finPartNo, r.p.finPartName, '', '', r.pending)),
    ...labourRows.map(r=>failureRootCauseRowHtml('labour', r.customer, r.p.finPartNo, r.p.finPartName, monthKeyLabel(r.mk), r.mk, r.t.pending))
  ].join('');
  const chart = failureParetoChartHtml();
  return `
    <div class="perf-subhead"><span class="psh-badge" style="background:var(--red);">⚠️ Failure Analysis</span><h3>Failure Items &amp; Root Cause Analysis</h3><span class="hint">${totalCount} pending item(s) — Sales Plan &amp; Job Work Plan, auto-filtered to Pending &gt; 0</span></div>
    ${chart ? `
    <div class="panel" style="background:var(--panel2); margin-bottom:14px;">
      <h3 style="justify-content:flex-start; text-align:left; font-size:13px;">📊 Pareto Chart — Pending Qty by Root Cause <span class="hint">Bars = Pending Qty per reason (descending) · Line = cumulative % · dashed red = 80% mark</span></h3>
      <div id="failureParetoChartBox">${chart}</div>
    </div>` : ''}
    <div class="plan-table-wrap">
    <table class="plan-table">
      <thead><tr>
        <th>Customer</th><th>Part No</th><th>Part Name</th><th>Month</th><th class="pt-num-h">Pending</th><th>Reason for Failure / Root Cause</th>
      </tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    </div>`;
}
function renderLabourPlanPerformanceReport(main){
  const list = DB.labourPO.filter(x=>reportUnitMatch(x.unit));
  // The Customer dropdown must list every customer with EITHER Sales Plan (Customer PO) or
  // Job Work Plan history, since this report now shows both — using only DB.labourPO here would
  // silently hide customers who only have Sales Plan records (like a Customer PO with no
  // matching Job Work PO), which is exactly the bug being fixed: they'd have data in the table
  // below but no way to select them from the dropdown.
  const custPOList = DB.custPO.filter(x=>reportUnitMatch(x.unit));
  const combinedCustomerList = list.concat(custPOList);
  const monthOptions = Array.from(new Set(list.flatMap(p=>labourPOAllMonthKeys(p)))).sort().reverse();
  main.innerHTML = `
    <div class="panel" style="margin-top:8px;">
      <h3>Planning Performance Report <span class="hint">Historical Customer Schedule vs. Delivery — Sales Plan (Customer PO) &amp; Job Work Plan</span></h3>
      <div class="plan-toolbar">
        <div class="right">
          <label class="fl">Customer</label>
          <select id="perfReportCustomerSel" onchange="setPerfReportCustomer(this.value)" style="min-width:220px;">${planCustomerOptionsHtml(combinedCustomerList, perfReportCustomerId)}</select>
        </div>
        <div class="right">
          <label class="fl">Month <span class="hint" style="position:static; font-size:9.5px;">(applies to Job Work Plan only — see note below)</span></label>
          <select id="perfReportMonthSel" onchange="setPerfReportMonth(this.value)">
            <option value="">All months</option>
            ${monthOptions.map(mk=>`<option value="${esc(mk)}" ${perfReportMonth===mk?'selected':''}>${esc(monthKeyLabel(mk))}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="perfReportBox">${salesPlanPerfReportHtml()}${labourPlanPerfReportHtml()}</div>
      <div id="failureRootCauseBox" style="margin-top:8px;">${failureRootCauseSectionHtml()}</div>
    </div>
  `;
}

/* ==== PLANNING PERFORMANCE GRAPH (Customer-wise Scheduled / Committed / Delivered) ====
   Read-only visual on top of the exact same rows already computed for the Planning Performance
   Report above (salesPlanPerfRows / labourPlanPerfRows — no new calculation logic, no changes to
   any existing field, record, or the report itself). Groups those rows by Customer and draws one
   grouped bar (Scheduled / Committed / Delivered, side by side) per customer, mirroring the
   grouped-bar visual style already used by the Production Performance Report's charts. */
let planPerfGraphSource = 'both'; // 'both' | 'sales' | 'labour' — which plan(s) feed the graph
let planPerfGraphFromDate = ''; // '' = no lower bound — filters by each PO's own PO Date
let planPerfGraphToDate = '';   // '' = no upper bound
function setPlanPerfGraphSource(v){ planPerfGraphSource = v; renderPlanningCustomerPerfGraph(document.getElementById('planningSub')); }
function setPlanPerfGraphDate(which, v){
  if(which==='from') planPerfGraphFromDate = v; else planPerfGraphToDate = v;
  renderPlanningCustomerPerfGraph(document.getElementById('planningSub'));
}
function clearPlanPerfGraphDates(){
  planPerfGraphFromDate=''; planPerfGraphToDate='';
  renderPlanningCustomerPerfGraph(document.getElementById('planningSub'));
}
function planPerfGraphDateInRange(d){
  if(!planPerfGraphFromDate && !planPerfGraphToDate) return true; // no filter set — include everything
  if(!d) return false; // filter is active but this record has no PO Date to compare
  if(planPerfGraphFromDate && d<planPerfGraphFromDate) return false;
  if(planPerfGraphToDate && d>planPerfGraphToDate) return false;
  return true;
}
// Job Work Plan rows are month-scoped (one row per PO per month, same as the Planning
// Performance Report's Month filter) — so date-range filtering for them compares against the
// row's own activity month (r.mk), not the PO's one-time creation date, otherwise a PO created
// in January would have ALL its months (Jan, Feb, Mar...) hidden or shown together regardless of
// which month the From/To range actually covers.
function planPerfGraphMonthInRange(mk){
  if(!planPerfGraphFromDate && !planPerfGraphToDate) return true;
  if(!mk) return false;
  const fromMk = planPerfGraphFromDate ? planPerfGraphFromDate.slice(0,7) : null;
  const toMk = planPerfGraphToDate ? planPerfGraphToDate.slice(0,7) : null;
  if(fromMk && mk<fromMk) return false;
  if(toMk && mk>toMk) return false;
  return true;
}
function planningCustomerPerfData(){
  const map = new Map();
  const bump = (key, scheduled, committed, dispatched) => {
    const k = key || '—';
    if(!map.has(k)) map.set(k, {customer:k, scheduled:0, committed:0, dispatched:0});
    const m = map.get(k);
    m.scheduled += scheduled; m.committed += committed; m.dispatched += dispatched;
  };
  if(planPerfGraphSource!=='labour'){
    salesPlanPerfRows().filter(r=>planPerfGraphDateInRange(r.p.custPoDate)).forEach(r=>bump(custDispByName(r.customer)||r.customer, r.scheduled, r.committed, r.dispatched));
  }
  if(planPerfGraphSource!=='sales'){
    labourPlanPerfRows().filter(r=>planPerfGraphMonthInRange(r.mk)).forEach(r=>bump(custDispByName(r.customer)||r.customer, r.t.scheduled, r.t.committed, r.t.dispatched));
  }
  return Array.from(map.values())
    .filter(m=>m.scheduled>0 || m.committed>0 || m.dispatched>0)
    .sort((a,b)=>b.scheduled-a.scheduled);
}
// Grouped bar chart: 3 bars (Scheduled / Committed / Delivered) per customer, side by side.
function planPerfGroupedBarSvg(data, opts){
  opts = opts||{};
  const n = data.length;
  if(!n) return `<div class="empty">No Scheduled, Committed, or Delivered quantity found for these filters.</div>`;
  const groupW = 118, padL=48, padR=20, padT=20, padB=76;
  const W = Math.max(opts.minWidth||640, padL+padR+groupW*n);
  const H = opts.height||280;
  const plotW = W-padL-padR, plotH = H-padT-padB;
  const maxV = Math.max(...data.flatMap(d=>[d.scheduled,d.committed,d.dispatched]), 1);
  const barGap = 4, barW = (groupW-16-barGap*2)/3;
  const series = [
    {key:'scheduled', color:'var(--steel)', label:'Scheduled'},
    {key:'committed', color:'var(--amber)', label:'Committed'},
    {key:'dispatched', color:'var(--green)', label:'Delivered'}
  ];
  let bars='', labels='';
  data.forEach((d,i)=>{
    const gx = padL + i*groupW + 8;
    labels += `<text x="${(gx+(groupW-16)/2).toFixed(1)}" y="${(H-padB+16).toFixed(1)}" text-anchor="end" font-size="10.5" fill="var(--text-dim)" transform="rotate(-38 ${(gx+(groupW-16)/2).toFixed(1)} ${(H-padB+16).toFixed(1)})">${esc2(d.customer.length>16?d.customer.slice(0,15)+'…':d.customer)}</text>`;
    series.forEach((s,si)=>{
      const v = d[s.key]||0;
      const bh = plotH*(v/maxV);
      const x = gx + si*(barW+barGap);
      const y = padT+(plotH-bh);
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="2.5" fill="${s.color}"><title>${esc2(d.customer)} — ${s.label}: ${v}</title></rect>
        <text x="${(x+barW/2).toFixed(1)}" y="${(y-4).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--text)">${esc2(v)}</text>`;
    });
  });
  return `<div style="overflow-x:auto;"><svg viewBox="0 0 ${W} ${H}" style="width:${W}px; max-width:none; height:${H}px;">
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H-padB}" stroke="var(--line)"></line>
    <line x1="${padL}" y1="${H-padB}" x2="${W-padR}" y2="${H-padB}" stroke="var(--line)"></line>
    ${bars}${labels}
  </svg></div>`;
}
function renderPlanningCustomerPerfGraph(main){
  const data = planningCustomerPerfData();
  const overall = data.reduce((a,m)=>({scheduled:a.scheduled+m.scheduled, committed:a.committed+m.committed, dispatched:a.dispatched+m.dispatched}), {scheduled:0,committed:0,dispatched:0});
  const overallPct = overall.scheduled>0 ? Math.round((overall.dispatched/overall.scheduled)*1000)/10 : 0;
  main.innerHTML = `
    <div class="panel" style="margin-top:8px;">
      <h3>Planning Performance Graph <span class="hint">Customer-wise Scheduled vs. Committed vs. Delivered Quantity — same figures as the Planning Performance Report above, just charted</span></h3>
      <div class="hint" style="position:static; margin:0 0 10px;">Sales Plan is filtered by each Customer PO's PO Date; Job Work Plan is filtered by the month each Schedule/Commitment/Dispatch actually happened in (same as the Month filter above). Leave From/To blank to include everything.</div>
      <div class="plan-toolbar">
        <div class="right">
          <label class="fl">Plan Source</label>
          <select id="planPerfGraphSourceSel" onchange="setPlanPerfGraphSource(this.value)">
            <option value="both" ${planPerfGraphSource==='both'?'selected':''}>Sales Plan + Job Work Plan</option>
            <option value="sales" ${planPerfGraphSource==='sales'?'selected':''}>Sales Plan only</option>
            <option value="labour" ${planPerfGraphSource==='labour'?'selected':''}>Job Work Plan only</option>
          </select>
        </div>
        <div class="right">
          <label class="fl">From Date <span class="hint" style="position:static; font-size:9.5px;">(PO Date)</span></label>
          <input id="planPerfGraphFromInput" type="date" value="${esc(planPerfGraphFromDate)}" onchange="setPlanPerfGraphDate('from', this.value)">
        </div>
        <div class="right">
          <label class="fl">To Date</label>
          <input id="planPerfGraphToInput" type="date" value="${esc(planPerfGraphToDate)}" onchange="setPlanPerfGraphDate('to', this.value)">
        </div>
        ${(planPerfGraphFromDate||planPerfGraphToDate) ? `<div class="right" style="align-self:end;"><button class="btn ghost" onclick="clearPlanPerfGraphDates()">✕ Clear Dates</button></div>` : ''}
      </div>
      ${data.length ? `
      <div class="cards" style="margin:16px 0;">
        <div class="card perf-card"><div class="v">${overall.scheduled}</div><div class="l">Total Scheduled</div></div>
        <div class="card perf-card"><div class="v">${overall.committed}</div><div class="l">Total Committed</div></div>
        <div class="card perf-card good"><div class="v">${overall.dispatched}</div><div class="l">Total Delivered</div></div>
        <div class="card perf-card ${perfPctClass(overallPct)}"><div class="v">${overallPct}%</div><div class="l">Overall Delivery Rate</div></div>
      </div>
      <div class="perf-legend">
        <span class="lg-item"><span class="lg-swatch" style="background:var(--steel);"></span>Scheduled Quantity</span>
        <span class="lg-item"><span class="lg-swatch" style="background:var(--amber);"></span>Committed Quantity</span>
        <span class="lg-item"><span class="lg-swatch" style="background:var(--green);"></span>Delivered Quantity</span>
      </div>` : ''}
      <div style="margin-top:14px;">${planPerfGroupedBarSvg(data)}</div>
    </div>
  `;
}
