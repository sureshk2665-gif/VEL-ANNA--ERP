/* ---------------- USER RIGHTS ---------------- */
const RIGHT_ACTIONS = ['view','add','edit','del','print','export','approve'];
const RIGHT_ACTION_LABELS = {view:'View', add:'Add', edit:'Edit', del:'Delete', print:'Print', export:'Export', approve:'Approve'};
function defaultRights(preset){
  // preset: 'full' (Administrator — every action on every module),
  //         'view'  (legacy — view + print only, kept for old data),
  //         'none'  (no access at all — the starting point for a new employee account)
  const r = {};
  PAGES.forEach(p=>{
    const o = {};
    RIGHT_ACTIONS.forEach(a=>{ o[a] = preset==='full'; });
    if(preset==='view'){ o.view = true; o.print = true; }
    r[p.id] = o;
  });
  return r;
}
// Older saved logins stored a single level ('none'/'view'/'edit') per module. This upgrades
// any such record to the new per-action object the first time it's loaded, so existing users
// keep working exactly as before instead of losing access.
function normalizeRights(rights){
  const out = {};
  PAGES.forEach(p=>{
    const v = rights ? rights[p.id] : undefined;
    if(v && typeof v==='object'){
      const o = {}; RIGHT_ACTIONS.forEach(a=>{ o[a] = !!v[a]; }); out[p.id] = o;
    } else if(v==='edit'){ out[p.id] = defaultRights('full')[p.id]; }
    else if(v==='view'){ out[p.id] = defaultRights('view')[p.id]; }
    else { out[p.id] = defaultRights('none')[p.id]; }
  });
  return out;
}
function hasRight(pageId, action){
  if(!currentUser) return false;
  if(currentUser.role==='admin') return true; // Software Admin: full access to every module, both units
  if(currentUser.role==='restrictedAdmin') return pageId==='admin' && action==='view'; // Admin: User Rights + Manual Backup only, inside the Admin page
  // The Dashboard is a navigation hub, not a data module — it only ever shows tiles for modules the
  // user already has real view rights on (self-filtering), so every logged-in user can always reach
  // it. Without this, a user granted rights to only one module (and not separately, easy-to-miss,
  // "Dashboard" row) would have no way back to the launcher at all after leaving that one module —
  // the fixed Dashboard button would itself show "Access Restricted", a dead end with no escape.
  if(pageId==='dashboard' && action==='view') return true;
  const r = currentUser.rights && currentUser.rights[pageId];
  return !!(r && r[action]);
}
// Legacy single-value summary (used only for the old view/edit-styled checks below).
function getRight(pageId){
  if(!currentUser) return 'none';
  if(currentUser.role==='admin') return 'edit';
  if(currentUser.role==='restrictedAdmin') return pageId==='admin' ? 'edit' : 'none';
  if(pageId==='dashboard') return 'view'; // see hasRight() — Dashboard is always reachable
  const r = currentUser.rights && currentUser.rights[pageId];
  if(!r || !r.view) return 'none';
  return (r.add||r.edit) ? 'edit' : 'view';
}
function canView(pageId){ return hasRight(pageId,'view'); }
function canEdit(pageId){ return hasRight(pageId,'add') || hasRight(pageId,'edit'); }
// Disables/greys out individual controls inside the rendered module based on the logged-in
// user's per-action rights for that module. Administrators (both Software Admin and the
// restricted Admin role, whose Admin-page UI is fully custom-gated already) are left untouched.
// Buttons are matched by their onclick handler's function name, which follows consistent
// naming across the whole app (add*/save* → add, edit*/cancelEdit* → edit, deleteRow/.danger
// → del, print* → print, *export*/Export* → export, acceptQuotation/setQuoteStatus → approve).
function applyGranularRights(main, pageId){
  if(!currentUser || currentUser.role==='admin' || currentUser.role==='restrictedAdmin') return;
  const r = (currentUser.rights && currentUser.rights[pageId]) || {};
  const canMutate = !!(r.add || r.edit);
  if(!canMutate){
    main.querySelectorAll('input, select, textarea').forEach(el=>{
      if(el.closest('.searchbar') || el.closest('.reportFilterPanel')) return; // keep search/filter usable
      el.disabled = true;
    });
  }
  main.querySelectorAll('button.btn').forEach(btn=>{
    if(btn.classList.contains('nav-safe') || btn.classList.contains('reports-toggle-btn')) return;
    const oc = btn.getAttribute('onclick') || '';
    let need = null;
    if(btn.classList.contains('danger') || /\bdeleteRow\s*\(/.test(oc)) need = 'del';
    else if(/\bprint[A-Za-z]*\s*\(/.test(oc)) need = 'print';
    else if(/export/i.test(oc)) need = 'export';
    else if(/^(acceptQuotation|setQuoteStatus|approve)/i.test(oc)) need = 'approve';
    else if(/^add[A-Z]/.test(oc)) need = 'add';
    else if(/^(edit|cancelEdit)[A-Z]/.test(oc)) need = 'edit';
    else if(/^save[A-Z]/.test(oc)) need = canMutate ? null : 'add';
    if(need && !r[need]){
      btn.disabled = true;
      btn.title = `You do not have "${RIGHT_ACTION_LABELS[need]||need}" permission for this module.`;
    }
  });
}
function accessiblePages(){
  return PAGES.filter(p=> canView(p.id));
}

/* ---------------- SUB-MODULE (per-tab) RIGHTS ---------------- */
// Static list of the first-level tab-groups shown inside each module, used to build the
// Sub-Module checkboxes on the User Rights screen and to hide/guard tabs the user can't see.
// Tools & Calibration are dynamic (built from GAUGE_KINDS + their own fixed tabs) so they're
// computed inside the function rather than hard-coded here.
const SUBMODULE_REGISTRY = {
  quotation:  [{id:'quotes',label:'Sales Quotation'},{id:'labour',label:'Job Work Quotation'},{id:'priceRevision',label:'Price Revision'},{id:'customers',label:'Customers'}],
  custPO:     [{id:'salesPO',label:'Sales PO'},{id:'labourPO',label:'Job Work PO'}],
  productDev: [{id:'bombar',label:'Bar Mapping'},{id:'bomforging',label:'Forging Mapping'},{id:'labourmap',label:'Job Work Mapping'},{id:'controlplan',label:'Control Plan'},{id:'instMapping',label:'Characteristic ⇄ Instrument Mapping'},{id:'routing',label:'Part Routing'}],
  prodPlan:   [{id:'salesPlan',label:'Sales Plan'},{id:'labourPlan',label:'Job Work Plan'},{id:'perfReport',label:'Planning Performance Report'},{id:'custPerfGraph',label:'Planning Performance Graph'}],
  purchase:   [{id:'materials',label:'Materials'},{id:'capitalGoods',label:'Capital Goods'}],
  stores:     [{id:'bar',label:'Bar Stock'},{id:'forging',label:'Forging Stock'},{id:'labour',label:'Job Work Stock'},{id:'wip',label:'Material Issue — Next Stage'},{id:'ledger',label:'Material Ledger Report'}],
  production: [{id:'jobs',label:'Production Jobs'},{id:'daily',label:'Daily Worksheet'},{id:'norms',label:'Production Norms'},{id:'machineCapacity',label:'Machine Capacity Report'},{id:'perfReport',label:'Production Performance Report'}],
  finalInsp:  [{id:'cards',label:'Final Inspection Cards'},{id:'reports',label:'Final Inspection Reports'}],
  inventory:  [{id:'stock',label:'Finished Goods Stock'},{id:'ledger',label:'Finished Goods Stock Ledger'}],
  sales:      [{id:'invoices',label:'Sales Invoice'},{id:'labourInvoice',label:'Job Work Invoice'}],
  jobTracking:[{id:'subcontract',label:'Subcontract Jobs'},{id:'tracking',label:'Part Tracking / Job Card History'},{id:'p360',label:'Part 360° Flow View'}],
  receiving:  [{id:'material',label:'Raw Material Inspection'},{id:'subcontract',label:'Subcontract Inspection'}],
  hr:         [{id:'current',label:'Current Employees'},{id:'resigned',label:'Resigned Employees'}],
  maintenance:[{id:'log',label:'Maintenance Log'},{id:'po',label:'Maintenance PO'},{id:'items',label:'Maintenance Items'},{id:'suppliers',label:'Maintenance Suppliers'}],
};
// Returns the sub-module list for a page — static from the registry above, or built
// dynamically for Tools / Calibration (whose tabs come from GAUGE_KINDS).
function moduleSubmodules(pageId){
  if(pageId==='tools'){
    const list = Object.keys(GAUGE_KINDS||{}).map(k=>({id:'g_'+k, label:(GAUGE_KINDS[k].icon||'')+' '+GAUGE_KINDS[k].label}));
    return list.concat([{id:'toolSuppliers',label:'Tools Suppliers'},{id:'po',label:'Tools PO'},{id:'register',label:'Tool Register'},{id:'issue',label:'Tool Issue'},{id:'reports',label:'Reports'}]);
  }
  if(pageId==='calibration'){
    return Object.keys(GAUGE_KINDS||{}).map(k=>({id:k, label:(GAUGE_KINDS[k].icon||'')+' '+GAUGE_KINDS[k].label}));
  }
  return SUBMODULE_REGISTRY[pageId] || [];
}
// Whether the current user may see/use a given sub-module tab within a module. Admins always
// pass. If the module itself isn't in scope for granular sub-tabs, or the user's rights record
// has no explicit subs setting for it, access defaults to allowed (so upgrading existing users
// never silently locks them out of tabs an admin hasn't deliberately restricted yet).
function subOK(pageId, subId){
  if(!currentUser) return false;
  if(currentUser.role==='admin') return true;
  if(!canView(pageId)) return false;
  const r = currentUser.rights && currentUser.rights[pageId];
  const subs = r && r.subs;
  if(!subs || !(subId in subs)) return true;
  return !!subs[subId];
}
// Picks the first sub-module tab id the current user is allowed to see for a module — used to
// steer away from a tab that just became restricted, onto one that's still accessible.
function firstAllowedSub(pageId){
  const list = moduleSubmodules(pageId);
  const found = list.find(s=>subOK(pageId, s.id));
  return found ? found.id : (list[0] ? list[0].id : null);
}

// Friendly display name for a role — 'admin' (Software Admin) has full control everywhere;
// 'restrictedAdmin' (Admin) is limited to User Rights + Manual Backup; 'user' is a Standard User
// governed entirely by their per-module/sub-module rights. Each role also gets a small icon and
// its own accent color so the badge next to the signed-in name reads clearly at a glance.
function roleLabel(role){
  if(role==='admin') return 'Software Admin';
  if(role==='restrictedAdmin') return 'Admin';
  return 'User';
}
function roleBadge(role){
  if(role==='admin') return {icon:'👑', label:'Software Admin', color:'var(--amber)'};
  if(role==='restrictedAdmin') return {icon:'🛡️', label:'Admin', color:'var(--steel)'};
  return {icon:'👤', label:'User', color:'var(--text-dim)'};
}
function renderNav(){
  const nav = document.getElementById('nav');
  const pages = accessiblePages();
  if(!pages.find(p=>p.id===currentPage) && pages.length){ currentPage = pages[0].id; }
  nav.innerHTML = pages.map(p=>`<button data-page="${p.id}" class="${currentPage===p.id?'active':''}"><span class="n">${p.n}</span>${p.label}</button>`).join('');
  nav.querySelectorAll('button').forEach(b=>{
    b.onclick = ()=>{ if(b.dataset.page!==currentPage) previousPage = currentPage; currentPage = b.dataset.page; reportModuleOpen = null; custPOQuoteFilterId = null; render(); };
  });
  const tag = document.getElementById('userTag');
  if(tag && currentUser){
    tag.innerHTML = `Signed in as<br><b>${esc(currentUser.name||currentUser.username)}</b><span class="role" style="color:${roleBadge(currentUser.role).color}; border:1px solid color-mix(in srgb, ${roleBadge(currentUser.role).color} 45%, transparent);">${roleBadge(currentUser.role).icon} ${esc(roleBadge(currentUser.role).label)}</span>`;
  }
  // Fixed-position Dashboard quick-access button lives in the persistent app header (same
  // pixel position on every screen) rather than inside each module's own topbar — this is
  // what keeps it from drifting around depending on whether a module also shows a "Back to X"
  // button, a Reports button, or a longer/shorter title. Just disable it while already on
  // the Dashboard itself.
  const dashBtn = document.getElementById('dashHomeBtnFixed');
  if(dashBtn) dashBtn.disabled = (currentPage==='dashboard');
  // Breadcrumb next to the fixed Dashboard button shows the current module's name (same label
  // used on its Dashboard tile), so the per-module heading no longer needs to repeat it.
  const crumb = document.getElementById('dashBreadcrumb');
  if(crumb){
    const p = PAGES.find(x=>x.id===currentPage);
    crumb.textContent = (p && p.id!=='dashboard') ? p.label : '';
  }
}

function flowline(active){
  // Removed ERP-wide per request — was showing a "Quotation → Customer PO → ... → Sales"
  // breadcrumb at the top of every module. Kept as a no-op (rather than deleting every call
  // site) so nothing else needs to change if it's ever wanted back.
  return '';
}
// Customer PO is scoped to the Quotation module only (Sales Quotation → Sales PO,
// Job Work Quotation → Job Work PO) — its breadcrumb shows only that link, not the full
// plant pipeline, and it carries no navigation into any other module.
function custPOFlowline(){
  return '';
}

function render(){
  // Price Revision is a sub-module of Quotation, not a standalone page — normalize any stale
  // currentPage='priceRevision' (e.g. from browser state saved before this change) into the
  // Quotation module's Price Revision sub-tab before permission checks run.
  if(currentPage==='priceRevision'){ currentPage='quotation'; quotationSubTab='priceRevision'; }
  renderNav();
  const main = document.getElementById('main');
  if(window.ViplReact) window.ViplReact.unmountAll(); // release any React screen before #main is rebuilt
  main.classList.remove('ro-mode');
  main.classList.remove('mod-quotation','mod-purchase');
  if(currentPage==='quotation' || currentPage==='custPO' || currentPage==='prodPlan') main.classList.add('mod-quotation');
  if(currentPage==='purchase' || currentPage==='maintenance') main.classList.add('mod-purchase');
  if(!canView(currentPage)){
    main.innerHTML = `<div class="page-topline"><div class="activeUnitBadge">${currentUnit==='Admin'?'🏢':'📍'} Active Unit: <b>${esc(unitLabel())}</b></div></div><div class="topbar"><div><h2>Access Restricted</h2><div class="desc">You do not have permission to view this module. Contact your administrator.</div></div></div>`;
    addDashboardHomeButton(main);
    return;
  }
  if(getRight(currentPage)==='view'){ main.classList.add('ro-mode'); }
  const roNotice = ''; // view-only banner removed per request — read-only enforcement (ro-mode) still applies
  // Maps a "child" report (one that belongs to a submodule/subtab rather than the page itself)
  // to the page it lives under, so its Reports screen is reachable from that page's render pass.
  const REPORT_PARENT_PAGE = { controlPlans: 'productDev', storesRawLedger: 'stores', storesForgingLedger: 'stores',
    capitalGoodsPO: 'purchase', itemPriceList: 'purchase', labourQuotation: 'quotation', maintenancePO: 'maintenance',
    toolsPO: 'tools', toolRegister: 'tools', labourMaterialReceipt: 'stores', dailyProduction: 'production',
    dailySetting: 'production', jobCardHistory: 'jobTracking', jobCardWIP: 'jobTracking', customerMaterialLedger: 'jobTracking' };
  const openReportBelongsHere = reportModuleOpen && REPORT_CONFIGS[reportModuleOpen] &&
    (reportModuleOpen===currentPage || REPORT_PARENT_PAGE[reportModuleOpen]===currentPage);
  if(openReportBelongsHere){
    renderModuleReports(main, reportModuleOpen);
    if(roNotice) main.insertAdjacentHTML('afterbegin', roNotice);
    main.insertAdjacentHTML('afterbegin', `<div class="page-topline"><div class="activeUnitBadge">${currentUnit==='Admin'?'🏢':'📍'} Active Unit: <b>${esc(unitLabel())}</b></div></div>`);
    applyGranularRights(main, currentPage);
    addDashboardHomeButton(main);
    return;
  }
  if(currentPage==='dashboard') { renderDashboard(main); }
  else if(currentPage==='quotation') { renderQuotation(main); }
  else if(currentPage==='custPO') { renderCustPO(main); }
  else if(currentPage==='productDev') { renderProductDevelopment(main); }
  else if(currentPage==='prodPlan') { renderProductionPlanning(main); }
  else if(currentPage==='purchase') { renderPurchase(main); }
  else if(currentPage==='receiving') { renderReceiving(main); }
  else if(currentPage==='stores') { renderStores(main); }
  else if(currentPage==='production') { renderProduction(main); }
  else if(currentPage==='finalInsp') { renderFinalInsp(main); }
  else if(currentPage==='inventory') { renderInventory(main); }
  else if(currentPage==='sales') { renderSales(main); }
  else if(currentPage==='jobTracking') { renderJobTracking(main); }
  else if(currentPage==='machines') { renderMachines(main); }
  else if(currentPage==='maintenance') { renderMaintenance(main); }
  else if(currentPage==='tools') { renderTools(main); }
  else if(currentPage==='calibration') { renderCalibration(main); }
  else if(currentPage==='hr') { renderHR(main); }
  else if(currentPage==='finance') { renderFinance(main); }
  else if(currentPage==='admin') { renderAdmin(main); }
  if(roNotice) main.insertAdjacentHTML('afterbegin', roNotice);
  const unitBadge = `<div class="page-topline"><div class="activeUnitBadge">${currentUnit==='Admin'?'🏢':'📍'} Active Unit: <b>${esc(unitLabel())}</b></div></div>`;
  main.insertAdjacentHTML('afterbegin', unitBadge);
  applyGranularRights(main, currentPage);
  if(REPORT_CONFIGS[currentPage]){
    // Reports sits in the top-right page-topline, next to Active Unit, on every module —
    // not inside the module's own topbar — so its position is identical and predictable
    // across the whole app.
    const topline = main.querySelector('.page-topline');
    if(topline && !topline.querySelector('.reports-toggle-btn')){
      const btn = document.createElement('button');
      btn.className = 'btn ghost reports-toggle-btn';
      btn.innerHTML = '📊 Reports';
      btn.onclick = ()=>openModuleReports(currentPage);
      topline.appendChild(btn);
    }
  }
  addDashboardHomeButton(main);
}
