// ---- Admin Office / Unit-1 / Unit-2 architecture ----
// Admin Office ('Admin') is now an INDEPENDENT unit in its own right — it is where all
// administration happens (Master Creation, Settings, Users & Rights, Approvals, Common Data),
// but it is NOT a production location and it is NOT a combined "view everything" mode any more.
// Unit-1 and Unit-2 are production locations only: all production transactions (Quotation onward
// through Sales, plus shop-floor masters like Machine/Tool/Gauge/Calibration) are created and
// saved strictly against whichever of the two units is active — never against Admin Office.
// True common master data (Item Master, Supplier/Customer Master, Product Development BOM
// mapping, Control Plans, Inspection Parameters) carries no unit field at all, so it is created
// once from Admin Office and is automatically available to both production units wherever it's
// referenced — nothing further to filter there.
function unitMatch(recordUnit){ return recordUnit===currentUnit; }
// Reports is the one place Admin Office is explicitly allowed to see across both production
// units (read-only) — matches "Reports... managed from the Admin Office" without reintroducing
// the old combined-save bug anywhere records are actually created/edited/deleted.
function reportUnitMatch(recordUnit){ return currentUnit==='Admin' ? true : recordUnit===currentUnit; }
function unitLabel(u){
  u = (u===undefined) ? currentUnit : u;
  return unitDisplayLabel(u);
}
// Production transactions (Quotation, Purchase, Stores, Production, Sales, Machine/Tool/Gauge
// registers, etc.) can only be created while a production location is active.
function requireWorkingUnit(){
  // Admin Office is now allowed to create/save production transactions directly (in addition to
  // Unit-1 / Unit-2) — records saved this way are stored under unit:'Admin' and are visible
  // whenever Admin Office is the active unit, consistent with every other module's unit scoping.
  return true;
}
// Master data / Settings / Users & Rights / Common Data can only be created or edited from
// Admin Office — production units can view and use this data, but never modify it.
function reportScopeLabel(){ return currentUnit==='Admin' ? 'All Production Units (Admin Office view)' : unitLabel(); }
function requireAdminOffice(){
  if(currentUnit!=='Admin'){ toast('Switch to Admin Office first — Master Creation, Settings and Common Data are managed centrally from there'); return false; }
  return true;
}
let currentUser = null;
// 4-digit passcode/OTP login-verification state (see attemptLogin() / attemptOtpVerify()) —
// holds the user record that already passed the Username+Password check and the OTP it must
// still enter before currentUser is actually set / the LoginLog record is created. Cleared the
// moment verification succeeds, fails is retried, or the person clicks "← Back".
let pendingOtpUser = null;
let pendingOtpCode = '';
// The LoginLog record ("session") id for the currently signed-in user, so attemptLogout() knows
// exactly which row to close out with a Logout Time + Session Duration. Null while signed out.
let currentLoginLogId = null;
let editingUserId = null;
let currentPage = 'dashboard';
let previousPage = null; // set by cross-module "jump" links (e.g. Quotation → Customer PO) so a
                          // consistent "← Back" control can return the user to where they came from
let purchaseSubTab = 'orders'; // 'orders' | 'suppliers' | 'subcontract' | 'items' | 'materialReceiving'
let editingMRId = null;
let salesSubTab = 'invoices';
let saleInvoiceUnit = ''; // 'Unit-1' | 'Unit-2' — chosen on the New Invoice form; controls which
                          // unit's Sales PO / Job Work PO (and therefore which Part Numbers) are
                          // selectable for this invoice.
let poUnitSel = '';      // 'Unit-1' | 'Unit-2' — chosen on the New/Edit Purchase Order form,
                          // same pattern as saleInvoiceUnit above: mandatory first step, locked
                          // to the Active Unit whenever a production unit is active, otherwise
                          // must be explicitly picked (Admin Office can raise POs for either unit).
let toolPOUnitSel = '';  // 'Unit-1' | 'Unit-2' — same pattern, for the Tools Purchase Order form
                          // in Tool Management.
let salesDashMonth = today().slice(0,7); // YYYY-MM — Monthly Sales Summary Dashboard month filter, defaults to current month
let salesDashCustomerId = '';           // '' = All Customers (default, per spec)
function emptySaleItemRow(){ return {partNo:'', partName:'', hsn:'998898', qty:'', rate:'', dcNo:'', note:'', labourPOId:'', custPOId:'', uom:''}; }
let saleItemRows = [emptySaleItemRow()];
let editingSaleId = null; // id of the DB.sales record (single invoice line) currently being edited
let quotationSubTab = 'quotes'; // 'quotes' | 'customers'
let editingCustomerId = null;
let custContactsDraft = []; // working list of {name,email,mobile} rows for the New/Edit Customer form
let itemsTypeTab = 'FORGING'; // 'FORGING' | 'BAR'
let storesSubTab = 'bar'; // 'bar' | 'forging' | 'labour' | 'wip' | 'ledger'
let labourStockSubTab = 'inward'; // 'inward' | 'stock' | 'txn' — sub-tabs within Job Work Stock
let mlLedgerTab = 'raw';  // Stores → Material Ledger Report: 'raw' (Bar) | 'forging'
let mlFilterPartNo = '', mlFilterFrom = '', mlFilterTo = '';
let jobTrackingSubTab = 'subcontract'; // 'subcontract' | 'tracking' — Subcontractor Master lives under Purchase; this tab only tracks issued/received job status. Part Routing moved to Product Development
let routingDraft = null; let editingRoutingId = null; let routingCustomerId = ''; let routingSearchQuery = '';
let jtSearchPart = '';
let p360SearchPart = '';
let p360SelectedCard = '';
let scForm = null; // new-Subcontractor form draft
let productDevSubTab = 'bombar'; // 'bombar' | 'bomforging' | 'labourmap' | 'controlplan' | 'instMapping'
let editingLabourMappingId = null; // id of Job Work Mapping record being edited
let editingBOMId = null;
let editingCPId = null;
let cpDraft = null;      // header + ops working object while adding/editing a Control Plan
let cpViewId = null;     // id of a saved Control Plan currently open in read-only view
let editingPOId = null;
let poItemsDraft = []; // [{id,desc,qty,rate}] working line-items for PO form
/* ---- Capital Goods sub-module (Purchase → Capital Goods) — mirrors the Materials Purchase
   flow (PO → Receiving → Item Master → Supplier) on its own state, parallel to purchaseSubTab. ---- */
let purchaseMainTab = 'materials';  // 'materials' | 'capitalGoods' — the two Purchase sub-modules
let cgSubTab = 'orders';            // 'orders' | 'receiving' | 'items' | 'suppliers' (within Capital Goods)
let editingCGPOId = null;
let cgPOItemsDraft = [];            // [{itemId,itemCode,itemName,uom,qty,rate}] working line-items for Capital Goods PO form
let cgPOUnitSel = '';
let editingCGItemId = null;
let editingCGSupplierId = null;
let editingCGReceivingId = null;
let cgrSelectedPOId = null;         // PO chosen in the (not-yet-saved) new Capital Goods Receiving entry form
let editingSupplierId = null;
let editingToolSupplierId = null; // id of Tool Supplier (Tools Management) row being edited
let editingItemId = null;
let viewingItemPriceHistoryId = null;
let editingMachineId = null;
let fiHeaderDraft = null;
let fiCharsDraft = null;
let editingFIId = null;
let fiViewId = null;
let fiCardsSubTab = 'cards'; // 'cards' | 'reports' — Final Inspection module's sub-screens
let fiCardEntryId = null;    // id of the Final Inspection Card currently showing its OK/Rework Qty entry panel
let fiCardEditId = null;     // id of the Final Inspection Card currently showing its Edit form
let fiCardReportForId = null; // set while a Final Inspection Report is being generated from a Card's OK Qty entry — links the saved report back to that card
let editingQuoteId = null;
let editingCustPOId = null;    // id of Customer PO record being edited
let custPOQuoteFilterId = null; // when set (via "View Customer POs" from a Quotation), scopes the Customer PO list to that quotation only
let custPOPartFilter = ''; // Part Number search text typed into the Customer PO list's search box (matches Part No or Part Name, case-insensitive)
let labourPOPartFilter = ''; // Part No / Part Name search text typed into the Job Work PO list's Part No search box (case-insensitive)
let labourPOCustFilter = ''; // Customer Name search text typed into the Job Work PO list's Customer Name search box (case-insensitive)
let custPOPrefill = null; // {customerId, finPartNo} — set when "+ Add PO for this Part" is clicked on an existing Part group, so the New Customer PO form opens with Customer + Part already selected (still creates a brand-new PO record, just saves re-picking them)
let planningSubTab = 'salesPlan'; // 'salesPlan' | 'labourPlan' — the Planning module's two submodules
let hrSubTab = 'current'; // 'current' | 'resigned' — the Human Resources module's sub-modules
let editingEmployeeId = null; // id of Employee (Human Resources) record being edited
// ---- Fast-entry Planning grid state (single-screen redesign: every Finished Part Number is
// already listed, no per-part selection step) ----
let planQuickDate = today();        // shared default Commitment Date applied to new entries in both grids
let salesPlanCustomerId = '';       // Customer selected at the top of the Sales Plan screen — scopes the grid to their parts only
let salesPlanPartFilter = '';       // search text for the Sales Plan grid (within the selected customer)
let salesPlanMonth = today().slice(0,7);  // YYYY-MM — Sales Plan screen's Month filter (scopes the "Committed (This Month)" column & Entries panel)
let labourPlanCustomerId = '';      // Customer selected at the top of the Job Work Plan screen — scopes the grid to their parts only
let labourPlanMonth = today().slice(0,7); // YYYY-MM — Job Work Plan screen's Month filter (Job Work Plan is inherently month-scoped: Schedule Qty resets every month)
let salesPlanHistoryOpen = {};      // {custPOId: true} — which Sales Plan rows have their entry history expanded
let labourPlanHistoryOpen = {};     // {labourPOId: true} — which Job Work Plan rows have their entry history expanded
let labourPlanJustAdded = {sched:null, commit:null}; // ids of the most-recently-added entries, used to flash-highlight them so a logged value never feels like it "disappeared"
let highlightPlanRowId = null;      // id of a row to scroll/focus into view when jumping in from elsewhere
let custPOSubTab = 'salesPO';  // 'salesPO' | 'labourPO' — the Customer PO module's two submodules
let editingLabourPOId = null;  // id of Job Work PO (Open PO) record being edited
let labourPlanPartFilter = ''; // search text typed into the Job Work Plan list's Part No search cell
let perfReportCustomerId = '';  // Customer filter for the Planning Performance Report ('' = all)
let perfReportMonth = '';       // Month filter (YYYY-MM) for the Planning Performance Report ('' = all months)
let prodModuleSubTab = 'jobs';  // 'jobs' | 'daily' | 'norms' | 'machineCapacity' | 'perfReport' — Production module's sub-screens
let dailyWorksheetSubTab = 'production';  // 'production' | 'setting' — Daily Worksheet's two sub-modules
// ---- Production Performance Report (separate submodule under Production Department) ----
// From/To date filter driving every calculation, table and chart in the report.
let prodPerfFromDate = '';
let prodPerfToDate = '';
let prodNormsSelectedPart = '';  // Production Norms — Part Number chosen in the top selector; '' = show all parts
let machineCapMonth = today().slice(0,7); // YYYY-MM for the Machine Capacity Report — defaults to current month
let machineCapWorkingDaysOverride = null; // null = auto-calculated (Total Days - Sundays); else a user-entered number
let labourPlanApprovedBy = '';  // Approved By name shown on the printed Customer Schedule & Delivery Commitment doc
// (labourPOPendingParts / labourPOAddOpenKeys removed — Job Work PO redesign: one PO = one Part,
// entered and saved directly from the single compact form below; no multi-part staging or
// inline "+ Add PO" card layout anymore.)
let editingGRId = null;
let manualGRMode = false;
let receivingSubTab = 'material'; // 'material' | 'subcontract' — Receiving Inspection tabs
let editingSubInspId = null;
let quoteItemsDraft = [];
// Tracks the customer currently selected in the Quotation draft form (persists across
// re-renders triggered by adding/removing line items, unlike reading the DOM live —
// the DOM is torn down and rebuilt on every render() call). Drives the Finished Part No
// picker's customer-scoped filtering.
let quoteDraftCustomerId = '';
let quoteDraftCustomerName = '';
let qtFilterPartNo = '';
let quoteViewId = null;
let quoteRevisionMode = false;      // true when the open editor was launched via "Revise Quotation" — Save creates a NEW revision instead of editing in place
let quoteHistoryId = null;          // id of quotation whose Revision History timeline panel is open
let quoteRevisionViewRev = null;    // {quoteId, revNo} — a single past revision open in read-only view
let quoteCompareState = null;       // {quoteId, revA, revB} — Compare Revisions panel open
let quoteHistorySearchOpen = false; // global "All Revisions" cross-quotation search/filter view
let quoteHistoryFilters = {customer:'', quoteNo:'', revNo:'', dateFrom:'', dateTo:'', user:''};
// ===== Price Revision (Quotation sub-module) state =====
// Customer-first workflow: pick a Customer → see every Part No already quoted to them → tick
// the parts to revise → enter a % or Fixed Amount increase → Save.
let prCustomerId = '';    // Price Revision tab: selected Customer id (blank until chosen)
let prCustomerName = '';  // display name, also used to match quotations saved with only a free-text customer name
let prSalesRawSel = {};   // {partNo:true} — Sales Quotation parts ticked for Raw Material Cost Increase
let prSalesMachSel = {};  // {partNo:true} — Sales Quotation parts ticked for Machining Cost Increase
let prLabourMachSel = {}; // {partNo:true} — Job Work Quotation parts ticked for Machining Cost Increase
let prSalesRawMode = 'pct', prSalesRawVal = '';    // 'pct' | 'amount'
let prSalesMachMode = 'pct', prSalesMachVal = '';
let prLabourMachMode = 'pct', prLabourMachVal = '';
let prEditingId = null;   // id of an existing DB.priceRevisions[] record currently being edited (null = creating a fresh one)
let editingLabourQuoteId = null;
let labourItemsDraft = [];
// Same purpose as quoteDraftCustomerId/Name above, for the Job Work Quotation draft form.
let labourDraftCustomerId = '';
let labourDraftCustomerName = '';
let labourQuoteViewId = null;
let lqFilterPartNo = '';
let calibrationSubTab = 'vipl'; // 'vipl' | 'customer'
let calGaugeFormOpen = false;   // Add Gauge form visibility
let editingGaugeId = null;      // id of gauge whose basic info is being edited
// Customer Gauges — multiple gauge numbers can be logged in one go under a single shared
// DC No. / DC Date (a customer typically sends several gauges together on one Delivery
// Challan). Each row is just a Customer Gauge Number; DC No./Date are entered once and
// applied to every row on Save. Only used for new entries — editing an existing record
// stays a single-row edit (see saveGauge/renderGaugeMaster).
function emptyCustGaugeRow(){ return {code:''}; }
let custGaugeRows = [emptyCustGaugeRow()];
let charInstMapFormOpen = false; // Characteristic ⇄ Measuring Instrument mapping form visibility
let editingCharInstMapId = null; // id of the mapping row being edited
let cimCharDraft = ''; // Characteristic currently picked/typed in the (new-mapping) form — kept across
                        // re-renders so committing a newly-typed characteristic to the master list
                        // doesn't blank the field the user was just filling in.
let calFormOpenId = null;       // id of gauge whose "log calibration" form is open
let calHistoryOpenId = null;    // id of gauge whose calibration history is expanded
let toolsSubTab = 'master';     // 'master' | 'po' | 'register' | 'issue' | 'reports'
let toolReportView = 'stock';   // 'stock' | 'history' (within Tool Management → Reports)
let toolFormOpen = false;       // Tool Master add/edit form visibility
let editingToolMasterId = null; // id of tool master row being edited
let fixtureFormOpen = false;       // Fixture Master add/edit form visibility
let editingFixtureId = null;       // id of fixture master row being edited
let toolRegFormOpen = false;    // Tool Register add form visibility
let toolIssueFormOpen = false;  // Tool Issue add form visibility
let toolPOFormOpen = false;     // Tools PO add form visibility
let receivePOId = null;         // id of Tools PO currently showing its "Receive" form

/* ---- Maintenance module state ---- */
let maintenanceSubTab = 'log';   // 'log' | 'items' | 'suppliers' | 'po'
let editingMaintItemId = null;   // id of Maintenance Item (DB.items, type:'MAINTENANCE') row being edited
let editingMaintSupplierId = null; // id of Maintenance Supplier (DB.suppliers, type:'Maintenance Supplier') row being edited
let maintPOFormOpen = false;     // Maintenance PO add form visibility
let maintPOUnitSel = '';         // 'Unit-1' | 'Unit-2' — same mandatory-first-step Unit pattern as Tools PO
let maintPOTypeSel = 'Purchase'; // 'Purchase' | 'Repair' — which PO type the open form is building
let maintPOActionId = null;      // id of Maintenance PO currently showing its Send/Receive action form
let editingMaintPOId = null;     // id of the Maintenance PO currently being edited (Open POs only)
let maintPOItemsDraft = [];      // draft line-item rows for the open Maintenance PO form (multi-item, like Purchase Order's poItemsDraft)

async function loadDB(){
  try{
    // Recovery step — this is the actual fix for "I saved, but sometimes the old data comes
    // back after refreshing or reopening": a previous saveDB() call always writes the local
    // cache FIRST and only afterwards pushes to Supabase in the background (see saveDB/
    // doPushToSupabase above). If the page was refreshed/closed/lost connection before that
    // background push confirmed, PENDING_KEY still holds that unsynced edit. Recover it now,
    // BEFORE trusting whatever is currently on the shared database, and re-push it — so a save
    // that "looked done" is never silently overwritten by older remote data on the next load.
    let pending = null;
    try{ const rawPending = localStorage.getItem(PENDING_KEY); if(rawPending) pending = JSON.parse(rawPending); }catch(e){}
    // Cross-computer fix: prefer the shared Supabase record (same data on every computer);
    // fall back to this browser's local cache only if Supabase isn't configured or unreachable
    // (e.g. offline) — so the app still works exactly as before in that case.
    const remote = await fetchRemoteDB();
    lastSyncOk = supabaseConfigured() ? (remote!==null) : null;
    let raw;
    if(pending && pending.data){
      // An unsynced local edit exists — it is the newest data that exists anywhere, so it wins
      // over the shared database, merged with anything the shared database has that this edit
      // doesn't (e.g. records another computer added in the meantime).
      const recovered = mergeDbForSync(pending.data, remote || {});
      raw = JSON.stringify(recovered);
      try{ localStorage.setItem(STORE_KEY, raw); }catch(e){}
      if(supabaseConfigured()){
        const ok = await pushRemoteDB(recovered);
        if(ok) clearPendingSave();
        else console.warn('[VIPL ERP] Recovered an interrupted save from this browser but could not re-sync it yet — it will retry on the next save or manual Sync, and is safely kept in the local cache meanwhile.');
      } else {
        clearPendingSave();
      }
    } else {
      raw = remote ? JSON.stringify(remote) : localStorage.getItem(STORE_KEY);
      if(remote){ try{ localStorage.setItem(STORE_KEY, raw); }catch(e){} } // refresh local cache
      else if(supabaseConfigured()){
        // Couldn't reach the shared database on load — we're about to fall back to this
        // browser's own local cache, which is exactly the old per-computer-only behaviour.
        // Warn loudly (both console and, once the UI exists, a toast) rather than silently
        // showing possibly-stale/incomplete data as if it were the shared truth.
        console.warn('[VIPL ERP] Could not reach the shared database on startup — showing this browser\'s local cache instead. Newly added records from other computers will not appear until the connection is restored.');
      }
    }
    if(raw){
      const loaded = JSON.parse(raw);
      // Migration safety: merge loaded data over defaults so any NEW fields added in later
      // app updates (e.g. labourQuotation) always exist, even for old saved browser data
      // that predates them — prevents a blank/broken page after an update.
      DB = Object.assign({}, DB, loaded);
      Object.keys(DB).forEach(k=>{
        if(Array.isArray(DB[k]) && !Array.isArray(loaded[k])) DB[k] = [];
      });
      if(!DB.counters) DB.counters = {};
      DB.counters = Object.assign({qt:0, lq:0, po:0, gr:0, st:0, pr:0, fi:0, sl:0, sp:0, it:0, mc:0, mt:0, tl:0, cl:0, cu:0, us:0, cd:0, cp:0, tp:0}, DB.counters);
      if(!DB.controlPlans) DB.controlPlans = [];
      if(!DB.failureReasons || typeof DB.failureReasons!=='object' || Array.isArray(DB.failureReasons)) DB.failureReasons = {};
      if(!Array.isArray(DB.partRouting)) DB.partRouting = [];
      if(!Array.isArray(DB.subcontractors)) DB.subcontractors = [];
      if(!Array.isArray(DB.subcontract)) DB.subcontract = [];
      if(!Array.isArray(DB.subcontractPOs)) DB.subcontractPOs = []; // {id, poNo, poDate, unit, subcontractorId, subcontractorName, process, partNo, partName, qty, rate, remarks, status:'Open'|'Closed'} — Purchase → Subcontractor PO, the link between a Subcontractor and every job issued against it.
      if(!Array.isArray(DB.jobCards)) DB.jobCards = [];
      if(!Array.isArray(DB.subInspection)) DB.subInspection = [];
      if(DB.counters.sc===undefined) DB.counters.sc = 0;
      if(DB.counters.jc===undefined) DB.counters.jc = 0;
      if(DB.counters.scpo===undefined) DB.counters.scpo = 0; // Subcontractor PO numbering
      if(DB.counters.jtn===undefined) DB.counters.jtn = 0;   // Job Tracking Number — one per Stores → Subcontract issue
      if(DB.counters.storesDC===undefined) DB.counters.storesDC = 0; // Delivery Challan No. — auto-numbered for every Stores → Subcontract issue
      if(!Array.isArray(DB.finalInspCards)) DB.finalInspCards = [];
      if(!Array.isArray(DB.custPO)) DB.custPO = [];
      if(!Array.isArray(DB.labourMaterialReceipt)) DB.labourMaterialReceipt = [];
      if(!Array.isArray(DB.productionNorms)) DB.productionNorms = [];
      if(!Array.isArray(DB.gaugesVipl)) DB.gaugesVipl = [];
      if(!Array.isArray(DB.gaugesCustomer)) DB.gaugesCustomer = [];
      if(!Array.isArray(DB.measuringInstruments)) DB.measuringInstruments = [];
      if(!Array.isArray(DB.charInstrumentMap)) DB.charInstrumentMap = [];
      // One-time migration: old flat calibration[] records become VIPL gauges with a single
      // calibration history entry each, so nothing is lost when upgrading to the new module.
      if(Array.isArray(DB.calibration) && DB.calibration.length && DB.gaugesVipl.length===0 && DB.gaugesCustomer.length===0){
        DB.gaugesVipl = DB.calibration.map(c=>({
          id: c.id || ('gg'+Date.now()+Math.random().toString(36).slice(2,6)),
          unit: c.unit, name: c.instrument||'', code: c.code||'', type:'', location:'',
          calibrations: [{
            id:'gc'+Date.now()+Math.random().toString(36).slice(2,6),
            date: c.lastCalDate||'', nextDue: c.nextDue||'', agency: c.agency||'',
            certNo: c.certNo||'', result: c.result||'Pass', certName:'', certData:''
          }]
        }));
        DB.calibration = [];
      }
      // Data-integrity pass: guarantee every gauge/instrument master record (old or new) carries
      // the full Tools Management field set, so no record is missing data after migration.
      ['gaugesVipl','gaugesCustomer','measuringInstruments'].forEach(listName=>{
        DB[listName] = (DB[listName]||[]).map(g=>Object.assign({
          id:'', unit:'', name:'', code:'', type:'', customerId:'', customerName:'',
          range:'', leastCount:'', location:'', department:'', status:'Active',
          make:'', serialNo:'', purchaseDate:'', calibrations:[]
        }, g, { calibrations: Array.isArray(g.calibrations) ? g.calibrations : [] }));
      });
      if(!Array.isArray(DB.toolMaster)) DB.toolMaster = [];
      if(!Array.isArray(DB.fixtureMaster)) DB.fixtureMaster = [];
      if(!DB.toolLists) DB.toolLists = {
        types:['End Mill','Drill','Tap','Reamer','Boring Tool','U Drill','Face Mill','Insert Tool','Turning Tool','Grooving Tool','Threading Tool'],
        materials:['HSS','Carbide','M35','M42']
      };
      if(!Array.isArray(DB.toolsPO)) DB.toolsPO = [];
      if(!Array.isArray(DB.toolRegister)) DB.toolRegister = [];
      if(!Array.isArray(DB.toolIssue)) DB.toolIssue = [];
      if(!Array.isArray(DB.maintenancePO)) DB.maintenancePO = [];
      if(!Array.isArray(DB.toolSuppliers)) DB.toolSuppliers = [];
      // Data-integrity: label the Purchase module's existing supplier master records as
      // Raw Material Suppliers (no data lost — just fills in the new `type` field).
      (DB.suppliers||[]).forEach(s=>{ if(!s.type) s.type = 'Raw Material'; if(s.email===undefined) s.email=''; });
      (DB.toolSuppliers||[]).forEach(s=>{ if(!s.type) s.type = 'Tool Supplier'; if(s.email===undefined) s.email=''; });
      // One-time cleanup: collapse duplicate/typo location strings (e.g. "G51-I", "G51 I")
      // into the two standard names everywhere a location is stored, so only "G51-I" and
      // "S-48" ever exist as machine/gauge/instrument locations across the whole app.
      (DB.machines||[]).forEach(m=>{ if(m.location) m.location = normalizeUnitLocation(m.location); });
      // Data-integrity fix: a machine's Plant (unit) must always match its Production
      // Location — older records could drift out of sync because editing a machine's
      // location previously didn't update its unit. Re-derive unit from location wherever
      // the location clearly identifies a plant, so Machine Summary counts are always correct.
      (DB.machines||[]).forEach(m=>{
        const u = machineUnitForLocation(m.location);
        if(u && m.unit!==u) m.unit = u;
      });
      (DB.gaugesVipl||[]).forEach(g=>{ if(g.location) g.location = normalizeUnitLocation(g.location); });
      (DB.measuringInstruments||[]).forEach(g=>{ if(g.location) g.location = normalizeUnitLocation(g.location); });
      // One-time cleanup: collapse every saved "Production Location" value (Bar Mapping,
      // Forging Mapping, Job Work Mapping) down to the two canonical PRODUCTION_LOCATIONS
      // strings — "UNIT-1 (G51-I)" and "UNIT-2 (S-48)" — regardless of how it was previously
      // typed/formatted, so only one standardized Production Location master exists app-wide.
      (DB.bom||[]).forEach(b=>{ if(b.prodLocation) b.prodLocation = normalizeProductionLocation(b.prodLocation); });
      (DB.labourMapping||[]).forEach(m=>{ if(m.prodLocation) m.prodLocation = normalizeProductionLocation(m.prodLocation); });
      // One-time cleanup: the Job Work Dispatch module (and its nested per-commitment dispatch
      // entries) has been retired — dispatch is now the Job Work Invoice itself, tracked via
      // invKind/commitmentId directly on DB.sales. Any old data from that short-lived design
      // is discarded (it predates real invoice records, so there's nothing to reconcile).
      (DB.labourPO||[]).forEach(po=>{
        (po.schedules||[]).forEach(s=>{
          (s.commitments||[]).forEach(c=>{ if(c.dispatches) delete c.dispatches; });
        });
      });
      if(DB.labourDispatch) delete DB.labourDispatch;
      // One-time migration: the old nested Job Work PO schedules[] (each holding its own
      // scheduledQty + commitments[]) is flattened into two simple running lists — Customer
      // Schedule Qty entries and Commitment entries — matching the current Job Work Planning
      // screen. Nothing is lost: every schedule's qty becomes one Schedule Qty entry, and
      // every commitment across every schedule becomes one Commitment entry.
      (DB.labourPO||[]).forEach(po=>{
        if(!po.scheduleQtyEntries && !po.commitments && Array.isArray(po.schedules) && po.schedules.length){
          po.scheduleQtyEntries = po.schedules.map(s=>({id:'sq'+Math.random().toString(36).slice(2,9), date:today(), qty:parseFloat(s.scheduledQty)||0, note:s.note||''}));
          po.commitments = [];
          po.schedules.forEach(s=>(s.commitments||[]).forEach(c=>{
            po.commitments.push({id:c.id||('lc'+Math.random().toString(36).slice(2,9)), date:c.date, qty:parseFloat(c.qty)||0});
          }));
        }
        if(!po.scheduleQtyEntries) po.scheduleQtyEntries = [];
        if(!po.commitments) po.commitments = [];
      });
      // One-time migration: old flat tools[] records become Tool Master entries, each with an
      // opening Tool Register receipt carrying over its existing quantity as current stock.
      if(Array.isArray(DB.tools) && DB.tools.length && DB.toolMaster.length===0){
        DB.tools.forEach(t=>{
          const toolId = t.id || ('tm'+Date.now()+Math.random().toString(36).slice(2,6));
          DB.toolMaster.push({ id: toolId, unit: t.unit, code: t.code||'', name: t.name||'', type: t.type||'', material:'', size:'', make:'', spec:'' });
          if((t.qty||0) > 0){
            DB.toolRegister.push({
              id:'tr'+Date.now()+Math.random().toString(36).slice(2,6), unit: t.unit, toolId,
              purchaseDate: t.lastUsed || today(), supplier:'Migrated opening stock', qtyReceived: t.qty||0
            });
          }
        });
        DB.tools = [];
      }
      // One-time migration: old single "Std. Rate" field on Item Master records splits into
      // marketPrice (Today's Market Price, manual, reference-only) + vqPrice (VIPL Quotation Price,
      // manual — master price that flows into Quotation costing).
      // No data lost — the old rate becomes the starting Market Price.
      (DB.items||[]).forEach(it=>{
        if(it.marketPrice===undefined) it.marketPrice = it.rate!==undefined ? (parseFloat(it.rate)||0) : 0;
        if(it.vqPrice===undefined) it.vqPrice = 0;
        if(!Array.isArray(it.marketPriceHistory)) it.marketPriceHistory = [];
        if(it.marketPriceEffDate===undefined) it.marketPriceEffDate = today();
      });
    }
  }catch(e){ /* no data yet */ }
}
function markPendingSave(){
  // Snapshot the just-made edit under its own key, separate from the normal local cache, so
  // loadDB() can tell "this device made a change that never got confirmed onto Supabase" apart
  // from an ordinary cache refresh, and recover it instead of quietly showing older remote data.
  try{ localStorage.setItem(PENDING_KEY, JSON.stringify({ data: DB, ts: Date.now() })); }catch(e){}
}
function clearPendingSave(){
  try{ localStorage.removeItem(PENDING_KEY); }catch(e){}
}
// Serializes every push to Supabase so two saveDB() calls fired close together (e.g. two quick
// edits, or a save that overlaps the 20s background auto-sync) can never run concurrently and
// race each other. Each push waits for the previous one to fully finish, and always sends the
// CURRENT global DB (read at run time, not at call time), so the latest edit is never dropped.
let saveQueue = Promise.resolve();
async function doPushToSupabase(){
  setSyncStatus('busy');
  try{
    // Pull-merge-push instead of a blind overwrite: fetch whatever is currently on the shared
    // record first, and merge THIS computer's just-made edit on top of it record-by-record
    // (see mergeDbForSync). This way, if another computer added a gauge (or anything else)
    // moments ago and we haven't seen it yet, our push no longer wipes it out — the previous
    // "push the whole local DB" approach was the actual cause of computers ending up with
    // different, non-overlapping data after a save from a device that was slightly behind.
    const remote = await fetchRemoteDB();
    if(remote) DB = mergeDbForSync(DB, remote); // DB (this device's fresh edit) wins on conflicts
    try{ localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }catch(e){}
    const ok = await pushRemoteDB(DB);
    setSyncStatus(ok);
    if(ok) clearPendingSave(); // confirmed on the shared database — safe to drop the recovery snapshot
    else toast('⚠ Saved locally, but could not sync to the shared database — check your internet connection');
  }catch(e){
    console.error('[VIPL ERP] saveDB sync error:', e);
    setSyncStatus(false);
    toast('⚠ Saved locally, but sync failed — see browser console for details');
  }
}
async function saveDB(){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } // instant local cache / offline backup
  catch(e){ toast('Save failed — storage error'); return; }
  markPendingSave();
  // Cross-computer fix: push the same change to the shared Supabase record so every other
  // computer sees it too. If Supabase isn't configured yet, or the network is down, this is a
  // silent no-op — the change still safely lives in localStorage above and nothing else breaks.
  if(!supabaseConfigured()) return;
  saveQueue = saveQueue.then(doPushToSupabase);
  return saveQueue;
}
function exportBackup(){
  const blob = new Blob([JSON.stringify(DB, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  a.href = url; a.download = `visalam_erp_backup_${ts}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Backup downloaded');
}
function importBackup(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const data = JSON.parse(e.target.result);
      DB = data;
      saveDB();
      toast('Backup restored');
      render();
    }catch(err){ toast('Invalid backup file'); }
  };
  reader.readAsText(file);
  input.value = '';
}
