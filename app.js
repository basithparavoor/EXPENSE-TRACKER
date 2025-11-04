// app.js — Shared utilities & profile support for FinAssist
// Replace your existing app.js with this file.

(function(){
  ////////////////////////
  // jsPDF loader
  ////////////////////////
  (function loadJsPDF(){
    if(window.jspdf) return;
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = function(){ /* loaded */ };
    s.onerror = function(){ console.warn('jsPDF failed to load from CDN'); };
    document.head.appendChild(s);
  })();

  function waitFor(conditionFn, timeout = 4000, interval = 80) {
    const start = Date.now();
    return new Promise((resolve) => {
      (function check(){
        try {
          if (conditionFn()) return resolve(true);
          if (Date.now() - start > timeout) return resolve(false);
          setTimeout(check, interval);
        } catch (err) { return resolve(false); }
      })();
    });
  }

  ////////////////////////
  // Settings / Theme
  ////////////////////////
  const DARK_STYLE_ID = 'tfm-dark-runtime-styles';

  function getSettings(){
    try {
      return JSON.parse(localStorage.getItem('tfm_settings') || '{"theme":"light","fontSize":"medium","fontFamily":"Inter"}');
    } catch(e){
      return {theme:'light', fontSize:'medium', fontFamily:'Inter'};
    }
  }

  // Add or update runtime CSS for dark mode so static Tailwind 'bg-white' etc become dark.
  function applyRuntimeDarkStyles(enable){
    let style = document.getElementById(DARK_STYLE_ID);
    if(style) style.remove();
    if(!enable) return;

    style = document.createElement('style');
    style.id = DARK_STYLE_ID;
    style.textContent = `
/* Runtime dark overrides for static tailwind classes used in the simple multi-page app */
html.tfm-dark, html.tfm-dark body {
  background-color: #071129 !important;
  color: #e6eef8 !important;
}
html.tfm-dark .bg-white { background-color: #07122a !important; color: #e6eef8 !important; }
html.tfm-dark .bg-slate-50 { background-color: #0b1724 !important; color: #cfe6ff !important; }
html.tfm-dark .text-slate-900 { color: #e6eef8 !important; }
html.tfm-dark .text-slate-500 { color: #93a3b6 !important; }
html.tfm-dark .text-slate-400 { color: #7d95aa !important; }
html.tfm-dark .border { border-color: rgba(255,255,255,0.06) !important; }
html.tfm-dark input, html.tfm-dark textarea, html.tfm-dark select {
  background-color: #061226 !important;
  color: #e6eef8 !important;
  border-color: rgba(255,255,255,0.06) !important;
}
html.tfm-dark input::placeholder, html.tfm-dark textarea::placeholder { color: rgba(230,238,248,0.5) !important; }
html.tfm-dark .bg-amber-500 { background-color: #f59e0b !important; color: #081020 !important; }
html.tfm-dark footer, html.tfm-dark nav, html.tfm-dark .fixed { background-color: rgba(10,15,25,0.7) !important; color: #cfe6ff !important; }
html.tfm-dark .shadow-lg { box-shadow: 0 6px 20px rgba(2,6,23,0.6) !important; }
    `;
    document.head.appendChild(style);
  }

  function applySettings(){
    const s = getSettings();
    if(s.theme === 'dark'){
      document.documentElement.classList.add('tfm-dark');
      applyRuntimeDarkStyles(true);
    } else {
      document.documentElement.classList.remove('tfm-dark');
      applyRuntimeDarkStyles(false);
    }

    if(s.fontSize === 'small') document.documentElement.style.fontSize = '14px';
    else if(s.fontSize === 'large') document.documentElement.style.fontSize = '18px';
    else document.documentElement.style.fontSize = '16px';

    document.documentElement.style.fontFamily = s.fontFamily || 'Inter';
  }

  // Listen for settings changes across tabs (storage event)
  window.addEventListener('storage', (ev)=>{
    if(ev.key === 'tfm_settings'){
      try { applySettings(); } catch(e){ console.error(e); }
    }
    if(ev.key === 'tfm_profile'){
      try { 
        // dispatch a custom event so pages may react
        window.dispatchEvent(new CustomEvent('tfm:profileChanged', {detail: JSON.parse(localStorage.getItem('tfm_profile')||'{}')}));
      } catch(e){ console.error(e); }
    }
  });

  // initial apply
  document.addEventListener('DOMContentLoaded', applySettings);

  ////////////////////////
  // Profile helpers
  ////////////////////////
  // profile stored in localStorage key: tfm_profile
  // shape:
  // { firstName, lastName, phone, whatsapp, sameAsPhone, email, addresses:[{line1,line2,country,state,city,pincode}], aadhaar, pan, avatarDataUrl }

  window.getProfile = function(){
    try{
      return JSON.parse(localStorage.getItem('tfm_profile') || '{}');
    }catch(e){
      return {};
    }
  };

  window.saveProfile = function(profile){
    localStorage.setItem('tfm_profile', JSON.stringify(profile || {}));
    // trigger storage event for same-tab listeners
    window.dispatchEvent(new CustomEvent('tfm:profileChanged', {detail: profile || {}}));
    // use localStorage set to trigger storage across tabs
    try{
      localStorage.setItem('tfm_profile_last_update', new Date().toISOString());
    }catch(e){}
  };

  window.listenForProfileChange = function(cb){
    if(typeof cb === 'function'){
      window.addEventListener('tfm:profileChanged', function(e){
        try{ cb(e.detail || JSON.parse(localStorage.getItem('tfm_profile')||'{}')); }catch(err){ cb({}); }
      });
      // also call immediately with current
      try{ cb(window.getProfile()); }catch(e){ cb({}); }
    }
  };

  ////////////////////////
  // CSV / PDF export (robust)
  ////////////////////////
  window.exportListAsPDF = async function(storageKey, filename){
    const arr = JSON.parse(localStorage.getItem(storageKey)||'[]');
    if(!arr || arr.length === 0){ alert('No data to export for ' + storageKey); return; }

    const ok = await waitFor(()=> !!(window.jspdf && window.jspdf.jsPDF), 4000);
    if(!ok){
      try {
        const txt = JSON.stringify(arr, null, 2);
        const blob = new Blob([txt], {type:'text/plain;charset=utf-8'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename.replace('.pdf','.txt'); a.click(); URL.revokeObjectURL(a.href);
        alert('jsPDF not available — downloaded JSON as text instead.');
        return;
      } catch(err){
        alert('Export failed: ' + err.message);
        return;
      }
    }

    try {
      const jsPDF = window.jspdf.jsPDF;
      const doc = new jsPDF({unit:'pt',format:'a4'});
      const left = 40;
      let y = 40;
      doc.setFontSize(14); doc.text(filename.replace('.pdf',''), left, y); y += 20;
      doc.setFontSize(10);

      const keys = Object.keys(arr[0]);
      const pageHeight = doc.internal.pageSize.height - 60;
      const usableWidth = doc.internal.pageSize.width - left*2;
      const colWidth = Math.max(60, usableWidth / Math.min(keys.length, 6));

      doc.setFont(undefined, 'bold');
      keys.forEach((k, idx)=>{ const x = left + idx*colWidth; doc.text(String(k).slice(0,18), x, y); });
      doc.setFont(undefined, 'normal');
      y += 16;

      arr.forEach((row) => {
        if(y > pageHeight){
          doc.addPage();
          y = 40;
        }
        keys.forEach((k, idx)=> {
          const x = left + idx*colWidth;
          let txt = (row[k] === undefined ? '' : String(row[k]));
          if(txt.length > 30) txt = txt.slice(0,27) + '...';
          doc.text(txt, x, y);
        });
        y += 14;
      });

      doc.save(filename);
    } catch(err){
      console.error('PDF export error:', err);
      alert('PDF export problem — try CSV.');
    }
  };

  ////////////////////////
  // Refresh datalist names (used by incomes/expenses pages)
  ////////////////////////
  window.refreshNamesDatalist = function(){
    const d = document.getElementById('namesList');
    if(!d) return;
    d.innerHTML = '';
    const contacts = JSON.parse(localStorage.getItem('tfm_contacts')||'[]');
    const incomes = JSON.parse(localStorage.getItem('tfm_incomes')||'[]');
    const expenses = JSON.parse(localStorage.getItem('tfm_expenses')||'[]');
    const names = new Set();
    contacts.forEach(c=> c && c.name && names.add(c.name));
    incomes.forEach(i=> i && i.name && names.add(i.name));
    expenses.forEach(e=> e && e.name && names.add(e.name));
    Array.from(names).forEach(n=> { const opt = document.createElement('option'); opt.value = n; d.appendChild(opt); });
  };

  // export small helper CSV
  window.downloadArrayAsCsv = function(arr, filename, header){
    if(!arr || arr.length === 0){ alert('No data'); return; }
    const csv = [header.join(',')].concat(arr.map(r=> header.map(h=> `"${(r[h]||'').toString().replace(/"/g,'""')}"`).join(','))).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
  };

  // Expose applySettings so pages can call immediately (pages may also call applySettings on load)
  window.applyFinSettings = applySettings;

  // ensure profileChanged event is fired once at load so pages can pick initial profile
  setTimeout(()=> {
    try{ window.dispatchEvent(new CustomEvent('tfm:profileChanged', {detail: JSON.parse(localStorage.getItem('tfm_profile')||'{}')})); }catch(e){}
  }, 200);

})();
