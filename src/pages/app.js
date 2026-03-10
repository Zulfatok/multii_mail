// src/pages/app.js — Inbox page with search functionality

import { esc, headerHtml, pageTemplate, CLIENT_HELPERS } from "./template.js";

export function appPage(domains) {
  const domainOptions = domains.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('');

  return pageTemplate(
    "Inbox",
    `
    ${headerHtml({
      badge: "Inbox",
      subtitle: "Kelola mail & baca inbox",
      rightHtml: `
        <a href="/admin" id="adminLink" class="pill" style="display:none">Admin</a>
        <button class="danger" onclick="logout()">Logout</button>
      `,
    })}

    <div class="card">
      <div class="row">
        <div>
          <div class="muted">Akun</div>
          <div id="me" style="margin-top:6px">...</div>
        </div>
        <div>
          <div class="muted">Buat mail baru</div>
          <div style="margin-top:10px">
            <div style="display:grid;grid-template-columns:1fr auto;gap:10px;margin-bottom:10px">
              <input id="alias" placeholder="contoh: sipar" />
              <button class="btn-primary" onclick="createAlias()">Create</button>
            </div>
            <select id="domainSelect" style="width:100%">
              ${domainOptions}
            </select>
          </div>
          <div id="aliasMsg" class="muted" style="margin-top:8px"></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <b>🔍 Cari Semua Pesan</b>
        <span class="muted">Cari di semua email</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:10px">
        <input id="globalSearchInput" placeholder="Ketik subject, pengirim, atau isi pesan..." onkeydown="if(event.key==='Enter')globalSearch()" />
        <button class="btn-primary" onclick="globalSearch()">Cari Semua</button>
      </div>
      <div id="globalSearchResults" style="margin-top:10px"></div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <b>Mail</b>
        <span class="muted" id="limitInfo"></span>
      </div>
      <div id="aliases" style="margin-top:10px"></div>
    </div>

    <div class="card" id="emailView" style="display:none"></div>

    <script>
      ${CLIENT_HELPERS}

      var DOMAINS = ${JSON.stringify(domains)};
      var ME = null;
      var SELECTED = null;
      var AUTO_REFRESH_INTERVAL = null;
      var SELECTED_EMAILS = [];

      function inboxDomId(local, domain){
        var safeDomain = String(domain||'').toLowerCase().replace(/[^a-z0-9]+/g,'_');
        return 'inbox_'+local+'_'+safeDomain;
      }

      async function loadMe(){
        var j = await api('/api/me');
        if(!j.ok){ location.href='/login'; return; }
        ME = j.user;
        document.getElementById('me').innerHTML =
          '<div><b>'+esc(ME.username)+'</b> <span class="muted">('+esc(ME.email)+')</span></div>'+
          '<div class="muted" style="margin-top:4px">role: '+esc(ME.role)+'</div>';
        document.getElementById('limitInfo').textContent = 'limit: '+ME.alias_limit;
        if(ME.role==='admin') document.getElementById('adminLink').style.display='inline-flex';
      }

      async function loadAliases(){
        var j = await api('/api/aliases');
        if(!j.ok){ alert(j.error||'gagal'); return; }
        var box = document.getElementById('aliases');
        box.innerHTML='';
        box.style.display='block';
        box.style.visibility='visible';
        box.style.minHeight='40px';

        if(j.aliases.length===0){
          box.innerHTML='<div class="muted">Belum ada mail.</div>';
          return;
        }

        var html = '';
        for(var i=0; i<j.aliases.length; i++){
          var a = j.aliases[i];
          var addr = a.local_part+'@'+a.domain;
          var isOpen = SELECTED===addr;
          var inboxId = inboxDomId(a.local_part, a.domain);

          html += '<div style="margin-bottom:10px;display:block;width:100%">'+
            '<div class="listItem" style="display:flex;flex-direction:column;width:100%;gap:10px">'+
              '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%">'+
                '<button class="btn-primary" onclick="selectAlias(\\''+a.local_part+'\\',\\''+a.domain+'\\')">'+
                  (isOpen?'Close':'Open')+
                '</button>'+
                '<span style="flex:1"><b>'+esc(addr)+'</b></span>'+
                (a.disabled?'<span class="pill">disabled</span>':'')+
              '</div>'+
              '<div style="width:100%"><button onclick="delAlias(\\''+a.local_part+'\\',\\''+a.domain+'\\')" class="danger" style="width:100%">Delete</button></div>'+
            '</div>'+
            '<div id="'+inboxId+'" style="display:'+(isOpen?'block':'none')+';margin-top:10px;padding-left:10px"></div>'+
          '</div>';
        }

        box.innerHTML = html;
        if(SELECTED){ await loadEmails(); }
      }

      async function selectAlias(local, domain){
        var key = local+'@'+domain;
        var wasSelected = SELECTED===key;
        if(wasSelected){
          SELECTED=null;
          stopAutoRefresh();
        } else {
          SELECTED=key;
          startAutoRefresh();
        }
        await loadAliases();
        if(!wasSelected){
          var inbox = document.getElementById(inboxDomId(local, domain));
          if(inbox) inbox.scrollIntoView({behavior:'smooth', block:'nearest'});
        }
      }

      async function loadEmails(silent){
        if(!SELECTED) return;
        var parts = SELECTED.split('@');
        var local = parts[0];
        var domain = parts.slice(1).join('@');
        var inboxId = inboxDomId(local, domain);
        var box = document.getElementById(inboxId);
        if(!box) return;

        box.style.display = 'block';
        box.style.visibility = 'visible';
        box.style.opacity = '1';
        box.style.minHeight = '100px';
        box.style.background = 'rgba(59,130,246,0.05)';
        box.style.border = '2px solid rgba(59,130,246,0.3)';
        box.style.padding = '12px';
        box.style.borderRadius = '8px';

        try{
          // Build API URL with search query if present
          var searchQuery = '';
          var searchInput = document.getElementById('emailSearch');
          if(searchInput && searchInput.value.trim()){
            searchQuery = '&q='+encodeURIComponent(searchInput.value.trim());
          }

          var j = await api('/api/emails?alias='+encodeURIComponent(local)+'&domain='+encodeURIComponent(domain)+searchQuery);
          if(!j.ok){
            if(!silent) alert(j.error||'gagal');
            return;
          }

          var refreshInfo = silent ? '<span class="muted" style="font-size:11px;margin-left:8px">🔄 Auto (30s)</span>' : '';

          // Search bar
          var currentSearch = (searchInput && searchInput.value) || '';
          var searchBarHtml = '<div style="margin-bottom:10px">'+
            '<div style="display:grid;grid-template-columns:1fr auto;gap:10px">'+
              '<input id="emailSearch" placeholder="🔍 Cari subject, pengirim, atau isi pesan..." value="'+esc(currentSearch)+'" onkeydown="if(event.key===\\'Enter\\')loadEmails()" />'+
              '<button class="btn-primary" onclick="loadEmails()">Cari</button>'+
            '</div>'+
          '</div>';

          // Bulk actions bar
          var bulkActionsHtml = '';
          if(j.emails && j.emails.length > 0){
            var selectedCount = SELECTED_EMAILS.length;
            bulkActionsHtml = '<div class="bulkActions">'+
              '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:0">'+
                '<input type="checkbox" class="selectAllCheckbox" id="selectAllCheck" onclick="toggleSelectAll()" />'+
                '<span class="muted" style="font-size:13px">Select All</span>'+
              '</label>'+
              (selectedCount > 0 ?
                '<button class="danger" onclick="deleteSelectedEmails()" style="margin-left:auto">'+
                  'Delete Selected ('+selectedCount+')'+
                '</button>' : '')+
            '</div>';
          }

          var html = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">'+
            '<b>Inbox</b>'+refreshInfo+
            '<button class="btn-ghost" onclick="loadEmails()">Refresh</button>'+
            '</div>'+
            searchBarHtml+
            bulkActionsHtml;

          if(!j.emails || j.emails.length===0){
            html += '<div class="muted" style="padding:24px;text-align:center;background:rgba(255,255,255,0.03);border-radius:8px;border:1px dashed rgba(148,163,184,0.3)">'+
              (currentSearch ? '🔍 Tidak ditemukan hasil untuk "'+esc(currentSearch)+'"' : '📪 Belum ada email masuk.')+
            '</div>';
          } else {
            for(var k=0; k<j.emails.length; k++){
              var m = j.emails[k];
              var isSelected = SELECTED_EMAILS.indexOf(m.id) !== -1;
              html += '<div class="mailItem'+(isSelected?' selected':'')+'" id="mail_'+m.id+'">'+
                '<div style="display:flex;gap:12px;align-items:flex-start">'+
                  '<input type="checkbox" class="emailCheckbox" '+
                    'id="check_'+m.id+'" '+
                    (isSelected?'checked ':'')+
                    'onclick="toggleEmailSelection(\\''+m.id+'\\')"/>'+
                  '<div style="flex:1;min-width:0">'+
                    '<div class="mailSubject">'+esc(m.subject||'(no subject)')+'</div>'+
                    '<div class="mailMeta">From: '+esc(m.from_addr||'')+'</div>'+
                    '<div class="mailMeta">'+esc(fmtDate(m.date || m.created_at || ''))+'</div>'+
                    (m.snippet ? '<div class="mailSnippet">'+esc(m.snippet)+'</div>' : '')+
                    '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">'+
                      '<button class="btn-primary" onclick="openEmail(\\''+m.id+'\\')">View</button>'+
                      '<button onclick="delEmail(\\''+m.id+'\\')" class="danger">Delete</button>'+
                    '</div>'+
                  '</div>'+
                '</div>'+
              '</div>';
            }
          }

          box.innerHTML = html;
        }catch(e){
          if(!silent) console.error('Load emails error:', e);
        }
      }

      function wrapEmailHtml(inner){
        return '<!doctype html><html><head><meta charset="utf-8">'+
          '<meta name="viewport" content="width=device-width,initial-scale=1">'+
          '<style>'+
            'html,body{margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;}' +
            'body{padding:16px;line-height:1.55;font-size:14px;}' +
            'img{max-width:100%;height:auto;}' +
            'table{max-width:100%;border-collapse:collapse;}' +
            'a{color:#2563eb;}' +
            'pre{white-space:pre-wrap;word-break:break-word;}' +
            'blockquote{margin:0;padding-left:12px;border-left:3px solid rgba(15,23,42,.2);color:rgba(15,23,42,.85)}' +
          '</style></head><body>'+ (inner || '') +'</body></html>';
      }

      async function openEmail(id){
        var j = await api('/api/emails/'+encodeURIComponent(id));
        if(!j.ok){ alert(j.error||'gagal'); return; }
        var v=document.getElementById('emailView');
        v.style.display='block';
        v.innerHTML =
          '<div class="viewerHead">'+
            '<div>'+
              '<div style="font-weight:900;font-size:16px">'+esc(j.email.subject||'(no subject)')+'</div>'+
              '<div class="muted" style="margin-top:6px">From: '+esc(j.email.from_addr||'')+'</div>'+
              '<div class="muted">To: '+esc(j.email.to_addr||'')+'</div>'+
              '<div class="muted">'+esc(fmtDate(j.email.date || j.email.created_at || ''))+'</div>'+
            '</div>'+
            '<button class="btn-ghost" onclick="document.getElementById(\\'emailView\\').style.display=\\'none\\'">Close</button>'+
          '</div>'+
          '<hr class="hr" />'+
          '<div id="msgBody"></div>';

        var body = document.getElementById('msgBody');
        if (j.email.html) {
          var iframe = document.createElement('iframe');
          iframe.className = 'mailFrame';
          iframe.setAttribute('sandbox','');
          iframe.setAttribute('referrerpolicy','no-referrer');
          iframe.srcdoc = wrapEmailHtml(j.email.html);
          body.appendChild(iframe);
          var note = document.createElement('div');
          note.className = 'muted';
          note.style.marginTop = '10px';
          note.textContent = 'HTML ditampilkan aman (sandbox).';
          body.appendChild(note);
        } else {
          var bx = document.createElement('div');
          bx.className = 'paper';
          var pre = document.createElement('pre');
          pre.className = 'mailText';
          pre.textContent = j.email.text || '';
          bx.appendChild(pre);
          body.appendChild(bx);
        }
        v.scrollIntoView({behavior:'smooth'});
      }

      async function createAlias(){
        var local = document.getElementById('alias').value.trim().toLowerCase();
        var domain = document.getElementById('domainSelect').value;
        var msg = document.getElementById('aliasMsg');
        msg.textContent='...';
        var j = await api('/api/aliases', {
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({local:local, domain:domain})
        });
        msg.textContent = j.ok ? 'Mail dibuat.' : (j.error||'gagal');
        if(j.ok){
          document.getElementById('alias').value='';
          await loadMe();
          await loadAliases();
        }
      }

      async function delAlias(local, domain){
        var addr = local+'@'+domain;
        if(!confirm('Hapus mail '+addr+' ?')) return;
        var j = await api('/api/aliases/'+encodeURIComponent(local)+'?domain='+encodeURIComponent(domain), {method:'DELETE'});
        if(!j.ok){ alert(j.error||'gagal'); return; }
        if(SELECTED===addr){
          SELECTED=null;
          stopAutoRefresh();
        }
        document.getElementById('emailView').style.display='none';
        await loadMe();
        await loadAliases();
      }

      async function delEmail(id){
        if(!confirm('Hapus email ini?')) return;
        var j = await api('/api/emails/'+encodeURIComponent(id), {method:'DELETE'});
        if(!j.ok){ alert(j.error||'gagal'); return; }
        var idx = SELECTED_EMAILS.indexOf(id);
        if(idx !== -1) SELECTED_EMAILS.splice(idx, 1);
        document.getElementById('emailView').style.display='none';
        await loadEmails();
      }

      function toggleEmailSelection(id){
        var idx = SELECTED_EMAILS.indexOf(id);
        if(idx === -1) SELECTED_EMAILS.push(id);
        else SELECTED_EMAILS.splice(idx, 1);
        loadEmails();
      }

      function toggleSelectAll(){
        var checkboxes = document.querySelectorAll('.emailCheckbox');
        if(checkboxes.length === 0) return;
        var allEmailIds = Array.from(checkboxes).map(function(cb){ return cb.id.replace('check_', ''); });
        var allSelected = allEmailIds.every(function(id){ return SELECTED_EMAILS.indexOf(id) !== -1; });
        if(allSelected){
          SELECTED_EMAILS = SELECTED_EMAILS.filter(function(id){ return allEmailIds.indexOf(id) === -1; });
        } else {
          allEmailIds.forEach(function(id){
            if(SELECTED_EMAILS.indexOf(id) === -1) SELECTED_EMAILS.push(id);
          });
        }
        loadEmails();
      }

      async function deleteSelectedEmails(){
        if(SELECTED_EMAILS.length === 0){ alert('Tidak ada email yang dipilih.'); return; }
        var count = SELECTED_EMAILS.length;
        if(!confirm('Hapus '+count+' email yang dipilih?')) return;
        var successCount = 0;
        var failCount = 0;
        for(var i=0; i<SELECTED_EMAILS.length; i++){
          try{
            var j = await api('/api/emails/'+encodeURIComponent(SELECTED_EMAILS[i]), {method:'DELETE'});
            if(j.ok) successCount++; else failCount++;
          } catch(e){ failCount++; }
        }
        SELECTED_EMAILS = [];
        if(failCount > 0) alert('Berhasil hapus '+successCount+' email. Gagal: '+failCount);
        else alert('Berhasil hapus '+successCount+' email.');
        document.getElementById('emailView').style.display='none';
        await loadEmails();
      }

      function startAutoRefresh(){
        stopAutoRefresh();
        AUTO_REFRESH_INTERVAL = setInterval(function(){ loadEmails(true); }, 30000);
      }
      function stopAutoRefresh(){
        if(AUTO_REFRESH_INTERVAL){ clearInterval(AUTO_REFRESH_INTERVAL); AUTO_REFRESH_INTERVAL = null; }
      }

      async function logout(){
        stopAutoRefresh();
        await fetch('/api/auth/logout',{method:'POST'});
        location.href='/login';
      }

      async function globalSearch(){
        var input = document.getElementById('globalSearchInput');
        var q = (input && input.value || '').trim();
        var box = document.getElementById('globalSearchResults');
        if(!q){
          if(box) box.innerHTML='';
          return;
        }
        if(box) box.innerHTML='<div class="muted" style="padding:12px;text-align:center">⏳ Mencari...</div>';
        try{
          var j = await api('/api/emails/search?q='+encodeURIComponent(q));
          if(!j.ok){
            box.innerHTML='<div class="muted" style="padding:12px;text-align:center">❌ '+(j.error||'Gagal mencari')+'</div>';
            return;
          }
          if(!j.emails || j.emails.length===0){
            box.innerHTML='<div class="muted" style="padding:24px;text-align:center;background:rgba(255,255,255,0.03);border-radius:8px;border:1px dashed rgba(148,163,184,0.3)">'+
              '🔍 Tidak ditemukan hasil untuk "'+esc(q)+'"'+
            '</div>';
            return;
          }
          var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'+
            '<span class="muted">Ditemukan <b>'+j.emails.length+'</b> hasil untuk "'+esc(q)+'"</span>'+
            '<button class="btn-ghost" onclick="clearGlobalSearch()">✕ Tutup</button>'+
          '</div>';
          for(var k=0; k<j.emails.length; k++){
            var m = j.emails[k];
            html += '<div class="mailItem">'+
              '<div style="display:flex;gap:12px;align-items:flex-start">'+
                '<div style="flex:1;min-width:0">'+
                  '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">'+
                    '<span class="pill" style="font-size:11px">'+esc(m.address||'')+'</span>'+
                  '</div>'+
                  '<div class="mailSubject">'+esc(m.subject||'(no subject)')+'</div>'+
                  '<div class="mailMeta">From: '+esc(m.from_addr||'')+'</div>'+
                  '<div class="mailMeta">'+esc(fmtDate(m.date || m.created_at || ''))+'</div>'+
                  (m.snippet ? '<div class="mailSnippet">'+esc(m.snippet)+'</div>' : '')+
                  '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">'+
                    '<button class="btn-primary" onclick="openEmail(\\''+m.id+'\\')">View</button>'+
                  '</div>'+
                '</div>'+
              '</div>'+
            '</div>';
          }
          box.innerHTML = html;
        }catch(e){
          console.error('Global search error:', e);
          if(box) box.innerHTML='<div class="muted" style="padding:12px;text-align:center">❌ Error: '+esc(String(e))+'</div>';
        }
      }

      function clearGlobalSearch(){
        var input = document.getElementById('globalSearchInput');
        if(input) input.value='';
        var box = document.getElementById('globalSearchResults');
        if(box) box.innerHTML='';
      }

      window.createAlias = createAlias;
      window.selectAlias = selectAlias;
      window.delAlias = delAlias;
      window.openEmail = openEmail;
      window.delEmail = delEmail;
      window.toggleEmailSelection = toggleEmailSelection;
      window.toggleSelectAll = toggleSelectAll;
      window.deleteSelectedEmails = deleteSelectedEmails;
      window.logout = logout;
      window.loadEmails = loadEmails;
      window.globalSearch = globalSearch;
      window.clearGlobalSearch = clearGlobalSearch;

      (async function(){
        try{
          await loadMe();
          await loadAliases();
        }catch(e){
          alert(String(e && e.message ? e.message : e));
        }
      })();
    </script>
    `
  );
}
