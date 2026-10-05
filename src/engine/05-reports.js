/* ---------------- REPORTS SUB-MODULE (generic, available in every module) ---------------- */
let reportModuleOpen = null;
let reportFilters = {};
let reportCardOpen = null; // id of the specific named-report card open within a module's Reports hub (null = show the card grid)
function blankReportFilter(){ return {q:'', dateFrom:'', dateTo:'', customer:'', supplier:'', partNo:'', product:'', status:'', subType:''}; }
function openModuleReports(moduleId){
  if(!REPORT_CONFIGS[moduleId]){ toast('Reports not available for this module yet'); return; }
  reportModuleOpen = moduleId;
  reportCardOpen = null;
  if(!reportFilters[moduleId]) reportFilters[moduleId] = blankReportFilter();
  render();
}
function closeModuleReports(){ reportModuleOpen = null; reportCardOpen = null; render(); }
/* Opens one named report card from a module's Reports hub grid. Applies that card's preset
   filters (status/subType/etc.) on top of a blank filter set, so each card behaves like its
   own canned report while reusing the same filter/table/print machinery underneath. */
function openReportCard(moduleId, cardId){
  const cfg = REPORT_CONFIGS[moduleId];
  const card = cfg && cfg.cards ? cfg.cards.find(c=>c.id===cardId) : null;
  // Some cards act as a shortcut into an entirely different report module (its own getRows/
  // columns) rather than a filtered preset of this module's own data — e.g. the Stores hub's
  // "Raw/Forging Material Ledger" cards open the dedicated storesRawLedger/storesForgingLedger
  // report modules instead of filtering Current Stock Report's rows.
  if(card && card.openModule){ openModuleReports(card.openModule); return; }
  reportCardOpen = cardId;
  reportFilters[moduleId] = Object.assign(blankReportFilter(), card?card.preset||{}:{});
  render();
}
function closeReportCard(){ reportCardOpen = null; render(); }
function setReportFilter(moduleId, key, val){
  if(!reportFilters[moduleId]) reportFilters[moduleId] = blankReportFilter();
  reportFilters[moduleId][key] = val;
  const main = document.getElementById('main');
  if(main) renderModuleReports(main, moduleId);
}
function clearReportFilters(moduleId){
  const cfg = REPORT_CONFIGS[moduleId];
  const card = (cfg && cfg.cards && reportCardOpen) ? cfg.cards.find(c=>c.id===reportCardOpen) : null;
  reportFilters[moduleId] = Object.assign(blankReportFilter(), card?card.preset||{}:{});
  const main = document.getElementById('main');
  if(main) renderModuleReports(main, moduleId);
}
function joinField(items, key){
  if(!Array.isArray(items) || !items.length) return '';
  return items.map(it=>it[key]).filter(Boolean).join('; ');
}
const REPORT_CONFIGS = {
  custPO: {
    title:'Customer PO', unitScoped:true, hasDate:true, hasCustomer:true, hasSupplier:false, hasPartNo:true, hasProduct:true, hasStatus:true,    // Combines Sales PO (DB.custPO) and Job Work PO (DB.labourPO) into one dated report — the
    // Customer PO module's own screen only shows one of the two subtabs at a time, so this is
    // the first place a user can filter Sales + Job Work PO intake together by date range.
    getRows:()=>{
      const salesRows = DB.custPO.filter(x=>reportUnitMatch(x.unit)).map(r=>({...r, poKind:'Sales PO', poNoDisp:r.custPoNo, poDateDisp:r.custPoDate, qtyDisp:r.orderedQty||0}));
      const labourRows = DB.labourPO.filter(x=>reportUnitMatch(x.unit)).map(r=>({...r, poKind:'Job Work PO', poNoDisp:r.poNo, poDateDisp:r.poDate, qtyDisp:labourScheduleQtyTotal(r)}));
      return [...salesRows, ...labourRows];
    },
    filterFields:r=>({date:r.poDateDisp||'', customer:r.customer||'', supplier:'', partNo:r.finPartNo||'', product:r.finPartName||'', status:r.status||''}),
    subTypes:{
      label:'PO Type',
      getValue:r=>r.poKind,
      getOptions:()=>['Sales PO','Job Work PO']
    },
    columns:[
      {label:'PO No', get:r=>r.poNoDisp||'—'}, {label:'PO Date', get:r=>r.poDateDisp||'—', date:true}, {label:'Type', get:r=>r.poKind||'—'},
      {label:'Customer Name', get:r=>r.customer||'—'}, {label:'Part No', get:r=>r.finPartNo||'—'}, {label:'Part Name', get:r=>r.finPartName||'—'},
      {label:'Qty', get:r=>r.qtyDisp??'—'}, {label:'Status', get:r=>r.status||'—'}
    ],
    cards:[
      {id:'all', icon:'📋', title:'All Customer POs', desc:'Every Sales PO and Job Work PO raised against customers.'},
      {id:'sales', icon:'🧾', title:'Sales PO Only', desc:'Customer POs raised against a Sales Quotation.', preset:{subType:'Sales PO'}},
      {id:'labour', icon:'🛠️', title:'Job Work PO Only', desc:'Open Job Work POs and their schedules.', preset:{subType:'Job Work PO'}},
      {id:'open', icon:'🟢', title:'Open POs', desc:'POs still pending delivery/closure.', preset:{status:'Open'}}
    ]
  },
  prodPlan: {
    title:'Planning', unitScoped:true, hasDate:true, hasCustomer:true, hasSupplier:false, hasPartNo:true, hasProduct:true, hasStatus:false,
    // Combines every dated Sales Plan commitment (DB.custPO[].plans) and Job Work Plan commitment
    // (DB.labourPO[].schedules[].commitments) into one flat, printable planning report — one row
    // per dated commitment entry, with Production Location resolved from the Product Development
    // → Job Work Mapping and shown right next to Part Name (on screen and in print).
    getRows:()=>{
      const salesRows = [];
      DB.custPO.filter(x=>reportUnitMatch(x.unit)).forEach(p=>{
        const loc = normalizeProductionLocation(labourMappingLocationFor(p.customerId, p.finPartNo));
        (p.plans||[]).forEach(pl=>{
          salesRows.push({ planKind:'Sales Plan', date:pl.date||'', customer:p.customer||'', finPartNo:p.finPartNo||'', finPartName:p.finPartName||'', prodLocation:loc||'', qty:pl.qty||0, note:pl.note||'' });
        });
      });
      const labourRows = [];
      DB.labourPO.filter(x=>reportUnitMatch(x.unit)).forEach(p=>{
        const loc = normalizeProductionLocation(labourMappingLocationFor(p.customerId, p.finPartNo));
        (p.schedules||[]).forEach(s=>{
          (s.commitments||[]).forEach(c=>{
            labourRows.push({ planKind:'Job Work Plan', date:c.date||'', customer:p.customer||'', finPartNo:p.finPartNo||'', finPartName:p.finPartName||'', prodLocation:loc||'', qty:c.qty||0, note:'' });
          });
        });
      });
      return [...salesRows, ...labourRows];
    },
    filterFields:r=>({date:r.date||'', customer:r.customer||'', supplier:'', partNo:r.finPartNo||'', product:r.finPartName||'', status:''}),
    subTypes:{
      label:'Plan Type',
      getValue:r=>r.planKind,
      getOptions:()=>['Sales Plan','Job Work Plan']
    },
    columns:[
      {label:'Date', get:r=>r.date||'—', date:true}, {label:'Type', get:r=>r.planKind||'—'}, {label:'Customer', get:r=>r.customer||'—'},
      {label:'Part No', get:r=>r.finPartNo||'—'}, {label:'Part Name', get:r=>r.finPartName||'—'}, {label:'Production Location', get:r=>r.prodLocation||'—'},
      {label:'Qty', get:r=>r.qty??'—'}, {label:'Note', get:r=>r.note||'—'}
    ],
    cards:[
      {id:'all', icon:'📅', title:'All Planning', desc:'Every dated Sales Plan and Job Work Plan commitment.'},
      {id:'sales', icon:'🧾', title:'Sales Plan', desc:'Dated commitments planned against Customer POs.', preset:{subType:'Sales Plan'}},
      {id:'labour', icon:'🛠️', title:'Job Work Plan', desc:'Dated commitments planned against Job Work POs.', preset:{subType:'Job Work Plan'}}
    ]
  },
  quotation: {
    title:'Quotation', unitScoped:true, hasDate:true, hasCustomer:true, hasSupplier:false, hasPartNo:true, hasProduct:true, hasStatus:true,
    getRows:()=>DB.quotation.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:r.quoteDate||'', customer:r.customer||'', supplier:'', partNo:joinField(r.items,'partNo'), product:joinField(r.items,'partName'), status:r.status||''}),
    columns:[
      {label:'Quote No', get:r=>r.quoteNo||'—'}, {label:'Date', get:r=>r.quoteDate||'—', date:true},
      {label:'Customer Name', get:r=>r.customer||'—'}, {label:'Part No(s)', get:r=>joinField(r.items,'partNo')||'—'},
      {label:'Part Name(s)', get:r=>joinField(r.items,'partName')||'—'}, {label:'Items', get:r=>(r.items||[]).length},
      {label:'Value', get:r=>fmtMoney((r.items||[]).reduce((a,it)=>a+calcQuoteItem(it).lineTotal,0))}, {label:'Status', get:r=>r.status||'—'}
    ],
    cards:[
      {id:'all', icon:'📋', title:'All Quotations', desc:'Every quotation raised, any status.'},
      {id:'draft', icon:'📝', title:'Draft Quotations', desc:'Quotations still being worked on.', preset:{status:'Draft'}},
      {id:'accepted', icon:'✅', title:'Accepted Quotations', desc:'Quotations the customer has accepted.', preset:{status:'Accepted'}},
      {id:'rejected', icon:'❌', title:'Rejected Quotations', desc:'Quotations declined by the customer.', preset:{status:'Rejected'}},
      {id:'labourQuotation', icon:'🛠️', title:'Job Work Quotation Report', desc:'Every Job Work Quotation raised, any status.', openModule:'labourQuotation'}
    ]
  },
  productDev: {
    title:'Product Development', unitScoped:false, hasDate:false, hasCustomer:true, hasSupplier:false, hasPartNo:true, hasProduct:true, hasStatus:true,
    getRows:()=>DB.bom,
    filterFields:r=>({date:'', customer:r.customerName||'', supplier:'', partNo:r.finPartNo||'', product:r.finPartName||'', status:r.mapType||''}),
    columns:[
      {label:'Part No', get:r=>r.finPartNo||'—'}, {label:'Part Name', get:r=>r.finPartName||'—'},
      {label:'Customer', get:r=>r.customerName||'—'}, {label:'Type', get:r=>r.mapType||'—'},
      {label:'Bar/Forging Part No', get:r=>r.purPartNo||r.forgPartNo||'—'}, {label:'Bar/Forging Part Name', get:r=>r.purPartName||r.forgPartName||'—'},
      {label:'Prod. Location', get:r=>r.prodLocation||'—'}, {label:'UOM', get:r=>r.uom||'—'}
    ],
    cards:[
      {id:'all', icon:'📋', title:'All Mappings', desc:'Every Part → Bar/Forging mapping.'},
      {id:'bar', icon:'🔩', title:'Bar Mapping', desc:'Finished parts mapped to a purchased Bar part.', preset:{status:'BAR'}},
      {id:'forging', icon:'⚙️', title:'Forging Mapping', desc:'Finished parts mapped to a purchased Forging part.', preset:{status:'FORGING'}}
    ]
  },
  controlPlans: {
    title:'Control Plan', unitScoped:false, hasDate:true, hasCustomer:true, hasSupplier:false, hasPartNo:true, hasProduct:true, hasStatus:true,
    getRows:()=>DB.controlPlans,
    filterFields:r=>({date:r.effectiveDate||'', customer:r.customerName||'', supplier:'', partNo:r.finPartNo||'', product:r.finPartName||'', status:r.status||''}),
    columns:[
      {label:'CP No', get:r=>r.cpNo||'—'}, {label:'Part No', get:r=>r.finPartNo||'—'},
      {label:'Part Name', get:r=>r.finPartName||'—'}, {label:'Customer', get:r=>r.customerName||'—'},
      {label:'Rev No', get:r=>r.revNo||'—'}, {label:'Effective Date', get:r=>r.effectiveDate||'—', date:true},
      {label:'Operations', get:r=>(r.ops||[]).length}, {label:'Status', get:r=>r.status||'—'}
    ],
    cards:[
      {id:'all', icon:'📋', title:'All Control Plans', desc:'Every Control Plan across all Parts.'},
      {id:'draft', icon:'📝', title:'Draft', desc:'Control Plans still being prepared.', preset:{status:'Draft'}},
      {id:'approved', icon:'✅', title:'Approved', desc:'Signed-off, active Control Plans.', preset:{status:'Approved'}},
      {id:'obsolete', icon:'🗄️', title:'Obsolete', desc:'Superseded Control Plans kept for history.', preset:{status:'Obsolete'}}
    ]
  },
  purchase: {
    title:'Purchase', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:true, hasPartNo:true, hasProduct:true, hasStatus:true,
    getRows:()=>DB.purchase.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:r.poDate||'', customer:'', supplier:r.supplier||'', partNo:joinField(r.items,'partNo'), product:joinField(r.items,'partName'), status:r.status||''}),
    columns:[
      {label:'PO No', get:r=>r.poNo||'—'}, {label:'Date', get:r=>r.poDate||'—', date:true}, {label:'Supplier', get:r=>r.supplier||'—'},
      {label:'Part No(s)', get:r=>joinField(r.items,'partNo')||'—'}, {label:'Items', get:r=>(r.items||[]).length},
      {label:'Value', get:r=>fmtMoney((r.items||[]).reduce((a,it)=>a+((parseFloat(it.qty)||0)*(parseFloat(it.rate)||0)),0))}, {label:'Status', get:r=>r.status||'—'}
    ],
    cards:[
      {id:'all', icon:'📋', title:'All Purchase Orders', desc:'Every raw material Purchase Order raised.'},
      {id:'open', icon:'🟢', title:'Open POs', desc:'POs still pending receipt/closure.', preset:{status:'Open'}},
      {id:'closed', icon:'⚪', title:'Closed POs', desc:'Fully received and closed POs.', preset:{status:'Closed'}},
      {id:'capitalGoods', icon:'🏗️', title:'Capital Goods Purchase Report', desc:'Capital Goods POs raised, open and received.', openModule:'capitalGoodsPO'},
      {id:'itemPriceList', icon:'💲', title:'Item Master / Price List Report', desc:'Current VQ Price and Market Price across all Items.', openModule:'itemPriceList'}
    ]
  },
  receiving: {
    title:'Receiving Inspection', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:false, hasPartNo:true, hasProduct:true, hasStatus:true,
    getRows:()=>DB.receiving.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:r.date||'', customer:'', supplier:'', partNo:r.partNo||'', product:r.item||r.partName||'', status:r.result||''}),
    columns:[
      {label:'Date', get:r=>r.date||'—', date:true}, {label:'Part No', get:r=>r.partNo||'—'}, {label:'Item', get:r=>r.item||r.partName||'—'},
      {label:'Qty Ordered', get:r=>r.qtyOrdered??'—'}, {label:'Qty Received', get:r=>r.qtyReceived??'—'},
      {label:'Inspector', get:r=>r.inspector||'—'}, {label:'Result', get:r=>r.result||'—'}
    ],
    cards:[
      {id:'all', icon:'📋', title:'All Receiving Inspection', desc:'Every incoming material inspection record.'},
      {id:'pass', icon:'✅', title:'Passed', desc:'Material accepted and pushed to Stores.', preset:{status:'Pass'}},
      {id:'fail', icon:'❌', title:'Failed / Hold', desc:'Rejected or on-hold material.', preset:{status:'Fail'}},
      {id:'pending', icon:'⏳', title:'Pending', desc:'Received but not yet inspected.', preset:{status:'Pending'}}
    ]
  },
  stores: {
    title:'Stores', unitScoped:true, hasDate:false, hasCustomer:false, hasSupplier:false, hasPartNo:true, hasProduct:true, hasStatus:false,
    getRows:()=>DB.stores.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:'', customer:'', supplier:'', partNo:r.partNo||'', product:r.item||r.partName||'', status:''}),
    columns:[
      {label:'Item', get:r=>r.item||'—'}, {label:'Part No', get:r=>r.partNo||'—'}, {label:'Part Name', get:r=>r.partName||'—'},
      {label:'Qty Balance', get:r=>r.qty??'—'}, {label:'Issued Qty', get:r=>r.issuedQty??'—'}, {label:'Location', get:r=>r.location||'—'}, {label:'Source', get:r=>r.source||'—'}
    ],
    cards:[
      {id:'all', icon:'📦', title:'Current Stock Report', desc:'Full stores stock balance across items.'},
      {id:'rawLedger', icon:'📒', title:'Raw Material Ledger', desc:'Date-wise Receipt → Production Issue → Balance ledger for Bar Stock.', openModule:'storesRawLedger'},
      {id:'forgingLedger', icon:'📒', title:'Forging Material Ledger', desc:'Date-wise Receipt → Production Issue → Balance ledger for Forging Stock.', openModule:'storesForgingLedger'},
      {id:'labourMaterialReceipt', icon:'📦', title:'Job Work Material Receipt (DC) Report', desc:'Customer-supplied material received against Delivery Challans.', openModule:'labourMaterialReceipt'}
    ]
  },
  // Material Ledger reports — share the same underlying ledger builder as the Stores → Material
  // Ledger Report tab (materialLedgerRows), just surfaced here too through the standard
  // filter/print/export Reports engine. storesBar = Raw Material, storesForging = Forging.
  storesRawLedger: {
    title:'Raw Material Ledger', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:true, hasPartNo:true, hasProduct:false, hasStatus:false,
    printLandscape:true, colWidths:[7,8,12,9,9,6,6,6,6,6,6,6,6,7],
    getRows:()=>materialLedgerRows('storesBar'),
    filterFields:r=>({date:r.date||'', customer:'', supplier:(r.supplier==='—'?'':r.supplier)||'', partNo:r.partNo||'', product:'', status:''}),
    columns:[
      {label:'Date', get:r=>r.date||'—', date:true}, {label:'Part No', get:r=>r.partNo||'—'}, {label:'Material Name', get:r=>r.partName||'—'},
      {label:'Supplier', get:r=>r.supplier||'—'}, {label:'PO/Receipt Ref', get:r=>r.ref||'—'},
      {label:'Opening Qty', get:r=>r.opening, num:true}, {label:'Received Qty', get:r=>r.received||'—', num:true}, {label:'Prod. Issued Qty', get:r=>r.issued||'—', num:true},
      {label:'Return/Rejected Qty', get:r=>r.retRej||'—', num:true}, {label:'Balance Qty', get:r=>r.balance, num:true},
      {label:'Rate (₹/Unit)', get:r=>fmtMoney(r.rate), num:true}, {label:'Total Value (₹)', get:r=>fmtMoney(r.totalValue), num:true},
      {label:'Issued Value (₹)', get:r=>fmtMoney(r.issuedValue), num:true}, {label:'Balance Value (₹)', get:r=>fmtMoney(r.balanceValue), num:true}
    ]
  },
  storesForgingLedger: {
    title:'Forging Material Ledger', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:true, hasPartNo:true, hasProduct:false, hasStatus:false,
    printLandscape:true, colWidths:[7,8,12,9,9,6,6,6,6,6,6,6,6,7],
    getRows:()=>materialLedgerRows('storesForging'),
    filterFields:r=>({date:r.date||'', customer:'', supplier:(r.supplier==='—'?'':r.supplier)||'', partNo:r.partNo||'', product:'', status:''}),
    columns:[
      {label:'Date', get:r=>r.date||'—', date:true}, {label:'Part No', get:r=>r.partNo||'—'}, {label:'Material Name', get:r=>r.partName||'—'},
      {label:'Supplier', get:r=>r.supplier||'—'}, {label:'PO/Receipt Ref', get:r=>r.ref||'—'},
      {label:'Opening Qty', get:r=>r.opening, num:true}, {label:'Received Qty', get:r=>r.received||'—', num:true}, {label:'Prod. Issued Qty', get:r=>r.issued||'—', num:true},
      {label:'Return/Rejected Qty', get:r=>r.retRej||'—', num:true}, {label:'Balance Qty', get:r=>r.balance, num:true},
      {label:'Rate (₹/Unit)', get:r=>fmtMoney(r.rate), num:true}, {label:'Total Value (₹)', get:r=>fmtMoney(r.totalValue), num:true},
      {label:'Issued Value (₹)', get:r=>fmtMoney(r.issuedValue), num:true}, {label:'Balance Value (₹)', get:r=>fmtMoney(r.balanceValue), num:true}
    ]
  },
  production: {
    title:'Production', unitScoped:true, hasDate:true, hasCustomer:true, hasSupplier:false, hasPartNo:true, hasProduct:true, hasStatus:true,
    getRows:()=>DB.production.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:r.startDate||'', customer:r.customerName||'', supplier:'', partNo:r.partNo||'', product:r.item||r.partName||'', status:r.status||''}),
    subTypes:{
      label:'Stage',
      getValue:r=>r.stage||'Unspecified',
      getOptions:()=>Array.from(new Set((DB.production||[]).map(r=>r.stage).filter(Boolean))).sort()
    },
    columns:[
      {label:'Card No', get:r=>r.cardNo||'—'}, {label:'Item', get:r=>r.item||'—'}, {label:'Part No', get:r=>r.partNo||'—'},
      {label:'Qty', get:r=>r.qty??'—'}, {label:'Stage', get:r=>r.stage||'—'}, {label:'Operator', get:r=>r.operator||'—'},
      {label:'Start Date', get:r=>r.startDate||'—', date:true}, {label:'Customer', get:r=>r.customerName||'—'}, {label:'Status', get:r=>r.status||'—'}
    ],
    cards:[
      {id:'all', icon:'🏭', title:'All Production', desc:'Every production card, any stage.'},
      {id:'inprogress', icon:'🔄', title:'In Progress', desc:'Cards currently running on the floor.', preset:{status:'In Progress'}},
      {id:'completed', icon:'✅', title:'Completed', desc:'Cards finished production.', preset:{status:'Completed'}},
      {id:'dailyProduction', icon:'🏭', title:'Daily Production Report', desc:'Daily Worksheet — machine/operator-wise production output.', openModule:'dailyProduction'},
      {id:'dailySetting', icon:'🔧', title:'Daily Setting Report', desc:'Daily Worksheet — machine/operator-wise setting time.', openModule:'dailySetting'}
    ]
  },
  finalInsp: {
    title:'Final Inspection', unitScoped:true, hasDate:true, hasCustomer:true, hasSupplier:true, hasPartNo:true, hasProduct:true, hasStatus:true,
    getRows:()=>DB.finalInsp.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:r.date||'', customer:r.customer||'', supplier:r.supplier||'', partNo:r.partNo||'', product:r.desc||r.partNo||'', status:r.result||''}),
    columns:[
      {label:'Card No', get:r=>r.card||'—'}, {label:'Part No', get:r=>r.partNo||'—'}, {label:'Qty', get:r=>r.qty??'—'},
      {label:'Date', get:r=>r.date||'—', date:true}, {label:'Customer', get:r=>r.customer||'—'}, {label:'Supplier', get:r=>r.supplier||'—'}, {label:'Result', get:r=>r.result||'—'}
    ],
    cards:[
      {id:'all', icon:'🔍', title:'All Final Inspection', desc:'Every final inspection record.'},
      {id:'pass', icon:'✅', title:'Passed / Cleared', desc:'Passed and pushed to Inventory.', preset:{status:'Pass'}},
      {id:'fail', icon:'❌', title:'Failed', desc:'Rejected at final inspection.', preset:{status:'Fail'}}
    ]
  },
  inventory: {
    title:'Finished Goods', unitScoped:true, hasDate:true, hasCustomer:true, hasSupplier:false, hasPartNo:true, hasProduct:true, hasStatus:false,
    partNoLabel:'Card No. Wise', partNoPlaceholder:'Search card no.',
    getRows:()=>DB.inventory.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:r.date||'', customer:r.customer||'', supplier:'', partNo:r.cardNo||'', product:r.item||'', status:''}),
    columns:[
      {label:'Item', get:r=>r.item||'—'}, {label:'Qty Available', get:r=>r.qty??'—'}, {label:'Customer', get:r=>r.customer||'—'},
      {label:'Source', get:r=>r.source||'—'}, {label:'Date', get:r=>r.date||'—', date:true}, {label:'Card No', get:r=>r.cardNo||'—'}
    ],
    cards:[
      {id:'all', icon:'📦', title:'Finished Goods Stock', desc:'Inventory ready for sale, across all sources.'}
    ]
  },
  sales: {
    title:'Sales', unitScoped:true, hasDate:true, hasCustomer:true, hasSupplier:false, hasPartNo:false, hasProduct:true, hasStatus:true,
    getRows:()=>DB.sales.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:r.invDate||'', customer:r.customer||'', supplier:'', partNo:'', product:r.item||'', status:r.status||''}),
    columns:[
      {label:'Invoice No', get:r=>r.invNo||'—'}, {label:'Date', get:r=>r.invDate||'—', date:true}, {label:'Customer', get:r=>r.customer||'—'},
      {label:'Item', get:r=>r.item||'—'}, {label:'Qty', get:r=>r.qty??'—'}, {label:'Value', get:r=>fmtMoney((parseFloat(r.qty)||0)*(parseFloat(r.rate)||0))}, {label:'Status', get:r=>r.status||'—'}
    ],
    cards:[
      {id:'all', icon:'💰', title:'All Sales Invoices', desc:'Every sales invoice raised.'}
    ]
  },
  machines: {
    title:'Machine Master', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:false, hasPartNo:false, hasProduct:true, hasStatus:true,
    productLabel:'Production Location Wise', productPlaceholder:'Search production location',
    subTypes:{
      label:'Machine Type',
      getValue:r=>r.type||'Unspecified',
      getOptions:()=>Array.from(new Set((DB.machines||[]).map(m=>m.type).filter(Boolean))).sort()
    },
    getRows:()=>DB.machines.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:r.installDate||'', customer:'', supplier:'', partNo:'', product:r.location||'', status:r.status||''}),
    columns:[
      {label:'Code', get:r=>r.code||'—'}, {label:'Name', get:r=>r.name||'—'}, {label:'Type', get:r=>r.type||'—'},
      {label:'Production Location', get:r=>r.location||'—'}, {label:'Capacity', get:r=>r.capacity||'—'}, {label:'Install Date', get:r=>r.installDate||'—', date:true}, {label:'Status', get:r=>r.status||'—'}
    ],
    cards:[
      {id:'all', icon:'⚙️', title:'All Machines', desc:'Full Machine Master listing.'},
      {id:'running', icon:'🟢', title:'Running', desc:'Machines currently in production.', preset:{status:'Running'}},
      {id:'idle', icon:'⚪', title:'Idle', desc:'Machines not currently running.', preset:{status:'Idle'}},
      {id:'breakdown', icon:'🔴', title:'Breakdown', desc:'Machines under breakdown.', preset:{status:'Breakdown'}}
    ]
  },
  maintenance: {
    title:'Maintenance', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:false, hasPartNo:true, hasProduct:false, hasStatus:true,
    partNoLabel:'Machine Code Wise', partNoPlaceholder:'Search machine code',
    getRows:()=>DB.maintenance.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>{ const m=DB.machines.find(x=>x.id===r.machineId); return {date:r.date||'', customer:'', supplier:'', partNo:m?m.code:'', product:'', status:r.status||''}; },
    subTypes:{
      label:'Maintenance Type',
      getValue:r=>r.type||'Unspecified',
      getOptions:()=>Array.from(new Set((DB.maintenance||[]).map(r=>r.type).filter(Boolean))).sort()
    },
    columns:[
      {label:'Machine', get:r=>{const m=DB.machines.find(x=>x.id===r.machineId); return m?(m.code+' — '+m.name):'—';}}, {label:'Type', get:r=>r.type||'—'},
      {label:'Date', get:r=>r.date||'—', date:true}, {label:'Description', get:r=>r.description||'—'}, {label:'Performed By', get:r=>r.performedBy||'—'},
      {label:'Next Due', get:r=>r.nextDue||'—', date:true}, {label:'Status', get:r=>r.status||'—'}
    ],
    cards:[
      {id:'all', icon:'🧰', title:'All Maintenance', desc:'Every maintenance record, preventive and breakdown.'},
      {id:'preventive', icon:'🗓️', title:'Preventive', desc:'Scheduled preventive maintenance.', preset:{subType:'Preventive'}},
      {id:'breakdown', icon:'🚨', title:'Breakdown', desc:'Unplanned breakdown maintenance.', preset:{subType:'Breakdown'}},
      {id:'maintenancePO', icon:'🧾', title:'Maintenance PO Report', desc:'Purchase & Repair POs raised against machines.', openModule:'maintenancePO'}
    ]
  },
  jobTracking: {
    title:'Job Card Tracking', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:false, hasPartNo:true, hasProduct:true, hasStatus:true,
    // Reports on the Subcontract Jobs ledger — the one dated, statused transaction log this
    // module owns (Part Routing is a master/definition table, not a report-worthy series;
    // Part Tracking is just a live lookup over this same data, so it isn't duplicated here).
    getRows:()=>DB.subcontract.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:r.issueDate||'', customer:'', supplier:'', partNo:r.partNo||'', product:r.partName||'', status:r.status||''}),
    columns:[
      {label:'Job No', get:r=>r.jobNo||'—'}, {label:'Card No', get:r=>r.cardNo||'—'}, {label:'Part No', get:r=>r.partNo||'—'},
      {label:'Part Name', get:r=>r.partName||'—'}, {label:'Operation', get:r=>r.operation||'—'}, {label:'Subcontractor', get:r=>r.subcontractorName||'—'},
      {label:'Qty Issued', get:r=>r.qty??'—'}, {label:'Qty Received', get:r=>r.receivedQty??'—'},
      {label:'Issue Date', get:r=>r.issueDate||'—', date:true}, {label:'Status', get:r=>r.status||'—'}
    ],
    cards:[
      {id:'all', icon:'🏗️', title:'All Subcontract Jobs', desc:'Every job issued to a subcontractor.'},
      {id:'issued', icon:'🟡', title:'Issued / Pending', desc:'Jobs still with the subcontractor.', preset:{status:'Issued'}},
      {id:'partial', icon:'🟠', title:'Partially Received', desc:'Jobs partially returned so far.', preset:{status:'Partially Received'}},
      {id:'received', icon:'✅', title:'Received', desc:'Jobs fully returned from the subcontractor.', preset:{status:'Received'}},
      {id:'wip', icon:'⏳', title:'WIP Report (Work in Progress)', desc:'Ongoing, pending, stage-wise Job Card progress — every card not yet completed, at every stage.', openModule:'jobCardWIP'},
      {id:'customerMaterialLedger', icon:'📒', title:'Customer Material Ledger Report', desc:'Customer-supplied Part Numbers — Received, Dispatched, Rejected and Pending Balance, with a flexible date filter.', openModule:'customerMaterialLedger'},
      {id:'jobCardHistory', icon:'🧾', title:'Job Card Movement History', desc:'Full stage-by-stage movement ledger for every Part Number.', openModule:'jobCardHistory'}
    ]
  },
  hr: {
    title:'Human Resources', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:false, hasPartNo:false, hasProduct:false, hasStatus:true,
    partNoLabel:'', productLabel:'',
    getRows:()=>DB.employees.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:r.doj||'', customer:'', supplier:'', partNo:'', product:'', status:r.status||''}),
    columns:[
      {label:'Emp Code', get:r=>r.empCode||'—'}, {label:'Employee Name', get:r=>r.empName||'—'}, {label:'Designation', get:r=>r.designation||'—'},
      {label:'Date of Joining', get:r=>r.doj||'—', date:true}, {label:'Status', get:r=>r.status||'—'}
    ],
    cards:[
      {id:'all', icon:'👔', title:'All Employees', desc:'Every employee on record, current and resigned.'},
      {id:'current', icon:'🟢', title:'Current Employees', desc:'Active employees on the rolls.', preset:{status:'Current'}},
      {id:'resigned', icon:'⚪', title:'Resigned Employees', desc:'Employees no longer with the company.', preset:{status:'Resigned'}}
    ]
  },
  tools: {
    title:'Tool Management', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:false, hasPartNo:true, hasProduct:true, hasStatus:false,
    getRows:()=>DB.toolIssue.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>{ const t=DB.toolMaster.find(x=>x.id===r.toolId); return {date:r.issueDate||'', customer:'', supplier:'', partNo:t?t.code:'', product:t?t.name:'', status:''}; },
    subTypes:{
      label:'Tool Type',
      getValue:r=>{ const t=DB.toolMaster.find(x=>x.id===r.toolId); return (t&&t.type)?t.type:'Unspecified'; },
      getOptions:()=>Array.from(new Set((DB.toolMaster||[]).map(t=>t.type).filter(Boolean))).sort()
    },
    columns:[
      {label:'Tool Code', get:r=>{const t=DB.toolMaster.find(x=>x.id===r.toolId); return t?t.code:'—';}},
      {label:'Tool Name', get:r=>{const t=DB.toolMaster.find(x=>x.id===r.toolId); return t?t.name:'—';}},
      {label:'Issue Date', get:r=>r.issueDate||'—', date:true}, {label:'Machine / Operator', get:r=>r.machineOperator||'—'},
      {label:'Qty Issued', get:r=>r.qtyIssued??'—'}, {label:'Balance Stock', get:r=>r.balanceAfter??'—'}
    ],
    cards:[
      {id:'all', icon:'🧰', title:'Tool Issue History', desc:'Every tool issue transaction, all tool types.'},
      {id:'toolsPO', icon:'🛒', title:'Tool Purchase Report', desc:'Every Tools Purchase Order raised.', openModule:'toolsPO'},
      {id:'toolRegister', icon:'📒', title:'Tool Register Report', desc:'Every tool receipt logged into stock, with current balance.', openModule:'toolRegister'}
    ]
  },
  calibration: {
    title:'Calibration', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:false, hasPartNo:true, hasProduct:true, hasStatus:true,
    partNoLabel:'Gauge Card No. Wise', partNoPlaceholder:'Search gauge card no. / code',
    productLabel:'Instrument Name Wise', productPlaceholder:'Search instrument / gauge name',
    // Calibration data lives across the three gauge registers (VIPL Gauges, Customer Gauges,
    // Measuring Instruments), each holding a nested calibrations[] history — flatten one row
    // per calibration record so the report reflects what's actually in those registers.
    getRows:()=>{
      const rows = [];
      Object.keys(GAUGE_KINDS).forEach(k=>{
        const kindCfg = GAUGE_KINDS[k];
        (DB[kindCfg.listName]||[]).filter(g=>reportUnitMatch(g.unit)).forEach(g=>{
          (g.calibrations||[]).forEach(c=>{
            rows.push({
              unit:g.unit, kind:kindCfg.label, instrument:g.name||'', code:g.code||'',
              lastCalDate:c.date||'', nextDue:c.nextDue||'', agency:c.agency||'', certNo:c.certNo||'', result:c.result||''
            });
          });
        });
      });
      return rows;
    },
    filterFields:r=>({date:r.nextDue||'', customer:'', supplier:'', partNo:r.code||'', product:r.instrument||'', status:r.result||''}),
    // Reports organized under the Calibration module's own sub-modules — Instrument Types —
    // i.e. VIPL Gauges / Customer Gauges / Measuring Instruments, matching the Calibration
    // module's own tabs, so the report mirrors how the master data is actually organized.
    subTypes:{
      label:'Instrument Type',
      getValue:r=>r.kind||'',
      getOptions:()=>Object.values(GAUGE_KINDS).map(k=>k.label)
    },
    columns:[
      {label:'Type', get:r=>r.kind||'—'}, {label:'Instrument', get:r=>r.instrument||'—'}, {label:'Code', get:r=>r.code||'—'}, {label:'Last Cal.', get:r=>r.lastCalDate||'—', date:true},
      {label:'Next Due', get:r=>r.nextDue||'—', date:true}, {label:'Agency', get:r=>r.agency||'—'}, {label:'Cert No.', get:r=>r.certNo||'—'}, {label:'Result', get:r=>r.result||'—'}
    ],
    cards:[
      {id:'all', icon:'📏', title:'All Calibration Records', desc:'Every calibration entry across all registers.'},
      {id:'vipl', icon:'🏷️', title:'VIPL Gauges', desc:'Calibration history for VIPL-owned gauges.', preset:{subType:'VIPL Gauges'}},
      {id:'customer', icon:'👤', title:'Customer Gauges', desc:'Calibration history for customer-supplied gauges.', preset:{subType:'Customer Gauges'}},
      {id:'instruments', icon:'📐', title:'Measuring Instruments', desc:'Calibration history for measuring instruments.', preset:{subType:'Measuring Instruments'}}
    ]
  },
  // ---------------- Additional reports (added for fuller module coverage) ----------------
  capitalGoodsPO: {
    title:'Capital Goods Purchase', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:true, hasPartNo:false, hasProduct:true, hasStatus:true,
    getRows:()=>DB.capitalGoodsPO.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:r.poDate||'', customer:'', supplier:r.supplier||'', partNo:'', product:joinField(r.items,'itemName'), status:r.status||''}),
    columns:[
      {label:'PO No', get:r=>r.poNo||'—'}, {label:'Date', get:r=>r.poDate||'—', date:true}, {label:'Supplier', get:r=>r.supplier||'—'},
      {label:'Item(s)', get:r=>joinField(r.items,'itemName')||'—'}, {label:'Items', get:r=>(r.items||[]).length},
      {label:'Value', get:r=>fmtMoney((r.items||[]).reduce((a,it)=>a+((parseFloat(it.qty)||0)*(parseFloat(it.rate)||0)),0))}, {label:'Status', get:r=>r.status||'—'}
    ],
    cards:[
      {id:'all', icon:'🏗️', title:'All Capital Goods POs', desc:'Every Capital Goods Purchase Order raised.'},
      {id:'open', icon:'🟢', title:'Open POs', desc:'Capital Goods POs still pending receipt.', preset:{status:'Open'}},
      {id:'received', icon:'✅', title:'Received', desc:'Capital Goods POs fully received.', preset:{status:'Received'}}
    ]
  },
  itemPriceList: {
    title:'Item Master / Price List', unitScoped:false, hasDate:false, hasCustomer:false, hasSupplier:false, hasPartNo:true, hasProduct:true, hasStatus:false,
    partNoLabel:'Item Code Wise', partNoPlaceholder:'Search item code', productLabel:'Item Name Wise', productPlaceholder:'Search item name',
    getRows:()=>DB.items,
    filterFields:r=>({date:'', customer:'', supplier:'', partNo:r.code||'', product:r.name||'', status:''}),
    subTypes:{
      label:'Item Type',
      getValue:r=>r.type||'Unspecified',
      getOptions:()=>Array.from(new Set((DB.items||[]).map(i=>i.type).filter(Boolean))).sort()
    },
    columns:[
      {label:'Code', get:r=>r.code||'—'}, {label:'Name', get:r=>r.name||'—'}, {label:'Type', get:r=>r.type||'—'}, {label:'UOM', get:r=>r.uom||'—'},
      {label:'VQ Price', get:r=>fmtMoney(r.vqPrice), num:true}, {label:'Market Price', get:r=>fmtMoney(r.marketPrice), num:true},
      {label:'Price Eff. Date', get:r=>r.marketPriceEffDate||'—', date:true}
    ],
    cards:[
      {id:'all', icon:'📋', title:'All Items', desc:'Full Item Master with VQ Price and Market Price.'},
      {id:'bar', icon:'🔩', title:'Bar Items', desc:'Purchased Bar raw material items.', preset:{subType:'BAR'}},
      {id:'forging', icon:'⚙️', title:'Forging Items', desc:'Purchased Forging raw material items.', preset:{subType:'FORGING'}},
      {id:'maintenance', icon:'🧰', title:'Maintenance Items', desc:'Spares/consumables/services items.', preset:{subType:'MAINTENANCE'}},
      {id:'capitalGoods', icon:'🏗️', title:'Capital Goods Items', desc:'Capital Goods items.', preset:{subType:'CAPITAL GOODS'}}
    ]
  },
  labourQuotation: {
    title:'Job Work Quotation', unitScoped:true, hasDate:true, hasCustomer:true, hasSupplier:false, hasPartNo:true, hasProduct:true, hasStatus:true,
    getRows:()=>DB.labourQuotation.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:r.quoteDate||'', customer:r.customer||'', supplier:'', partNo:joinField(r.items,'partNo'), product:joinField(r.items,'partName'), status:r.status||''}),
    columns:[
      {label:'Quote No', get:r=>r.quoteNo||'—'}, {label:'Date', get:r=>r.quoteDate||'—', date:true}, {label:'Customer', get:r=>r.customer||'—'},
      {label:'Part No(s)', get:r=>joinField(r.items,'partNo')||'—'}, {label:'Part Name(s)', get:r=>joinField(r.items,'partName')||'—'},
      {label:'Items', get:r=>(r.items||[]).length}, {label:'CNC Rate', get:r=>fmtMoney(r.cncRate), num:true}, {label:'VMC Rate', get:r=>fmtMoney(r.vmcRate), num:true},
      {label:'Status', get:r=>r.status||'—'}
    ],
    cards:[
      {id:'all', icon:'📋', title:'All Job Work Quotations', desc:'Every Job Work Quotation raised, any status.'},
      {id:'draft', icon:'📝', title:'Draft', desc:'Job Work Quotations still being worked on.', preset:{status:'Draft'}},
      {id:'accepted', icon:'✅', title:'Accepted', desc:'Job Work Quotations accepted by the customer.', preset:{status:'Accepted'}},
      {id:'rejected', icon:'❌', title:'Rejected', desc:'Job Work Quotations declined by the customer.', preset:{status:'Rejected'}}
    ]
  },
  maintenancePO: {
    title:'Maintenance PO', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:true, hasPartNo:false, hasProduct:true, hasStatus:true,
    getRows:()=>DB.maintenancePO.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:r.date||'', customer:'', supplier:r.supplier||'', partNo:'', product:(r.items||[]).map(it=>maintPOItemRowLabel(it)).join('; '), status:r.status||''}),
    subTypes:{
      label:'PO Type',
      getValue:r=>r.poType||'Unspecified',
      getOptions:()=>['Purchase','Repair']
    },
    columns:[
      {label:'PO No', get:r=>r.poNo||'—'}, {label:'Date', get:r=>r.date||'—', date:true}, {label:'Type', get:r=>r.poType||'—'},
      {label:'Supplier', get:r=>r.supplier||'—'}, {label:'Item(s)', get:r=>(r.items||[]).map(it=>maintPOItemRowLabel(it)).join('; ')||'—'},
      {label:'Expected Date', get:r=>r.expectedDate||'—', date:true}, {label:'Status', get:r=>r.status||'—'}
    ],
    cards:[
      {id:'all', icon:'🧰', title:'All Maintenance POs', desc:'Every Maintenance Purchase/Repair PO raised.'},
      {id:'purchase', icon:'🛒', title:'Purchase POs', desc:'Spares/consumables purchase POs.', preset:{subType:'Purchase'}},
      {id:'repair', icon:'🔧', title:'Repair POs', desc:'Machine part/assembly sent out for repair.', preset:{subType:'Repair'}},
      {id:'open', icon:'🟢', title:'Open / Pending', desc:'POs still open, sent or pending receipt.', preset:{status:'Open'}},
      {id:'received', icon:'✅', title:'Received', desc:'POs fully received back.', preset:{status:'Received'}}
    ]
  },
  toolsPO: {
    title:'Tool Purchase', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:true, hasPartNo:true, hasProduct:true, hasStatus:true,
    getRows:()=>DB.toolsPO.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>{ const t=DB.toolMaster.find(x=>x.id===r.toolId); return {date:r.createdDate||'', customer:'', supplier:r.supplier||'', partNo:t?t.code:'', product:t?t.name:'', status:r.status||''}; },
    columns:[
      {label:'PO No', get:r=>r.poNo||'—'},
      {label:'Tool Code', get:r=>{const t=DB.toolMaster.find(x=>x.id===r.toolId); return t?t.code:'—';}},
      {label:'Tool Name', get:r=>{const t=DB.toolMaster.find(x=>x.id===r.toolId); return t?t.name:'—';}},
      {label:'Qty', get:r=>r.qty??'—'}, {label:'Supplier', get:r=>r.supplier||'—'}, {label:'Expected Date', get:r=>r.expectedDate||'—', date:true}, {label:'Status', get:r=>r.status||'—'}
    ],
    cards:[
      {id:'all', icon:'🧰', title:'All Tool Purchase Orders', desc:'Every Tools Purchase Order raised.'},
      {id:'open', icon:'🟢', title:'Open POs', desc:'Tool POs still pending receipt.', preset:{status:'Open'}},
      {id:'received', icon:'✅', title:'Received', desc:'Tool POs fully received into Tool Register.', preset:{status:'Received'}}
    ]
  },
  toolRegister: {
    title:'Tool Register', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:true, hasPartNo:true, hasProduct:true, hasStatus:false,
    getRows:()=>DB.toolRegister.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>{ const t=DB.toolMaster.find(x=>x.id===r.toolId); return {date:r.purchaseDate||'', customer:'', supplier:r.supplier||'', partNo:t?t.code:'', product:t?t.name:'', status:''}; },
    columns:[
      {label:'Tool Code', get:r=>{const t=DB.toolMaster.find(x=>x.id===r.toolId); return t?t.code:'—';}},
      {label:'Tool Name', get:r=>{const t=DB.toolMaster.find(x=>x.id===r.toolId); return t?t.name:'—';}},
      {label:'Purchase Date', get:r=>r.purchaseDate||'—', date:true}, {label:'Supplier', get:r=>r.supplier||'—'},
      {label:'Qty Received', get:r=>r.qtyReceived??'—', num:true},
      {label:'Current Stock', get:r=>{const t=DB.toolMaster.find(x=>x.id===r.toolId); return t?toolCurrentStock(t.id):'—';}, num:true}
    ],
    cards:[
      {id:'all', icon:'📒', title:'Tool Register', desc:'Every tool receipt logged into stock.'}
    ]
  },
  labourMaterialReceipt: {
    title:'Job Work Material Receipt (DC)', unitScoped:true, hasDate:true, hasCustomer:true, hasSupplier:false, hasPartNo:true, hasProduct:true, hasStatus:false,
    getRows:()=>DB.labourMaterialReceipt.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:r.dcDate||r.date||'', customer:r.customer||'', supplier:'', partNo:r.finPartNo||'', product:r.finPartName||'', status:''}),
    columns:[
      {label:'DC No', get:r=>r.dcNo||'—'}, {label:'DC Date', get:r=>r.dcDate||'—', date:true}, {label:'Customer', get:r=>r.customer||'—'},
      {label:'Part No', get:r=>r.finPartNo||'—'}, {label:'Part Name', get:r=>r.finPartName||'—'}, {label:'PO No', get:r=>r.poNo||'—'},
      {label:'Qty Received', get:r=>r.qtyReceived??'—', num:true}, {label:'Remarks', get:r=>r.remarks||'—'}
    ],
    cards:[
      {id:'all', icon:'📦', title:'All Material Receipts', desc:'Every customer-supplied Job Work material DC receipt.'}
    ]
  },
  dailyProduction: {
    title:'Daily Production', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:false, hasPartNo:true, hasProduct:false, hasStatus:false,
    getRows:()=>DB.dailyProduction.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:r.date||'', customer:'', supplier:'', partNo:r.partId||'', product:'', status:''}),
    subTypes:{
      label:'Shift',
      getValue:r=>r.shift||'Unspecified',
      getOptions:()=>Array.from(new Set((DB.dailyProduction||[]).map(r=>r.shift).filter(Boolean))).sort()
    },
    columns:[
      {label:'Date', get:r=>r.date||'—', date:true}, {label:'Shift', get:r=>r.shift||'—'},
      {label:'Machine', get:r=>{const m=DB.machines.find(x=>x.id===r.machineId); return m?(m.code+' — '+m.name):'—';}},
      {label:'Part No', get:r=>r.partId||'—'}, {label:'Operation', get:r=>r.operation||'—'},
      {label:'Operator', get:r=>{const e=DB.employees.find(x=>x.id===r.operatorId); return e?e.empName:'—';}},
      {label:'Qty', get:r=>r.qty??'—', num:true}, {label:'Hours', get:r=>r.hours??'—', num:true}
    ],
    cards:[
      {id:'all', icon:'🏭', title:'Daily Production Report', desc:'Every daily production worksheet entry, all shifts.'}
    ]
  },
  dailySetting: {
    title:'Daily Setting', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:false, hasPartNo:true, hasProduct:false, hasStatus:false,
    getRows:()=>DB.dailySetting.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:r.date||'', customer:'', supplier:'', partNo:r.partId||'', product:'', status:''}),
    subTypes:{
      label:'Shift',
      getValue:r=>r.shift||'Unspecified',
      getOptions:()=>Array.from(new Set((DB.dailySetting||[]).map(r=>r.shift).filter(Boolean))).sort()
    },
    columns:[
      {label:'Date', get:r=>r.date||'—', date:true}, {label:'Shift', get:r=>r.shift||'—'},
      {label:'Machine', get:r=>{const m=DB.machines.find(x=>x.id===r.machineId); return m?(m.code+' — '+m.name):'—';}},
      {label:'Part No', get:r=>r.partId||'—'}, {label:'Operation', get:r=>r.operation||'—'},
      {label:'Operator', get:r=>{const e=DB.employees.find(x=>x.id===r.operatorId); return e?e.empName:'—';}},
      {label:'Setting Minutes', get:r=>r.settingMinutes??'—', num:true}
    ],
    cards:[
      {id:'all', icon:'🔧', title:'Daily Setting Report', desc:'Every daily machine setting worksheet entry, all shifts.'}
    ]
  },
  jobCardHistory: {
    title:'Job Card Movement History', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:false, hasPartNo:true, hasProduct:true, hasStatus:true,
    getRows:()=>DB.jobCards.filter(x=>reportUnitMatch(x.unit)),
    filterFields:r=>({date:r.issueDate||'', customer:'', supplier:'', partNo:r.partNo||'', product:r.partName||'', status:r.status||''}),
    columns:[
      {label:'Card No', get:r=>r.cardNo||'—'}, {label:'Part No', get:r=>r.partNo||'—'}, {label:'Part Name', get:r=>r.partName||'—'},
      {label:'Qty', get:r=>r.qty??'—', num:true}, {label:'Prev Stage', get:r=>r.prevStage||'—'}, {label:'Stage', get:r=>r.stage||'—'}, {label:'Next Stage', get:r=>r.nextStage||'—'},
      {label:'Issue Type', get:r=>r.issueType||'—'}, {label:'Subcontractor', get:r=>r.subcontractorName||'—'},
      {label:'Issue Date', get:r=>r.issueDate||'—', date:true}, {label:'Completion Date', get:r=>r.completionDate||'—', date:true}, {label:'Status', get:r=>r.status||'—'}
    ],
    cards:[
      {id:'all', icon:'🧾', title:'All Job Card Movements', desc:'Full append-only stage movement ledger for every Part Number.'},
      {id:'open', icon:'🟡', title:'Open', desc:'Movements still open at their current stage.', preset:{status:'Open'}},
      {id:'completed', icon:'✅', title:'Completed', desc:'Movements completed at their stage.', preset:{status:'Completed'}}
    ]
  },
  // WIP Report — Job Card Tracking's own "what's still in progress right now" view: every OPEN
  // Job Card ledger row (i.e. material that hasn't yet completed its current stage), stage-wise,
  // with how many days it has been sitting there. Deliberately scoped to status:'Open' at the
  // data source itself (not just a card preset) so "All WIP" always means ongoing/pending only —
  // Job Card Movement History remains the place to see the full open+completed ledger.
  jobCardWIP: {
    title:'WIP Report — Job Card Tracking', unitScoped:true, hasDate:true, hasCustomer:false, hasSupplier:false, hasPartNo:true, hasProduct:true, hasStatus:false,
    getRows:()=>DB.jobCards.filter(x=>reportUnitMatch(x.unit) && x.status==='Open'),
    filterFields:r=>({date:r.issueDate||'', customer:'', supplier:'', partNo:r.partNo||'', product:r.partName||'', status:''}),
    subTypes:{
      label:'Current Stage',
      getValue:r=>r.stage||'Unspecified',
      getOptions:()=>Array.from(new Set(DB.jobCards.filter(x=>x.status==='Open').map(r=>r.stage).filter(Boolean))).sort()
    },
    columns:[
      {label:'Card No', get:r=>r.cardNo||'—'}, {label:'Part No', get:r=>r.partNo||'—'}, {label:'Part Name', get:r=>r.partName||'—'},
      {label:'Qty', get:r=>r.qty??'—', num:true}, {label:'Prev Stage', get:r=>r.prevStage||'—'}, {label:'Current Stage', get:r=>r.stage||'—'}, {label:'Next Stage', get:r=>r.nextStage||'—'},
      {label:'Issue Type', get:r=>r.issueType||'—'}, {label:'Subcontractor', get:r=>r.subcontractorName||'—'}, {label:'Issue Date', get:r=>r.issueDate||'—', date:true},
      {label:'Days Pending', get:r=>{ if(!r.issueDate) return '—'; const ms = new Date(today()+'T00:00:00') - new Date(r.issueDate+'T00:00:00'); const d = Math.floor(ms/86400000); return d>=0?d:0; }, num:true}
    ],
    cards:[
      {id:'all', icon:'⏳', title:'All WIP (Open Job Cards)', desc:'Every Job Card currently in progress — nothing completed, nothing from Planning/Masters.'},
      {id:'stores', icon:'🏬', title:'In Stores — Awaiting Next Stage', desc:'Material sitting in Stores WIP, not yet issued onward.', preset:{subType:'Stores'}},
      {id:'production', icon:'⚙️', title:'In Production', desc:'Material currently issued to Production.', preset:{subType:'Production'}},
      {id:'subcontract', icon:'🏗️', title:'With Subcontractor', desc:'Material currently issued to a Subcontractor.', preset:{subType:'Subcontract'}},
      {id:'receivingInsp', icon:'🔬', title:'In Receiving Inspection', desc:'Subcontractor returns awaiting Pass/Hold/Fail.', preset:{subType:'Receiving Inspection'}},
      {id:'finalInsp', icon:'✅', title:'In Final Inspection', desc:'Production output awaiting Final Inspection sign-off.', preset:{subType:'Final Inspection'}}
    ]
  },
  // Custom-rendered report (see renderCustomerMaterialLedgerReport) — this stub only registers the
  // title/existence with the Reports engine so openModuleReports()/back-navigation work; the actual
  // table, date-range and Part No filters are entirely bespoke because Received/Dispatched/Rejected
  // must each be summed from a DIFFERENT date field (DC Date / Invoice Date / Production Start Date)
  // across THREE different source tables — something the generic single-date-field report engine
  // (used by every other module above) can't express.
  customerMaterialLedger: { title:'Customer Material Ledger' }
};
function filterReportRows(moduleId, rows){
  const cfg = REPORT_CONFIGS[moduleId];
  const f = reportFilters[moduleId] || blankReportFilter();
  return rows.filter(r=>{
    const ff = cfg.filterFields(r);
    if(cfg.hasDate && (f.dateFrom||f.dateTo)){
      const d = ff.date||'';
      if(f.dateFrom && (!d || d < f.dateFrom)) return false;
      if(f.dateTo && (!d || d > f.dateTo)) return false;
    }
    if(cfg.hasCustomer && f.customer && (ff.customer||'')!==f.customer) return false;
    if(cfg.hasSupplier && f.supplier && (ff.supplier||'')!==f.supplier) return false;
    if(cfg.hasPartNo && f.partNo && !(ff.partNo||'').toLowerCase().includes(f.partNo.toLowerCase())) return false;
    if(cfg.hasProduct && f.product && !(ff.product||'').toLowerCase().includes(f.product.toLowerCase())) return false;
    if(cfg.hasStatus && f.status && (ff.status||'')!==f.status) return false;
    if(cfg.subTypes && f.subType && cfg.subTypes.getValue(r)!==f.subType) return false;
    if(f.q){
      const hay = cfg.columns.map(c=>String(c.get(r)||'')).join(' ').toLowerCase();
      if(!hay.includes(f.q.toLowerCase())) return false;
    }
    return true;
  });
}
function getFilteredReportRows(moduleId){
  const cfg = REPORT_CONFIGS[moduleId];
  return filterReportRows(moduleId, cfg.getRows());
}
function renderModuleReports(main, moduleId){
  if(moduleId==='customerMaterialLedger'){ renderCustomerMaterialLedgerReport(main); return; }
  const cfg = REPORT_CONFIGS[moduleId];
  if(!cfg){ main.innerHTML = `<div class="topbar"><div><h2>Reports</h2></div></div><div class="panel"><div class="empty">Reports not available for this module.</div></div>`; return; }
  if(!reportFilters[moduleId]) reportFilters[moduleId] = blankReportFilter();
  // ---- Card-grid hub: when this module defines named report cards and none is open yet,
  // show the "folder" of report cards (screenshot-style) instead of jumping straight to a
  // filterable table. Clicking a card opens that specific report with its preset filters. ----
  if(cfg.cards && cfg.cards.length && !reportCardOpen){
    main.innerHTML = `
    <div class="topbar"><div><h2>📊 ${esc(cfg.title)} — Reports</h2></div></div>
    <div class="panel report-hub-panel" style="margin-top:12px;">
      <div class="report-hub-title">📁 ${esc(cfg.title)} Reports</div>
      <div class="report-hub-grid">
        ${cfg.cards.map(c=>`
        <div class="report-hub-card" onclick="openReportCard('${moduleId}','${c.id}')" role="button" tabindex="0">
          <div class="report-hub-card-icon">${c.icon||'📊'}</div>
          <div class="report-hub-card-body">
            <div class="report-hub-card-title">${esc(c.title)}</div>
            <div class="report-hub-card-desc">${esc(c.desc||'')}</div>
          </div>
          <div class="report-hub-card-arrow">›</div>
        </div>`).join('')}
      </div>
      <div class="rowactions" style="justify-content:flex-start; margin-top:12px;">
        <button class="btn ghost small" onclick="closeModuleReports()">← Back to ${esc(cfg.title)}</button>
      </div>
    </div>`;
    return;
  }
  const f = reportFilters[moduleId];
  const allRows = cfg.getRows();
  const filtered = filterReportRows(moduleId, allRows);
  const statuses = cfg.hasStatus ? Array.from(new Set(allRows.map(r=>cfg.filterFields(r).status).filter(Boolean))).sort() : [];
  const customers = cfg.hasCustomer ? Array.from(new Set([...(DB.customers||[]).map(c=>c.name), ...allRows.map(r=>cfg.filterFields(r).customer)].filter(Boolean))).sort() : [];
  const suppliers = cfg.hasSupplier ? Array.from(new Set([...(DB.suppliers||[]).map(c=>c.name), ...allRows.map(r=>cfg.filterFields(r).supplier)].filter(Boolean))).sort() : [];
  const activeCard = (cfg.cards && reportCardOpen) ? cfg.cards.find(c=>c.id===reportCardOpen) : null;
  const backTarget = (cfg.cards && cfg.cards.length) ? `closeReportCard()` : `closeModuleReports()`;
  const backLabel = (cfg.cards && cfg.cards.length) ? `← Back to ${esc(cfg.title)} Reports` : `← Back to ${esc(cfg.title)}`;
  main.innerHTML = `
    <div class="topbar"><div><h2>📊 ${esc(cfg.title)}${activeCard?' — '+esc(activeCard.title):' — Reports'}</h2></div></div>
    ${cfg.subTypes ? `
    <div class="subtabs" style="margin-top:12px;">
      <button class="${!f.subType?'active':''}" onclick="setReportFilter('${moduleId}','subType','')">📋 All ${esc(cfg.subTypes.label)}</button>
      ${cfg.subTypes.getOptions().map(o=>`<button class="${f.subType===o?'active':''}" onclick="setReportFilter('${moduleId}','subType','${esc(o)}')">${esc(o)}</button>`).join('')}
    </div>` : ''}
    <div class="panel reportFilterPanel" style="${cfg.subTypes?'':'margin-top:12px;'}">
      <h3>🔍 Filters</h3>
      <div class="frow g4">
        ${cfg.hasDate?`<div><label class="fl">Date From</label><input type="date" value="${esc(f.dateFrom)}" onchange="setReportFilter('${moduleId}','dateFrom',this.value)"></div>
        <div><label class="fl">Date To</label><input type="date" value="${esc(f.dateTo)}" onchange="setReportFilter('${moduleId}','dateTo',this.value)"></div>`:''}
        ${cfg.hasCustomer?`<div><label class="fl">Customer Wise</label><select onchange="setReportFilter('${moduleId}','customer',this.value)"><option value="">— all customers —</option>${customers.map(c=>`<option value="${esc(c)}" ${f.customer===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div>`:''}
        ${cfg.hasSupplier?`<div><label class="fl">Supplier Wise</label><select onchange="setReportFilter('${moduleId}','supplier',this.value)"><option value="">— all suppliers —</option>${suppliers.map(c=>`<option value="${esc(c)}" ${f.supplier===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div>`:''}
      </div>
      <div class="frow g4">
        ${cfg.hasPartNo?`<div><label class="fl">${esc(cfg.partNoLabel||'Part Number Wise')}</label><input placeholder="${esc(cfg.partNoPlaceholder||'Search part no.')}" value="${esc(f.partNo)}" oninput="setReportFilter('${moduleId}','partNo',this.value)"></div>`:''}
        ${cfg.hasProduct?`<div><label class="fl">${esc(cfg.productLabel||'Product Wise')}</label><input placeholder="${esc(cfg.productPlaceholder||'Search product / item')}" value="${esc(f.product)}" oninput="setReportFilter('${moduleId}','product',this.value)"></div>`:''}
        ${cfg.hasStatus?`<div><label class="fl">Status Wise</label><select onchange="setReportFilter('${moduleId}','status',this.value)"><option value="">— all status —</option>${statuses.map(s=>`<option value="${esc(s)}" ${f.status===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>`:''}
        <div><label class="fl">🔎 Search (any field)</label><input placeholder="Quick search across all columns..." value="${esc(f.q)}" oninput="setReportFilter('${moduleId}','q',this.value)"></div>
      </div>
      <div class="rowactions" style="justify-content:flex-start; margin-top:6px;">
        <button class="btn ghost small" onclick="clearReportFilters('${moduleId}')">✕ Clear Filters</button>
        <button class="btn ghost small" onclick="${backTarget}">${backLabel}</button>
      </div>
    </div>
    <div class="panel">
      <div class="section-total"><h3>${esc(cfg.title)}${f.subType?' — '+esc(f.subType):''} Report <span class="hint">${filtered.length} of ${allRows.length} record(s)</span></h3>
        <div class="rowactions" style="justify-content:flex-end; gap:8px;">
          <button class="btn ghost small" onclick="printModuleReport('${moduleId}')">🖨 Print</button>
          <button class="btn ghost small" onclick="printModuleReport('${moduleId}',true)">📄 PDF Export</button>
        </div>
      </div>
      <div class="report-table-wrap">
        <table class="report-table${cfg.printLandscape?' report-table-wide':''}">
          <thead><tr>${cfg.columns.map(c=>`<th${c.num?' class="num"':''}>${esc(c.label)}</th>`).join('')}</tr></thead>
          <tbody>${filtered.length? filtered.map(r=>`<tr>${cfg.columns.map(c=>{ const v=c.get(r); const cls=c.num?' class="num"':''; if(c.date) return `<td${cls}>${fmtDate(v)}</td>`; return `<td${cls}>${esc(v===null||v===undefined||v===''?'—':String(v))}</td>`; }).join('')}</tr>`).join('') : `<tr><td colspan="${cfg.columns.length}"><div class="empty">No records match the selected filters.</div></td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}
function printModuleReport(moduleId, isPDF){
  const cfg = REPORT_CONFIGS[moduleId];
  if(!cfg) return;
  const rows = getFilteredReportRows(moduleId);
  const headers = cfg.columns.map(c=>c.label);
  // Numeric columns (c.num) get a right-aligned <th>/<td class="num"> so figures line up in
  // clean columns on the printout, matching the on-screen report table.
  const theadHtml = '<tr>'+cfg.columns.map(c=>`<th${c.num?' class="num"':''}>${esc(c.label)}</th>`).join('')+'</tr>';
  const printRows = rows.map(r=>cfg.columns.map(c=>{ const v=c.get(r); if(c.date) return fmtDate(v); return esc(v===null||v===undefined||v===''?'—':String(v)); }));
  const bodyHtml = printRows.length ? printRows.map(r=>'<tr>'+r.map((c,i)=>`<td${cfg.columns[i].num?' class="num"':''}>${c}</td>`).join('')+'</tr>').join('')
    : `<tr><td colspan="${headers.length}" style="text-align:center; padding:12px; color:#888;">No records</td></tr>`;
  // Explicit per-column widths (when configured) keep wide text columns from squeezing narrow
  // numeric ones on landscape printouts with many columns.
  const colgroupHtml = cfg.colWidths ? '<colgroup>'+cfg.colWidths.map(w=>`<col style="width:${w}%;">`).join('')+'</colgroup>' : '';
  const f = reportFilters[moduleId] || blankReportFilter();
  const title = cfg.title + (cfg.subTypes && f.subType ? ' — '+f.subType : '') + ' Report';
  printReport(title, headers, printRows, {theadHtml, bodyHtml, colgroupHtml, orientation: cfg.printLandscape ? 'landscape' : undefined,
    barLeft: cfg.unitScoped?`Unit: ${esc(reportScopeLabel())}`:'Scope: Common Data (All Units)', barRight:`Total Records: ${rows.length}`});
  if(isPDF) setTimeout(()=>toast('In the print dialog, choose "Save as PDF" as the destination'), 500);
}
function uid(prefix){
  DB.counters[prefix] = (DB.counters[prefix]||0)+1;
  return prefix.toUpperCase()+'-'+String(DB.counters[prefix]).padStart(4,'0');
}
// Document-number generator for Quotation / Sales / Purchase / Invoice etc: scans the
// records ACTUALLY SAVED so far and returns (highest used sequence + 1). Because it reads
// straight from saved data rather than a running counter, a number that was only previewed
// on an open "New ..." form, or that belonged to a cancelled/deleted record, is never
// consumed — the next call simply reuses it. Call this fresh each time a "New ..." form is
// rendered (do not cache/store the result until the record is actually saved).
function nextSeqNo(records, field, prefix, pad){
  pad = pad || 4;
  let max = 0;
  const re = new RegExp('^'+prefix.toUpperCase()+'-0*(\\d+)');
  (records||[]).forEach(r=>{
    const v = r && r[field];
    if(!v) return;
    const m = String(v).match(re);
    if(m){ const n = parseInt(m[1],10); if(n>max) max = n; }
  });
  return prefix.toUpperCase()+'-'+String(max+1).padStart(pad,'0');
}
// Indian Financial Year label for a given date, e.g. 2025-07-14 -> "25-26" (Apr 2025 - Mar 2026).
// Falls back to today's date if none supplied / unparsable.
function fyLabel(dateStr){
  const d = dateStr ? new Date(dateStr) : new Date();
  if(isNaN(d.getTime())) return fyLabel();
  const y = d.getFullYear(), m = d.getMonth()+1; // 1-12
  const startY = m>=4 ? y : y-1;
  const endY = startY+1;
  return String(startY).slice(-2)+'-'+String(endY).slice(-2);
}
// Next Sales/Job Work Invoice number: format "<seq> (<FY>)", e.g. "1024 (25-26)".
// The running <seq> is ONE shared counter across BOTH Sales and Job Work invoices (DB.sales),
// taken as the highest number seen so far + 1 — regardless of which FY bracket it carries —
// so it keeps incrementing continuously even across financial years. The FY bracket itself
// reflects the invoice date being raised for.
function nextInvNo(dateStr){
  let max = 0;
  (DB.sales||[]).forEach(s=>{
    const v = s && s.invNo;
    if(!v) return;
    const m = String(v).match(/^\s*(\d+)/);
    if(m){ const n = parseInt(m[1],10); if(n>max) max = n; }
  });
  return (max+1)+' ('+fyLabel(dateStr)+')';
}
// Next Job Work Invoice number — UNIT-WISE: unlike nextInvNo() (one shared counter across all
// Sales + Job Work invoices), Job Work Invoices run two entirely separate sequences, one per
// Unit:
//   Unit-1 → plain numeric series, e.g. "126 (26-27)"
//   Unit-2 → "S-" prefixed series, e.g. "S-126 (26-27)" — its own independent count, NOT the
//            same number as Unit-1 just relabelled.
// Only DB.sales rows with invKind==='labour' AND unit===the given unit are scanned for the
// highest already-saved seq (+1) — draft rows (invNo null) are automatically skipped, and the
// FY bracket reflects the invoice date being raised.
function labourInvPrefix(unit){ return unit==='Unit-2' ? 'S-' : ''; }
function nextLabourInvNo(dateStr, unit){
  const prefix = labourInvPrefix(unit);
  let max = 0;
  const re = unit==='Unit-2' ? /^\s*S-\s*(\d+)/i : /^\s*(\d+)/;
  (DB.sales||[]).forEach(s=>{
    if(!s || s.invKind!=='labour' || s.unit!==unit) return;
    const v = s.invNo;
    if(!v) return;
    const m = String(v).match(re);
    if(m){ const n = parseInt(m[1],10); if(n>max) max = n; }
  });
  return prefix+(max+1)+' ('+fyLabel(dateStr)+')';
}
function fmtMoney(n){ return '₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2}); }
// Always-2-decimal money formatter (e.g. "₹1,999.99" or "₹2,000.00", never "₹2,000") — used for
// the Sales / Job Work Invoice item row's Rate & Total fields so the figures are consistently
// rounded to the nearest paisa instead of showing 4+ raw decimal places or dropping to 0 decimals.
function fmtMoney2(n){ return '₹'+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2, maximumFractionDigits:2}); }
// Job Work Invoice — Delivery Challan No. dropdown: lists the Customer Delivery Challans already
// logged for this customer under Job Work Stock → Customer Material Inward (DC Receipt), i.e.
// DB.labourMaterialReceipt. Deduped by DC No. (a customer often sends several part lines on one
// DC), keeping the latest DC Date per number, sorted most-recent-first.
// Strictly scoped to the selected Part No — only DC's that actually carried that exact Part No
// are shown. No fallback to "all DC's for the customer": if none of the customer's DC's were
// logged against this Part No, the picker shows none rather than unrelated DC's.
function labourInvoiceDcOptionsHtml(customerId, selectedDcNo, finPartNo){
  if(!customerId) return '<option value="">— select a Customer first —</option>';
  const partKey = (finPartNo||'').trim().toLowerCase();
  if(!partKey) return '<option value="">— select a Part No first —</option>';
  const map = new Map();
  DB.labourMaterialReceipt.filter(r=>r.customerId===customerId && r.dcNo
    && (r.finPartNo||'').trim().toLowerCase()===partKey).forEach(r=>{
    const cur = map.get(r.dcNo);
    if(!cur || (r.dcDate||'') > (cur.dcDate||'')) map.set(r.dcNo, r);
  });
  const list = Array.from(map.values()).sort((a,b)=>(b.dcDate||'').localeCompare(a.dcDate||''));
  if(!list.length) return '<option value="">— no Delivery Challan found for this Part No —</option>';
  return `<option value="">— select Delivery Challan No. —</option>` + list.map(r=>
    `<option value="${esc(r.dcNo)}" ${r.dcNo===selectedDcNo?'selected':''}>${esc(r.dcNo)}${r.dcDate?' — '+fmtDate(r.dcDate):''}</option>`).join('');
}
// Called when the user picks a Delivery Challan from the header dropdown — auto-fills the
// read-only DC No. display and stamps that DC No. onto every current item row so it's saved
// with the invoice and carried through to the printed Tax Invoice's "D.C No" note.
function onSaleDcSelect(selEl){
  const dcNo = selEl.value;
  const displayEl = document.getElementById('slDcNo'); if(displayEl) displayEl.value = dcNo;
  syncSaleItemRows();
  saleItemRows.forEach(r=>{ r.dcNo = dcNo; });
}
function amountInWords(num){
  num = Math.round(Number(num)||0);
  if(num===0) return 'Zero Rupees Only';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function two(n){ if(n<20) return ones[n]; return tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:''); }
  function three(n){ if(n>99) return ones[Math.floor(n/100)]+' Hundred'+(n%100?' '+two(n%100):''); return two(n); }
  const crore = Math.floor(num/10000000); num%=10000000;
  const lakh = Math.floor(num/100000); num%=100000;
  const thousand = Math.floor(num/1000); num%=1000;
  const hundred = num;
  let parts = [];
  if(crore) parts.push(three(crore)+' Crore');
  if(lakh) parts.push(three(lakh)+' Lakh');
  if(thousand) parts.push(three(thousand)+' Thousand');
  if(hundred) parts.push(three(hundred));
  return (parts.join(' ')||'Zero')+' Rupees Only';
}
function today(){ return new Date().toISOString().slice(0,10); }
function fmtDateTime(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  if(isNaN(d)) return '—';
  return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
}
// "Xh Ym" session-duration formatter used by the LoginLog — given two ISO timestamps, returns
// the elapsed wall-clock time between them (never negative; a logout somehow recorded before
// its login simply reads "0m").
function fmtSessionDuration(loginIso, logoutIso){
  const start = new Date(loginIso), end = new Date(logoutIso);
  if(isNaN(start) || isNaN(end)) return '';
  const mins = Math.max(0, Math.round((end-start)/60000));
  const h = Math.floor(mins/60), m = mins%60;
  return h>0 ? `${h}h ${m}m` : `${m}m`;
}
/* Raw Material Market Price History (Purchase → Item Master) —
   Whenever Today's Market Price is changed, the previous value is archived (not overwritten)
   with Previous Price, Effective Date, Updated Date & Time, and Updated By. Only the latest
   price (it.marketPrice) is ever used as the current/active price — e.g. when a new PO fetches
   the market price. Existing POs store their own rate at creation time and are never affected
   by later market price changes or by this history. */
function ensureMarketPriceHistory(it){
  if(!it) return [];
  if(!Array.isArray(it.marketPriceHistory)) it.marketPriceHistory = [];
  return it.marketPriceHistory;
}
// Call this instead of setting it.marketPrice directly. effectiveDate defaults to today.
function updateItemMarketPrice(it, newPrice, effectiveDate){
  if(!it) return;
  const price = parseFloat(newPrice)||0;
  const effDate = effectiveDate || today();
  const oldPrice = parseFloat(it.marketPrice)||0;
  // Only archive + log a history entry if the price actually changed (or this is the very
  // first price being set) — re-saving the same price shouldn't clutter the history.
  if(price !== oldPrice || !ensureMarketPriceHistory(it).length){
    ensureMarketPriceHistory(it).push({
      previousPrice: oldPrice,
      effectiveDate: it.marketPriceEffDate || effDate,
      updatedAt: new Date().toISOString(),
      updatedBy: (currentUser && currentUser.name) || 'System'
    });
  }
  it.marketPrice = price;
  it.marketPriceEffDate = effDate;
}
function viewItemPriceHistory(id){
  viewingItemPriceHistoryId = id;
  render();
}
function closeItemPriceHistory(){
  viewingItemPriceHistoryId = null;
  render();
}
function itemPriceHistoryPanelHtml(){
  const it = DB.items.find(x=>x.id===viewingItemPriceHistoryId);
  if(!it) return '';
  const hist = ensureMarketPriceHistory(it).slice().reverse(); // most recent change first
  return `
    <div class="panel">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3 style="margin:0;">Price History — ${esc(it.code)} <span class="hint">${esc(it.name)}</span></h3>
        <button class="btn ghost small" onclick="closeItemPriceHistory()">← Back</button>
      </div>
      <div class="cards" style="margin-top:12px;">
        <div class="card"><div class="v">${fmtMoney(it.marketPrice)}</div><div class="l">Current Active Price</div></div>
        <div class="card"><div class="v">${fmtDate(it.marketPriceEffDate)||'—'}</div><div class="l">Effective Date</div></div>
      </div>
      <div class="tw" style="margin-top:14px;"><table class="insp">
        <tr><th>Previous Price (₹)</th><th>Effective Date</th><th>Updated Date &amp; Time</th><th>Updated By</th></tr>
        ${hist.map(h=>`<tr><td>${fmtMoney(h.previousPrice)}</td><td>${fmtDate(h.effectiveDate)||'—'}</td><td>${fmtDateTime(h.updatedAt)}</td><td>${esc(h.updatedBy)||'—'}</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty">No previous price changes recorded yet.</div></td></tr>'}
      </table></div>
    </div>`;
}
/* Display-only date formatter — converts a stored ISO date (YYYY-MM-DD) to DD-MM-YYYY
   for on-screen/print display. Underlying storage/sorting/filtering always stays ISO.
   This is the single formatter used everywhere a stored date is shown to the user —
   report tables, printed reports, record view/detail screens, and list/card views —
   per the ERP-wide DD-MM-YYYY display standard (e.g. 25-07-2026). */
function fmtDate(iso){
  if(!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if(!m) return esc(iso);
  return `${m[3]}-${m[2]}-${m[1]}`;
}
const fmtDMY = fmtDate; // legacy alias — kept so existing call sites keep working
/* Customer-wise colour coding — a stable colour per customer name (same customer always
   gets the same colour, across renders and modules), used as an accent stripe / badge so
   records are visually groupable by customer at a glance. */
const CUSTOMER_COLOR_PALETTE = ['#8fb4d4','#e8a355','#8fd4a8','#d48fc9','#d4c88f','#8fd4d0','#d48f8f','#a8a0e8','#c9d48f','#8fa0d4'];
function customerColor(name){
  const key = (name||'').trim().toLowerCase();
  if(!key) return '#5a6270';
  let hash = 0;
  for(let i=0;i<key.length;i++){ hash = ((hash<<5)-hash + key.charCodeAt(i))|0; }
  return CUSTOMER_COLOR_PALETTE[Math.abs(hash) % CUSTOMER_COLOR_PALETTE.length];
}
function esc(s){ return (s||'').toString().replace(/[<>&"']/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c])); }
