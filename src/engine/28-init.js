/* ---------------- INIT ---------------- */
document.getElementById('unitSelect').addEventListener('change', e=>{
  currentUnit = e.target.value; render();
});

async function attemptLogin(){
  const uEl = document.getElementById('loginUser');
  const pEl = document.getElementById('loginPass');
  const u = uEl.value.trim();
  const p = pEl.value;
  const errEl = document.getElementById('loginErr');
  const statusEl = document.getElementById('loginStatus');
  const statusTextEl = document.getElementById('loginStatusText');
  const btnEl = document.getElementById('loginBtn');
  if(!u || !p){
    errEl.textContent = 'Please enter both Username and Password.';
    errEl.classList.add('show');
    return;
  }
  errEl.classList.remove('show');
  // Show a clear, professional "Connecting to Database…" status (with spinner) while we make
  // sure we're checking credentials against the latest shared data — same fetchRemoteDB() /
  // mergeDbForSync() calls used elsewhere (e.g. manualSync()); connection setup itself is untouched.
  statusTextEl.textContent = 'Connecting to Database…';
  statusEl.style.display = 'flex';
  btnEl.disabled = true;
  uEl.disabled = true;
  pEl.disabled = true;
  let match = null;
  if(AUTH_MODE){
    // Supabase Auth checks the password; the ERP user record with the same username decides
    // what this person may see. The password stored in that record is not used.
    let authErr = null;
    try{
      const res = await window.ViplAuth.signIn(u, p);
      if(!res.ok) authErr = res.message;
      else{
        statusTextEl.textContent = 'Loading data…';
        const alreadyBooted = !!dataBooted;
        await bootDataOnce();
        if(alreadyBooted){
          // Signing in again in the same tab (after a logout): pull the latest shared data.
          const remote = await fetchRemoteDB();
          if(remote!==null){
            DB = mergeDbForSync(remote, DB);
            try{ localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }catch(e){}
            setSyncStatus(true);
          } else setSyncStatus(false);
        }
        const email = window.ViplAuth.toEmail(u);
        match = (DB.users||[]).find(x=>x.username && window.ViplAuth.toEmail(x.username)===email) || null;
        if(!match){
          authErr = 'Signed in, but there is no ERP user named "'+u+'". Ask the Software Admin to add it in Admin → Users.';
          await window.ViplAuth.signOut();
        }
      }
    } finally {
      statusEl.style.display = 'none';
      btnEl.disabled = false;
      uEl.disabled = false;
      pEl.disabled = false;
    }
    if(authErr){
      errEl.textContent = authErr;
      errEl.classList.add('show');
      return;
    }
  } else {
    try{
      if(supabaseConfigured()){
        const remote = await fetchRemoteDB();
        if(remote!==null){
          DB = mergeDbForSync(remote, DB);
          try{ localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }catch(e){}
          setSyncStatus(true);
        }else{
          setSyncStatus(false);
        }
      }
    } finally {
      statusEl.style.display = 'none';
      btnEl.disabled = false;
      uEl.disabled = false;
      pEl.disabled = false;
    }
    match = (DB.users||[]).find(x=>x.username===u && x.password===p);
  }
  if(match){
    // Username + Password are correct, but the dashboard is NOT granted yet — a 4-digit
    // passcode/OTP must also be entered correctly first (see attemptOtpVerify() below).
    errEl.classList.remove('show');
    pEl.value = '';
    pendingOtpUser = match;
    goToOtpStep();
  }else{
    errEl.textContent = 'Invalid username or password.';
    errEl.classList.add('show');
  }
}
// Generates a fresh random 4-digit code (1000–9999, so it's always exactly 4 digits) and shows
// the OTP entry step. Since this app has no SMS/Email gateway configured to actually deliver a
// code, the generated code is surfaced directly on-screen (and via toast) so the feature is
// fully usable end-to-end rather than silently blocking sign-in on an undeliverable code.
function goToOtpStep(){
  pendingOtpCode = String(Math.floor(1000+Math.random()*9000));
  document.getElementById('loginStepCreds').style.display = 'none';
  document.getElementById('loginStepOtp').style.display = 'block';
  document.getElementById('otpForUser').textContent = pendingOtpUser.name || pendingOtpUser.username;
  document.getElementById('otpDemoNote').textContent = `Demo Mode — no SMS/Email gateway configured. Your code: ${pendingOtpCode}`;
  const otpErr = document.getElementById('otpErr'); if(otpErr) otpErr.classList.remove('show');
  const otpEl = document.getElementById('loginOtp');
  if(otpEl){ otpEl.value = ''; otpEl.focus(); }
  toast(`🔐 Your 4-digit verification code is ${pendingOtpCode}`, 6000);
}
// Re-generates and re-shows a new 4-digit code for the same pendingOtpUser, without going back
// to re-checking Username/Password.
function resendOtp(){
  if(!pendingOtpUser) return;
  goToOtpStep();
}
// Returns to the Username/Password step, discarding whatever code was generated — the person
// must re-enter valid credentials to get a new one.
function backToCredentialsStep(){
  pendingOtpUser = null;
  pendingOtpCode = '';
  document.getElementById('loginStepOtp').style.display = 'none';
  document.getElementById('loginStepCreds').style.display = 'block';
  const otpErr = document.getElementById('otpErr'); if(otpErr) otpErr.classList.remove('show');
  const uEl = document.getElementById('loginUser'); if(uEl) uEl.focus();
}
// Final gate: only once the 4-digit code entered here matches pendingOtpCode does currentUser
// actually get set and the dashboard become reachable. This is also the single point where a
// LoginLog "session" row is created — login_time is recorded exactly when access is granted,
// never earlier (so a wrong/abandoned OTP attempt never creates a stray log entry).
function attemptOtpVerify(){
  const otpEl = document.getElementById('loginOtp');
  const otpErr = document.getElementById('otpErr');
  const entered = (otpEl.value||'').trim();
  if(!pendingOtpUser || !pendingOtpCode){ backToCredentialsStep(); return; }
  if(entered.length!==4 || !/^\d{4}$/.test(entered)){
    otpErr.textContent = 'Please enter the 4-digit code.';
    otpErr.classList.add('show');
    return;
  }
  if(entered!==pendingOtpCode){
    otpErr.textContent = 'Incorrect code. Please try again.';
    otpErr.classList.add('show');
    otpEl.value=''; otpEl.focus();
    return;
  }
  otpErr.classList.remove('show');
  currentUser = pendingOtpUser;
  currentPage = 'dashboard';
  // Create this session's LoginLog row — login_time is "now", logout_time/session_duration are
  // filled in only later by attemptLogout() when the person actually signs out.
  const logRow = { id:uid('ll'), userId:currentUser.id, username:currentUser.username, name:currentUser.name||currentUser.username,
    loginTime:new Date().toISOString(), logoutTime:'', sessionDuration:'' };
  DB.loginLogs = DB.loginLogs||[];
  DB.loginLogs.push(logRow);
  currentLoginLogId = logRow.id;
  saveDB();
  pendingOtpUser = null;
  pendingOtpCode = '';
  otpEl.value = '';
  document.getElementById('loginOverlay').classList.add('hide');
  document.getElementById('appRoot').style.display = 'block';
  render();
}
function attemptLogout(){
  // Close out this session's LoginLog row — stamp logout_time and compute/store
  // session_duration ("Xh Ym") — before clearing currentUser, so the record this person just
  // finished is captured exactly once, right here.
  if(currentLoginLogId){
    const row = (DB.loginLogs||[]).find(x=>x.id===currentLoginLogId);
    if(row && !row.logoutTime){
      row.logoutTime = new Date().toISOString();
      row.sessionDuration = fmtSessionDuration(row.loginTime, row.logoutTime);
      saveDB();
    }
  }
  currentLoginLogId = null;
  // Supabase Auth mode: end the database session too — after the queued save of the LoginLog
  // row above has gone through, since that save still needs this session.
  if(AUTH_MODE) saveQueue.then(()=>window.ViplAuth.signOut());
  // Logging out always returns to the Login screen — no remembered session, no automatic
  // sign-back-in. Signing in again requires entering a valid Username and Password, then the
  // correct 4-digit code.
  currentUser = null;
  currentPage = 'dashboard';
  const main = document.getElementById('main');
  if(main) main.innerHTML = '';
  document.getElementById('appRoot').style.display = 'none';
  const overlay = document.getElementById('loginOverlay');
  overlay.classList.remove('hide');
  backToCredentialsStep();
  const uEl = document.getElementById('loginUser');
  const pEl = document.getElementById('loginPass');
  const errEl = document.getElementById('loginErr');
  if(uEl) uEl.value = '';
  if(pEl) pEl.value = '';
  if(errEl) errEl.classList.remove('show');
  if(uEl) uEl.focus();
}
document.getElementById('loginBtn').addEventListener('click', attemptLogin);
document.getElementById('loginPass').addEventListener('keydown', e=>{ if(e.key==='Enter') attemptLogin(); });
document.getElementById('loginUser').addEventListener('keydown', e=>{ if(e.key==='Enter') attemptLogin(); });
document.getElementById('otpVerifyBtn').addEventListener('click', attemptOtpVerify);
document.getElementById('loginOtp').addEventListener('keydown', e=>{ if(e.key==='Enter') attemptOtpVerify(); });
document.getElementById('otpBackLink').addEventListener('click', backToCredentialsStep);
document.getElementById('otpResendLink').addEventListener('click', resendOtp);
document.getElementById('logoutBtn').addEventListener('click', attemptLogout);
document.getElementById('dashHomeBtnFixed').addEventListener('click', ()=>goModule('dashboard'));
document.getElementById('syncNowBtn').addEventListener('click', manualSync);
// Keep long-open tabs fresh: pull from the shared database whenever the tab regains focus/
// becomes visible again, and every 20s in the background — this is what makes a record added
// on one computer show up on another without a manual page reload.
window.addEventListener('focus', autoSyncPull);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) autoSyncPull(); });
setInterval(autoSyncPull, 20000);
// Warn before closing/reloading while a just-made change is still saving to Supabase in the
// background. The edit itself is never lost (loadDB() recovers it via PENDING_KEY either way —
// see above), but this gives the user a chance to wait a moment so the shared database has the
// latest data immediately, instead of only after the recovery step runs on next load.
window.addEventListener('beforeunload', (e)=>{
  let hasPending = false;
  try{ hasPending = !!localStorage.getItem(PENDING_KEY); }catch(err){}
  if(hasPending){
    e.preventDefault();
    e.returnValue = 'Your last change is still saving to the shared database. Wait a moment before closing or reloading.';
    return e.returnValue;
  }
});

// Loads the data and runs the start-up migrations / default seeding. Runs once: straight
// away normally, but in Supabase Auth mode only after the first successful sign-in — before
// that the shared database refuses every request, and running the seeding against an empty
// local cache would push duplicate default records into the real data on sign-in.
let dataBooted = null; // Promise once started
function bootDataOnce(){ if(!dataBooted) dataBooted = bootData(); return dataBooted; }
async function bootData(){
  await loadDB();
  setSyncStatus(lastSyncOk);
  if(lastSyncOk===false){
    toast('⚠ Could not reach the shared database on startup — showing local data only. Check your internet connection, then click Sync.', 6000);
  }
  if(!DB.quotation) DB.quotation = [];
  if(!DB.suppliers) DB.suppliers = [];
  if(!DB.customers) DB.customers = [];
  // Back-fill Customer ID for any customer saved before this field existed, so every customer
  // — old or new — always has a unique, permanent Customer ID.
  DB.customers.forEach(c=>{ if(!c.no) c.no = uid('cu'); });
  if(!DB.items) DB.items = [];
  if(!DB.bom) DB.bom = [];
  if(!DB.inspectionParams) DB.inspectionParams = [];
  if(!DB.controlPlans) DB.controlPlans = [];
  // migrate legacy BOM rows (pre bar/forging split) into mapType-tagged rows
  (function migrateBOMMapType(){
    const migrated = [];
    DB.bom.forEach(b=>{
      if(b.mapType){ migrated.push(b); return; }
      const hasBar = !!(b.purPartNo || b.purPartName);
      const hasForg = !!(b.forgPartNo || b.forgPartName);
      if(hasBar && hasForg){
        migrated.push({...b, id:b.id+'-bar', mapType:'BAR', normWeight:b.purNormWeight||0});
        migrated.push({...b, id:b.id+'-forg', mapType:'FORGING', normWeight:0});
      } else if(hasForg){
        migrated.push({...b, mapType:'FORGING', normWeight:0});
      } else {
        migrated.push({...b, mapType:'BAR', normWeight:b.purNormWeight||0});
      }
    });
    DB.bom = migrated;
  })();
  if(!DB.inventory) DB.inventory = [];
  if(!DB.storesBar) DB.storesBar = [];
  if(!DB.storesForging) DB.storesForging = [];
  if(!DB.machines) DB.machines = [];
  if(!DB.maintenance) DB.maintenance = [];
  if(!DB.maintenancePO) DB.maintenancePO = [];
  if(!DB.tools) DB.tools = [];
  if(!DB.calibration) DB.calibration = [];
  if(!DB.gaugesVipl) DB.gaugesVipl = [];
  if(!DB.gaugesCustomer) DB.gaugesCustomer = [];
  if(!DB.measuringInstruments) DB.measuringInstruments = [];
  if(!DB.charInstrumentMap) DB.charInstrumentMap = [];
  if(!DB.toolMaster) DB.toolMaster = [];
  if(!DB.toolsPO) DB.toolsPO = [];
  if(!DB.toolRegister) DB.toolRegister = [];
  if(!DB.toolIssue) DB.toolIssue = [];
  if(!DB.fixtureMaster) DB.fixtureMaster = [];
  // ---- One-time data migration: consolidate common master data into Admin Office ----
  // Tool Master, Fixture Master, and the three Gauge/Measuring-Instrument registers are common
  // data owned centrally by Admin Office (not by whichever unit happened to create them before
  // this redesign). Any such records still carrying a Unit-1 or Unit-2 tag from earlier use are
  // reassigned to Admin Office here. This deliberately does NOT touch production transactions —
  // Quotation, Customer PO, Purchase, Receiving, Stores, Production, Final Inspection, Inventory,
  // Sales, Machine Master, Maintenance, Tool Issue/Register/PO — which stay linked only to their
  // own production location, exactly as before.
  (function migrateCommonMastersToAdminOffice(){
    let changed = false;
    ['toolMaster','fixtureMaster','gaugesVipl','gaugesCustomer','measuringInstruments'].forEach(listName=>{
      (DB[listName]||[]).forEach(rec=>{ if(rec.unit && rec.unit!=='Admin'){ rec.unit = 'Admin'; changed = true; } });
    });
    if(changed) saveDB();
  })();
  // ---- Data-integrity fix: reconcile Final Inspection Card OK Qty → Finished Goods Stock ----
  // Cards whose OK Qty was recorded by an older build (back when Finished Goods Stock only moved
  // on a passed Final Inspection Report, not directly off the card's OK Qty) — or where a push
  // never completed for any other reason — can end up with OK Qty on the card that never actually
  // reached Finished Goods Stock. On every load, top up Finished Goods Stock with exactly the
  // difference between each card's OK Qty and what has already been pushed for it, so no OK Qty
  // is ever stuck off Finished Goods Stock. Idempotent — once caught up, the gap is 0 and nothing
  // more happens here.
  (function reconcileFICardStock(){
    if(!Array.isArray(DB.finalInspCards) || !DB.finalInspCards.length) return;
    let changed = false;
    DB.finalInspCards.forEach(c=>{
      const pushedQty = (c.inventoryIds||[]).reduce((a,id)=>{
        const iv = (DB.inventory||[]).find(x=>x.id===id);
        return a + (iv ? (parseFloat(iv.qty)||0) : 0);
      },0);
      const gap = Math.round(((c.okQty||0)-pushedQty)*10000)/10000;
      if(gap>0.0001){
        const ivId = 'iv'+Date.now()+Math.floor(Math.random()*100000);
        DB.inventory.push({
          id:ivId, unit:c.unit||'', item:(c.partNo+(c.partName?' - '+c.partName:'')), partNo:c.partNo||'', partName:c.partName||'',
          qty:gap, source:'Final Insp. Card — '+(c.cardNo||c.partNo), date:c.date||today(),
          finalInspCardId:c.id, customer:c.customer||'', quotationId:c.quotationId||null, quoteNo:c.quoteNo||'', quoteRate:c.quoteRate||0, cardNo:c.cardNo||''
        });
        c.inventoryIds = c.inventoryIds||[];
        c.inventoryIds.push(ivId);
        changed = true;
      }
    });
    if(changed) saveDB();
  })();
  if(!DB.customGrades) DB.customGrades = {};
  if(!DB.toolLists) DB.toolLists = {types:[],materials:[]};
  if(!Array.isArray(DB.toolLists.types) || !DB.toolLists.types.length) DB.toolLists.types = ['End Mill','Drill','Tap','Reamer','Boring Tool','U Drill','Face Mill','Insert Tool','Turning Tool','Grooving Tool','Threading Tool'];
  if(!Array.isArray(DB.toolLists.materials) || !DB.toolLists.materials.length) DB.toolLists.materials = ['HSS','Carbide','M35','M42'];
  if(!DB.settings) DB.settings = {theme:'corporate', addresses:{office:'',unit1:'',unit2:''}};
  if(!DB.settings.theme) DB.settings.theme = 'corporate';
  if(!DB.settings.addresses) DB.settings.addresses = {office:'',unit1:'',unit2:''};
  if(!DB.settings.company) DB.settings.company = {name:'VISALAM INDUSTRIES PVT LTD', logo:''};
  if(!DB.settings.gst) DB.settings.gst = {gstin:'33AAFCV5068H1Z7', stateCode:'33', stateName:'TAMILNADU', email:'visalamindia@gmail.com', phone:'9941010733'};
  // Schema upgrade — Statutory Registrations (MSME / Udyam). Seeds the company's Udyam number
  // exactly once, only when the field has never existed on this DB. Once present (even if an
  // Admin later clears it on purpose) it's left alone, so the Admin setting is always the source.
  (function migrateStatutoryFields(){
    const g = DB.settings.gst;
    let changed = false;
    if(!('cin' in g)){ g.cin = ''; changed = true; }
    if(!('msmeNo' in g)){ g.msmeNo = 'UDYAM-TN-24-0000294'; g.msmeCategory = 'Micro'; changed = true; }
    if(!('msmeCategory' in g)){ g.msmeCategory = ''; changed = true; }
    if(!('statutoryUpdatedBy' in g)){ g.statutoryUpdatedBy = ''; g.statutoryUpdatedAt = ''; changed = true; }
    if(changed) saveDB();
  })();
  if(!DB.settings.bank) DB.settings.bank = {accName:'VISALAM INDUSTRIES PVT LTD', accNo:'0936201003095', bankName:'Canara Bank', branch:'Ambattur', ifsc:'CNRB0000936'};
  if(!DB.settings.backup) DB.settings.backup = {enabled:false, frequency:'Daily', time:'22:00', lastRun:''};
  if(!DB.counters.sp) DB.counters.sp = 0;
  if(!DB.counters.qt) DB.counters.qt = 0;
  if(!DB.counters.it) DB.counters.it = 0;
  if(!DB.counters.mc) DB.counters.mc = 0;
  if(!DB.counters.mt) DB.counters.mt = 0;
  if(!DB.counters.tl) DB.counters.tl = 0;
  if(!DB.counters.fx) DB.counters.fx = 0;
  if(!DB.counters.cl) DB.counters.cl = 0;
  if(!DB.counters.cu) DB.counters.cu = 0;
  if(!DB.counters.us) DB.counters.us = 0;
  if(!DB.counters.cd) DB.counters.cd = 0;
  if(!DB.loginLogs) DB.loginLogs = []; // back-fill for data saved before the LoginLog feature existed
  if(!DB.counters.ll) DB.counters.ll = 0;
  if(!DB.users || !DB.users.length){
    DB.users = [
      {id:uid('us'), username:'softwareadmin', password:'softwareadmin', name:'Software Admin', role:'admin', rights:defaultRights('full')},
      {id:uid('us'), username:'admin', password:'admin', name:'Admin', role:'restrictedAdmin', rights:defaultRights('none')},
      // VIPL Unit 1, VIPL Unit 2 and Quality start with no module access — module & sub-module
      // rights for these three are configured from Admin/Software Admin → Users & Module-wise
      // Rights, same as any other Standard User account.
      {id:uid('us'), username:'vipl1', password:'vipl1', name:'VIPL Unit 1', role:'user', rights:defaultRights('none')},
      {id:uid('us'), username:'vipl2', password:'vipl2', name:'VIPL Unit 2', role:'user', rights:defaultRights('none')},
      {id:uid('us'), username:'quality', password:'quality', name:'Quality', role:'user', rights:defaultRights('none')},
      {id:uid('us'), username:'user1', password:'user1', name:'User 1', role:'user', rights:defaultRights('none')},
      {id:uid('us'), username:'user2', password:'user2', name:'User 2', role:'user', rights:defaultRights('none')},
      {id:uid('us'), username:'user3', password:'user3', name:'User 3', role:'user', rights:defaultRights('none')},
    ];
    saveDB();
  } else {
    // Data saved by an older build of this file (a different downloaded copy, same browser)
    // may predate one or more of the 5 documented default accounts. Add back only whichever
    // ones are missing by username — this never touches or resets an existing account, so any
    // password/rights an admin already changed are left exactly as they are.
    const REQUIRED_DEFAULT_USERS = [
      {username:'softwareadmin', password:'softwareadmin', name:'Software Admin', role:'admin', rights:defaultRights('full')},
      {username:'admin', password:'admin', name:'Admin', role:'restrictedAdmin', rights:defaultRights('none')},
      {username:'vipl1', password:'vipl1', name:'VIPL Unit 1', role:'user', rights:defaultRights('none')},
      {username:'vipl2', password:'vipl2', name:'VIPL Unit 2', role:'user', rights:defaultRights('none')},
      {username:'quality', password:'quality', name:'Quality', role:'user', rights:defaultRights('none')},
      {username:'user1', password:'user1', name:'User 1', role:'user', rights:defaultRights('none')},
      {username:'user2', password:'user2', name:'User 2', role:'user', rights:defaultRights('none')},
      {username:'user3', password:'user3', name:'User 3', role:'user', rights:defaultRights('none')},
    ];
    let addedAny = false;
    REQUIRED_DEFAULT_USERS.forEach(def=>{
      if(!DB.users.find(u=>u.username===def.username)){
        DB.users.push(Object.assign({id:uid('us')}, def));
        addedAny = true;
      }
    });
    if(addedAny) saveDB();
  }
  // One-time fix for browser data saved by an older build of this file, where the built-in
  // 'admin' account was incorrectly given full Software-Admin control instead of being limited
  // to User Rights + Manual Backup. As long as at least one other full-control account exists
  // (the 'softwareadmin' account), the 'admin' account is corrected to the restricted role here
  // — its username, password and display name are left untouched, only the role/permissions
  // and, if it still had the old generic label, the display name are corrected.
  (function fixLegacyAdminRole(){
    const legacyAdmin = DB.users.find(u=>u.username==='admin');
    const hasOtherFullAdmin = DB.users.some(u=>u.username!=='admin' && u.role==='admin');
    if(legacyAdmin && legacyAdmin.role==='admin' && hasOtherFullAdmin){
      legacyAdmin.role = 'restrictedAdmin';
      if(legacyAdmin.name==='Administrator' || legacyAdmin.name==='Software Admin' || !legacyAdmin.name){
        legacyAdmin.name = 'Admin';
      }
      saveDB();
    }
  })();
  DB.users.forEach(u=>{
    u.rights = normalizeRights(u.rights);
    if(u.mobile===undefined) u.mobile = ''; // back-fill for accounts saved before this field existed
  });
  renderThemeGrid();
  applyTheme(DB.settings.theme);
  const unitSelectEl = document.getElementById('unitSelect');
  if(unitSelectEl) unitSelectEl.value = currentUnit;
  checkAutoBackup();
  setInterval(checkAutoBackup, 60*1000);
}
(async function init(){
  if(!AUTH_MODE) await bootDataOnce();
  else{
    // Data loads after sign-in; until then show the sign-in screen in the theme this browser last used.
    try{ const cached = JSON.parse(localStorage.getItem(STORE_KEY)||'null'); applyTheme(cached && cached.settings && cached.settings.theme); }catch(e){ applyTheme(); }
  }
  // Always start at the Login screen — no auto sign-in, no remembered session. The person must
  // enter a valid Username and Password every time the app is opened or reloaded.
  currentUser = null;
  currentPage = 'dashboard';
  document.getElementById('loginOverlay').classList.remove('hide');
  document.getElementById('appRoot').style.display = 'none';
})();
