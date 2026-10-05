/* ===== ERP-wide standard dropdown widget engine =====
   Converts every <select> in the app into the standard searchable dropdown (card-style
   trigger + popover with search field + option list), matching one consistent design across
   every module. The original <select> stays in the DOM (hidden, value/onchange untouched) so
   all existing code keeps working exactly as before — this only changes how it's presented.
   Works automatically for selects rendered now AND any added later (via render() re-runs,
   partial innerHTML updates, dynamically added rows, etc.) through a MutationObserver, so any
   new dropdown created in future code automatically gets this same look with no extra work. */
(function(){
  function closeAllPanels(except){
    document.querySelectorAll('.cdd-panel.open').forEach(p=>{
      if(p===except) return;
      p.classList.remove('open'); p.style.display='none';
      const t = p.previousElementSibling; if(t && t.classList) t.classList.remove('open');
    });
  }
  function enhanceOne(sel){
    if(!sel || sel.dataset.cddEnhanced || sel.classList.contains('cdd-skip')) return;
    sel.dataset.cddEnhanced='1';
    sel.classList.add('cdd-native');
    const wrap=document.createElement('div');
    wrap.className='cdd-wrap';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);

    const trigger=document.createElement('button');
    trigger.type='button'; trigger.className='cdd-trigger';
    const labelSpan=document.createElement('span'); labelSpan.className='cdd-label';
    const caret=document.createElement('span'); caret.className='cdd-caret';
    trigger.appendChild(labelSpan); trigger.appendChild(caret);
    wrap.appendChild(trigger);

    const panel=document.createElement('div'); panel.className='cdd-panel';
    const search=document.createElement('input');
    search.type='text'; search.className='cdd-search'; search.placeholder='Search...';
    const list=document.createElement('div'); list.className='cdd-list';
    panel.appendChild(search); panel.appendChild(list);
    wrap.appendChild(panel);

    function isPlaceholderOpt(opt){ return !opt.value; }
    function renderList(filter){
      list.innerHTML='';
      const f=(filter||'').trim().toLowerCase();
      let any=false;
      Array.from(sel.options).forEach(opt=>{
        const txt=opt.textContent;
        const isAddNew = opt.value==='__add_new_grade__';
        if(f && !isAddNew && !txt.toLowerCase().includes(f)) return;
        any=true;
        const row=document.createElement('div');
        row.className='cdd-option'+(opt.selected?' sel':'')+(isPlaceholderOpt(opt)?' placeholder':'')+(opt.disabled?' disabled':'')+(opt.value==='__add_new_grade__'?' cdd-add-new':'');
        row.textContent=txt;
        row.onclick=()=>{
          if(opt.disabled) return;
          sel.value=opt.value;
          sel.dispatchEvent(new Event('change',{bubbles:true}));
          sel.dispatchEvent(new Event('input',{bubbles:true}));
          syncTrigger();
          closeAllPanels();
        };
        list.appendChild(row);
      });
      if(!any){ const e=document.createElement('div'); e.className='cdd-empty'; e.textContent='No matches'; list.appendChild(e); }
    }
    function syncTrigger(){
      const opt=sel.options[sel.selectedIndex];
      labelSpan.textContent = opt ? opt.textContent : '';
      labelSpan.classList.toggle('placeholder', !!(opt && isPlaceholderOpt(opt)));
      trigger.disabled = sel.disabled;
    }
    function openPanel(){
      closeAllPanels(panel);
      panel.classList.add('open'); panel.style.display='block'; trigger.classList.add('open');
      search.value=''; renderList('');
      setTimeout(()=>search.focus(), 0);
    }
    trigger.addEventListener('click', e=>{
      e.stopPropagation();
      if(sel.disabled) return;
      if(panel.classList.contains('open')){ closeAllPanels(); }
      else openPanel();
    });
    search.addEventListener('input', ()=>renderList(search.value));
    search.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeAllPanels(); trigger.focus(); } });
    panel.addEventListener('click', e=>e.stopPropagation());

    // Keep the trigger label in sync if code elsewhere mutates the select's value/options
    // directly (common in this app, e.g. document.getElementById(id).value = x).
    new MutationObserver(syncTrigger).observe(sel, {attributes:true, attributeFilter:['disabled'], childList:true, subtree:true});
    sel.addEventListener('change', syncTrigger);
    const origDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(sel, 'value', {
      get(){ return origDescriptor.get.call(this); },
      set(v){ origDescriptor.set.call(this, v); syncTrigger(); },
      configurable:true
    });
    syncTrigger();
  }
  function enhanceAll(root){
    (root||document).querySelectorAll('select:not([data-cdd-enhanced])').forEach(enhanceOne);
  }
  document.addEventListener('click', ()=>closeAllPanels());
  document.addEventListener('DOMContentLoaded', ()=>enhanceAll(document));
  enhanceAll(document);
  const mo = new MutationObserver(muts=>{
    for(const m of muts){
      m.addedNodes && m.addedNodes.forEach(n=>{
        if(n.nodeType!==1) return;
        if(n.matches && n.matches('select')) enhanceOne(n);
        else if(n.querySelectorAll) enhanceAll(n);
      });
    }
  });
  mo.observe(document.body, {childList:true, subtree:true});
  // Safety net: the app rebuilds large chunks of the DOM via innerHTML on almost every click
  // (render(), sub-tab renders, dynamic "Add Stage"/"Add Item" rows, etc.). The MutationObserver
  // above catches virtually all of it, but as a guarantee that literally every dropdown in every
  // module/sub-module always gets the same standard design with no exceptions, run a lightweight
  // periodic sweep as well.
  setInterval(()=>enhanceAll(document), 300);
})();
