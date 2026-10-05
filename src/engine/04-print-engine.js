/* ---------------- A4 PRINT ENGINE ---------------- */
/* ---------------- SHARED PRINT THEME HELPERS ----------------
   One consistent professional theme is used across every print format (reports, quotations,
   purchase orders, invoices, etc). Rows/labels for Totals, Grand Total, Status, Result, Summary
   and Remarks are auto-detected and given a shared highlight treatment (colour + bold + border)
   so they read clearly in colour AND in black-and-white printing. */
function hiWrap(html){
  if(!html) return html;
  // Uses safe DOM parsing (not regex) to avoid catastrophic-backtracking hangs on large/irregular
  // print content (e.g. Job Work Quotation rows) — the previous regex-based version could freeze the tab.
  // A <template> is used because its content model allows stray <tr>/<td> fragments (no <table>
  // ancestor needed) to parse correctly, unlike a normal document/body parse.
  try{
    const HI_LABEL_RE = /^(status|remarks?|summary|result)$/i;
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const frag = tpl.content;
    frag.querySelectorAll('tr').forEach(tr=>{
      let isHi = false, isTotal = false;
      tr.querySelectorAll('td,th').forEach(cell=>{
        const txt = (cell.textContent||'').trim();
        if(HI_LABEL_RE.test(txt)) isHi = true;
        const strong = cell.querySelector('strong');
        if(strong && /^(grand\s+)?total$/i.test((strong.textContent||'').trim())) isTotal = true;
      });
      if(isHi) tr.classList.add('prHiRow');
      if(isTotal) tr.classList.add('prTotalRow');
    });
    frag.querySelectorAll('div.kv').forEach(kv=>{
      const k = kv.querySelector('span.k');
      if(k && HI_LABEL_RE.test((k.textContent||'').trim())) kv.classList.add('prHiRow');
    });
    const out = document.createElement('div');
    out.appendChild(frag.cloneNode(true));
    return out.innerHTML;
  }catch(e){
    // If parsing fails for any reason, fall back to the original, un-highlighted HTML
    // rather than risking a hang.
    return html;
  }
}
function printReport(title, headers, rows, opts){
  opts = opts || {};
  const addr = (DB.settings.addresses||{});
  const co = DB.settings.company || {name:'VISALAM INDUSTRIES PVT LTD', logo:''};
  // Only the Production module is allowed to show the unit-specific works address (opts.showUnitAddress===true).
  // Every other module/report always shows only the single Admin Office address, managed centrally in the Admin Module,
  // so a change made there automatically reflects everywhere without any manual updates.
  const unitAddr = opts.showUnitAddress ? (currentUnit==='Unit-1' ? addr.unit1 : currentUnit==='Unit-2' ? addr.unit2 : addr.office) : '';
  const officeAddr = addr.office||'';
  // opts.unitAddrOverride (used by Purchase Order printing, same pattern as the Sales Invoice
  // printout) fully replaces the header address with the ONE address belonging to the record's
  // own selected Unit — instead of always showing the Admin Office address. Left undefined for
  // every other module/report, so their address behaviour is completely unchanged.
  const hasAddrOverride = Object.prototype.hasOwnProperty.call(opts, 'unitAddrOverride');
  const headerAddr = hasAddrOverride ? opts.unitAddrOverride : officeAddr;
  // opts.headerAddrHtml (used by Purchase Order printing only) fully replaces how the header
  // address is broken into lines — e.g. putting "Visalam Industries Pvt Ltd Unit 1" on its own
  // first line, with the rest of the address (D.P.No, street, city...) starting fresh below it —
  // instead of the default addrLines() comma-splitting. Left undefined for every other
  // module/report, so their header address formatting is completely unchanged.
  const w = window.open('', '_blank', 'width=900,height=1000');
  if(!w){ alert('Popup blocked — please allow popups for this site to print.'); return; }
  const theadHtml = opts.theadHtml || ('<tr>'+headers.map(h=>`<th>${esc(h)}</th>`).join('')+'</tr>');
  let bodyHtml = opts.bodyHtml || (rows.length ? rows.map(r=>'<tr>'+r.map(c=>`<td>${c}</td>`).join('')+'</tr>').join('')
    : `<tr><td colspan="${headers.length}" style="text-align:center; padding:12px; color:#888;">No records</td></tr>`);
  bodyHtml = hiWrap(bodyHtml);
  const noteHtml = opts.note ? `<div class="prNote">${hiWrap(opts.note)}</div>` : '';
  const footerHtml = opts.footerHtml ? hiWrap(opts.footerHtml) : '';
  const pageSize = opts.orientation==='landscape' ? 'A4 landscape' : 'A4';
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title>
  <style>
    @page{ size:${pageSize}; margin:${opts.pageMargin||'14mm'}; }
    *{ box-sizing:border-box; }
    :root{
      --accent:#164a63; --accent-dark:#0d3145; --accent-dim:#e9f0f4; --accent-dim2:#f4f8fa;
      --highlight-bg:#fdf3d9; --highlight-border:#c99420; --highlight-ink:#5c4409;
      --ink:#0f1e2b; --sub-ink:#3d4d5b; --line-soft:#b7c1c9; --line-mid:#93a0a8;
    }
    body{ font-family:'Segoe UI',Arial,sans-serif; color:var(--ink); margin:0; padding:0; font-size:12px; line-height:1.45; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .prHead{ display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2.5px solid var(--accent); padding-bottom:14px; margin-bottom:18px; gap:14px; }
    .prHead .brandBlock{ display:flex; align-items:flex-start; gap:12px; }
    .prHead .brandBlock img{ max-height:52px; max-width:130px; object-fit:contain; }
    .prHead h1{ font-size:20px; margin:0 0 4px; letter-spacing:0.3px; font-weight:800; color:var(--accent-dark); }
    .prHead .sub{ font-size:11px; color:var(--sub-ink); }
    .prHead .sub.office{ margin-top:2px; }
    .addrLine{ line-height:1.5; }
    .prHead .meta{ text-align:right; font-size:11px; color:var(--sub-ink); line-height:1.7; }
    .prHead .meta strong{ font-size:12px; color:var(--accent); }
    .prTitle{ font-size:14px; font-weight:700; margin:0 0 10px; text-transform:uppercase; letter-spacing:1px; color:#fff; text-align:center; background:linear-gradient(135deg,var(--accent),var(--accent-dark)); padding:8px 14px; border-radius:4px; }
    .prBar{ display:flex; flex-direction:column; gap:6px; font-size:11px; color:var(--sub-ink); margin-bottom:14px; padding:9px 12px; border:1px solid var(--line-soft); border-left:3px solid var(--accent); background:var(--accent-dim); border-radius:3px; }
    .prBar .prBarRow{ display:flex; justify-content:space-between; gap:14px; }
    .prBar .prBarRow span{ line-height:1.6; }
    .prBar .prBarAddr{ line-height:1.6; padding-top:4px; border-top:1px dashed var(--line-soft); }
    .prBar .prBarAddr strong{ color:var(--accent-dark); }
    .prBar .prBarAddrLine{ padding-left:2px; }
    table{ width:100%; border-collapse:collapse; table-layout:fixed; }
    th, td{ border:1px solid var(--line-soft); padding:7px 9px; font-size:11px; word-wrap:break-word; vertical-align:middle; text-align:center; }
    th{ background:var(--accent); color:#fff; text-transform:uppercase; letter-spacing:0.4px; font-size:9.5px; text-align:center; border-color:var(--accent); font-weight:700; }
    td.char{ font-weight:600; }
    td.num, th.num{ text-align:center; }
    tr:nth-child(even) td{ background:var(--accent-dim2); }
    tr:last-child td{ border-bottom:1.5px solid var(--accent); }
    /* Highlighted rows: Totals / Grand Total / Status / Result / Summary / Remarks — coloured AND
       bold with a stronger border so the emphasis still reads clearly on a black-and-white printout. */
    tr.prTotalRow td, tr.prHiRow td{ background:var(--highlight-bg) !important; color:var(--highlight-ink); font-weight:700; border-top:1.6px solid var(--highlight-border); border-bottom:1.6px solid var(--highlight-border); }
    .prFoot{ margin-top:36px; display:flex; justify-content:space-between; font-size:11px; }
    .prFoot .sign{ border-top:1px solid #1a1a1a; padding-top:6px; width:160px; text-align:center; color:#1a1a1a; letter-spacing:0.2px; }
    .prMetaRow{ margin-top:16px; }
    .prNote{ margin-top:18px; font-size:10.5px; color:#1a1a1a; border:1px solid var(--line-soft); border-left:3px solid var(--accent); padding:0; background:#fff; border-radius:4px; overflow:hidden; }
    .prNote.prNoteBefore{ margin-top:0; margin-bottom:18px; }
    .prNote .ntTitle{ font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.7px; background:var(--accent-dim); padding:8px 13px; border-bottom:1px solid var(--line-soft); color:var(--accent-dark); }
    .prNote .ntBody{ padding:11px 13px 13px; }
    .prNote table{ width:100%; border-collapse:collapse; margin-bottom:6px; }
    .prNote table td{ border:none; padding:4px 6px; font-size:10.5px; vertical-align:middle; text-align:center; }
    .prNote table td.k{ width:150px; font-weight:700; white-space:nowrap; padding-right:8px; color:var(--sub-ink); }
    .prNote table td.v{ color:#141414; }
    .prNote table tr.prHiRow td{ border-radius:3px; }
    .prNote .ntPara{ margin:6px 0 0; line-height:1.6; }
    .prNote .ntPara strong{ text-transform:uppercase; }
    .prNote .ntWarn{ margin-top:8px; padding:8px 10px; background:var(--highlight-bg); border:1px solid var(--highlight-border); color:var(--highlight-ink); font-style:italic; border-radius:3px; }
    .prRemarks{ margin-top:12px; border:1px solid var(--highlight-border); border-left:3px solid var(--highlight-border); border-radius:4px; overflow:hidden; page-break-inside:avoid; }
    .prRemarks .rmTitle{ font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.7px; background:var(--highlight-bg); padding:8px 13px; border-bottom:1px solid var(--highlight-border); color:var(--highlight-ink); }
    .prRemarks .rmBody{ padding:10px 13px 12px; font-size:11px; color:#141414; line-height:1.6; white-space:pre-wrap; }
    @media print{ .noPrint{ display:none; } }
    .noPrint{ text-align:center; margin:14px 0; }
    .noPrint button{ padding:8px 18px; font-size:13px; cursor:pointer; margin:0 4px; border-radius:3px; border:1px solid #ccc; background:#fff; }
    .noPrint button:first-child{ background:var(--accent); color:#fff; border-color:var(--accent); }
    body{ padding:5mm 3mm; }
    @media print{
      tr.prTotalRow td, tr.prHiRow td, .prRemarks .rmTitle, .prNote .ntWarn{ background:var(--highlight-bg) !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    }
    /* opts.copies (e.g. Purchase Order's ["ORIGINAL COPY FOR SUPPLIER","OFFICE COPY"]) prints
       multiple labelled copies of the same document from a single Print action — each copy on
       its own page. Unused by every other report (opts.copies left undefined), so this has no
       effect anywhere else. */
    .prCopyLabel{ text-align:center; font-weight:800; font-size:12.5px; letter-spacing:1.2px; text-transform:uppercase; color:#fff; background:linear-gradient(135deg,var(--accent-dark),var(--accent)); padding:6px 10px; border-radius:3px; margin-bottom:12px; }
    .prCopyBreak{ page-break-after:always; }
  </style>${opts.extraCss?`<style>${opts.extraCss}</style>`:''}</head><body>
    ${(()=>{
      const docBodyHtml = `
    <div class="prHead">
      <div class="brandBlock">
        ${co.logo ? `<img src="${co.logo}" alt="logo">` : ''}
        <div>
          <h1>${esc(co.name||'VISALAM INDUSTRIES PVT LTD')}</h1>
          ${opts.headerAddrHtml ? opts.headerAddrHtml : (headerAddr ? `<div class="sub office">${addrLines(headerAddr)}</div>` : '')}
          ${(!opts.headerAddrHtml && !hasAddrOverride && unitAddr && unitAddr!==officeAddr) ? `<div class="sub">${addrLines(unitAddr)}</div>` : ''}
          ${opts.showGstin ? `<div class="sub" style="margin-top:3px; font-weight:700; color:var(--accent-dark);">GSTIN : ${esc((DB.settings.gst||{}).gstin)||'—'}</div>` : ''}
          <!-- opts.showGstin (Purchase Order print only) prints Visalam's own Company GSTIN
               under the address in the header. Left off by default, so every other
               printReport-based report/printout is unaffected. -->
        </div>
      </div>
      <div class="meta">
        <div><strong>${esc(unitLabel())}</strong></div>
        <div>Printed: ${(()=>{ const d=new Date(); const p=n=>String(n).padStart(2,'0'); return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()}, ${p(d.getHours()%12||12)}:${p(d.getMinutes())} ${d.getHours()<12?'AM':'PM'}`; })()}</div>
      </div>
    </div>
    <div class="prTitle">${esc(title)}</div>
    ${opts.barLeft || opts.barRight ? `<div class="prBar"><div class="prBarRow"><span>${opts.barLeft||''}</span><span>${opts.barRight||''}</span></div>${opts.barAddr?`<div class="prBarAddr"><strong>Address:</strong>${addr3Lines(opts.barAddr,'prBarAddrLine')}</div>`:''}</div>` : ''}
    ${opts.notePosition==='before' ? noteHtml.replace('class="prNote"','class="prNote prNoteBefore"') : ''}
    <table>${opts.colgroupHtml||''}<thead>${theadHtml}</thead><tbody>${bodyHtml}</tbody></table>
    ${opts.notePosition==='before' ? '' : noteHtml}
    ${footerHtml}
    ${opts.showSign!==false ? `<div class="prFoot"><div class="sign">Prepared By</div><div class="sign">Verified By</div><div class="sign">Authorized Signatory</div></div>` : ''}`;
      if(opts.copies && opts.copies.length){
        return opts.copies.map((label,idx)=>`<div${idx<opts.copies.length-1?' class="prCopyBreak"':''}>
          <div class="prCopyLabel">${esc(label)}</div>
          ${docBodyHtml}
        </div>`).join('');
      }
      return docBodyHtml;
    })()}
    <div class="noPrint">
      <button onclick="window.print()">🖨 Print</button>
      <button onclick="window.close()">Close</button>
    </div>
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(()=>{ try{ w.print(); }catch(e){} }, 300);
}
