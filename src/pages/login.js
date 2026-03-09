// src/pages/login.js

import { headerHtml, pageTemplate, CLIENT_HELPERS } from "./template.js";

export function loginPage() {
    return pageTemplate(
        "Login",
        `
    ${headerHtml({
            badge: "Login",
            subtitle: "Mail Portal • Kelola mail & inbox",
            rightHtml: `<a class="pill" href="/signup">Buat akun</a>`,
        })}

    <div class="card">
      <div class="row">
        <div>
          <label>Username / Email</label>
          <input id="id" placeholder="sipar / sipar@gmail.com" autocomplete="username" />
        </div>
        <div>
          <label>Password</label>
          <div class="pwWrap">
            <input id="pw" type="password" placeholder="••••••••" autocomplete="current-password" />
            <button type="button" class="pwToggle" onclick="togglePw('pw', this)">Show</button>
          </div>
        </div>
      </div>

      <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <button class="btn-primary" onclick="login()">Login</button>
        <a href="/reset" class="muted">Lupa password?</a>
      </div>
      <pre id="out" class="muted"></pre>
    </div>

    <script>
      ${CLIENT_HELPERS}
      async function login(){
        var id = document.getElementById('id').value.trim();
        var pw = document.getElementById('pw').value;
        var out = document.getElementById('out');
        out.textContent = '...';
        var r = await fetch('/api/auth/login',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({id:id,pw:pw})
        });
        var j = await readJsonOrText(r);
        if(j.ok){ location.href='/app'; return; }
        out.textContent = j.error || 'gagal';
      }
    </script>
    `
    );
}
