/* ---------------- MODULE LAUNCHER (app-icon grid, home-screen style) ---------------- */
const MODULE_ICONS = {
  dashboard:   {icon:'📊', bg:'linear-gradient(155deg,#6a7bff,#3c4bd6)'},
  quotation:   {icon:'📝', bg:'linear-gradient(155deg,#ffb648,#e8862a)'},
  custPO:      {icon:'📄', bg:'linear-gradient(155deg,#5aa7ff,#2d6fd9)'},
  productDev:  {icon:'🧪', bg:'linear-gradient(155deg,#3fd0c9,#1a9e97)'},
  prodPlan:    {icon:'📅', bg:'linear-gradient(155deg,#8a7bff,#5a4bd6)'},
  purchase:    {icon:'🛒', bg:'linear-gradient(155deg,#6fd17a,#2fa24a)'},
  receiving:   {icon:'📥', bg:'linear-gradient(155deg,#ffd85e,#e0a800)'},
  stores:      {icon:'📦', bg:'linear-gradient(155deg,#c48a55,#8f5c2e)'},
  production:  {icon:'⚙️', bg:'linear-gradient(155deg,#7c93b3,#455a77)'},
  finalInsp:   {icon:'✅', bg:'linear-gradient(155deg,#5fd68a,#249a55)'},
  inventory:   {icon:'🗄️', bg:'linear-gradient(155deg,#8e9bb0,#57657a)'},
  sales:       {icon:'💰', bg:'linear-gradient(155deg,#4fce8f,#1f8f5a)'},
  jobTracking: {icon:'🧭', bg:'linear-gradient(155deg,#e8ab4c,#9a7638)'},
  machines:    {icon:'🏭', bg:'linear-gradient(155deg,#5a6a8f,#2c3a5c)'},
  maintenance: {icon:'🔧', bg:'linear-gradient(155deg,#ff8a65,#d9502a)'},
  tools:       {icon:'🛠️', bg:'linear-gradient(155deg,#b07cff,#7a3fdb)'},
  calibration: {icon:'🎯', bg:'linear-gradient(155deg,#4fc3e0,#1f8fac)'},
  hr:          {icon:'👔', bg:'linear-gradient(155deg,#ff8fb3,#d94f80)'},
  finance:     {icon:'💹', bg:'linear-gradient(155deg,#3fbf8f,#1a8f63)'},
  admin:       {icon:'🔐', bg:'linear-gradient(155deg,#5c6b7f,#2e3a4a)'},
};
function renderModuleLauncher(){
  const pages = accessiblePages().filter(p=>p.id!=='dashboard');
  return `
    <div class="panel launcher-panel">
      <h3>Modules <span class="hint">${pages.length} available — tap to open</span></h3>
      <div class="app-grid">
        ${pages.map(p=>{
          let cfg = MODULE_ICONS[p.id] || {icon:'▫️', bg:'linear-gradient(155deg,#8a97ab,#57657a)'};
          let sub = '';
          // The Admin tile always keeps the name "Admin" (so it's never mistaken for missing),
          // but its icon/color and a small caption reflect the signed-in account's actual level
          // of access: Software Admin (full control) gets a gold master-key icon; the restricted
          // Admin role (User Rights + Manual Backup only) gets a steel-blue shield-lock icon.
          if(p.id==='admin' && currentUser){
            if(currentUser.role==='admin'){ cfg = {icon:'🔑', bg:'linear-gradient(155deg,#f0c05a,#c8901a)'}; sub = 'Software Admin'; }
            else if(currentUser.role==='restrictedAdmin'){ cfg = {icon:'🛡️', bg:'linear-gradient(155deg,#7c93b3,#3d5170)'}; sub = 'User Rights + Backup'; }
          }
          return `<button class="app-tile" onclick="goModule('${p.id}')" title="${esc(p.label)}${sub?' — '+esc(sub):''}">
            <span class="app-icon" style="background:${cfg.bg};">${cfg.icon}</span>
            <span class="app-label">${esc(p.label)}</span>
            ${sub ? `<span class="app-sublabel">${esc(sub)}</span>` : ''}
          </button>`;
        }).join('')}
      </div>
    </div>`;
}
function goModule(id){ if(id!==currentPage) previousPage = currentPage; currentPage = id; reportModuleOpen = null; reportCardOpen = null; custPOQuoteFilterId = null; render(); }
// Returns to the module the user jumped from via a cross-module link (e.g. Quotation → Customer
// PO, Job Work PO → Job Work Quotation). Falls back to the Dashboard if there's nothing to return to.
// Never touches any entered/saved data — it only changes which screen is displayed.
function goBackNav(){
  if(previousPage){
    currentPage = previousPage;
    previousPage = null;
  } else {
    currentPage = 'dashboard';
  }
  render();
}
// Plain "← Back" — unconditionally jumps to the previous screen the user was actually on,
// regardless of any in-progress edit/view state (mirrors how the fixed Dashboard button already
// behaves). This sits next to the contextual "← Back to X" button so users always have a simple,
// predictable way back to wherever they came from, even mid-edit.
function goPrevPage(){
  currentPage = previousPage || 'dashboard';
  previousPage = null;
  render();
}
// Adds a "← Dashboard" button to a page's .topbar (top-left) so every module can jump back
// to the Dashboard/module launcher, now that the sidebar no longer lists modules.
// Looks at the various "viewing/editing a specific record" state variables used across
// modules and returns the single most relevant "← Back" target for the screen currently on
// display. This lets one consistent button (in the topbar, top-left, on every screen) always
// take the user back to the right previous/parent screen — list, history, or module — without
// touching any entered or saved data (it only flips view-state flags back and re-renders).
function computeBackContext(){
  if(currentPage==='quotation'){
    if(quoteCompareState) return {label:'History', action:closeCompare};
    if(quoteRevisionViewRev) return {label:'History', action:closeQuoteRevisionView};
    if(quoteHistorySearchOpen) return {label:'Quotation', action:closeQuoteHistorySearch};
    if(quoteHistoryId) return {label:'Quotation', action:closeQuoteHistory};
    if(quoteViewId) return {label:'Quotation List', action:closeViewQuote};
    if(editingQuoteId) return {label:'Quotation List', action:cancelEditQuote};
    if(labourQuoteViewId) return {label:'Job Work Quotation List', action:closeViewLabourQuote};
    if(editingLabourQuoteId) return {label:'Job Work Quotation List', action:cancelEditLabourQuote};
    if(typeof editingCustomerId!=='undefined' && editingCustomerId) return {label:'Customer List', action:cancelEditCustomer};
  }
  if(currentPage==='custPO'){
    if(editingCustPOId) return {label:'Customer PO List', action:cancelEditCustPO};
    if(typeof editingLabourPOId!=='undefined' && editingLabourPOId) return {label:'Job Work PO List', action:cancelEditLabourPO};
  }
  if(currentPage==='productDev'){
    if(typeof editingCPId!=='undefined' && editingCPId) return {label:'Control Plan List', action:cancelCP};
    if(typeof cpViewId!=='undefined' && cpViewId) return {label:'Control Plan List', action:closeCPView};
    if(typeof editingBOMId!=='undefined' && editingBOMId) return {label:'Mapping List', action:cancelEditBOM};
    if(typeof editingLabourMappingId!=='undefined' && editingLabourMappingId) return {label:'Job Work Mapping List', action:cancelEditLabourMapping};
    if(typeof charInstMapFormOpen!=='undefined' && charInstMapFormOpen) return {label:'Mapping List', action:cancelCharInstMapForm};
  }
  if(currentPage==='purchase'){
    if(typeof editingPOId!=='undefined' && editingPOId) return {label:'Purchase Order List', action:cancelEditPO};
    if(typeof editingCGPOId!=='undefined' && editingCGPOId) return {label:'Capital Goods PO List', action:cancelEditCGPO};
    if(typeof editingCGItemId!=='undefined' && editingCGItemId) return {label:'Capital Goods Item List', action:cancelEditCGItem};
    if(typeof editingCGSupplierId!=='undefined' && editingCGSupplierId) return {label:'Capital Goods Supplier List', action:cancelEditCGSupplier};
    if(typeof editingCGReceivingId!=='undefined' && editingCGReceivingId) return {label:'Capital Goods Receiving List', action:cancelEditCGReceiving};
    if(typeof editingSupplierId!=='undefined' && editingSupplierId) return {label:'Supplier List', action:cancelEditSupplier};
    if(typeof editingItemId!=='undefined' && editingItemId) return {label:'Item Master List', action:cancelEditItem};
    if(typeof editingMRId!=='undefined' && editingMRId) return {label:'Material Receiving List', action:cancelEditMR};
  }
  if(currentPage==='receiving'){
    if(typeof editingGRId!=='undefined' && editingGRId) return {label:'Receiving Inspection List', action:cancelEditGR};
    if(typeof editingSubInspId!=='undefined' && editingSubInspId) return {label:'Subcontract Inspection List', action:cancelEditSubInsp};
  }
  if(currentPage==='production'){
    if(typeof editingDailyProdId!=='undefined' && editingDailyProdId) return {label:'Daily Production List', action:cancelEditDailyProd};
    if(typeof editingDailySettingId!=='undefined' && editingDailySettingId) return {label:'Daily Setting List', action:cancelEditDailySetting};
  }
  if(currentPage==='jobTracking'){
    if(typeof editingRoutingId!=='undefined' && editingRoutingId) return {label:'Routing List', action:cancelRouting};
  }
  if(currentPage==='finalInsp'){
    if(typeof fiViewId!=='undefined' && fiViewId) return {label:'Final Inspection List', action:closeViewFI};
    if(typeof editingFIId!=='undefined' && editingFIId) return {label:'Final Inspection List', action:cancelFI};
    if(typeof fiCardEditId!=='undefined' && fiCardEditId) return {label:'Final Inspection Cards', action:()=>{ fiCardEditId=null; render(); }};
    if(typeof fiCardEntryId!=='undefined' && fiCardEntryId) return {label:'Final Inspection Cards', action:()=>{ fiCardEntryId=null; render(); }};
  }
  if(currentPage==='sales'){
    if(typeof editingSaleId!=='undefined' && editingSaleId) return {label:'Invoice List', action:cancelEditSale};
  }
  if(currentPage==='machines'){
    if(typeof editingMachineId!=='undefined' && editingMachineId) return {label:'Machine List', action:cancelEditMachine};
  }
  if(currentPage==='hr'){
    if(typeof editingEmployeeId!=='undefined' && editingEmployeeId) return {label:'Employee List', action:()=>{ cancelEditEmployee(); render(); }};
  }
  if(currentPage==='maintenance'){
    if(typeof editingMaintItemId!=='undefined' && editingMaintItemId) return {label:'Maintenance Item List', action:cancelEditMaintenanceItem};
    if(typeof editingMaintSupplierId!=='undefined' && editingMaintSupplierId) return {label:'Maintenance Supplier List', action:cancelEditMaintenanceSupplier};
    if(typeof maintPOFormOpen!=='undefined' && maintPOFormOpen) return {label:'Maintenance PO List', action:toggleMaintPOForm};
  }
  if(currentPage==='tools'){
    if(typeof toolFormOpen!=='undefined' && toolFormOpen) return {label:'Tool Master List', action:cancelToolForm};
    if(typeof fixtureFormOpen!=='undefined' && fixtureFormOpen) return {label:'Fixture Master List', action:cancelFixtureForm};
    if(typeof editingToolSupplierId!=='undefined' && editingToolSupplierId) return {label:'Tool Supplier List', action:cancelEditToolSupplier};
  }
  if(currentPage==='tools' || currentPage==='calibration'){
    if(typeof calGaugeFormOpen!=='undefined' && calGaugeFormOpen) return {label:'Gauge List', action:cancelGaugeForm};
  }
  if(currentPage==='admin'){
    if(typeof editingUserId!=='undefined' && editingUserId) return {label:'Users List', action:closeUserEditor};
  }
  // Purchase never shows a "← Back to Product Development" link — the two modules aren't a
  // parent/child pair, so any stray previousPage pointing at Product Development is ignored here;
  // Purchase links forward to Quotation instead (see renderItems' "🔗 View in Quotation" button).
  if(currentPage==='purchase' && previousPage==='productDev'){ return null; }
  if(previousPage && previousPage!==currentPage){
    const backCfg = PAGES.find(p=>p.id===previousPage);
    return {label:backCfg?backCfg.label:'Previous', action:goBackNav};
  }
  return null;
}
// Adds a consistent "← Back to …" button (and, when there's nowhere more specific to go, a
// "🏠 Dashboard" button) to a page's .topbar (top-left) so every module and submodule has the
// same, easy-to-find way back — this never clears any entered or saved data, it only re-renders.
function addDashboardHomeButton(main){
  // The Dashboard quick-access button itself lives in the fixed app header (see
  // #dashHomeBtnFixed) so its screen position never varies between modules. This function
  // injects the contextual "← Back to X" button (and, when there's somewhere to go back to, the
  // plain "← Back" button) for the CURRENT screen. Both now live in the top-right .page-topline
  // row — the same row as the Active Unit badge and the Reports button — placed first in that
  // row so reading order is Back buttons → Active Unit → Reports, consistently on every screen
  // that has a page-topline (every module screen does; see render()).
  if(currentPage==='dashboard'){ return; }
  const topline = main.querySelector('.page-topline');
  if(!topline) return;
  topline.querySelectorAll('.back-nav-btn, .back-prev-btn').forEach(b=>b.remove());
  // Plain "← Back" — always goes to the previous screen, independent of the contextual button
  // below. Shown whenever there is somewhere to go back to (i.e. previousPage is set). Inserted
  // first so, read left-to-right within the right-aligned row, it appears before "← Back to X".
  if(previousPage && previousPage!==currentPage){
    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn ghost small back-prev-btn';
    prevBtn.innerHTML = `← Back`;
    prevBtn.title = 'Go back to the previous page';
    prevBtn.onclick = goPrevPage;
    topline.insertBefore(prevBtn, topline.firstChild);
  }
  const back = computeBackContext();
  if(back){
    const backBtn = document.createElement('button');
    backBtn.className = 'btn ghost small back-nav-btn';
    backBtn.innerHTML = `← Back to ${esc(back.label)}`;
    backBtn.onclick = back.action;
    topline.insertBefore(backBtn, topline.firstChild);
  }
}

/* ---------------- DASHBOARD ---------------- */
function renderDashboard(main){
  const u = currentUnit;
  // Dashboard is read-only, so Admin Office gets its Reports-style combined view across both
  // production units here too — this never touches Save/Edit/Delete, so it can't reintroduce
  // the old data-corruption bug.
  const qt = DB.quotation.filter(x=>reportUnitMatch(x.unit));
  const po = DB.purchase.filter(x=>reportUnitMatch(x.unit));
  const gr = DB.receiving.filter(x=>reportUnitMatch(x.unit));
  const st = DB.stores.filter(x=>reportUnitMatch(x.unit));
  const pr = DB.production.filter(x=>reportUnitMatch(x.unit));
  const fi = DB.finalInsp.filter(x=>reportUnitMatch(x.unit));
  const iv = DB.inventory.filter(x=>reportUnitMatch(x.unit));
  const sl = DB.sales.filter(x=>reportUnitMatch(x.unit));
  const openPO = po.filter(x=>x.status==='Open').length;
  const pendingGR = gr.filter(x=>x.result==='Pending').length;
  const inProd = pr.filter(x=>x.status!=='Completed').length;
  const failedFI = fi.filter(x=>x.result==='Fail').length;
  const ivQty = iv.reduce((a,x)=>a+(parseFloat(x.qty)||0),0);

  main.innerHTML = `
    <div class="topbar">
      <div><h2>Dashboard</h2></div>
    </div>
    ${renderModuleLauncher()}
    <div class="cards">
      <div class="card"><div class="v">${qt.length}</div><div class="l">Quotations</div></div>
      <div class="card"><div class="v">${qt.filter(x=>x.status==='Sent').length}</div><div class="l">Awaiting Acceptance</div></div>
      <div class="card"><div class="v">${po.length}</div><div class="l">Purchase Orders</div></div>
      <div class="card"><div class="v">${openPO}</div><div class="l">Open POs</div></div>
      <div class="card"><div class="v">${gr.length}</div><div class="l">Receiving Entries</div></div>
      <div class="card"><div class="v">${pendingGR}</div><div class="l">Pending Inspection</div></div>
      <div class="card"><div class="v">${st.length}</div><div class="l">Store Line Items</div></div>
      <div class="card"><div class="v">${inProd}</div><div class="l">Jobs In Production</div></div>
      <div class="card"><div class="v">${fi.length}</div><div class="l">Final Inspections</div></div>
      <div class="card"><div class="v">${failedFI}</div><div class="l">Rejections</div></div>
      <div class="card"><div class="v">${iv.length}</div><div class="l">Finished Goods Line Items</div></div>
      <div class="card"><div class="v">${ivQty}</div><div class="l">Finished Goods Qty in Stock</div></div>
      <div class="card"><div class="v">${sl.length}</div><div class="l">Sales Invoices</div></div>
    </div>
    <div class="split">
      <div class="panel">
        <h3>Recent Quotations</h3>
        ${qt.slice(-5).reverse().map(q=>`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #262c34;font-size:12px;">
          <span>${esc(q.quoteNo)} — ${esc(custDispByName(q.customer))}</span><span class="pill ${q.status==='Accepted'?'done':q.status==='Rejected'?'fail':q.status==='Sent'?'progress':'open'}">${q.status}</span></div>`).join('') || '<div class="empty">No quotations yet.</div>'}
      </div>
      <div class="panel">
        <h3>Recent Purchase Orders</h3>
        ${po.slice(-5).reverse().map(p=>`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #262c34;font-size:12px;">
          <span>${esc(p.poNo)} — ${esc(p.supplier)}</span><span class="pill ${p.status==='Open'?'open':'done'}">${p.status}</span></div>`).join('') || '<div class="empty">No purchase orders yet.</div>'}
      </div>
      <div class="panel">
        <h3>Recent Sales Invoices</h3>
        ${sl.slice(-5).reverse().map(s=>`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #262c34;font-size:12px;">
          <span>${esc(s.invNo)} — ${esc(s.customer)}</span><span class="muted">${fmtDate(s.invDate)}</span></div>`).join('') || '<div class="empty">No invoices yet.</div>'}
      </div>
    </div>
  `;
}
