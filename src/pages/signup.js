// src/pages/signup.js

import { esc, headerHtml, pageTemplate, CLIENT_HELPERS } from "./template.js";

export function signupPage(domains) {
    const domainOptions = domains.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('');

    return pageTemplate(
        "Signup",
        `
    ${headerHtml({
            badge: "Signup",
            subtitle: "Buat akun • Pilih domain",
            rightHtml: `<a class="pill" href="/login">Login</a>`,
        })}

    <div class="card">
      <div class="row">
        <div>
          <label>Username</label>
          <input id="u" placeholder="sipar" autocomplete="username" oninput="updatePreview()" />
        </div>
        <div>
          <label>Email (untuk reset password)</label>
          <input id="e" placeholder="sipar@gmail.com" autocomplete="email" />
        </div>
      </div>

      <div style="margin-top:12px">
        <label>Domain</label>
        <select id="domain" onchange="updatePreview()" style="width:100%;">
          ${domainOptions}
        </select>
      </div>

      <div style="margin-top:12px">
        <label>Password</label>
        <div class="pwWrap">
          <input id="pw" type="password" placeholder="minimal 8 karakter" autocomplete="new-password" />
          <button type="button" class="pwToggle" onclick="togglePw('pw', this)">Show</button>
        </div>
        <div class="muted" style="margin-top:10px">
          Mail alias kamu nanti: <span class="kbd" id="preview"></span>
        </div>
      </div>

      <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <button class="btn-primary" onclick="signup()">Buat Akun</button>
      </div>
      <pre id="out" class="muted"></pre>
    </div>

    <script>
      ${CLIENT_HELPERS}
      function updatePreview(){
        var username = document.getElementById('u').value.trim() || 'namamu';
        var domain = document.getElementById('domain').value;
        document.getElementById('preview').textContent = username + '@' + domain;
      }
      updatePreview();

      async function signup(){
        var username = document.getElementById('u').value.trim();
        var email = document.getElementById('e').value.trim();
        var pw = document.getElementById('pw').value;
        var domain = document.getElementById('domain').value;
        var out = document.getElementById('out');
        out.textContent = '...';
        var r = await fetch('/api/auth/signup',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({username:username,email:email,pw:pw,domain:domain})
        });
        var j = await readJsonOrText(r);
        if(j.ok){ location.href='/app'; return; }
        out.textContent = j.error || 'gagal';
      }
    </script>
    `
    );
}
