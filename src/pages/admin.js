// src/pages/admin.js — Admin panel page

import { esc, headerHtml, pageTemplate, LOGO_SVG, CLIENT_HELPERS } from "./template.js";

export function adminPage(domains) {
    const domainsDisplay = domains.join(', ');

    return pageTemplate(
        "Admin Panel",
        `
    <style>
      .adminLayout{display:grid;grid-template-columns:280px 1fr;gap:0;min-height:calc(100vh - 40px);margin:-18px}
      .adminSidebar{
        background:linear-gradient(180deg, rgba(255,255,255,.04), transparent 40%),var(--card);
        border-right:1px solid var(--border);padding:20px 0;position:sticky;top:0;height:100vh;overflow-y:auto;
      }
      .adminContent{padding:20px 24px;overflow-y:auto}
      .sidebarBrand{padding:0 20px 20px;border-bottom:1px solid var(--border);margin-bottom:12px}
      .sidebarBrandTitle{display:flex;align-items:center;gap:10px;font-weight:900;font-size:16px;margin-bottom:4px}
      .sidebarBrandSub{color:var(--muted);font-size:12px}
      .sidebarNav{padding:0 12px}
      .sidebarItem{
        display:flex;align-items:center;gap:12px;padding:12px 12px;margin:4px 0;
        border-radius:12px;color:var(--text);text-decoration:none;cursor:pointer;
        transition:all .2s ease;border:1px solid transparent;
      }
      .sidebarItem:hover{background:rgba(59,130,246,.08);border-color:rgba(59,130,246,.2);text-decoration:none}
      .sidebarItem.active{background:rgba(59,130,246,.15);border-color:rgba(59,130,246,.35);font-weight:600}
      .sidebarIcon{font-size:18px;width:20px;text-align:center}
      .sidebarLogout{margin-top:auto;padding:12px;border-top:1px solid var(--border)}
      .contentHeader{margin-bottom:20px}
      .contentTitle{font-size:24px;font-weight:900;margin-bottom:6px}
      .contentSubtitle{color:var(--muted);font-size:13px}
      .userCard{
        background:linear-gradient(180deg, rgba(255,255,255,.04), transparent 50%),var(--card);
        border:1px solid var(--border);border-radius:16px;padding:18px;margin-bottom:12px;transition:all .2s ease;
      }
      .userCard:hover{border-color:rgba(96,165,250,.35);transform:translateY(-1px);box-shadow:0 4px 16px rgba(0,0,0,.3)}
      .userHeader{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px}
      .userInfo{flex:1;min-width:200px}
      .userName{font-weight:700;font-size:15px;margin-bottom:4px}
      .userEmail{color:var(--muted);font-size:13px}
      .userBadges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
      .userActions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
      .limitInput{display:flex;gap:8px;align-items:center;grid-column:1/-1}
      .limitInput input{width:100px;padding:8px 10px}
      @media (max-width:860px){
        .adminLayout{grid-template-columns:1fr}
        .adminSidebar{display:none}
        .adminContent{padding:14px}
        .userActions{grid-template-columns:1fr}
      }
    </style>

    <div class="adminLayout">
      <div class="adminSidebar">
        <div class="sidebarBrand">
          <div class="sidebarBrandTitle">
            ${LOGO_SVG}
            <span>Admin Panel</span>
          </div>
          <div class="sidebarBrandSub">Email Management</div>
        </div>
        <div class="sidebarNav">
          <a href="/app" class="sidebarItem">
            <span class="sidebarIcon">📥</span>
            <span>Inbox</span>
          </a>
          <div class="sidebarItem" id="navUsers" data-section="users">
            <span class="sidebarIcon">👥</span>
            <span>Users</span>
          </div>
          <div class="sidebarItem" id="navMessages" data-section="messages">
            <span class="sidebarIcon">📨</span>
            <span>Pesan User</span>
          </div>
          <div class="sidebarItem" onclick="showSettings()">
            <span class="sidebarIcon">⚙️</span>
            <span>Settings</span>
          </div>
        </div>
        <div class="sidebarLogout">
          <button class="danger" onclick="logout()" style="width:100%">
            <span style="margin-right:6px">🚪</span>Logout
          </button>
        </div>
      </div>

      <div class="adminContent">
        <div id="sectionUsers">
          <div class="contentHeader">
            <div class="contentTitle">User Management</div>
            <div class="contentSubtitle">
              <span class="muted">Domains: <span class="kbd">${esc(domainsDisplay)}</span></span>
            </div>
          </div>
          <div id="users"></div>
        </div>

        <div id="sectionMessages" style="display:none">
          <div class="contentHeader">
            <div class="contentTitle">Pesan User</div>
            <div class="contentSubtitle">
              <span class="muted">Lihat dan baca pesan masuk dari semua user</span>
            </div>
          </div>
          <div style="margin-bottom:16px">
            <input id="searchUser" placeholder="Filter by user email..." style="max-width:400px" oninput="filterMessages(this.value)" />
          </div>
          <div id="messagesList"></div>
          <div id="emailViewer" style="display:none;margin-top:20px"></div>
        </div>
      </div>
    </div>

    <script>
      ${CLIENT_HELPERS}

      var DEFAULT_DOMAIN = ${JSON.stringify(domains[0] || "")};
      var CURRENT_SECTION = 'users';
      var ALL_MESSAGES = [];
      var FILTERED_MESSAGES = [];

      function bindNavigation(){
        var items = document.querySelectorAll('.sidebarItem[data-section]');
        items.forEach(function(el){
          var section = el.getAttribute('data-section');
          el.addEventListener('click', function(){ showSection(section); });
        });
      }

      async function loadUsers(){
        var j = await api('/api/admin/users');
        if(!j.ok){
          alert(j.error||'gagal');
          if(j.error==='Forbidden') location.href='/app';
          return;
        }
        var box = document.getElementById('users');
        box.innerHTML='';
        for(var i=0; i<j.users.length; i++){
          var u = j.users[i];
          var card = document.createElement('div');
          card.className = 'userCard';
          card.innerHTML =
            '<div class="userHeader">'+
              '<div class="userInfo">'+
                '<div class="userName">'+esc(u.username)+'</div>'+
                '<div class="userEmail">'+esc(u.email)+'</div>'+
                '<div class="userBadges">'+
                  (u.role==='admin' ? '<span class="pill" style="background:rgba(59,130,246,.15);border-color:rgba(59,130,246,.4)">admin</span>' : '<span class="pill">user</span>')+
                  (u.disabled ? '<span class="pill" style="background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.4)">disabled</span>' : '')+
                  '<span class="pill">'+u.alias_count+' mail</span>'+
                '</div>'+
              '</div>'+
            '</div>'+
            '<div class="userActions">'+
              '<div class="limitInput">'+
                '<label style="font-size:12px;color:var(--muted);white-space:nowrap">Mail Limit:</label>'+
                '<input id="lim_'+esc(u.id)+'" value="'+u.alias_limit+'" type="number" />'+
                '<button class="btn-primary" onclick="setLimit(\\''+esc(u.id)+'\\')">Update</button>'+
              '</div>'+
              '<button onclick="toggleAliases(\\''+esc(u.id)+'\\')" class="btn-ghost">📧 Lihat Mail</button>'+
              '<button onclick="toggleUser(\\''+esc(u.id)+'\\','+(u.disabled?0:1)+')" class="'+(u.disabled?'btn-primary':'danger')+'">'+(u.disabled?'✓ Enable':'✕ Disable')+'</button>'+
              '<button onclick="delUser(\\''+encodeURIComponent(u.id)+'\\')" class="danger">🗑 Delete</button>'+
            '</div>'+
            '<div id="aliases_'+esc(u.id)+'" style="display:none;margin-top:14px"></div>';
          box.appendChild(card);
        }
      }

      async function toggleAliases(userId){
        var aliasBox = document.getElementById('aliases_'+userId);
        if(!aliasBox) return;
        if(aliasBox.style.display !== 'none' && aliasBox.innerHTML !== ''){
          aliasBox.style.display = 'none';
          return;
        }
        aliasBox.innerHTML = '<div class="muted">Loading...</div>';
        aliasBox.style.display = 'block';
        var j = await api('/api/admin/users/'+encodeURIComponent(userId)+'/aliases');
        if(!j.ok){
          aliasBox.innerHTML = '<div class="muted">Error: '+esc(j.error||'gagal')+'</div>';
          return;
        }
        if(j.aliases.length === 0){
          aliasBox.innerHTML = '<div class="muted" style="padding:12px;background:rgba(255,255,255,.02);border-radius:12px;border:1px solid var(--border)">User ini belum membuat mail.</div>';
          return;
        }
        var html = '<div style="padding:14px;background:rgba(255,255,255,.02);border-radius:12px;border:1px solid var(--border)">';
        html += '<div class="muted" style="margin-bottom:12px;font-size:13px;font-weight:600">📧 Daftar Mail:</div>';
        for(var i=0; i<j.aliases.length; i++){
          var a = j.aliases[i];
          var aliasDomain = a.domain || DEFAULT_DOMAIN;
          html += '<div style="padding:10px 0;border-bottom:1px solid rgba(71,85,105,.2);display:flex;justify-content:space-between;align-items:center;gap:10px">'+
            '<div style="flex:1;min-width:0">'+
              '<div style="font-family:ui-monospace,monospace;font-size:13px;word-break:break-all;font-weight:600">'+esc(a.local_part)+'@'+esc(aliasDomain)+'</div>'+
              '<div class="muted" style="font-size:11px;margin-top:2px">'+new Date(a.created_at*1000).toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'})+'</div>'+
            '</div>'+
            '<div>'+
              (a.disabled ? '<span class="pill" style="background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.4);font-size:11px">disabled</span>' : '<span class="pill" style="background:rgba(16,185,129,.15);border-color:rgba(16,185,129,.4);font-size:11px">active</span>')+
            '</div>'+
          '</div>';
        }
        html += '</div>';
        aliasBox.innerHTML = html;
      }

      async function setLimit(id){
        var v = document.getElementById('lim_'+id).value;
        var lim = parseInt(v,10);
        if(isNaN(lim) || lim < 0){ alert('Limit harus angka positif'); return; }
        var j = await api('/api/admin/users/'+encodeURIComponent(id), {
          method:'PATCH',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({alias_limit:lim})
        });
        if(!j.ok){ alert(j.error||'gagal'); return; }
        alert('Limit berhasil diupdate!');
        await loadUsers();
      }

      async function toggleUser(id, disabled){
        var j = await api('/api/admin/users/'+encodeURIComponent(id), {
          method:'PATCH',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({disabled:disabled})
        });
        if(!j.ok){ alert(j.error||'gagal'); return; }
        await loadUsers();
      }

      async function delUser(encId){
        var id = decodeURIComponent(encId);
        if(!confirm('⚠️ Hapus user ini?\\n\\nID: '+id+'\\n\\nAksi ini akan menghapus:\\n• Sessions\\n• Reset tokens\\n• Mail aliases\\n• Emails (dan raw di R2 jika ada)\\n\\nAksi ini TIDAK BISA dibatalkan!')) return;
        var j = await api('/api/admin/users/'+encodeURIComponent(id), { method:'DELETE' });
        if(!j.ok){ alert(j.error||'gagal'); return; }
        alert('User berhasil dihapus!');
        await loadUsers();
      }

      function showSection(section){
        CURRENT_SECTION = section;
        var navUsers = document.getElementById('navUsers');
        var navMessages = document.getElementById('navMessages');
        var sectionUsers = document.getElementById('sectionUsers');
        var sectionMessages = document.getElementById('sectionMessages');
        if(!navUsers || !navMessages || !sectionUsers || !sectionMessages) return;
        navUsers.classList.remove('active');
        navMessages.classList.remove('active');
        if(section === 'users'){
          navUsers.classList.add('active');
          sectionUsers.style.display = 'block';
          sectionMessages.style.display = 'none';
        } else if(section === 'messages'){
          navMessages.classList.add('active');
          sectionUsers.style.display = 'none';
          sectionMessages.style.display = 'block';
          loadAllMessages();
        }
      }

      async function loadAllMessages(){
        var box = document.getElementById('messagesList');
        box.innerHTML = '<div class="muted">Loading...</div>';
        try{
          var j = await api('/api/admin/emails');
          if(!j.ok){ box.innerHTML = '<div class="muted">Error: '+esc(j.error||'gagal')+'</div>'; return; }
          ALL_MESSAGES = j.emails || [];
          FILTERED_MESSAGES = ALL_MESSAGES;
          renderMessages();
        } catch(e){
          box.innerHTML = '<div class="muted">Error loading messages</div>';
        }
      }

      function filterMessages(query){
        var q = query.toLowerCase().trim();
        if(!q){
          FILTERED_MESSAGES = ALL_MESSAGES;
        } else {
          FILTERED_MESSAGES = ALL_MESSAGES.filter(function(m){
            return (m.user_email||'').toLowerCase().indexOf(q) !== -1 ||
                   (m.username||'').toLowerCase().indexOf(q) !== -1;
          });
        }
        renderMessages();
      }

      function renderMessages(){
        var box = document.getElementById('messagesList');
        if(!box) return;
        if(FILTERED_MESSAGES.length === 0){
          box.innerHTML = '<div class="muted">Tidak ada pesan.</div>';
          return;
        }
        var html = '';
        for(var i=0; i<FILTERED_MESSAGES.length; i++){
          var m = FILTERED_MESSAGES[i];
          var userInfo = esc((m.username||'unknown')+' ('+m.user_email+')');
          var fromAddr = esc(m.from_addr||'');
          var subject = esc(m.subject||'(no subject)');
          var snippet = esc((m.snippet||'').substring(0,120));
          var date = new Date(m.created_at*1000).toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'});
          html += '<div class="userCard" style="cursor:pointer" data-msg-id="'+esc(m.id)+'">'+
            '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">'+
              '<div style="flex:1;min-width:0">'+
                '<div style="font-size:13px;color:var(--muted);margin-bottom:4px">👤 '+userInfo+'</div>'+
                '<div style="font-weight:700;font-size:14px;margin-bottom:4px">'+subject+'</div>'+
                '<div style="font-size:12px;color:var(--muted)">From: '+fromAddr+'</div>'+
                '<div style="margin-top:6px;font-size:13px;color:var(--text);opacity:0.85">'+snippet+'...</div>'+
              '</div>'+
              '<div style="text-align:right">'+
                '<div class="pill" style="font-size:11px">'+date+'</div>'+
                '<button class="btn-ghost" style="margin-top:8px;padding:6px 10px" data-action="open" data-msg-id="'+esc(m.id)+'">Baca</button>'+
              '</div>'+
            '</div>'+
          '</div>';
        }
        box.innerHTML = html;
        box.querySelectorAll('[data-action="open"]').forEach(function(btn){
          btn.addEventListener('click', function(e){
            e.stopPropagation();
            viewMessage(btn.getAttribute('data-msg-id'));
          });
        });
        box.querySelectorAll('.userCard[data-msg-id]').forEach(function(card){
          card.addEventListener('click', function(){
            viewMessage(card.getAttribute('data-msg-id'));
          });
        });
      }

      async function viewMessage(id){
        var viewer = document.getElementById('emailViewer');
        viewer.innerHTML = '<div class="muted">Loading...</div>';
        viewer.style.display = 'block';
        try{
          var j = await api('/api/admin/emails/'+encodeURIComponent(id));
          if(!j.ok){ viewer.innerHTML = '<div class="muted">Error: '+esc(j.error||'gagal')+'</div>'; return; }
          var e = j.email;
          var userInfo = esc((e.username||'unknown')+' ('+e.user_email+')');
          viewer.innerHTML =
            '<div class="card">'+
              '<div style="display:flex;justify-content:space-between;margin-bottom:16px">'+
                '<button onclick="closeMessageViewer()" class="btn-ghost">← Back</button>'+
              '</div>'+
              '<div class="paper" style="margin-bottom:12px">'+
                '<div style="margin-bottom:8px"><b>User:</b> '+userInfo+'</div>'+
                '<div style="margin-bottom:8px"><b>From:</b> '+esc(e.from_addr||'')+'</div>'+
                '<div style="margin-bottom:8px"><b>To:</b> '+esc(e.to_addr||'')+'</div>'+
                '<div style="margin-bottom:8px"><b>Subject:</b> '+esc(e.subject||'')+'</div>'+
                '<div style="margin-bottom:8px"><b>Date:</b> '+esc(e.date||'')+'</div>'+
              '</div>'+
              (e.html ? '<iframe class="mailFrame" sandbox="" referrerpolicy="no-referrer" srcdoc="'+esc(e.html)+'"></iframe>' :
                       '<div class="paper"><pre class="mailText">'+esc(e.text||'')+'</pre></div>')+
            '</div>';
        } catch(err){
          viewer.innerHTML = '<div class="muted">Error loading email</div>';
        }
      }

      function closeMessageViewer(){
        document.getElementById('emailViewer').style.display = 'none';
      }

      function showSettings(){
        alert('⚙️ Settings\\n\\nDomains: ${esc(domainsDisplay)}\\n\\n⚠️ Delete user akan menghapus semua data terkait.');
      }

      async function logout(){
        if(confirm('Logout dari admin panel?')){
          await fetch('/api/auth/logout',{method:'POST'});
          location.href='/login';
        }
      }

      window.showSection = showSection;
      window.showSettings = showSettings;
      window.logout = logout;
      window.setLimit = setLimit;
      window.toggleUser = toggleUser;
      window.delUser = delUser;
      window.toggleAliases = toggleAliases;
      window.loadAllMessages = loadAllMessages;
      window.filterMessages = filterMessages;
      window.viewMessage = viewMessage;
      window.closeMessageViewer = closeMessageViewer;

      document.addEventListener('DOMContentLoaded', bindNavigation);
      bindNavigation();
      showSection('users');
      loadUsers().catch(function(e){ alert(String(e && e.message ? e.message : e)); });
    </script>
    `
    );
}
