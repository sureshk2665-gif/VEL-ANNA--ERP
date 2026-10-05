/* =========================================================================== */

let DB = {
  quotation: [],  // {id, quoteNo, quoteDate, validUntil, unit, customerId, customer, gstin, address, contact, items:[{desc,qty,rawMat,machining,othersCost:[{key,label,enabled,amount,remarks,customLabel}],adminPct,invPct,packPct,marginPct,transPct}], terms, status:'Draft'|'Sent'|'Accepted'|'Rejected', productionIds:[]}
  labourQuotation: [], // {id, quoteNo, quoteDate, unit, customerId, customer, gstin, cncRate, vmcRate, profitPct,
                       //  items:[{partNo, partName, lqCncOps:[{q,a}...], lqVmcOps:[{q,a}...], negoPct}] — dynamic
                       //  CNC/VMC Cycle Time Working rows (Quotation + Actual per operation; old cnc1..5/vmc1..5
                       //  saves are migrated in-place on first read), notes, status:'Draft'|'Sent'|'Accepted'|'Rejected'}
  priceRevisions: [], // Quotation → Price Revision sub-module — APPROVAL-BASED workflow, entirely separate
                      // from each quotation's own revisions[]/priceRevisions[] history arrays. Each record is a
                      // PROPOSED price change awaiting Customer Approval; it never touches DB.quotation /
                      // DB.labourQuotation until explicitly applied (see prApplyApproved in the render script).
                      // {id, module:'Sales'|'Labour', costType:'Raw Material'|'Machining', mode:'pct'|'amount', val,
                      //  unit, customerId, customer, createdDate, createdBy,
                      //  status:'Draft'|'Sent to Customer'|'Pending Customer Approval'|'Approved'|'Rejected',
                      //  sentDate, pendingDate, approvedDate, rejectedDate, appliedDate,
                      //  parts:[{partNo, partName, quoteRefs:[{quoteId,quoteNo,itemIndex}], oldPrice, revisionPct, revisionAmt, revisedPrice}]}
  custPO: [], // Customer PO (each record also holds its .plans[] set by the separate Production Planning module) — the central link between Quotation → Purchase → Production → Sales.
              // {id, unit, refNo, custPoNo, custPoDate, quotationId, quoteNo, customerId, customer, finPartNo, finPartName,
              //  orderedQty, deliveryDate, status:'Open'|'Closed', plans:[{id,date,qty,note}]} — plannedQty = sum(plans.qty),
              // balanceQty = orderedQty - plannedQty (continuously tracked as more planning entries are added)
  labourPO: [], // Job Work PO — Open PO workflow: header raised ONCE against an APPROVED Job Work Quotation + Finished
                // Part (no fixed ordered quantity; Job Work Rate always auto-fetched from that quotation). Multiple
                // Monthly Schedules are then logged against it over time; each schedule carries its own Commitment
                // Plan (any number of dated delivery commitments whose quantities must sum to the schedule qty);
                // each commitment carries its own Dispatches (any number of dated dispatch entries against it).
                // Full traceability: Customer → Job Work Quotation → Open PO → Monthly Schedule → Commitment → Dispatch.
                // {id, unit, refNo, poNo, poDate, labourQuoteId, labourQuoteNo, customerId, customer, finPartNo,
                //  finPartName, price, status:'Open'|'Closed',
                //  schedules:[{id, scheduledQty, note, commitments:[{id, date, qty, dispatches:[{id,date,qty}]}]}]}
  productionNorms: [], // Production module → Production Norms — {id, source:'Sales'|'Labour', quotationId, quoteNo, partNo, partName,
                       //  customer, unit, quoteCncOps:[N sec, OPN-1..N], quoteVmcOps:[N sec, OPN-1..N] (for Sales, cached from
                       //  the linked Quotation's ACTUAL Cycle Time per operation — NOT the Quotation Cycle Time used for
                       //  costing; dynamic length, matching however many operation rows exist on the Quotation; read-only here,
                       //  refreshed automatically if the Quotation's Actual Cycle Time is revised),
                       //  prodCncOps:[N sec], prodVmcOps:[N sec] (editable per-operation shop-floor cycle time — each defaults
                       //  to the Quotation's Actual value the first time a part is seen, then persists whatever the user sets
                       //  here), updatedAt}. This is the SINGLE SOURCE of cycle time for the Machine Capacity Report (summed
                       //  per part from these operation arrays): Quotation (Actual CT) → Production Norms → Machine Capacity
                       //  Report. One record per (source, quotationId, partNo). No combined Total Cycle Time is stored or
                       //  shown in this module.
  labourMapping: [], // Product Development → Job Work Mapping — single Customer + Part → Production Location
                     // mapping, shared by both the Job Work Quotation and Job Work PO modules (no duplicate entry).
                     // Common data (like Bar/Forging Mapping) — created/edited only from Admin Office, visible
                     // identically from every unit. {id, customerId, customer, finPartNo, finPartName, prodLocation}
  labourMaterialReceipt: [], // Job Work Stock → Customer Material Inward (DC Receipt) — logged when a Customer
                     // physically hands over material against a Delivery Challan for job-work. This IS the
                     // customer-supplied material that Job Work Stock's "Stock Qty (Available)" is built from
                     // (as opposed to Stores Bar/Forging Stock, which is company-owned/purchased material).
                     // {id, unit, dcNo, dcDate, customerId, customer, finPartNo, finPartName, qtyReceived, date,
                     //  remarks} — dcNo/dcDate stay attached to this record permanently for traceability;
                     // "Issue to Production" from Job Work Stock nets against the sum of these receipts.
  purchase: [],   // {id, poNo, poDate, unit, supplier, gstin, items:[{desc,qty,rate}], terms, status}
  materialReceiving: [], // {id, poId, unit, date, item, partNo, partName, itemType, uom, qtyOrdered, qtyReceived, invoiceNo, invoiceDate, receivedBy, remarks, pushedToInspection, grId} — logged when material physically arrives against a PO; auto-transferred to Receiving Inspection (no re-entry). DC/Challan No is captured later, in Receiving Inspection.
  receiving: [],  // {id, poId, unit, date, item, qtyReceived, qtyOrdered, dc, inspector, result, remarks, mrId} — Quality inspection; mrId links back to the Material Receiving entry that created it (if auto-transferred)
  subInspection: [], // Receiving Inspection → "Subcontract Inspection" tab — inward-quality check for job-work
                     // material RETURNING from a Subcontractor (as opposed to `receiving`, which is inward
                     // raw material like Bar/Forging against a Purchase PO). Created automatically the moment
                     // a Subcontract Job (Job Card Tracking → Subcontract Jobs) is marked "✅ Received" — the
                     // qty sits here as 'Pending' until inspected; only a 'Pass' result returns it to Stores
                     // (WIP) via returnQtyToStoresWIP, exactly mirroring the raw-material GR → Pass → Stores flow.
                     // {id, unit, subcontractId, jobNo, cardNo, dcNo, dcDate, partNo, partName, subcontractorName,
                     //  operation, qtyReceived, date, inspector, result:'Pending'|'Pass'|'Hold'|'Fail', remarks,
                     //  pushedToStores, routeIndex}
  stores: [],     // {id, unit, item, partNo, partName, qty, issuedQty, location, source, history:[{date,qty,balanceAfter}]} — qty is remaining balance, supports multiple partial issues to Production
  storesBar: [],     // {id, unit, partNo, partName, qty} — Stores → From Purchase → Bar, kept separate from main stores stock
  storesForging: [], // {id, unit, partNo, partName, qty} — Stores → From Purchase → Forging, kept separate from main stores stock
  production: [],  // {id, unit, item, qty, stage, operator, startDate, status}
  dailyProduction: [], // Production → Daily Worksheet → Daily Production (quick daily entry) — {id, unit, date, shift, machineId, partId(=Finished Part No issued from Stores), operatorId, qty}
  dailySetting: [], // Production → Daily Worksheet → Daily Setting — {id, unit, date, shift, machineId, operatorId, settingMinutes}
  finalInsp: [],  // {id, unit, item, qty, inspector, date, result, remarks, fiCardId} — fiCardId (when present) links this report back to the Final Inspection Card it was generated from (see finalInspCards below)
  finalInspCards: [], // Final Inspection Cards — auto-created the moment a completed Production quantity is sent to Final Inspection (from Production → "Final Insp." or Stores WIP → Next Stage: Final Inspection).
                      // One card per quantity sent for inspection: {id, unit, partNo, partName, prodQty, okQty, reworkQty, pendingQty,
                      //  status:'Open'|'Closed', cardNo, customer, date, quotationId, quoteNo, quoteRate,
                      //  grade, supplier, grir, cert, autoChars (Inspection Parameters, carried over so a generated report can auto-load them),
                      //  reportIds:[] (DB.finalInsp records generated against this card)}.
                      // Flow: Production → Final Insp. Qty (this card, Open) → OK/Rework Qty entry → Final Inspection Report generated for
                      // the OK qty (linked via reportIds / report.fiCardId) → once Pending Qty = 0 and every linked report is completed, the
                      // card auto-closes (status:'Closed'). The separate Final Inspection Report section (DB.finalInsp) is untouched by this —
                      // it remains its own report list, still linked to the Part No, just now populated by the card's "Generate Report" action.
  inventory: [],  // {id, unit, item, qty, source, date, fiId} — finished goods stock, ready for sale
  sales: [],      // {id, unit, invNo, invDate, customer, gstin, items:[{desc,qty,rate}], status, invId, (used to
                   //  group/finalize them as a unit — invNo is only ever assigned, via nextInvNo(), at Finalize time)}
                   //  packCount — invoice-level packing count, stored on every line of the invoice: labelled
                   //  "Number of Boxes" on Sales Invoices and "Number of Trays" on Job Work Invoices
                   //  (see packCountLabel()); printed under the Party Name on the Tax Invoice.
  suppliers: [],  // Raw Material Suppliers (Purchase module) — {id, name, gstin, phone, email, contact, address, type:'Raw Material'}
  customers: [],  // {id, name, shortName, gstin, phone, contact, address} — shortName is only used for on-screen display space-saving in the Customer Management list; it never substitutes for the full name anywhere else (dropdowns, documents, invoices, reports all use `name`)
  items: [],      // {id, code, name, type:'FORGING'|'BAR'|'MAINTENANCE', uom, vqPrice, marketPrice}
                  // type:'MAINTENANCE' entries (spares/consumables/services) are managed from the Maintenance
                  //   module's "Maintenance Items" tab, but live in this SAME shared Item Master.
                  // vqPrice = "VIPL Quotation Price" — manually maintained by the Purchase team; this is the
                  //   master material price and flows automatically into Sales Quotation raw-material costing.
                  // marketPrice = "Today's Market Price" — manually entered/updated by the Purchase team, for
                  //   internal comparison/reporting only; never used automatically in quotation calculations.
  bom: [],        // {id, finPartNo, finPartName, purItemId, purPartNo, purPartName, forgItemId, forgPartNo, forgPartName, reqQty, uom} — Part → Purchased Bar Part + Forging Part mapping (global, not unit-specific)
  inspectionParams: [], // {id, partNo, partName, chars:[{name,spec,usl,lsl,method}]} — master inspection characteristics per Part No, auto-loaded into Final Inspection (global, not unit-specific)
  controlPlans: [], // {id, cpNo, customerId, customerName, finPartNo, finPartName, materialGrade, drawingNo, revisionNo, pdRecordRef, effectiveDate, revNo, status:'Draft'|'Approved'|'Obsolete', preparedBy, checkedBy, approvedBy, ops:[{opNo,process,machine(type),toolFixGauge,charName,lcl,ucl,measInst,sampleSize,freq,controlMethod,reactionPlan,responsibility}], history:[{date,revNo,status,by,note}]}
  productCharacteristics: [], // string[] — user-added Product Characteristic names (typed via "Other" on any Characteristic dropdown). Auto-saved the moment a new name is entered so it instantly becomes a selectable option everywhere a Characteristic dropdown appears (Control Plan rows, Characteristic ⇄ Instrument Mapping, etc.), without a page refresh.
  machines: [],   // {id, unit, code, name, type, location, capacity, installDate, status}
  // Capital Goods sub-module (Purchase → Capital Goods) — mirrors the Materials Purchase flow
  // (PO → Receiving → Item Master → Supplier) exactly, but on its own DB buckets so the existing
  // Materials Purchase flow (DB.purchase / DB.materialReceiving / DB.suppliers type:'Raw Material'
  // / DB.items type:'BAR'|'FORGING') is never touched.
  // Item Master reuses the SAME shared DB.items master with type:'CAPITAL GOODS' (same pattern as
  // Maintenance Items, which use type:'MAINTENANCE' in this same list).
  // Supplier reuses the SAME shared DB.suppliers master with type:'Capital Goods Supplier' (same
  // pattern as Maintenance Suppliers / Tool Suppliers).
  capitalGoodsPO: [], // {id, unit, poNo, poDate, supplier, gstin, items:[{itemId,itemCode,itemName,uom,qty,rate}],
                      //  terms, status:'Open'|'Received'}
  capitalGoodsReceiving: [], // {id, poId, unit, date, itemId, itemCode, itemName, uom, qtyOrdered, qtyReceived,
                      //  invoiceNo, invoiceDate, receivedBy, remarks} — logged when a Capital Goods item
                      //  physically arrives against a Capital Goods PO; this IS the "linked to Item Master"
                      //  step (itemId always points back into the shared Item Master).
                      // Flow: Capital Goods PO → Receiving → Item Master → Supplier
  employees: [],  // Human Resources → {id, unit, empCode, empName, doj, designation, status:'Current'|'Resigned'} —
                  // deliberately minimal. status is the single source of truth for Current vs
                  // Resigned; the two HR sub-screens are just filtered views of this one list, so
                  // marking an employee Resigned instantly moves them out of Current Employees and
                  // into Resigned Employees, with nothing to keep in sync.
  maintenance: [],// {id, unit, machineId, type:'Preventive'|'Breakdown', date, description, performedBy, nextDue, status}
  // Maintenance PO — handles BOTH (a) buying new maintenance spares/consumables and (b) sending an
  // existing machine's part/assembly out to a supplier for repair/service and receiving it back.
  // Item selection reuses the shared Item Master (DB.items, type:'MAINTENANCE') — no separate Tool-Master-style
  // duplicate list. Supplier reuses the shared Supplier Master (DB.suppliers, type:'Maintenance Supplier').
  // {id, unit, poNo, poType:'Purchase'|'Repair', date, supplier, expectedDate, remarks, status:'Open'|'Sent'|'Received',
  //  items:[{machineId, itemId, itemDesc, uom, qty, rate, sentQty, receivedQty}],  // MULTIPLE items per PO
  //  commercialTerms:{discountPct, freight, packing, paymentTerms, validity, deliveryIn, insurance, commissioning, gstPct}, // shown/printed after the items section; gstPct (default 18) drives the printed Subtotal→GST→Grand Total calc
  //  sentDate, dcNo, sentRemarks,               // Repair — dispatch to supplier
  //  receivedDate, receivedCondition, invoiceNo, actualCost, receivedRemarks, // Purchase receipt OR Repair return
  //  history:[{date, action, note}] }
  maintenancePO: [],
  tools: [],      // legacy flat tool records — migrated into toolMaster/toolRegister on load, kept only for backward compat
  toolMaster: [],   // {id, unit, code, type, material, size, make, spec, name}
  fixtureMaster: [], // {id, unit, fixtureNo, finPartNo, finPartName, opNo, name, remarks}
  toolLists: {       // admin-extensible dropdown master lists for the Tool Master screen
    types:['End Mill','Drill','Tap','Reamer','Boring Tool','U Drill','Face Mill','Insert Tool','Turning Tool','Grooving Tool','Threading Tool'],
    materials:['HSS','Carbide','M35','M42']
  },
  toolsPO: [],      // {id, unit, poNo, toolId, qty, supplier, expectedDate, createdDate, status:'Open'|'Received', receivedQty, receivedDate, receivedRegisterId}
  toolRegister: [], // {id, unit, toolId, purchaseDate, supplier, qtyReceived, poId}
  toolIssue: [],    // {id, unit, toolId, issueDate, machineOperator, qtyIssued, balanceAfter}
  toolSuppliers: [], // Tools Suppliers (Tools Management module) — {id, name, gstin, phone, email, contact, address, type:'Tool Supplier'}
  calibration: [],// legacy flat records — migrated into gaugesVipl on load, kept only for backward compat
  // Master data for all three instrument registers now lives here and is maintained ONLY from the
  // Tools Management module. The Calibration module just references these records by id and appends
  // to their calibrations[] history — it never creates/edits/deletes the master record itself.
  // {id, unit, name, code(=Instrument ID), type, customerId, customerName, range, leastCount, location,
  //  department, status, make(=Manufacturer), serialNo, purchaseDate, calibrations:[{id,date,nextDue,agency,certNo,result,remarks,certName,certData}]}
  gaugesVipl: [],     // "VIPL Gauges" master
  gaugesCustomer: [], // "Customer Gauges" master
  measuringInstruments: [], // "Measuring Instruments" master
  charInstrumentMap: [], // Characteristic ⇄ Measuring Instrument mapping sub-model — {id, charName, instrumentNames:[]}.
                         // Maintained from Product Development → "Characteristic ⇄ Instrument Mapping" subtab (uses the
                         // Measuring Instruments master from Tools Management as its instrument choices). When a Control
                         // Plan row's Product Characteristic has a mapping here, the Measuring Instrument dropdown for
                         // that row is restricted to only the mapped instrument(s); characteristics with no mapping
                         // fall back to showing the full instrument master (so existing data never breaks).
  partRouting: [], // Part Number → Next-Stage Memory — {id, partNo, partName, stages:[stage names in the order they must be executed, e.g.
                   //  ['Stores','Production','Stores','Subcontract','Stores','Production','Stores','Final Inspection','Inventory']]} (Inventory = Finished Goods)
                   // One record per Part No. Used to auto-determine the Next Stage whenever a Production job or Subcontract job
                   // completes and material returns to Stores, and to auto-detect when Final Inspection is due (no Production/Subcontract stages left).
  subcontractors: [], // {id, name, contact, phone, address, gstin} — lightweight Subcontractor master used by the Subcontract Details sub-module.
  failureReasons: {}, // Planning Performance Report → Failure Items & Root Cause Analysis — keyed by a unique row key
                       // (kind:sales|labour + Customer + Part No [+ month for Job Work]) → {reason, other}. 'reason' is one of
                       // the fixed dropdown options (or 'Others'); 'other' holds the free-text detail when reason==='Others'.
  subcontract: [], // Subcontract Details sub-module — {id, jobNo, unit, jobCardId, cardNo, partNo, partName, qty, operation, stageLabel,
                   //  subcontractorId, subcontractorName, issueDate, dueDate, status:'Issued'|'Received', receivedQty, receivedDate,
                   //  remarks, storeId (Stores WIP record this was issued from), returnedToStoreId (Stores WIP record created on receipt)}
  jobCards: [], // Part Number Tracking / Job Card History — one row PER STAGE MOVEMENT (append-only ledger; nothing is ever
                // overwritten, so the full historical trail is always preserved). {id, cardNo, partNo, partName, qty, unit,
                // prevStage, stage (=current stage this row represents), nextStage, issueType:'In-House'|'Subcontract'|'',
                // subcontractorName, operation, refType:'production'|'subcontract'|'finalInsp'|'inventory'|'stores', refId,
                // issueDate, completionDate, status:'Open'|'Completed', remarks}
  counters: {qt:0, lq:0, po:0, gr:0, st:0, pr:0, fi:0, sl:0, sp:0, it:0, mc:0, mt:0, tl:0, cl:0, cu:0, us:0, cd:0, cp:0, tp:0, sc:0, jc:0, ll:0},
  settings: {theme:'corporate', addresses:{office:'', unit1:'', unit2:''}, company:{name:'VISALAM INDUSTRIES PVT LTD', logo:''},
    // gst also holds the company's Statutory Registrations, maintained ONLY by Software Admin /
    // Admin roles from Admin → Statutory Registrations: gstin, cin, msmeNo (Udyam Registration
    // No.), msmeCategory ('Micro'|'Small'|'Medium'), statutoryUpdatedBy, statutoryUpdatedAt.
    // The printed Sales / Job Work Tax Invoice reads these live at print time.
    gst:{gstin:'33AAFCV5068H1Z7', stateCode:'33', stateName:'TAMILNADU', email:'visalamindia@gmail.com', phone:'9941010733',
      cin:'', msmeNo:'UDYAM-TN-24-0000294', msmeCategory:'Micro', statutoryUpdatedBy:'', statutoryUpdatedAt:''},
    bank:{accName:'VISALAM INDUSTRIES PVT LTD', accNo:'0936201003095', bankName:'Canara Bank', branch:'Ambattur', ifsc:'CNRB0000936'}},
  users: [],  // {id, username, password, name, role:'admin'|'user', rights:{pageId:'none'|'view'|'edit'}}
  loginLogs: [] // Login/Logout audit trail — {id, userId, username, name, loginTime (ISO string,
                // recorded the moment 4-digit OTP verification succeeds), logoutTime (ISO string,
                // recorded on Sign Out — '' while the session is still open), sessionDuration
                // (formatted "Xh Ym", computed and stored once at logout, '' while still open)}.
                // One row per completed sign-in; a row with no logoutTime means that session is
                // either still open or the browser/tab was closed without using Sign Out.
};
let currentUnit = 'Admin';
// Fallback short tags only used if the Admin Module hasn't saved a unit address yet.
const UNIT_LOCATIONS_FALLBACK = {'Unit-1':'G51-I', 'Unit-2':'S-48'};
// Standardized short shop-floor tags — Unit-1 is always "G51-I", Unit-2 is always "S-48",
// regardless of what free-text company/works address has been entered in Admin → Settings.
// (Previously this was derived from the Unit Address text field, which meant typing a company
// name into that field could leak into every "Active Unit" badge/label across the app.)
function unitShortTag(u){
  return UNIT_LOCATIONS_FALLBACK[u] || '';
}
// Single standardized display label used everywhere in the app: "Unit 1 (G51-I)" / "Unit 2
// (S-48)" / "Admin Office". This is the ONE canonical human-readable Unit label — every screen,
// badge, dropdown, filter, and report should call this instead of building its own string.
function unitDisplayLabel(u){
  if(u==='Admin') return 'Admin Office';
  if(u==='Unit-1') return 'Unit 1 (G51-I)';
  if(u==='Unit-2') return 'Unit 2 (S-48)';
  return u || '—';
}
// Resolves a Machine Master shop-floor location tag ("G51-I" / "S-48") to its owning
// working-unit key ("Unit-1" / "Unit-2"). This is the single source of truth linking a
// machine's Production Location to its Plant — every machine's `unit` field is kept in sync
// with this mapping (see addMachine/saveEditMachine) so the Machine Summary, filters, and
// Production Location shown on the machine card always agree with each other.
function machineUnitForLocation(loc){
  const norm = normalizeUnitLocation(loc);
  if(norm==='G51-I') return 'Unit-1';
  if(norm==='S-48') return 'Unit-2';
  return null;
}
// Single canonical list of standard shop-floor locations — every location field in the app
// (Machine Master, Calibration, etc.) is normalized to one of these two, so stray variants
// like "G-51 I" / "G51 I" collapse into the one standard "G51-I" entry (same for S-48).
const STANDARD_LOCATIONS = ['G51-I', 'S-48'];
function normalizeUnitLocation(loc){
  const raw = (loc||'').trim();
  if(!raw) return raw;
  const clean = raw.toUpperCase().replace(/[\s\-]+/g,'');
  const match = STANDARD_LOCATIONS.find(l=> l.toUpperCase().replace(/[\s\-]+/g,'')===clean);
  return match || raw;
}
// Single canonical "Production Location" master — the ONE list every "Production Location"
// dropdown across the whole app (Bar Mapping, Forging Mapping, Job Work Mapping, etc.) draws
// from, so there is exactly one master and no risk of duplicate/misspelled entries per module.
const PRODUCTION_LOCATIONS = ['Unit 1 (G51-I)', 'Unit 2 (S-48)'];
// Collapses any legacy/misspelled/differently-formatted Production Location string (e.g.
// "Unit-1(G-51 I)", "UNIT 1 - G51 I", "Unit1(G51I)") down to one of the two canonical
// PRODUCTION_LOCATIONS strings, purely by detecting which unit number it refers to.
function normalizeProductionLocation(loc){
  const raw = (loc||'').trim();
  if(!raw) return raw;
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]+/g,'');
  if(clean.includes('UNIT1')) return PRODUCTION_LOCATIONS[0];
  if(clean.includes('UNIT2')) return PRODUCTION_LOCATIONS[1];
  return raw;
}
// Converts a canonical Production Location string into the matching working-unit key.
function prodLocationToUnit(loc){
  const norm = normalizeProductionLocation(loc);
  if(norm===PRODUCTION_LOCATIONS[0]) return 'Unit-1';
  if(norm===PRODUCTION_LOCATIONS[1]) return 'Unit-2';
  return null;
}
// Looks up the Production Location already mapped (Product Development → Job Work Mapping)
// for a Customer + Finished Part.
function labourMappingLocationFor(customerId, finPartNo){
  const key = (finPartNo||'').trim().toLowerCase();
  const m = DB.labourMapping.find(x=>x.customerId===customerId && (x.finPartNo||'').trim().toLowerCase()===key);
  return m ? m.prodLocation : '';
}
// Because Production Location is mapped per Customer + Finished Part (Job Work Mapping), Job Work
// Quotation / Job Work PO / and future Job Work Invoice do NOT need the operator to be standing
// inside Unit-1 or Unit-2 to create the record — the physical unit is resolved automatically
// from that mapping. If already on a specific production unit, that stays authoritative
// (someone physically on the Unit-1 floor is on Unit-1, full stop). Only when working from
// Admin Office does this auto-resolve from the mapping; if no mapping exists yet, it falls
// back to 'Admin' rather than blocking the save — the record can be re-tagged later once the
// mapping is created.
function resolveLabourUnit(customerId, finPartNo){
  if(currentUnit!=='Admin') return currentUnit;
  const loc = labourMappingLocationFor(customerId, finPartNo);
  return prodLocationToUnit(loc) || 'Admin';
}
