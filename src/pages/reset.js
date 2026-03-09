// src/pages/reset.js

import { headerHtml, pageTemplate, CLIENT_HELPERS } from "./template.js";

export function resetPage() {
    return pageTemplate(
        "Reset Password",
        `
    ${headerHtml({
            badge: "Reset",
            subtitle: "Kirim token reset / set password baru",
            rightHtml: `<a class="pill" href="/login">Login</a>`,
        })}

    <div class="card">
      <label>Email akun</label>
      <input id="e" placeholder="sipar@gmail.com" autocomplete="email" />
      <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <button class="btn-primary" onclick="reqReset()">Kirim Token</button>
      </div>
      <pre id="out" class="muted"></pre>
    </div>

    <div class="card">
      <div class="muted">Punya token?</div>
      <div class="row" style="margin-top:10px">
        <div>
          <label>Token</label>
          <input id="t" placeholder="token dari email" />
        </div>
        <div>
          <label>Password baru</label>
          <div class="pwWrap">
            <input id="npw" type="password" placeholder="••••••••" autocomplete="new-password" />
            <button type="button" class="pwToggle" onclick="togglePw('npw', this)">Show</button>
          </div>
        </div>
      </div>
      <div style="margin-top:12px">
        <button class="btn-primary" onclick="confirmReset()">Set Password</button>
      </div>
      <pre id="out2" class="muted"></pre>
    </div>

    <script>
      ${CLIENT_HELPERS}

      // autofill token from #token=...
      (function(){
        try{
          var h = location.hash || '';
          var m = h.match(/token=([^&]+)/);
          if(m && m[1]){
            document.getElementById('t').value = decodeURIComponent(m[1]);
          }
        }catch{}
      })();

      async function reqReset(){
        var email = document.getElementById('e').value.trim();
        var out = document.getElementById('out');
        out.textContent = '...';
        var r = await fetch('/api/auth/reset/request',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({email:email})
        });
        var j = await readJsonOrText(r);
        out.textContent = j.ok ? 'Jika email terdaftar, token akan dikirim.' : (j.error || 'gagal');
      }

      async function confirmReset(){
        var token = document.getElementById('t').value.trim();
        var newPw = document.getElementById('npw').value;
        var out = document.getElementById('out2');
        out.textContent = '...';
        var r = await fetch('/api/auth/reset/confirm',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({token:token,newPw:newPw})
        });
        var j = await readJsonOrText(r);
        out.textContent = j.ok ? 'Password diubah. Silakan login.' : (j.error || 'gagal');
      }
    </script>
    `
    );
}
