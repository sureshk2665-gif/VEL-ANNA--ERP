/* ---------------- QUOTATION ---------------- */
// Others Cost — scalable, config-driven list of optional cost items (renamed from the old
// single "Fixturing Cost" field). To add a new cost category in future, just add an entry
// to OTHERS_COST_TYPES below — no database/schema change needed, since each quote item just
// stores an array of {key,label,enabled,amount,remarks}.
const OTHERS_COST_TYPES = [
  {key:'rustOil', label:'Rust Oil'},
  {key:'heatTreatment', label:'Heat Treatment'},
  {key:'plating', label:'Plating'},
  {key:'coating', label:'Coating'},
  {key:'deburring', label:'Deburring Cost'},
  {key:'other', label:'Other (Custom)'}
];
function blankOthersCost(){ return OTHERS_COST_TYPES.map(t=>({key:t.key, label:t.label, enabled:false, amount:0, remarks:'', customLabel:''})); }
// Ensures an item has a full, up-to-date Others Cost array — adds entries for any cost
// types introduced after the quote was created, and migrates the legacy single Fixturing
// Cost value (if present) into the "Other (Custom)" slot the first time it's touched.
function ensureOthersCost(it){
  if(!it) return [];
  if(!Array.isArray(it.othersCost)) it.othersCost = [];
  // Migrate legacy Grinding / Thread Rolling entries (now moved into Machining Cost as
  // Grinding Cost / Rolling Cost) the first time this item is touched after the change.
  if(!it._grindRollMigrated){
    const legacyGrind = it.othersCost.find(x=>x.key==='grinding');
    const legacyRoll = it.othersCost.find(x=>x.key==='threadRolling');
    if(legacyGrind && legacyGrind.enabled && !(parseFloat(it.mcwGrindingCost)||0)) it.mcwGrindingCost = legacyGrind.amount;
    if(legacyRoll && legacyRoll.enabled && !(parseFloat(it.mcwRollingCost)||0)) it.mcwRollingCost = legacyRoll.amount;
    it._grindRollMigrated = true;
  }
  // Drop any Others Cost entries that are no longer in the current OTHERS_COST_TYPES list
  // (e.g. the retired Grinding / Thread Rolling keys) so they don't linger in old quotes.
  const validKeys = OTHERS_COST_TYPES.map(t=>t.key);
  it.othersCost = it.othersCost.filter(x=>validKeys.includes(x.key));
  OTHERS_COST_TYPES.forEach(t=>{
    if(!it.othersCost.find(x=>x.key===t.key)) it.othersCost.push({key:t.key, label:t.label, enabled:false, amount:0, remarks:'', customLabel:''});
  });
  if((parseFloat(it.fixturing)||0)>0 && !it._fixMigrated){
    const oth = it.othersCost.find(x=>x.key==='other');
    if(oth && !oth.enabled){ oth.enabled=true; oth.amount=it.fixturing; oth.customLabel='Fixturing Cost'; oth.remarks='Migrated from legacy Fixturing Cost'; }
  }
  it._fixMigrated = true;
  return it.othersCost;
}
function othersCostLabel(o){ return o.key==='other' ? (o.customLabel||'').trim()||'Other (Custom)' : o.label; }
function sumOthersCost(it){ return ensureOthersCost(it).filter(o=>o.enabled).reduce((a,o)=>a+(parseFloat(o.amount)||0),0); }
function selectedOthersCost(it){ return ensureOthersCost(it).filter(o=>o.enabled); }
function updateOthersCostField(i,key,field,val){
  const it = quoteItemsDraft[i]; if(!it) return;
  ensureOthersCost(it);
  const item = it.othersCost.find(x=>x.key===key); if(!item) return;
  item[field] = val;
  if(field==='enabled') renderQuoteItemRows(); else refreshQuoteCalcs();
}
// Development Cost — only relevant for parts that require development charges (fixtures,
// tooling, gauges, etc). Kept as its own opt-in section (devCostApplicable toggle) so
// standard production parts never show it, in the quotation screen or in print/PDF.
const DEV_COST_PRESETS = ['CNC Fixture','VMC Fixture','CLC Fixture','Inspection Fixture','Tooling','Gauge'];
function blankDevCostItem(){ return {id:'dc'+Math.random().toString(36).slice(2,9), name:'', qty:1, amount:0}; }
function ensureDevCost(it){
  if(!it) return [];
  if(!Array.isArray(it.devCostItems)) it.devCostItems = [];
  return it.devCostItems;
}
function sumDevCost(it){ return ensureDevCost(it).reduce((a,d)=>a+((parseFloat(d.qty)||0)*(parseFloat(d.amount)||0)),0); }
function addDevCostItem(i){
  const it = quoteItemsDraft[i]; if(!it) return;
  ensureDevCost(it).push(blankDevCostItem());
  renderQuoteItemRows();
}
function removeDevCostItem(i,j){
  const it = quoteItemsDraft[i]; if(!it) return;
  ensureDevCost(it).splice(j,1);
  renderQuoteItemRows();
}
function updateDevCostItem(i,j,field,val){
  const it = quoteItemsDraft[i]; if(!it) return;
  const d = ensureDevCost(it)[j]; if(!d) return;
  d[field] = val;
  refreshQuoteCalcs();
}
// Development Item Name picker — same fdd (dropdown list) design as the existing
// Finished Part No picker: click to open a list of presets, or "Other (type manually)"
// to clear it and type a custom name in the manual input below.
function selectDevCostItemName(i,j,name,el){
  const it = quoteItemsDraft[i]; if(!it) return;
  const d = ensureDevCost(it)[j]; if(!d) return;
  d.name = (name==='__other__') ? '' : name;
  const list = document.getElementById(`devNameList${i}_${j}`);
  if(list) list.style.display = 'none';
  renderQuoteItemRows();
}
function syncDevNameDisplay(i,j){
  const disp = document.getElementById(`devNameDisplay${i}_${j}`);
  const it = quoteItemsDraft[i]; if(!it || !disp) return;
  const d = ensureDevCost(it)[j]; if(!d) return;
  disp.value = d.name;
}
function updateDevCostApplicable(i,val){
  const it = quoteItemsDraft[i]; if(!it) return;
  it.devCostApplicable = val;
  if(val && ensureDevCost(it).length===0) it.devCostItems.push(blankDevCostItem());
  renderQuoteItemRows();
}
function devCostSectionHtml(it,i){
  if(!it.devCostApplicable) return '';
  const items = ensureDevCost(it);
  const rows = items.map((d,j)=>{
    const ddId = `devNameDD${i}_${j}`;
    const listId = `devNameList${i}_${j}`;
    const dispId = `devNameDisplay${i}_${j}`;
    return `
    <div class="dc-row" style="display:grid; grid-template-columns:1fr 90px 120px 30px; gap:6px; align-items:start; padding:3px 4px; border-bottom:1px dashed var(--line-soft,#d9e0e6);">
      <div>
        <div class="fdd" id="${ddId}">
          <input type="text" id="${dispId}" readonly value="${esc(d.name)}" placeholder="— pick development item —" onclick="toggleFddList('${listId}')">
          <div class="fdd-list" id="${listId}" style="display:none;">
            <div class="fdd-item" onclick="selectDevCostItemName(${i},${j},'',this)">— pick development item —</div>
            ${DEV_COST_PRESETS.map(p=>`<div class="fdd-item" onclick="selectDevCostItemName(${i},${j},'${esc(p)}',this)">${esc(p)}</div>`).join('')}
            <div class="fdd-item" onclick="selectDevCostItemName(${i},${j},'__other__',this)">Other (type manually)</div>
          </div>
        </div>
        <input type="text" style="margin-top:6px;" value="${esc(d.name)}" placeholder="e.g. Custom Fixture" oninput="updateDevCostItem(${i},${j},'name',this.value); syncDevNameDisplay(${i},${j})">
      </div>
      <input type="number" step="1" placeholder="Qty" value="${d.qty===0||d.qty?d.qty:''}" oninput="updateDevCostItem(${i},${j},'qty',this.value)">
      <input type="number" step="0.01" placeholder="Cost Amount (₹)" value="${d.amount===0||d.amount?d.amount:''}" oninput="updateDevCostItem(${i},${j},'amount',this.value)">
      <button type="button" class="btn danger small" title="Remove" onclick="removeDevCostItem(${i},${j})">✕</button>
    </div>`;
  }).join('');
  return `
    <div class="dc-box" style="margin-top:8px; border:1px solid #ddd0f0; border-left:4px solid #7c4dbe; border-radius:4px; padding:6px 10px; background:#faf8fe;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
        <span class="fl" style="margin:0; color:#6935a3; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; font-size:11px;">🛠 Development Cost</span>
        <span style="font-size:11px; font-weight:700; color:#6935a3;">Total: ${fmtMoney(sumDevCost(it))}</span>
      </div>
      <div class="dc-rows">${rows || '<div class="empty" style="padding:6px 0;">No development cost items yet.</div>'}</div>
      <button type="button" class="btn ghost small" style="margin-top:6px;" onclick="addDevCostItem(${i})">➕ Add New</button>
    </div>`;
}
// Looks up the Production Location mapped for this Finished Part No in Product Development
// (Bar Mapping / Forging Mapping — DB.bom), and resolves it to a Unit. This is the SALES-side
// counterpart of labourMappingLocationFor()/resolveLabourUnit() above.
function bomLocationFor(finPartNo){
  const key = (finPartNo||'').trim().toLowerCase();
  if(!key) return '';
  const b = DB.bom.find(x=>(x.finPartNo||'').trim().toLowerCase()===key && x.prodLocation);
  return b ? b.prodLocation : '';
}
function resolveSalesPartUnit(finPartNo){
  return prodLocationToUnit(bomLocationFor(finPartNo));
}
function blankMcwOpRow(){ return {q:'', a:''}; } // q = Quotation Cycle Time (sec), a = Actual Cycle Time (sec)
// Optional convenience PREFILL ONLY — if this Part No already has a BOM Mapping on file, its
// Material/Shape/Size/Grade/Density are offered as a starting point so the person quoting
// doesn't have to retype what's already known. Nothing here is required: every field below is
// fully editable and usable even when no match is found (see quoteItemRowHtml / recalcQuoteDims).
function rawMaterialDimsForFinPart(finPartNo){
  const key = (finPartNo||'').trim().toLowerCase();
  const empty = {found:false, material:'', shape:'', size:'', grade:'', density:'', legacyVqPrice:0, purPartNo:''};
  if(!key) return empty;
  const bom = DB.bom.find(b=>b.mapType==='BAR' && (b.finPartNo||'').trim().toLowerCase()===key && b.purPartNo);
  if(!bom) return empty;
  const item = DB.items.find(it=>it.type==='BAR' && (it.code||'').trim().toLowerCase()===(bom.purPartNo||'').trim().toLowerCase());
  return {
    found:true, material:bom.material||'', shape:bom.shape||'', size:bom.size||'', grade:bom.grade||'',
    density:bom.density||defaultDensityForMaterial(bom.material), legacyVqPrice: item?(parseFloat(item.vqPrice)||0):0, purPartNo:bom.purPartNo||''
  };
}
// Computes/refreshes a quote item's Piece Weight from whatever Material/Shape/Size/Density/Cut
// Length are currently entered ON THIS ITEM — entirely self-contained, no lookup into Product
// Development or Purchase required — then re-derives the Raw Material Cost hint from Cut Length
// × VIPL Quotation Price.
function recalcQuoteDims(i){
  const it = quoteItemsDraft[i];
  if(!it) return;
  const get = id=>{ const el=document.getElementById(id+i); return el?el.value:''; };
  const material = get('qiMaterial'), shape = get('qiShape'), size = get('qiSize'), grade = get('qiGrade');
  const cutLength = get('qiCutLength'), vqPrice = get('qiVqPrice');
  // Density is NEVER typed — it always follows Material Name → Material Grade, straight from the
  // Material Grade master (densityForMaterialGrade), and the Density field stays read-only.
  const density = grade ? densityForMaterialGrade(material, grade) : defaultDensityForMaterial(material);
  const densEl = document.getElementById('qiDensity'+i);
  if(densEl) densEl.value = density;
  const pwEl = document.getElementById('qiPieceWeight'+i);
  const pieceWeight = calcBarPieceWeightKg(shape, size, density, cutLength);
  Object.assign(it, {rmMaterial:material, rmShape:shape, rmSize:size, rmGrade:grade, rmDensity:density, cutLength, vqPrice, pieceWeight});
  if(pwEl) pwEl.value = pieceWeight || 0;
  const refHintEl = document.getElementById('qiVqPriceHint'+i);
  if(refHintEl){
    const ref = latestPurchasePriceForMaterialGrade(material, grade);
    if(ref){
      refHintEl.className = 'purchase-ref-hint';
      refHintEl.innerHTML = `📎 Latest Price: <span style="white-space:nowrap;">₹${ref.price}/Kg</span> | <span style="white-space:nowrap;">Date: ${ref.date?fmtDate(ref.date):'—'}</span>`;
    } else {
      refHintEl.className = 'purchase-ref-hint empty';
      refHintEl.textContent = '📎 No purchase entry found for this Material/Grade yet';
    }
  }
  const hintEl = document.getElementById('qiRawMatHint'+i);
  const rate = parseFloat(vqPrice)||0;
  if(rate || pieceWeight){
    // Raw Material Cost is now fully automatic: whenever Cut Length / Material Cost per Kg /
    // dimensions change, it recomputes and overwrites the field itself (no manual "Recalc" step).
    const cost = Math.round(rate*pieceWeight*100)/100;
    it.rawMat = cost;
    const rawMatEl = document.getElementById('qiRawMat'+i);
    if(rawMatEl) rawMatEl.value = cost;
  }
  if(hintEl){
    hintEl.textContent = (rate || pieceWeight) ? `= Material Cost per Kg ₹${rate} × Piece Wt ${pieceWeight} kg (auto-updates)` : 'Enter dimensions & Material Cost per Kg above';
  }
  refreshQuoteCalcs();
}
// Material Name changed → the Material Grade list is specific to that Material, so rebuild its
// options (clearing any grade that no longer applies) before recalculating Density/Piece Weight.
function onQuoteDimsMaterialChange(i){
  const matEl = document.getElementById('qiMaterial'+i);
  const gradeEl = document.getElementById('qiGrade'+i);
  if(matEl && gradeEl){
    const stillValid = allGradesForMaterial(matEl.value).some(g=>g.grade===gradeEl.value);
    gradeEl.innerHTML = materialGradeOptionsHtml(matEl.value, stillValid?gradeEl.value:'');
  }
  recalcQuoteDims(i);
}
function onQuoteSizeSelChange(i){
  const sel = document.getElementById('qiSizeSel'+i);
  const inp = document.getElementById('qiSize'+i);
  if(!sel || !inp) return;
  if(sel.value==='__other__'){ inp.style.display='block'; inp.value=''; inp.focus(); }
  else{ inp.style.display='none'; inp.value = sel.value; }
  recalcQuoteDims(i);
}
function blankQuoteItem(){ return {id:'qi'+Math.random().toString(36).slice(2,9), mapType:'', partNo:'', partName:'', qty:1, moqQty:1, rawMat:0, machining:0, othersCost:blankOthersCost(), devCostApplicable:false, devCostItems:[], adminPct:4, invPct:2, packPct:1, marginPct:10, transPct:3,
  // Dimensions & Quotation Calc — fully self-contained on the quote item: Material/Shape/Size/
  // Grade/Density/Cut Length/Material Cost per Kg are all entered right here, with no dependency
  // on Product Development or Purchase having anything defined first.
  rmMaterial:'', rmShape:'', rmSize:'', rmGrade:'', rmDensity:'', cutLength:'', vqPrice:'', pieceWeight:0,
  // Machining Cost Working — mirrors the Job Work Quotation's CNC/VMC cycle-time cost model,
  // but uses Efficiency % (instead of Profit %) to adjust the computed cost.
  mcwCncRate:5, mcwVmcRate:7, mcwEffPct:85, mcwNegoPct:0, mcwCuttingCost:0, mcwGrindingCost:0, mcwRollingCost:0,
  // CNC / VMC Operation Cost rows — dynamic list. Only ONE row is shown by default when the
  // table first opens for a new item; use "Add Operation Row" to add as many more as needed.
  // Each row carries BOTH a Quotation Cycle Time and an Actual (shop-floor) Cycle Time, kept
  // fully separate: Quotation values drive the Quotation cost math below; Actual values are
  // the single source of truth handed to the Production module (Production Norms / Machine
  // Capacity Report).
  mcwCncOps:[blankMcwOpRow()],
  mcwVmcOps:[blankMcwOpRow()]}; }
// Back-compat: older saved quotations only have flat mcwCnc1..5 / mcwVmc1..5 fields (single
// Quotation-only cycle time, no Actual). This migrates any such item in-place to the new
// dynamic mcwCncOps/mcwVmcOps row model — keeping only the operation slots that actually had
// a value, and mirroring that existing Quotation cycle time into the Actual column too, so an
// already-created part never shows blank Quotation/Actual fields. Newly added rows afterwards
// still start fully blank in both columns, as normal. This backfill runs at most once per item
// (tracked via _mcwActualSeeded), so it never overwrites an Actual value the user later clears
// on purpose. Always call before reading mcw ops.
function ensureMcwOps(it){
  // Detect old saved items merged with blankQuoteItem() defaults: blankQuoteItem() already
  // supplies a trivial one-row blank mcwCncOps/mcwVmcOps array, so a plain Array.isArray()
  // check below would wrongly treat that as "already migrated" and skip pulling in the real
  // legacy mcwCnc1..5/mcwVmc1..5 values — leaving Quotation AND Actual both blank. Treat a
  // single all-blank row as "not yet migrated" too, so the flat-field migration still runs.
  const isTrivialBlank = arr => Array.isArray(arr) && arr.length===1 && !(arr[0].q===0||!!arr[0].q) && !(arr[0].a===0||!!arr[0].a);
  if(!Array.isArray(it.mcwCncOps) || isTrivialBlank(it.mcwCncOps)){
    const filled = [1,2,3,4,5].map(n=>it['mcwCnc'+n]).filter(v=>v===0||!!v);
    if(filled.length) it.mcwCncOps = filled.map(v=>({q:v, a:v}));
    else if(!Array.isArray(it.mcwCncOps)) it.mcwCncOps = [blankMcwOpRow()];
  }
  if(!Array.isArray(it.mcwVmcOps) || isTrivialBlank(it.mcwVmcOps)){
    const filled = [1,2,3,4,5].map(n=>it['mcwVmc'+n]).filter(v=>v===0||!!v);
    if(filled.length) it.mcwVmcOps = filled.map(v=>({q:v, a:v}));
    else if(!Array.isArray(it.mcwVmcOps)) it.mcwVmcOps = [blankMcwOpRow()];
  }
  if(!it.mcwCncOps.length) it.mcwCncOps.push(blankMcwOpRow());
  if(!it.mcwVmcOps.length) it.mcwVmcOps.push(blankMcwOpRow());
  // One-time self-heal for items that already had the new mcwCncOps/mcwVmcOps arrays (e.g.
  // saved by an earlier build of this table) but ended up with an existing Quotation Cycle
  // Time and a blank Actual Cycle Time — mirror Quotation into Actual for those rows once,
  // then never touch it again.
  if(!it._mcwActualSeeded){
    it.mcwCncOps.forEach(r=>{ if((r.q===0||!!r.q) && !(r.a===0||!!r.a)) r.a = r.q; });
    it.mcwVmcOps.forEach(r=>{ if((r.q===0||!!r.q) && !(r.a===0||!!r.a)) r.a = r.q; });
    it._mcwActualSeeded = true;
  }
  return it;
}
function qItemLabel(it){
  const pn=(it.partNo||'').trim(), nm=(it.partName||it.desc||'').trim();
  return pn && nm ? `${pn} — ${nm}` : (pn||nm);
}
// Single canonical "Production Location" master — see PRODUCTION_LOCATIONS above. Returns
// exactly the two standardized entries so every module offers the identical list; no longer
// derived per-module from whatever Machine Master happens to contain, which was how stray
// duplicate/misspelled Production Location values crept in before.
function prodLocationOptionsList(){
  return PRODUCTION_LOCATIONS.slice();
}
/* ===== Machine Master's own bare shop-floor location (STANDARD_LOCATIONS) is a separate,
   simpler picker from the "Production Location" master above (PRODUCTION_LOCATIONS) — this
   one is just the physical spot within a machine's own unit (Machine Master itself,
   Calibration's VIPL Gauges & Measuring Instruments), not the combined Unit+Location value
   used by Bar Mapping / Forging Mapping / Job Work Mapping / Job Work Stock. ===== */
function machineLocationOptionsList(){
  const seen = {}; const opts = [];
  STANDARD_LOCATIONS.forEach(l=>{ seen[l]=1; opts.push(l); }); // the only two standard locations
  DB.machines.forEach(m=>{
    const loc = normalizeUnitLocation(m.location);
    if(loc && !seen[loc]){ seen[loc]=1; opts.push(loc); } // any genuinely different location a machine actually uses
  });
  opts.sort();
  return opts;
}
/* Generic Machine Master location picker — reused by every module that needs a
   machine/shop-floor location (Machine Master itself, Calibration's VIPL Gauges &
   Measuring Instruments, etc.) so there is a single source of truth for locations
   instead of separate free-text fields or a separate Location Master. */
// Display-only label for a bare shop-floor location tag — shows "Unit 1 (G51-I)" / "Unit 2
// (S-48)" for the two standard locations while leaving the underlying stored value (still
// just "G51-I" / "S-48") untouched, so no existing matching/filtering logic is affected.
function machineLocationDisplayLabel(loc){
  const norm = normalizeUnitLocation(loc);
  if(norm==='G51-I') return 'Unit 1 (G51-I)';
  if(norm==='S-48') return 'Unit 2 (S-48)';
  return loc;
}
function machineLocationPickerHtml(selectId, inputId, selectedValue, placeholder){
  const opts = machineLocationOptionsList();
  const isKnown = selectedValue && opts.includes(selectedValue);
  const optsHtml = opts.map(l=>`<option value="${esc(l)}" ${selectedValue===l?'selected':''}>${esc(machineLocationDisplayLabel(l))}</option>`).join('');
  return `<select id="${selectId}" onchange="onMachineLocationChange('${selectId}','${inputId}')">
      <option value="">— select location —</option>${optsHtml}
      <option value="__other__" ${selectedValue&&!isKnown?'selected':''}>Other (add new)</option>
    </select>
    <input id="${inputId}" placeholder="${esc(placeholder||'e.g. G51-I')}" value="${esc(selectedValue||'')}" style="margin-top:6px; display:${(selectedValue&&!isKnown)||opts.length===0?'block':'none'};">`;
}
function onMachineLocationChange(selectId, inputId){
  const sel = document.getElementById(selectId);
  const inp = document.getElementById(inputId);
  if(!sel || !inp) return;
  if(sel.value==='__other__'){ inp.style.display='block'; inp.value=''; inp.focus(); }
  else{ inp.style.display='none'; inp.value = sel.value; }
}
function prodLocationPickerHtml(selectId, inputId, selectedValue){
  selectedValue = normalizeProductionLocation(selectedValue);
  const opts = prodLocationOptionsList();
  const isKnown = selectedValue && opts.includes(selectedValue);
  const items = opts.map(l=>({value:l, label:l}));
  const ddId = selectId+'DD';
  return `${genericPickerHtml(ddId, selectId, items, isKnown?selectedValue:(selectedValue?'__other__':''), '— select production location —', `onProdLocationChange('${selectId}','${inputId}')`, true)}
    <input id="${inputId}" placeholder="e.g. Unit 1 (G51-I), Unit 2 (S-48)" value="${esc(selectedValue||'')}" style="margin-top:6px; display:${(selectedValue&&!isKnown)||opts.length===0?'block':'none'};">`;
}
function onProdLocationChange(selectId, inputId){
  const sel = document.getElementById(selectId);
  const inp = document.getElementById(inputId);
  if(!sel || !inp) return;
  if(sel.value==='__other__'){ inp.style.display='block'; inp.value=''; inp.focus(); }
  else{ inp.style.display='none'; inp.value = sel.value; }
}
function bomFinPartPickerOptionsHtml(){
  const seen = {}; const opts = [];
  DB.bom.forEach(b=>{
    const key = (b.finPartNo||'').trim();
    if(key && !seen[key]){
      seen[key]=1;
      opts.push(`<option value="${esc(key)}" data-name="${esc(b.finPartName)||''}">${esc(key)}</option>`);
    }
  });
  opts.sort((a,b)=>a.localeCompare(b));
  return opts.join('');
}
function bomFinPartPickerItemsHtml(i){
  const custId = quoteDraftCustomerId;
  const nameKey = (quoteDraftCustomerName||'').trim().toLowerCase();
  const seen = {}; const opts = [];
  DB.bom.forEach(b=>{
    if(custId){ if(b.customerId!==custId) return; }
    else if(nameKey){ if((b.customerName||'').trim().toLowerCase()!==nameKey) return; }
    const key = (b.finPartNo||'').trim();
    if(key && !seen[key]){ seen[key]=1; opts.push({no:key, name:b.finPartName||''}); }
  });
  opts.sort((a,b)=>a.no.localeCompare(b.no));
  return opts.map(o=>`<div class="fdd-item" onclick="setQuoteRowPartFromBOMCustom(${i},'${esc(o.no)}','${esc(o.name)}',this)">${esc(o.no)}</div>`).join('');
}
function toggleFddList(listId){
  const list = document.getElementById(listId);
  if(!list) return;
  const open = list.style.display !== 'none';
  document.querySelectorAll('.fdd-list').forEach(l=>l.style.display='none');
  list.style.display = open ? 'none' : '';
}
