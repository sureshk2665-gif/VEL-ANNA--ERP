/* ---------------- AUTOMATIC BACKUP ---------------- */
function isAutoBackupDue(bk){
  if(!bk || !bk.enabled) return false;
  const now = new Date();
  const parts = (bk.time||'22:00').split(':');
  const h = parseInt(parts[0],10)||0, m = parseInt(parts[1],10)||0;
  const scheduledToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  if(now < scheduledToday) return false; // today's scheduled time hasn't arrived yet
  if(!bk.lastRun) return true; // never run before — due once the time is reached
  const last = new Date(bk.lastRun);
  if(isNaN(last.getTime())) return true;
  if(bk.frequency==='Weekly'){
    const diffDays = Math.floor((scheduledToday - new Date(last.getFullYear(),last.getMonth(),last.getDate())) / (1000*60*60*24));
    return diffDays >= 7;
  }
  if(bk.frequency==='Monthly'){
    const monthsDiff = (now.getFullYear()-last.getFullYear())*12 + (now.getMonth()-last.getMonth());
    return monthsDiff >= 1;
  }
  // Daily (default)
  return last.toDateString() !== now.toDateString();
}
function performAutoBackup(){
  try{
    const blob = new Blob([JSON.stringify(DB, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    a.href = url; a.download = `visalam_erp_autobackup_${ts}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    DB.settings.backup.lastRun = new Date().toISOString();
    saveDB();
    toast('✓ Automatic backup completed');
    if(currentPage==='admin') render();
  }catch(e){ /* silent — will retry on next scheduled check */ }
}
function checkAutoBackup(){
  if(!DB || !DB.settings || !DB.settings.backup) return;
  if(isAutoBackupDue(DB.settings.backup)) performAutoBackup();
}
function saveAutoBackupSettings(){
  if(!requireAdminOffice()) return;
  const enabled = document.getElementById('abEnabled').checked;
  const frequency = document.getElementById('abFrequency').value;
  const time = document.getElementById('abTime').value || '22:00';
  DB.settings.backup = Object.assign({}, DB.settings.backup, {enabled, frequency, time});
  saveDB();
  toast('Automatic Backup settings saved');
  render();
  checkAutoBackup();
}
function resetAllData(){
  if(!currentUser || currentUser.role!=='admin'){ toast('Only Software Admin can reset data'); return; }
  if(!confirm('This will permanently delete ALL data (quotations, purchase orders, receiving, stores, production, inspections, inventory, sales, machines, maintenance, tools, calibration, suppliers, customers, items, employees, and product development mappings) for BOTH units. Users, addresses and theme are kept. This cannot be undone. Continue?')) return;
  const typed = prompt('Type RESET (all caps) to confirm permanent deletion of all data:');
  if(typed !== 'RESET'){ toast('Reset cancelled'); return; }
  const keepUsers = DB.users;
  const keepSettings = DB.settings;
  const keepCounters = DB.counters;
  DB = {
    quotation: [], labourQuotation: [], custPO: [], labourPO: [], labourMapping: [], labourMaterialReceipt: [], productionNorms: [], purchase: [], materialReceiving: [], receiving: [], subInspection: [], stores: [],
    storesBar: [], storesForging: [], production: [], dailyProduction: [], dailySetting: [], finalInsp: [], finalInspCards: [], inventory: [],
    sales: [], suppliers: [], customers: [], items: [], bom: [], inspectionParams: [], controlPlans: [], machines: [], capitalGoodsPO: [], capitalGoodsReceiving: [], employees: [],
    maintenance: [], maintenancePO: [], tools: [], calibration: [], gaugesVipl: [], gaugesCustomer: [], measuringInstruments: [], charInstrumentMap: [],
    toolMaster: [], fixtureMaster: [], toolsPO: [], toolRegister: [], toolIssue: [], toolSuppliers: [],
    toolLists: {
      types:['End Mill','Drill','Tap','Reamer','Boring Tool','U Drill','Face Mill','Insert Tool','Turning Tool','Grooving Tool','Threading Tool'],
      materials:['HSS','Carbide','M35','M42']
    },
    counters: {qt:0, lq:0, po:0, gr:0, st:0, pr:0, fi:0, sl:0, sp:0, it:0, mc:0, mt:0, tl:0, fx:0, cl:0, cu:0, cp:0, tp:0,
      us: keepCounters ? (keepCounters.us||0) : 0, cd: keepCounters ? (keepCounters.cd||0) : 0},
    settings: keepSettings,
    users: keepUsers
  };
  saveDB();
  editingQuoteId=null; editingLabourQuoteId=null; quoteItemsDraft=[]; labourItemsDraft=[]; quoteViewId=null; labourQuoteViewId=null;
  editingCustPOId=null;
  editingPOId=null; poItemsDraft=[]; editingSupplierId=null; editingItemId=null; editingMachineId=null;
  editingCGPOId=null; cgPOItemsDraft=[]; editingCGItemId=null; editingCGSupplierId=null; editingCGReceivingId=null; purchaseMainTab='materials'; cgSubTab='orders';
  editingBOMId=null; editingCustomerId=null; custContactsDraft=[]; fiHeaderDraft=null; fiCharsDraft=null; editingFIId=null; fiViewId=null; editingGRId=null; editingSubInspId=null;
  toast('All data has been reset');
  currentPage = 'dashboard';
  render();
}
let toastHideTimer = null;
function toast(msg, durationMs){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  if(toastHideTimer) clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(()=>t.classList.remove('show'), durationMs || 2200);
}
