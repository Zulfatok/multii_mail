// src/pages/template.js — Shared HTML template, CSS, and UI components

import { esc } from "../utils.js";

export { esc };

const LOGO_IMG_URL = "https://raw.githubusercontent.com/Zulfatok/Rule_provider/main/rule_provider/Desain%20tanpa%20judul%20(7).png";

export const LOGO_SVG = `<img src="${LOGO_IMG_URL}" alt="OL" width="52" height="52" class="logo-img" />`;

const FAVICON_URL = LOGO_IMG_URL;

export function headerHtml({ badge, subtitle, rightHtml = "" }) {
  return `
  <header class="hdr">
    <div class="brand">
      <div class="logo">${LOGO_SVG}</div>
      <div class="brandText">
        <div class="brandName">Org_Lemah</div>
        <div class="brandSub">${subtitle || ""}</div>
      </div>
      ${badge ? `<span class="pill">${badge}</span>` : ""}
    </div>
    <div class="hdrRight">${rightHtml}</div>
  </header>`;
}

export function pageTemplate(title, body, extraHead = "") {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <meta name="theme-color" content="#070a10">
  <link rel="icon" type="image/png" href="${FAVICON_URL}">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    base-uri 'none';
    object-src 'none';
    form-action 'self';
    frame-ancestors 'none';
    img-src 'self' data: https:;
    style-src 'self' 'unsafe-inline';
    script-src 'self' 'unsafe-inline';
    connect-src 'self';
    frame-src 'self';
  ">
  ${extraHead}
  <style>
    :root{
      --bg0:#0f172a;
      --bg1:#1e293b;
      --bg2:#334155;
      --card: rgba(30,41,59,.92);
      --card2: rgba(15,23,42,.95);
      --border: rgba(71,85,105,.45);
      --text:#f1f5f9;
      --muted:#94a3b8;
      --brand:#3b82f6;
      --brand-light:#60a5fa;
      --brand2:#06b6d4;
      --danger:#ef4444;
      --success:#10b981;
      --warning:#f59e0b;
      --paper:#f8fafc;
      --paperText:#0f172a;
      --paperBorder: rgba(2,6,23,.12);
    }
    *{box-sizing:border-box}
    body{
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      margin:0;
      color:var(--text);
      min-height:100vh;
      background:
        radial-gradient(1200px 600px at 10% 0%, rgba(59,130,246,.12), transparent 60%),
        radial-gradient(900px 500px at 90% 10%, rgba(6,182,212,.10), transparent 55%),
        radial-gradient(700px 400px at 50% 100%, rgba(99,102,241,.08), transparent 50%),
        linear-gradient(180deg, var(--bg1), var(--bg0));
    }
    a{color:var(--brand);text-decoration:none}
    a:hover{opacity:.92;text-decoration:underline}
    .wrap{max-width:1040px;margin:0 auto;padding:18px}
    .hdr{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px 0 6px}
    .brand{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    .logo{display:flex;align-items:center}
    .logo-img{width:52px;height:52px;border-radius:14px;object-fit:cover;box-shadow:0 4px 16px rgba(59,130,246,.35),0 0 0 2px rgba(96,165,250,.25);transition:transform .2s ease,box-shadow .2s ease}
    .logo-img:hover{transform:scale(1.08);box-shadow:0 6px 24px rgba(59,130,246,.45),0 0 0 3px rgba(96,165,250,.35)}
    .brandText{display:flex;flex-direction:column;line-height:1.05}
    .brandName{font-weight:900;letter-spacing:.2px}
    .brandSub{color:var(--muted);font-size:12.5px;margin-top:4px}
    .hdrRight{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .card{
      background:linear-gradient(180deg, rgba(255,255,255,.05), transparent 50%),var(--card);
      border:1px solid rgba(100,116,139,.35);
      border-radius:20px;padding:20px;margin:16px 0;
      box-shadow:0 8px 32px rgba(0,0,0,.4),0 1px 2px rgba(59,130,246,.15);
      backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);overflow:hidden;
    }
    input,button,select,textarea{font:inherit}
    label{display:block;margin-bottom:6px;color:var(--muted);font-size:13px}
    input,select,textarea{
      width:100%;padding:12px 12px;border-radius:14px;
      border:1px solid var(--border);background:var(--card2);color:var(--text);outline:none;
    }
    input::placeholder{color:rgba(184,195,214,.55)}
    input:focus,select:focus,textarea:focus{border-color:rgba(96,165,250,.65);box-shadow:0 0 0 4px rgba(96,165,250,.12)}
    .pwWrap{position:relative}
    .pwWrap input{padding-right:92px}
    .pwToggle{
      position:absolute;right:10px;top:50%;transform:translateY(-50%);
      padding:6px 10px;border-radius:999px;border:1px solid var(--border);
      background:rgba(255,255,255,.06);color:var(--muted);font-size:12px;cursor:pointer;
    }
    .pwToggle:hover{background:rgba(255,255,255,.10);color:var(--text);border-color:rgba(96,165,250,.28)}
    button{
      padding:11px 16px;border-radius:12px;border:1px solid var(--border);
      background:rgba(59,130,246,.15);color:var(--text);cursor:pointer;
      font-weight:500;transition:all .2s ease;white-space:nowrap;
    }
    button:hover{background:rgba(59,130,246,.22);border-color:rgba(96,165,250,.45);transform:translateY(-1px);box-shadow:0 4px 12px rgba(59,130,246,.25)}
    button:active{transform:translateY(0)}
    .btn-primary{
      background:linear-gradient(135deg,rgba(59,130,246,.4),rgba(6,182,212,.3));
      border-color:rgba(59,130,246,.5);font-weight:600;box-shadow:0 4px 14px rgba(59,130,246,.3);
    }
    .btn-primary:hover{background:linear-gradient(135deg,rgba(59,130,246,.5),rgba(6,182,212,.4));border-color:rgba(96,165,250,.6);box-shadow:0 6px 20px rgba(59,130,246,.4);transform:translateY(-2px)}
    .btn-ghost{background:rgba(255,255,255,.04)}
    .danger{border-color:rgba(239,68,68,.50);background:rgba(239,68,68,.12)}
    .danger:hover{background:rgba(239,68,68,.16);border-color:rgba(239,68,68,.60)}
    .muted{color:var(--muted)}
    .pill{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;border:1px solid var(--border);background:rgba(255,255,255,.04);color:var(--muted);font-size:12px}
    .kbd{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--border);background:rgba(255,255,255,.04);color:var(--muted)}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .split{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
    .listItem{padding:12px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
    .mailItem{padding:12px 12px;border:1px solid var(--border);border-radius:16px;background:rgba(255,255,255,.03);margin-bottom:10px}
    .mailSubject{font-weight:900;font-size:14.5px}
    .mailMeta{color:var(--muted);font-size:12.5px;margin-top:4px;line-height:1.35}
    .mailSnippet{color:rgba(238,242,255,.92);font-size:13.5px;margin-top:10px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
    .viewerHead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
    .paper{background:var(--paper);color:var(--paperText);border:1px solid var(--paperBorder);border-radius:16px;padding:14px}
    .mailFrame{width:100%;height:70vh;border:1px solid var(--paperBorder);border-radius:16px;background:var(--paper)}
    .mailText{white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-size:14px;line-height:1.65;margin:0}
    .hr{border:0;border-top:1px solid var(--border);margin:12px 0}
    .emailCheckbox{width:20px;height:20px;cursor:pointer;accent-color:var(--brand);flex-shrink:0}
    .selectAllCheckbox{width:18px;height:18px;cursor:pointer;accent-color:var(--brand);margin-right:8px}
    .mailItem.selected{background:rgba(59,130,246,.12);border-color:rgba(59,130,246,.45)}
    .bulkActions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 12px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.3);border-radius:12px;margin-bottom:10px}
    @media (max-width:860px){.split{grid-template-columns:1fr}}
    @media (max-width:760px){
      .wrap{padding:14px}
      .hdr{flex-direction:column;align-items:flex-start}
      .row{grid-template-columns:1fr}
      .mailFrame{height:58vh}
      .listItem{flex-direction:column!important;align-items:flex-start!important;padding:12px!important;display:flex!important;width:100%!important}
      .listItem > div{width:100%!important;min-width:0!important;display:block!important}
      .listItem input{width:100%!important;max-width:none!important}
      .listItem button{flex:1;min-width:0;font-size:13px;padding:10px 12px;display:block!important;width:100%!important}
      #aliases{min-height:40px!important;display:block!important;visibility:visible!important;opacity:1!important;width:100%!important}
      #aliases > div{display:block!important;visibility:visible!important;opacity:1!important;width:100%!important;margin-bottom:10px!important}
      #aliases .listItem{display:flex!important;visibility:visible!important;opacity:1!important;width:100%!important;background:rgba(255,255,255,.03)!important;border:1px solid var(--border)!important;border-radius:12px!important;padding:12px!important;margin-bottom:8px!important}
    }
  </style>
</head>
<body>
  <div class="wrap">
    ${body}
  </div>
</body>
</html>`;
}

// Shared client-side helpers (injected into pages that need them)
export const CLIENT_HELPERS = `
function togglePw(id, btn){
  var el = document.getElementById(id);
  if(!el) return;
  var show = el.type === 'password';
  el.type = show ? 'text' : 'password';
  btn.textContent = show ? 'Hide' : 'Show';
  btn.setAttribute('aria-pressed', show ? 'true' : 'false');
}
function esc(s){return (s||'').replace(/[&<>"']/g, function(m){ return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[m]; });}
async function readJsonOrText(r){
  try { return await r.json(); }
  catch {
    var t = await r.text().catch(function(){return '';});
    return { ok:false, error: 'Server returned non-JSON ('+r.status+'). ' + (t ? t.slice(0,200) : '') };
  }
}
async function api(path, opts){
  var r = await fetch(path, opts);
  var j = await r.json().catch(function(){return null;});
  if(!j) {
    var t = await r.text().catch(function(){return '';});
    throw new Error('Server returned non-JSON ('+r.status+'): ' + (t ? t.slice(0,200) : ''));
  }
  return j;
}
function fmtDate(v){
  if(v===null||v===undefined||v==='') return '';
  try{
    if(typeof v === 'number'){
      var ms = v < 1000000000000 ? (v*1000) : v;
      return new Date(ms).toLocaleString();
    }
    var s = String(v);
    if(/^\\d{9,13}$/.test(s)){
      var n = Number(s);
      var ms2 = n < 1000000000000 ? (n*1000) : n;
      return new Date(ms2).toLocaleString();
    }
    var d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  }catch{ return String(v); }
}
`;
