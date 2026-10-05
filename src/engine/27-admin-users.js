/* ---------------- ADMIN ---------------- */
function renderAdmin(main){
  const isFullAdmin = currentUser && currentUser.role==='admin';
  const isRestrictedAdmin = currentUser && currentUser.role==='restrictedAdmin';
  // Admin (restricted) role: only User Rights management + a Manual Backup download button.
  // No Restore, no Automatic Backup controls, no Company/GST/Address settings, no Reset Data.
  if(isRestrictedAdmin){
    main.innerHTML = `
      <div class="topbar"><div></div></div>
      ${currentUnit!=='Admin' ? `<div class="panel" style="margin-top:12px; border-color:var(--amber);"><div class="empty">You're viewing Settings from ${esc(unitLabel())}. Switch the Active Unit to <b>Admin Office</b> to make changes — Settings, Users &amp; Rights are managed centrally and read-only from a production unit.</div></div>` : ''}
      ${renderStatutoryPanelHtml()}
      ${renderUsersPanelHtml()}
      <div class="panel">
        <h3>💾 Manual Backup</h3>
        <div class="desc" style="margin-bottom:12px;">Download a full backup of the current data as a JSON file. Keep it somewhere safe. (Restore and Automatic Backup are not available on the Admin account — only Software Admin can access those.)</div>
        <button class="btn amber" onclick="exportBackup()">⬇️ Download Backup (JSON)</button>
      </div>
      ${renderLoginLogsPanelHtml()}
    `;
    return;
  }
  const a = DB.settings.addresses || {office:'',unit1:'',unit2:''};
  const co = DB.settings.company || {name:'VISALAM INDUSTRIES PVT LTD', logo:''};
  const gs = DB.settings.gst || {gstin:'',stateCode:'',stateName:'',email:'',phone:''};
  const bk = DB.settings.bank || {accName:'',accNo:'',bankName:'',branch:'',ifsc:''};
  const bkp = DB.settings.backup || {enabled:false, frequency:'Daily', time:'22:00', lastRun:''};
  const isAdmin = isFullAdmin;
  main.innerHTML = `
    <div class="topbar"><div></div></div>
    ${currentUnit!=='Admin' ? `<div class="panel" style="margin-top:12px; border-color:var(--amber);"><div class="empty">You're viewing Settings from ${esc(unitLabel())}. Switch the Active Unit to <b>Admin Office</b> to make changes — Settings, Users &amp; Rights are managed centrally and read-only from a production unit.</div></div>` : ''}
    ${isAdmin ? renderUsersPanelHtml() : `<div class="panel" style="margin-top:12px;"><div class="empty">Only Software Admin or Admin accounts can manage users and rights.</div></div>`}
    <div class="panel addrGrid" style="margin-top:12px;">
      <h3>🏢 Company Master</h3>
      <div class="desc" style="margin-bottom:14px;">Set the company name and logo once here — they will automatically appear on every printed report and Quotation, Purchase Order, and Reports document.</div>
      <div class="frow g2">
        <div><label class="fl">Company Name</label><input id="coName" placeholder="e.g. Visalam Industries Pvt Ltd" value="${esc(co.name)}"></div>
        <div><label class="fl">Company Logo</label>
          <input id="coLogoFile" type="file" accept="image/*" onchange="handleLogoUpload(this)">
        </div>
      </div>
      <div class="frow g1" id="coLogoPreviewWrap" style="${co.logo?'':'display:none;'}">
        <div>
          <label class="fl">Logo Preview</label>
          <div style="display:flex; align-items:center; gap:12px;">
            <img id="coLogoPreview" src="${esc(co.logo)}" style="max-height:64px; max-width:160px; border:1px solid var(--line); border-radius:4px; background:#fff; padding:4px;">
            <button class="btn ghost small" onclick="removeCompanyLogo()">✕ Remove Logo</button>
          </div>
        </div>
      </div>
      <button class="btn amber" style="margin-top:6px;" onclick="saveCompanyMaster()">💾 Save Company Master</button>
    </div>
    ${renderStatutoryPanelHtml()}
    <div class="panel addrGrid" style="margin-top:12px;">
      <h3>🧾 GST &amp; Bank Details <span class="hint" style="position:static; font-size:9.5px;">(used on printed Sales Tax Invoices — GSTIN, CIN &amp; MSME are under Statutory Registrations)</span></h3>
      <div class="frow g4">
        <div><label class="fl">State Code</label><input id="gsStateCode" value="${esc(gs.stateCode)}" placeholder="33"></div>
        <div><label class="fl">State Name</label><input id="gsStateName" value="${esc(gs.stateName)}" placeholder="TAMILNADU"></div>
        <div><label class="fl">Contact Phone</label><input id="gsPhone" value="${esc(gs.phone)}" placeholder="9941010733"></div>
        <div><label class="fl">Contact Email</label><input id="gsEmail" value="${esc(gs.email)}" placeholder="company@example.com"></div>
      </div>
      <div class="frow g4" style="margin-top:6px;">
        <div><label class="fl">Bank A/c Name</label><input id="bkAccName" value="${esc(bk.accName)}" placeholder="Account holder name"></div>
        <div><label class="fl">Bank A/c No.</label><input id="bkAccNo" value="${esc(bk.accNo)}" placeholder="Account number"></div>
        <div><label class="fl">Bank Name</label><input id="bkBankName" value="${esc(bk.bankName)}" placeholder="e.g. Canara Bank"></div>
        <div><label class="fl">Branch</label><input id="bkBranch" value="${esc(bk.branch)}" placeholder="Branch name"></div>
      </div>
      <div class="frow g2">
        <div><label class="fl">IFSC Code</label><input id="bkIfsc" value="${esc(bk.ifsc)}" placeholder="e.g. CNRB0000936"></div>
      </div>
      <button class="btn amber" style="margin-top:6px;" onclick="saveGstBankDetails()">💾 Save GST &amp; Bank Details</button>
    </div>
    <div class="panel addrGrid" style="margin-top:12px;">
      <h3>Company &amp; Unit Addresses</h3>
      <div class="frow g1">
        <div><label class="fl">Admin / Registered Office Address</label><textarea id="adOffice" placeholder="Registered office address">${esc(a.office)}</textarea></div>
      </div>
      <div class="frow g2">
        <div><label class="fl">Unit 1 Address (G51-I)</label><textarea id="adUnit1" placeholder="Unit 1 works address">${esc(a.unit1)}</textarea></div>
        <div><label class="fl">Unit 2 Address (S-48)</label><textarea id="adUnit2" placeholder="Unit 2 works address">${esc(a.unit2)}</textarea></div>
      </div>
      <button class="btn amber" onclick="saveAdminAddresses()">💾 Save Addresses</button>
    </div>
    <div class="panel addrGrid">
      <h3>🔄 Automatic Backup</h3>
      <div class="desc" style="margin-bottom:14px;">When enabled, VIPL ERP automatically saves a backup at the chosen frequency and time — no manual action needed. The check runs whenever the ERP is open in a browser tab; if the device was off or the tab closed at the scheduled time, the backup runs as soon as it's next opened.</div>
      <div class="frow g2">
        <div>
          <label class="fl">Automatic Backup</label>
          <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text); cursor:pointer;">
            <input id="abEnabled" type="checkbox" style="width:16px;height:16px;" ${bkp.enabled?'checked':''}>
            Enable Automatic Backup
          </label>
        </div>
        <div></div>
      </div>
      <div class="frow g2">
        <div>
          <label class="fl">Backup Frequency</label>
          <select id="abFrequency">
            <option value="Daily" ${bkp.frequency==='Daily'?'selected':''}>Daily</option>
            <option value="Weekly" ${bkp.frequency==='Weekly'?'selected':''}>Weekly</option>
            <option value="Monthly" ${bkp.frequency==='Monthly'?'selected':''}>Monthly</option>
          </select>
        </div>
        <div>
          <label class="fl">Backup Time</label>
          <input id="abTime" type="time" value="${esc(bkp.time||'22:00')}">
        </div>
      </div>
      <div class="frow g1">
        <div><label class="fl">Last Successful Backup</label><div>${bkp.lastRun ? fmtDateTime(bkp.lastRun) : '— No automatic backup has run yet —'}</div></div>
      </div>
      <button class="btn amber" style="margin-top:6px;" onclick="saveAutoBackupSettings()">💾 Save Automatic Backup Settings</button>
    </div>
    <div class="panel">
      <h3>Data Backup &amp; Restore</h3>
      <div class="desc" style="margin-bottom:12px;">Data is saved in this browser only. Download a backup regularly, and keep it somewhere safe — clearing browser data will erase everything.</div>
      <div class="frow g2">
        <button class="btn amber" onclick="exportBackup()">⬇️ Download Backup (JSON)</button>
        <label class="btn" style="cursor:pointer;text-align:center;">
          ⬆️ Restore from Backup
          <input type="file" accept="application/json" style="display:none" onchange="importBackup(this)">
        </label>
      </div>
    </div>
    ${isAdmin ? `
    <div class="panel" style="border-color:var(--red);">
      <h3 style="color:var(--red);">⚠ Danger Zone — Reset All Data</h3>
      <div class="desc" style="margin-bottom:12px;">Permanently erases every quotation, purchase order, receiving, stores, production, inspection, inventory, sales, master, and mapping record in both units. Users, addresses and theme are kept so you are not locked out. Download a backup first if you may need this data again — this cannot be undone.</div>
      <button class="btn danger" onclick="resetAllData()">🗑 Reset All Data</button>
    </div>` : ''}
    <div class="panel">
      <h3>Current Records</h3>
      <div class="frow g1">
        <div><label class="fl">Office</label><div>${esc(a.office)||'—'}</div></div>
      </div>
      <div class="frow g2">
        <div><label class="fl">Unit 1</label><div>${esc(a.unit1)||'—'}</div></div>
        <div><label class="fl">Unit 2</label><div>${esc(a.unit2)||'—'}</div></div>
      </div>
    </div>
    ${renderLoginLogsPanelHtml()}
  `;
}
// LoginLog viewer — shown at the bottom of the Admin page for both Software Admin and Admin
// (restricted) accounts, so the LoginLog data feature actually has somewhere to be seen and
// used, not just written silently to storage. Read-only: most recent sign-in first, capped at
// the last 100 rows for a fast render. A row with no Logout Time / Duration means that session
// is either still open right now, or the browser/tab was closed without using Sign Out.
function renderLoginLogsPanelHtml(){
  const rows = (DB.loginLogs||[]).slice().sort((a,b)=>String(b.loginTime).localeCompare(String(a.loginTime))).slice(0,100);
  return `
    <div class="panel">
      <h3>🔐 Login Log <span class="hint">${(DB.loginLogs||[]).length} session(s) recorded</span></h3>
      <div class="desc" style="margin-bottom:12px;">Every successful sign-in — after Username + Password AND the 4-digit OTP are both verified — is logged here with Login Time, Logout Time and Session Duration. A blank Logout Time/Duration means that session is either still open or the tab was closed without using Sign Out.</div>
      <div class="grid-box" style="max-height:340px; overflow-y:auto;">
        ${rows.length ? `
        <table class="mini-table" style="width:100%; border-collapse:collapse;">
          <thead><tr style="text-align:left; font-size:10.5px; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px;">
            <th style="padding:6px 8px;">User</th><th style="padding:6px 8px;">Login Time</th><th style="padding:6px 8px;">Logout Time</th><th style="padding:6px 8px;">Duration</th>
          </tr></thead>
          <tbody>
            ${rows.map(r=>`
              <tr style="border-top:1px solid var(--line); font-size:12px;">
                <td style="padding:6px 8px; font-weight:700;">${esc(r.name||r.username)}</td>
                <td style="padding:6px 8px;">${fmtDateTime(r.loginTime)}</td>
                <td style="padding:6px 8px;">${r.logoutTime ? fmtDateTime(r.logoutTime) : '<span style="color:var(--steel,#3a8dff);">— open —</span>'}</td>
                <td style="padding:6px 8px;">${esc(r.sessionDuration)||'—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>` : `<div class="empty">No login sessions recorded yet.</div>`}
      </div>
    </div>`;
}
/* ---------------- USERS & MODULE RIGHTS ---------------- */
const MODPAGES = PAGES.filter(p=>p.id!=='dashboard'); // dashboard always visible to all logged-in users
// True if this user is the only remaining Software Admin account — deleting or renaming its
// username is blocked so the system can never end up with zero full-control accounts.
function isLastSoftwareAdmin(u){
  return u.role==='admin' && (DB.users||[]).filter(x=>x.role==='admin').length<=1;
}
function renderUsersPanelHtml(){
  const initials = s => (s||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
  const rows = (DB.users||[]).map(u=>{
    const modCount = u.role==='admin' ? MODPAGES.length : Object.values(u.rights||{}).filter(v=>v && v.view).length;
    const rowClass = u.role==='admin' ? 'is-admin' : (u.role==='restrictedAdmin' ? 'is-restricted-admin' : '');
    const metaClass = u.role==='admin' ? 'badge-admin' : (u.role==='restrictedAdmin' ? 'badge-restricted' : '');
    const metaText = u.role==='admin' ? '👑 Software Admin — full access'
      : u.role==='restrictedAdmin' ? '🛡️ Admin — User Rights + Manual Backup only'
      : modCount+' of '+MODPAGES.length+' module(s) accessible';
    return `<div class="userRow ${rowClass}">
      <div class="uinfo">
        <div class="uavatar">${esc(initials(u.name||u.username))}</div>
        <div class="utext">
          <div class="uname" title="${esc(u.name||u.username)} (${esc(u.username)})">${esc(u.name||u.username)} <span class="muted">(${esc(u.username)})</span></div>
          <div class="umeta ${metaClass}">${metaText}</div>
          <div class="umeta">📱 ${u.mobile?esc(u.mobile):'No mobile number on file'}</div>
        </div>
      </div>
      <div class="rowactions">
        <button class="btn ghost" onclick="openUserEditor('${u.id}')">✎</button>
        <button class="btn ghost" onclick="deleteUser('${u.id}')" ${isLastSoftwareAdmin(u)?'disabled title="Cannot delete the only remaining Software Admin"':''}>🗑</button>
      </div>
    </div>`;
  }).join('') || `<div class="empty">No additional users yet.</div>`;

  return `
    <div class="panel" style="margin-top:12px;">
      <h3>Users &amp; Module-wise Rights</h3>
      <div class="desc" style="margin-bottom:14px;">Create user accounts and control exactly which modules — and which sub-modules/tabs within them — each person can view or edit. Software Admin always has full control over every module. Admin is limited to User Rights and Manual Backup only.</div>
      <div class="userGrid">${rows}</div>
      <button class="btn amber" style="margin-top:14px;" onclick="openUserEditor(null)">➕ Add User</button>
      <div id="userEditorHost"></div>
    </div>`;
}
function openUserEditor(userId){
  editingUserId = userId;
  const host = document.getElementById('userEditorHost');
  const u = userId ? DB.users.find(x=>x.id===userId) : {id:null, username:'', password:'', name:'', role:'user', rights:defaultRights('none'), mobile:''};
  if(!u){ return; }
  const rights = u.rights || defaultRights('none');
  const isSuperRole = u.role==='admin' || u.role==='restrictedAdmin';
  const rightsRows = MODPAGES.map(p=>{
    const cur = rights[p.id] || {};
    const cells = RIGHT_ACTIONS.map(a=>`<td><input type="checkbox" data-mod="${p.id}" data-act="${a}" ${cur[a]?'checked':''} ${isSuperRole?'disabled':''}></td>`).join('');
    const subs = moduleSubmodules(p.id);
    const curSubs = cur.subs || {};
    const subRow = subs.length ? `<tr class="rights-subrow"><td colspan="${RIGHT_ACTIONS.length+1}">
        <div class="hint" style="position:static; font-size:9.5px; margin:2px 0 5px;">↳ Sub-Modules — untick to hide a specific tab inside ${esc(p.label)} for this user</div>
        <div style="display:flex; flex-wrap:wrap; gap:4px 14px;">
          ${subs.map(s=>`<label style="display:flex; align-items:center; gap:5px; font-size:11px; font-weight:500;">
            <input type="checkbox" data-submod="${p.id}" data-sub="${s.id}" ${(curSubs[s.id]!==false)?'checked':''} ${isSuperRole?'disabled':''}> ${esc(s.label)}
          </label>`).join('')}
        </div>
      </td></tr>` : '';
    return `<tr><td class="modname">${p.label}</td>${cells}</tr>${subRow}`;
  }).join('');
  const headerCells = RIGHT_ACTIONS.map(a=>`<th>${RIGHT_ACTION_LABELS[a]}</th>`).join('');
  host.innerHTML = `
    <div class="panel" style="margin-top:14px; background:var(--panel2);">
      <h3>${userId? 'Edit User' : 'Add New User'}</h3>
      <div class="frow g2">
        <div><label class="fl">Full Name</label><input id="ueName" value="${esc(u.name)}" placeholder="e.g. Ramesh Kumar"></div>
        <div><label class="fl">Username</label><input id="ueUsername" value="${esc(u.username)}" ${isLastSoftwareAdmin(u)?'disabled':''} placeholder="login username"></div>
      </div>
      <div class="frow g2">
        <div><label class="fl">Password</label><input id="uePassword" type="text" value="${esc(u.password)}" placeholder="login password"></div>
        <div><label class="fl">Registered Mobile Number <span class="hint" style="position:static; font-size:9.5px; color:var(--amber-dim);">(optional)</span></label>
          <input id="ueMobile" type="tel" maxlength="10" inputmode="numeric" value="${esc(u.mobile||'')}" placeholder="10-digit mobile number"></div>
      </div>
      <div class="frow g2">
        <div><label class="fl">Account Type</label>
          <select id="ueRole" onchange="document.getElementById('rightsBlock').style.display = (this.value==='admin'||this.value==='restrictedAdmin') ? 'none' : 'block';">
            <option value="user" ${u.role==='user'?'selected':''}>Standard User (module rights apply)</option>
            <option value="restrictedAdmin" ${u.role==='restrictedAdmin'?'selected':''}>Admin (User Rights + Manual Backup only)</option>
            <option value="admin" ${u.role==='admin'?'selected':''}>Software Admin (full control — all modules, both units)</option>
          </select>
        </div>
      </div>
      <div id="rightsBlock" style="display:${isSuperRole?'none':'block'}; margin-top:14px;">
        <div class="adminSectionTitle">Module &amp; Sub-Module Access Rights <span class="hint" style="text-transform:none; letter-spacing:0; font-family:var(--sans);">— tick exactly what this employee is allowed to do, module by module. "Approve" only applies where a module has an approval step (e.g. accepting a Quotation). Where a module has sub-modules (tabs), untick individual ones below its row to hide just that tab for this user.</span></div>
        <div class="rowactions" style="justify-content:flex-start; margin-bottom:10px;">
          <button type="button" class="btn ghost small" onclick="bulkSetUserRights('view')">✓ Grant View — All</button>
          <button type="button" class="btn ghost small" onclick="bulkSetUserRights('full')">✓ Grant Full — All</button>
          <button type="button" class="btn ghost small" onclick="bulkSetUserRights('none')">✕ Clear All</button>
        </div>
        <div class="tw"><table class="rights-table"><thead><tr><th style="text-align:left;">Module</th>${headerCells}</tr></thead>
        <tbody id="rightsBody">${rightsRows}</tbody></table></div>
      </div>
      <div class="rowactions" style="justify-content:flex-start; margin-top:14px;">
        <button class="btn amber" onclick="saveUser()">💾 Save User</button>
        <button class="btn ghost" onclick="closeUserEditor()">Cancel</button>
      </div>
    </div>`;
}
function bulkSetUserRights(mode){
  // mode: 'view' (tick View+Print on every module), 'full' (tick everything), 'none' (clear all)
  document.querySelectorAll('#rightsBody input[type="checkbox"]:not(:disabled)').forEach(cb=>{
    if(cb.dataset.submod){
      cb.checked = mode!=='none';
      return;
    }
    if(mode==='none'){ cb.checked = false; }
    else if(mode==='full'){ cb.checked = true; }
    else if(mode==='view'){ cb.checked = (cb.dataset.act==='view' || cb.dataset.act==='print'); }
  });
}
function closeUserEditor(){
  editingUserId = null;
  const host = document.getElementById('userEditorHost');
  if(host) host.innerHTML = '';
}
function saveUser(){
  if(!requireAdminOffice()) return;
  const username = document.getElementById('ueUsername').value.trim();
  const password = document.getElementById('uePassword').value;
  const name = document.getElementById('ueName').value.trim();
  const role = document.getElementById('ueRole').value;
  const mobile = document.getElementById('ueMobile').value.trim();
  if(!username || !password){ toast('Username and password are required'); return; }
  if(mobile && !/^\d{10}$/.test(mobile)){ toast('Registered Mobile Number must be exactly 10 digits'); return; }
  const dupe = (DB.users||[]).find(x=>x.username===username && x.id!==editingUserId);
  if(dupe){ toast('Username already exists'); return; }
  const rights = defaultRights('none');
  if(role==='admin'){
    Object.assign(rights, defaultRights('full'));
  } else if(role==='user'){
    document.querySelectorAll('#rightsBody input[type="checkbox"][data-mod]').forEach(cb=>{
      const mod = cb.dataset.mod, act = cb.dataset.act;
      if(rights[mod]) rights[mod][act] = cb.checked;
    });
    document.querySelectorAll('#rightsBody input[type="checkbox"][data-submod]').forEach(cb=>{
      const mod = cb.dataset.submod, sub = cb.dataset.sub;
      if(rights[mod]){
        if(!rights[mod].subs) rights[mod].subs = {};
        rights[mod].subs[sub] = cb.checked;
      }
    });
  }
  // role==='restrictedAdmin' (Admin): access is hardcoded to User Rights + Manual Backup only
  // (see hasRight/getRight/renderAdmin) — the per-module rights object is irrelevant for it and
  // is left at the 'none' default above.
  if(editingUserId){
    const u = DB.users.find(x=>x.id===editingUserId);
    Object.assign(u, {username, password, name, role, rights, mobile});
  }else{
    const id = uid('us');
    DB.users.push({id, username, password, name, role, rights, mobile});
  }
  saveDB(); toast('User saved'); closeUserEditor(); render();
}
function deleteUser(id){
  if(!requireAdminOffice()) return;
  const u = DB.users.find(x=>x.id===id);
  if(u && isLastSoftwareAdmin(u)){ toast('Cannot delete the only remaining Software Admin'); return; }
  if(!confirm('Delete this user?')) return;
  DB.users = DB.users.filter(x=>x.id!==id);
  saveDB(); toast('User deleted'); render();
}
/* ---- Statutory Registrations (GSTIN / CIN / MSME-Udyam) — Software Admin & Admin roles only ---- */
function canManageStatutory(){
  return !!(currentUser && (currentUser.role==='admin' || currentUser.role==='restrictedAdmin'));
}
const STATUTORY_PATTERNS = {
  gstin: {re:/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, label:'GSTIN', eg:'33AAFCV5068H1Z7'},
  cin:   {re:/^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/, label:'CIN', eg:'U12345TN2010PTC012345'},
  msmeNo:{re:/^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/, label:'MSME (Udyam) No', eg:'UDYAM-TN-24-0000294'}
};
function renderStatutoryPanelHtml(){
  if(!canManageStatutory()) return '';
  const gs = DB.settings.gst || {};
  const cat = gs.msmeCategory || '';
  const preview = [
    `GSTIN : ${esc(gs.gstin)||'—'}`,
    gs.cin ? `CIN : ${esc(gs.cin)}` : '',
    gs.msmeNo ? `MSME No : ${esc(gs.msmeNo)}${cat?' ('+esc(cat)+')':''}` : ''
  ].filter(Boolean).join('<br>');
  return `
    <div class="panel addrGrid" style="margin-top:12px;">
      <h3>🏛️ Statutory Registrations <span class="hint" style="position:static; font-size:9.5px;">(Software Admin / Admin only — printed on Sales &amp; Job Work Tax Invoices)</span></h3>
      <div class="desc" style="margin-bottom:14px;">Company GSTIN, CIN and MSME (Udyam) registration. Every invoice printout reads these values live, so an update here applies to the next print — no need to re-save existing invoices. Leave a field blank to hide it from the invoice.</div>
      <div class="frow g4">
        <div><label class="fl">Company GSTIN</label><input id="stGstin" value="${esc(gs.gstin)}" placeholder="${STATUTORY_PATTERNS.gstin.eg}" maxlength="15" style="text-transform:uppercase;"></div>
        <div><label class="fl">CIN No</label><input id="stCin" value="${esc(gs.cin)}" placeholder="${STATUTORY_PATTERNS.cin.eg}" maxlength="21" style="text-transform:uppercase;"></div>
        <div><label class="fl">MSME / Udyam Registration No</label><input id="stMsmeNo" value="${esc(gs.msmeNo)}" placeholder="${STATUTORY_PATTERNS.msmeNo.eg}" maxlength="19" style="text-transform:uppercase;"></div>
        <div><label class="fl">MSME Category</label>
          <select id="stMsmeCat">
            <option value="" ${!cat?'selected':''}>— Select —</option>
            ${['Micro','Small','Medium'].map(c=>`<option value="${c}" ${cat===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="frow g2">
        <div><label class="fl">Invoice Header Preview</label><div style="font-size:12.5px; line-height:1.6;">${preview}</div></div>
        <div><label class="fl">Last Updated</label><div style="font-size:12.5px;">${gs.statutoryUpdatedAt ? esc(fmtDateTime(gs.statutoryUpdatedAt))+' by '+esc(gs.statutoryUpdatedBy||'—') : '— Not updated yet —'}</div></div>
      </div>
      <button class="btn amber" style="margin-top:6px;" onclick="saveStatutoryDetails()">💾 Save Statutory Registrations</button>
    </div>`;
}
function saveStatutoryDetails(){
  if(!canManageStatutory()){ toast('Only Software Admin or Admin can update Statutory Registrations'); return; }
  if(!requireAdminOffice()) return;
  const val = id => (document.getElementById(id).value||'').trim().toUpperCase().replace(/\s+/g,'');
  const vals = { gstin: val('stGstin'), cin: val('stCin'), msmeNo: val('stMsmeNo') };
  for(const k of Object.keys(vals)){
    const p = STATUTORY_PATTERNS[k];
    if(vals[k] && !p.re.test(vals[k])){ toast(`${p.label} format looks wrong — expected like ${p.eg}`); return; }
  }
  const msmeCategory = document.getElementById('stMsmeCat').value;
  if(vals.msmeNo && !msmeCategory){ toast('Select the MSME Category (Micro / Small / Medium)'); return; }
  DB.settings.gst = Object.assign({}, DB.settings.gst||{}, vals, {
    msmeCategory: vals.msmeNo ? msmeCategory : '',
    statutoryUpdatedBy: (currentUser && (currentUser.name||currentUser.username)) || 'System',
    statutoryUpdatedAt: new Date().toISOString()
  });
  saveDB(); toast('Statutory registrations saved'); render();
}
function saveGstBankDetails(){
  if(!requireAdminOffice()) return;
  // Merge (not replace) so the Statutory Registrations fields — GSTIN, CIN, MSME — which are
  // maintained separately by Admin roles only, are never wiped by this save.
  DB.settings.gst = Object.assign({}, DB.settings.gst||{}, {
    stateCode: document.getElementById('gsStateCode').value.trim(),
    stateName: document.getElementById('gsStateName').value.trim(),
    email: document.getElementById('gsEmail').value.trim(),
    phone: document.getElementById('gsPhone').value.trim()
  });
  DB.settings.bank = {
    accName: document.getElementById('bkAccName').value.trim(),
    accNo: document.getElementById('bkAccNo').value.trim(),
    bankName: document.getElementById('bkBankName').value.trim(),
    branch: document.getElementById('bkBranch').value.trim(),
    ifsc: document.getElementById('bkIfsc').value.trim()
  };
  saveDB(); toast('GST & Bank details saved'); render();
}
function saveAdminAddresses(){
  if(!requireAdminOffice()) return;
  DB.settings.addresses = {
    office: document.getElementById('adOffice').value.trim(),
    unit1: document.getElementById('adUnit1').value.trim(),
    unit2: document.getElementById('adUnit2').value.trim()
  };
  saveDB(); toast('Addresses saved'); render();
}
function handleLogoUpload(input){
  const file = input.files && input.files[0];
  if(!file) return;
  if(file.size > 1.5*1024*1024){ toast('Logo image too large — please use an image under 1.5MB'); input.value=''; return; }
  const reader = new FileReader();
  reader.onload = (e)=>{
    const preview = document.getElementById('coLogoPreview');
    const wrap = document.getElementById('coLogoPreviewWrap');
    if(preview) preview.src = e.target.result;
    if(wrap) wrap.style.display = 'block';
    input.dataset.pendingLogo = e.target.result;
  };
  reader.readAsDataURL(file);
}
function removeCompanyLogo(){
  const fileInput = document.getElementById('coLogoFile');
  const preview = document.getElementById('coLogoPreview');
  const wrap = document.getElementById('coLogoPreviewWrap');
  if(fileInput){ fileInput.value=''; delete fileInput.dataset.pendingLogo; fileInput.dataset.removed='1'; }
  if(preview) preview.src = '';
  if(wrap) wrap.style.display = 'none';
}
function saveCompanyMaster(){
  if(!requireAdminOffice()) return;
  const name = document.getElementById('coName').value.trim();
  const fileInput = document.getElementById('coLogoFile');
  const existing = (DB.settings.company||{}).logo || '';
  let logo = existing;
  if(fileInput && fileInput.dataset.removed==='1'){ logo = ''; }
  else if(fileInput && fileInput.dataset.pendingLogo){ logo = fileInput.dataset.pendingLogo; }
  DB.settings.company = { name: name || 'VISALAM INDUSTRIES PVT LTD', logo };
  saveDB(); toast('Company Master saved'); render();
}
