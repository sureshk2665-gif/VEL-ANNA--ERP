/* ===== Customer Short Name — screen-display helper =====
   Customer Management lets a Short Name be set purely to save space on-screen. These two
   helpers are the ONLY place that resolves it, and are used strictly on live in-app screens
   (cards, lists, dropdown labels, headers) — never inside printReport()/printX() functions,
   invoices, or any other generated document, which must always show the Full Customer Name.
   custDispById: when a customerId is available (most linked records).
   custDispByName: when only the customer name string is stored (legacy / unlinked records) —
   looks the customer up by name so Short Name still applies without needing a schema change. */
function custDispById(customerId, fallbackName){
  if(customerId){
    const c = DB.customers.find(x=>x.id===customerId);
    if(c) return c.shortName || c.name || fallbackName || '';
  }
  return fallbackName || '';
}
function custDispByName(name){
  if(!name) return name;
  const key = String(name).trim().toLowerCase();
  if(!key) return name;
  const c = DB.customers.find(x=>(x.name||'').trim().toLowerCase()===key);
  return (c && c.shortName) ? c.shortName : name;
}
function addrLines(s, cls){
  if(!s) return '';
  const parts = s.toString().split(/(?<=[.,])\s+|\n+/).map(x=>x.trim()).filter(Boolean);
  if(!parts.length) return '';
  return parts.map(p=>`<div class="${cls||'addrLine'}">${esc(p)}</div>`).join('');
}
// Groups an address into exactly up to 3 balanced lines (never squashed onto one line),
// splitting on commas/newlines and evenly distributing extra segments across 3 rows.
function addr3Lines(s, cls){
  if(!s) return '';
  const parts = s.toString().split(/,|\n/).map(x=>x.trim()).filter(Boolean);
  if(!parts.length) return '';
  const n = Math.min(3, parts.length);
  const lines = [];
  const base = Math.floor(parts.length/n), extra = parts.length%n;
  let idx = 0;
  for(let i=0;i<n;i++){
    const cnt = base + (i<extra?1:0);
    lines.push(parts.slice(idx, idx+cnt).join(', '));
    idx += cnt;
  }
  return lines.map(l=>`<div class="${cls||'addrLine'}">${esc(l)}</div>`).join('');
}
// Shared company/unit header-address line-break formatter for the Purchase Order, Sales Invoice
// and Job Work Invoice PRINT TEMPLATES ONLY — gives all three the same consistent layout:
//   Line 1: Company-Unit name          e.g. "Visalam Industries Pvt Ltd-Unit-1"
//   Line 2: Plot/Door No + Estate name e.g. "D.P.NO G-51 | Sidco Industrial Estate"
//   Line 3: Area / City                e.g. "Kakkalur, Thiruvallur"
//   Line 4: Pin Code, on its own line  e.g. "Pin-602003"
// (Cell/Email are printed separately by each template, not part of this address string.)
// Falls back gracefully — fewer comma-separated segments just means fewer lines.
function printHeaderAddrHtml(addrStr, cls){
  cls = cls || 'addrLine';
  if(!addrStr) return '';
  const parts = addrStr.toString().split(',').map(x=>x.trim()).filter(Boolean);
  if(!parts.length) return '';
  const lines = [];
  lines.push(parts[0]);
  let restStart = 1;
  if(parts.length>=3){ lines.push(parts[1]+' | '+parts[2]); restStart = 3; }
  else if(parts.length===2){ lines.push(parts[1]); restStart = 2; }
  const rest = parts.slice(restStart);
  const pinIdx = rest.findIndex(p=>/pin/i.test(p));
  let pinPart = '', areaParts = rest;
  if(pinIdx!==-1){ pinPart = rest[pinIdx]; areaParts = rest.filter((_,i)=>i!==pinIdx); }
  if(areaParts.length) lines.push(areaParts.join(', '));
  if(pinPart) lines.push(pinPart);
  return lines.map(l=>`<div class="${cls}">${esc(l)}</div>`).join('');
}
const THEMES = [
  {id:'corporate', label:'Corporate', dots:['#f4f6f8','#1f3a5f','#a97c1f']},
  {id:'light',     label:'Daylight',  dots:['#eef1f4','#2f6690','#b8730f']},
  {id:'slate',     label:'Slate',     dots:['#eef1f5','#33517a','#a1700f']},
  {id:'forest',    label:'Forest',    dots:['#f0f5f1','#1e6b45','#a1700f']},
];
function renderThemeGrid(){
  const grid = document.getElementById('themeGrid');
  if(!grid) return;
  const current = (DB.settings && DB.settings.theme) || 'corporate';
  grid.innerHTML = THEMES.map(t=>`
    <div class="theme-swatch ${current===t.id?'active':''}" title="${esc(t.label)}" onclick="setAppTheme('${t.id}')">
      <div class="ts-dots">${t.dots.map(c=>`<span class="ts-dot" style="background:${c};"></span>`).join('')}</div>
      <div class="ts-label">${esc(t.label)}</div>
    </div>`).join('');
}
function setAppTheme(t){
  DB.settings = DB.settings || {};
  DB.settings.theme = t;
  applyTheme(t);
  renderThemeGrid();
  saveDB();
}
function applyTheme(t){
  document.body.setAttribute('data-theme', t || 'corporate');
}

const PAGES = [
  {id:'dashboard', label:'Dashboard', n:'01'},
  {id:'quotation', label:'Quotation', n:'02'},
  {id:'custPO', label:'Customer PO', n:'03'},
  {id:'productDev', label:'Product Development', n:'04'},
  {id:'prodPlan', label:'Planning', n:'05'},
  {id:'purchase', label:'Purchase', n:'06'},
  {id:'receiving', label:'Receiving Inspection', n:'07'},
  {id:'stores', label:'Stores', n:'08'},
  {id:'production', label:'Production', n:'09'},
  {id:'finalInsp', label:'Final Inspection', n:'10'},
  {id:'inventory', label:'Finished Goods', n:'11'},
  {id:'sales', label:'Sales', n:'12'},
  {id:'jobTracking', label:'Job Card Tracking', n:'13'},
  {id:'machines', label:'Machine Master', n:'14'},
  {id:'maintenance', label:'Maintenance', n:'15'},
  {id:'tools', label:'Tool Management', n:'16'},
  {id:'calibration', label:'Calibration', n:'17'},
  {id:'hr', label:'Human Resources', n:'18'},
  {id:'finance', label:'Finance', n:'19'},
  {id:'admin', label:'Admin', n:'20'},
];
