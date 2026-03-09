// src/index.js — Main router (thin entry point)
import PostalMime from "postal-mime";
import { createLogger } from "./logger.js";
import {
  json, html, badRequest, unauthorized, forbidden, notFound,
  safeInt, nowSec, base64Url, base64UrlToBytes, sha256Base64Url,
  pbkdf2HashBase64Url, pbkdf2Iters, getCookie, setCookieHeader,
  readJson, validLocalPart,
  usersHasPassIters, aliasesHasDomain, emailsHasDomain, getAllowedDomains,
} from "./utils.js";
import {
  getUserBySession, createSession, destroySession,
  cleanupExpired, deleteUserCascade, sendResetEmail,
} from "./auth.js";
import { loginPage } from "./pages/login.js";
import { signupPage } from "./pages/signup.js";
import { resetPage } from "./pages/reset.js";
import { appPage } from "./pages/app.js";
import { adminPage } from "./pages/admin.js";

// -------------------- Worker entry --------------------
export default {
  async fetch(request, env, ctx) {
    const log = createLogger("router", env);
    ctx.waitUntil(cleanupExpired(env));

    const url = new URL(request.url);
    const path = url.pathname;
    const cookieSecure = url.protocol === "https:";

    // ==================== Pages ====================
    if (request.method === "GET") {
      const domains = getAllowedDomains(env);
      if (path === "/" || path === "/login") return html(loginPage());
      if (path === "/signup") return html(signupPage(domains));
      if (path === "/reset") return html(resetPage());
      if (path === "/app") return html(appPage(domains));

      // Admin page — server-side protection
      if (path === "/admin") {
        const me = await getUserBySession(request, env);
        if (!me || me.role !== "admin") {
          log.warn("Unauthorized admin page access attempt");
          return Response.redirect(url.origin + "/login", 302);
        }
        return html(adminPage(domains));
      }
    }

    // ==================== Monitoring API (API Key auth) ====================
    if (path.startsWith("/api/monitor/")) {
      const apiKey = request.headers.get("x-api-key") || "";
      if (!env.MONITOR_API_KEY || apiKey !== env.MONITOR_API_KEY) {
        return json({ ok: false, error: "Invalid API key" }, 401);
      }
      log.info("Monitor API request", { path });

      // GET /api/monitor/stats
      if (path === "/api/monitor/stats" && request.method === "GET") {
        const userCount = await env.DB.prepare(`SELECT COUNT(*) as c FROM users`).first();
        const aliasCount = await env.DB.prepare(`SELECT COUNT(*) as c FROM aliases`).first();
        const emailCount = await env.DB.prepare(`SELECT COUNT(*) as c FROM emails`).first();
        return json({
          ok: true,
          stats: {
            users: Number(userCount?.c ?? 0),
            aliases: Number(aliasCount?.c ?? 0),
            emails: Number(emailCount?.c ?? 0),
          },
        });
      }

      // GET /api/monitor/inbox?alias=xxx&domain=yyy&since=timestamp&limit=20&offset=0
      if (path === "/api/monitor/inbox" && request.method === "GET") {
        const alias = (url.searchParams.get("alias") || "").trim().toLowerCase();
        const domain = (url.searchParams.get("domain") || "").trim().toLowerCase();
        const since = safeInt(url.searchParams.get("since"), 0);
        const limit = Math.min(safeInt(url.searchParams.get("limit"), 20), 100);
        const offset = safeInt(url.searchParams.get("offset"), 0);
        const q = (url.searchParams.get("q") || "").trim();

        const hasEmailDomain = await emailsHasDomain(env);
        let sqlWhere = "WHERE e.created_at > ?";
        const binds = [since];

        // Filter by specific alias (per-email monitoring)
        if (alias) {
          sqlWhere += " AND e.local_part = ?";
          binds.push(alias);
        }
        if (domain && hasEmailDomain) {
          sqlWhere += " AND e.domain = ?";
          binds.push(domain);
        }

        // Search across subject, from_addr, text
        if (q) {
          const pattern = `%${q}%`;
          sqlWhere += " AND (e.subject LIKE ? OR e.from_addr LIKE ? OR e.text LIKE ?)";
          binds.push(pattern, pattern, pattern);
        }

        // Get total count
        const countRow = await env.DB.prepare(
          `SELECT COUNT(*) as c FROM emails e ${sqlWhere}`
        ).bind(...binds).first();
        const total = Number(countRow?.c ?? 0);

        // Get emails
        const rows = await env.DB.prepare(
          `SELECT e.id, e.local_part, ${hasEmailDomain ? "e.domain," : ""} e.from_addr, e.to_addr,
                  e.subject, e.date, e.created_at,
                  substr(COALESCE(e.text,''), 1, 500) as snippet,
                  u.username
           FROM emails e
           JOIN users u ON u.id = e.user_id
           ${sqlWhere}
           ORDER BY e.created_at DESC
           LIMIT ? OFFSET ?`
        ).bind(...binds, limit, offset).all();

        return json({
          ok: true,
          total,
          limit,
          offset,
          emails: (rows.results || []).map(e => ({
            ...e,
            domain: e.domain || domain || "",
          })),
        });
      }

      // GET /api/monitor/email/:id
      if (path.startsWith("/api/monitor/email/") && request.method === "GET") {
        const id = decodeURIComponent(path.slice("/api/monitor/email/".length));
        const row = await env.DB.prepare(
          `SELECT e.id, e.local_part, e.from_addr, e.to_addr, e.subject, e.date,
                  e.text, e.html, e.raw_key, e.created_at, e.size,
                  u.username, u.email as user_email
           FROM emails e
           JOIN users u ON u.id = e.user_id
           WHERE e.id = ?`
        ).bind(id).first();

        if (!row) return notFound();
        return json({ ok: true, email: row });
      }

      // GET /api/monitor/aliases?username=xxx — list aliases for a user (or all)
      if (path === "/api/monitor/aliases" && request.method === "GET") {
        const username = (url.searchParams.get("username") || "").trim().toLowerCase();
        const hasDomain = await aliasesHasDomain(env);
        const allowedDomains = getAllowedDomains(env);
        const fallbackDomain = allowedDomains[0] || env.DOMAIN || "";

        let rows;
        if (username) {
          // Get aliases for specific user
          const user = await env.DB.prepare(`SELECT id FROM users WHERE username = ?`).bind(username).first();
          if (!user) return json({ ok: false, error: "User not found" }, 404);

          rows = hasDomain
            ? await env.DB.prepare(
              `SELECT a.local_part, a.domain, a.disabled, a.created_at, u.username
               FROM aliases a JOIN users u ON u.id = a.user_id
               WHERE a.user_id = ? ORDER BY a.created_at DESC`
            ).bind(user.id).all()
            : await env.DB.prepare(
              `SELECT a.local_part, ? as domain, a.disabled, a.created_at, u.username
               FROM aliases a JOIN users u ON u.id = a.user_id
               WHERE a.user_id = ? ORDER BY a.created_at DESC`
            ).bind(fallbackDomain, user.id).all();
        } else {
          // Get all aliases
          rows = hasDomain
            ? await env.DB.prepare(
              `SELECT a.local_part, a.domain, a.disabled, a.created_at, u.username
               FROM aliases a JOIN users u ON u.id = a.user_id
               ORDER BY a.created_at DESC LIMIT 200`
            ).all()
            : await env.DB.prepare(
              `SELECT a.local_part, ? as domain, a.disabled, a.created_at, u.username
               FROM aliases a JOIN users u ON u.id = a.user_id
               ORDER BY a.created_at DESC LIMIT 200`
            ).bind(fallbackDomain).all();
        }

        const aliases = (rows.results || []).map(a => ({
          email: `${a.local_part}@${a.domain || fallbackDomain}`,
          local_part: a.local_part,
          domain: a.domain || fallbackDomain,
          username: a.username,
          disabled: !!a.disabled,
          created_at: a.created_at,
        }));

        return json({ ok: true, aliases });
      }

      // POST /api/monitor/alias — create a new email alias
      // Body: { "local": "sambat", "domain": "mazayaa.me", "username": "sipar" }
      if (path === "/api/monitor/alias" && request.method === "POST") {
        const body = await readJson(request);
        if (!body) return badRequest("JSON required");

        const local = String(body.local || "").trim().toLowerCase();
        let domain = String(body.domain || "").trim().toLowerCase();
        const username = String(body.username || "").trim().toLowerCase();

        if (!local) return badRequest("local required (contoh: sambat)");
        if (!validLocalPart(local)) return badRequest("local tidak valid (a-z0-9._+- max 64)");
        if (!username) return badRequest("username required (user pemilik alias)");

        // Find user
        const user = await env.DB.prepare(
          `SELECT id, alias_limit, disabled FROM users WHERE username = ?`
        ).bind(username).first();

        if (!user) return json({ ok: false, error: "User not found" }, 404);
        if (user.disabled) return json({ ok: false, error: "User is disabled" }, 403);

        const allowedDomains = getAllowedDomains(env);
        const fallbackDomain = allowedDomains[0] || env.DOMAIN || "";
        const hasDomain = await aliasesHasDomain(env);

        if (!domain) domain = fallbackDomain;
        if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
          return badRequest("Domain tidak diizinkan. Allowed: " + allowedDomains.join(", "));
        }

        // Check alias limit
        const cnt = await env.DB.prepare(
          `SELECT COUNT(*) as c FROM aliases WHERE user_id = ? AND disabled = 0`
        ).bind(user.id).first();
        if (Number(cnt?.c ?? 0) >= user.alias_limit) {
          return json({ ok: false, error: "Alias limit tercapai (" + user.alias_limit + ")" }, 403);
        }

        const t = nowSec();
        try {
          if (hasDomain) {
            await env.DB.prepare(
              `INSERT INTO aliases (local_part, domain, user_id, disabled, created_at)
               VALUES (?, ?, ?, 0, ?)`
            ).bind(local, domain, user.id, t).run();
          } else {
            await env.DB.prepare(
              `INSERT INTO aliases (local_part, user_id, disabled, created_at)
               VALUES (?, ?, 0, ?)`
            ).bind(local, user.id, t).run();
          }
        } catch (e) {
          const msg = String(e && e.message ? e.message : e);
          if (msg.toUpperCase().includes("UNIQUE")) {
            return badRequest("Email " + local + "@" + domain + " sudah dipakai");
          }
          log.error("Monitor create alias error", { error: msg });
          return json({ ok: false, error: "DB error" }, 500);
        }

        const email = local + "@" + domain;
        log.info("Monitor API: alias created", { email, username });
        return json({
          ok: true,
          alias: { email, local_part: local, domain, username },
        });
      }

      // DELETE /api/monitor/alias — delete an email alias
      // Body: { "local": "sambat", "domain": "mazayaa.me" }
      if (path === "/api/monitor/alias" && request.method === "DELETE") {
        const body = await readJson(request);
        if (!body) return badRequest("JSON required");

        const local = String(body.local || "").trim().toLowerCase();
        let domain = String(body.domain || "").trim().toLowerCase();

        if (!local) return badRequest("local required");
        if (!validLocalPart(local)) return badRequest("local tidak valid");

        const allowedDomains = getAllowedDomains(env);
        const fallbackDomain = allowedDomains[0] || env.DOMAIN || "";
        const hasDomain = await aliasesHasDomain(env);

        if (!domain) domain = fallbackDomain;

        // Check alias exists
        let alias;
        if (hasDomain) {
          alias = await env.DB.prepare(
            `SELECT local_part, domain, user_id FROM aliases WHERE local_part = ? AND domain = ?`
          ).bind(local, domain).first();
        } else {
          alias = await env.DB.prepare(
            `SELECT local_part, user_id FROM aliases WHERE local_part = ?`
          ).bind(local).first();
        }

        if (!alias) return json({ ok: false, error: "Alias not found" }, 404);

        // Delete alias and its emails
        if (hasDomain) {
          // Delete emails for this alias
          const emailRows = await env.DB.prepare(
            `SELECT raw_key FROM emails WHERE local_part = ? AND domain = ?`
          ).bind(local, domain).all();

          await env.DB.prepare(`DELETE FROM emails WHERE local_part = ? AND domain = ?`).bind(local, domain).run();
          await env.DB.prepare(`DELETE FROM aliases WHERE local_part = ? AND domain = ?`).bind(local, domain).run();

          // R2 cleanup
          if (env.MAIL_R2) {
            const keys = (emailRows.results || []).map(r => r.raw_key).filter(k => k);
            if (keys.length > 0) {
              ctx.waitUntil(Promise.allSettled(keys.map(k => env.MAIL_R2.delete(k))));
            }
          }
        } else {
          const emailRows = await env.DB.prepare(
            `SELECT raw_key FROM emails WHERE local_part = ?`
          ).bind(local).all();

          await env.DB.prepare(`DELETE FROM emails WHERE local_part = ?`).bind(local).run();
          await env.DB.prepare(`DELETE FROM aliases WHERE local_part = ?`).bind(local).run();

          if (env.MAIL_R2) {
            const keys = (emailRows.results || []).map(r => r.raw_key).filter(k => k);
            if (keys.length > 0) {
              ctx.waitUntil(Promise.allSettled(keys.map(k => env.MAIL_R2.delete(k))));
            }
          }
        }

        const email = local + "@" + domain;
        log.info("Monitor API: alias deleted", { email });
        return json({ ok: true, deleted: email });
      }

      return notFound();
    }

    // ==================== API ====================
    if (path.startsWith("/api/")) {
      try {
        // Signup
        if (path === "/api/auth/signup" && request.method === "POST") {
          const body = await readJson(request);
          if (!body) return badRequest("JSON required");

          const username = String(body.username || "").trim().toLowerCase();
          const email = String(body.email || "").trim().toLowerCase();
          const pw = String(body.pw || "");

          if (!/^[a-z0-9_]{3,24}$/.test(username)) return badRequest("Username 3-24, a-z0-9_");
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest("Email tidak valid");
          if (pw.length < 8) return badRequest("Password minimal 8 karakter");

          const iters = pbkdf2Iters(env);
          const salt = crypto.getRandomValues(new Uint8Array(16));
          const pass_salt = base64Url(salt);
          const pass_hash = await pbkdf2HashBase64Url(pw, salt, iters);

          const t = nowSec();
          const id = crypto.randomUUID();

          const c = await env.DB.prepare(`SELECT COUNT(*) as c FROM users`).first();
          const count = Number(c?.c ?? 0);
          const role = count === 0 ? "admin" : "user";
          const aliasLimit = safeInt(env.DEFAULT_ALIAS_LIMIT, 3);

          try {
            const hasIters = await usersHasPassIters(env);
            if (hasIters) {
              await env.DB.prepare(
                `INSERT INTO users (id, username, email, pass_salt, pass_hash, pass_iters, role, alias_limit, disabled, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
              ).bind(id, username, email, pass_salt, pass_hash, iters, role, aliasLimit, t).run();
            } else {
              await env.DB.prepare(
                `INSERT INTO users (id, username, email, pass_salt, pass_hash, role, alias_limit, disabled, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
              ).bind(id, username, email, pass_salt, pass_hash, role, aliasLimit, t).run();
            }
          } catch (e) {
            const msg = String(e && e.message ? e.message : e);
            if (msg.toUpperCase().includes("UNIQUE")) return badRequest("Username/email sudah dipakai");
            log.error("Signup DB error", { error: msg });
            return json({ ok: false, error: "DB error" }, 500);
          }

          // Auto-create initial alias
          let domain = String(body.domain || "").trim().toLowerCase();
          const allowedDomains = getAllowedDomains(env);
          const fallbackDomain = allowedDomains[0] || env.DOMAIN || "";
          const hasDomain = await aliasesHasDomain(env);

          if (!domain) domain = fallbackDomain;
          const selectedDomain = allowedDomains.includes(domain) ? domain : fallbackDomain;

          try {
            if (hasDomain) {
              await env.DB.prepare(
                `INSERT INTO aliases (local_part, domain, user_id, disabled, created_at)
                 VALUES (?, ?, ?, 0, ?)`
              ).bind(username, selectedDomain, id, t).run();
            } else {
              await env.DB.prepare(
                `INSERT INTO aliases (local_part, user_id, disabled, created_at)
                 VALUES (?, ?, 0, ?)`
              ).bind(username, id, t).run();
            }
          } catch (e) {
            log.warn("Auto-create alias error", { error: String(e) });
          }

          const ttl = safeInt(env.SESSION_TTL_SECONDS, 1209600);
          const token = await createSession(env, id, ttl);
          log.info("User signed up", { username, role });

          return json({ ok: true }, 200, {
            "set-cookie": setCookieHeader("session", token, { maxAge: ttl, secure: cookieSecure }),
          });
        }

        // Login
        if (path === "/api/auth/login" && request.method === "POST") {
          const body = await readJson(request);
          if (!body) return badRequest("JSON required");

          const id = String(body.id || "").trim().toLowerCase();
          const pw = String(body.pw || "");
          if (!id || !pw) return badRequest("Lengkapi data");

          const hasIters = await usersHasPassIters(env);
          const user = hasIters
            ? await env.DB.prepare(
              `SELECT id, username, email, pass_salt, pass_hash, pass_iters, role, alias_limit, disabled
                 FROM users WHERE username = ? OR email = ?`
            ).bind(id, id).first()
            : await env.DB.prepare(
              `SELECT id, username, email, pass_salt, pass_hash, role, alias_limit, disabled
                 FROM users WHERE username = ? OR email = ?`
            ).bind(id, id).first();

          if (!user || user.disabled) return unauthorized("Login gagal");

          const saltBytes = base64UrlToBytes(user.pass_salt);
          const iters = hasIters ? safeInt(user.pass_iters, pbkdf2Iters(env)) : pbkdf2Iters(env);

          if (iters > 100000) {
            return unauthorized("Hash password lama tidak didukung. Silakan reset password.");
          }

          let hash;
          try {
            hash = await pbkdf2HashBase64Url(pw, saltBytes, iters);
          } catch (e) {
            if ((e?.name || "") === "NotSupportedError") {
              return unauthorized("Parameter hash tidak didukung. Silakan reset password.");
            }
            throw e;
          }

          if (hash !== user.pass_hash) return unauthorized("Login gagal");

          const ttl = safeInt(env.SESSION_TTL_SECONDS, 1209600);
          const token = await createSession(env, user.id, ttl);
          log.info("User logged in", { username: user.username });

          return json({ ok: true }, 200, {
            "set-cookie": setCookieHeader("session", token, { maxAge: ttl, secure: cookieSecure }),
          });
        }

        // Logout
        if (path === "/api/auth/logout" && request.method === "POST") {
          await destroySession(request, env);
          return json({ ok: true }, 200, {
            "set-cookie": setCookieHeader("session", "", { maxAge: 0, secure: cookieSecure }),
          });
        }

        // Reset request
        if (path === "/api/auth/reset/request" && request.method === "POST") {
          const body = await readJson(request);
          if (!body) return badRequest("JSON required");
          const email = String(body.email || "").trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest("Email tidak valid");

          const user = await env.DB.prepare(`SELECT id, disabled FROM users WHERE email = ?`)
            .bind(email).first();
          if (!user || user.disabled) return json({ ok: true });

          const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
          const token = base64Url(tokenBytes);
          const tokenHash = await sha256Base64Url(new TextEncoder().encode(token));
          const t = nowSec();
          const ttl = safeInt(env.RESET_TTL_SECONDS, 3600);

          await env.DB.prepare(
            `INSERT INTO reset_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`
          ).bind(tokenHash, user.id, t + ttl, t).run();

          ctx.waitUntil(sendResetEmail(env, email, token));
          return json({ ok: true });
        }

        // Reset confirm
        if (path === "/api/auth/reset/confirm" && request.method === "POST") {
          const body = await readJson(request);
          if (!body) return badRequest("JSON required");
          const token = String(body.token || "").trim();
          const newPw = String(body.newPw || "");
          if (!token) return badRequest("Token wajib");
          if (newPw.length < 8) return badRequest("Password minimal 8 karakter");

          const tokenHash = await sha256Base64Url(new TextEncoder().encode(token));
          const rt = await env.DB.prepare(
            `SELECT user_id, expires_at FROM reset_tokens WHERE token_hash = ?`
          ).bind(tokenHash).first();

          if (!rt || rt.expires_at <= nowSec()) return badRequest("Token invalid/expired");

          const iters = pbkdf2Iters(env);
          const salt = crypto.getRandomValues(new Uint8Array(16));
          const pass_salt = base64Url(salt);
          const pass_hash = await pbkdf2HashBase64Url(newPw, salt, iters);

          const hasIters = await usersHasPassIters(env);
          if (hasIters) {
            await env.DB.prepare(`UPDATE users SET pass_salt=?, pass_hash=?, pass_iters=? WHERE id=?`)
              .bind(pass_salt, pass_hash, iters, rt.user_id).run();
          } else {
            await env.DB.prepare(`UPDATE users SET pass_salt=?, pass_hash=? WHERE id=?`)
              .bind(pass_salt, pass_hash, rt.user_id).run();
          }

          await env.DB.prepare(`DELETE FROM reset_tokens WHERE token_hash=?`).bind(tokenHash).run();
          log.info("Password reset confirmed", { userId: rt.user_id });
          return json({ ok: true });
        }

        // ===== Auth required below =====
        const me = await getUserBySession(request, env);
        if (!me) return unauthorized();

        if (path === "/api/me" && request.method === "GET") {
          return json({
            ok: true,
            user: {
              id: me.id,
              username: me.username,
              email: me.email,
              role: me.role,
              alias_limit: me.alias_limit,
            },
          });
        }

        // Aliases
        if (path === "/api/aliases" && request.method === "GET") {
          const hasDomain = await aliasesHasDomain(env);
          const allowedDomains = getAllowedDomains(env);
          const fallbackDomain = allowedDomains[0] || env.DOMAIN || "";

          const rows = hasDomain
            ? await env.DB.prepare(
              `SELECT local_part, domain, disabled, created_at FROM aliases WHERE user_id = ? ORDER BY created_at DESC`
            ).bind(me.id).all()
            : await env.DB.prepare(
              `SELECT local_part, ? as domain, disabled, created_at FROM aliases WHERE user_id = ? ORDER BY created_at DESC`
            ).bind(fallbackDomain, me.id).all();

          return json({ ok: true, aliases: rows.results || [] });
        }

        if (path === "/api/aliases" && request.method === "POST") {
          const body = await readJson(request);
          if (!body) return badRequest("JSON required");
          const local = String(body.local || "").trim().toLowerCase();
          let domain = String(body.domain || "").trim().toLowerCase();
          if (!validLocalPart(local)) return badRequest("Mail tidak valid (a-z0-9._+- max 64)");

          const allowedDomains = getAllowedDomains(env);
          const fallbackDomain = allowedDomains[0] || env.DOMAIN || "";
          const hasDomain = await aliasesHasDomain(env);

          if (!fallbackDomain && !hasDomain) return badRequest("Domain belum dikonfigurasi");

          if (hasDomain) {
            if (!domain) domain = fallbackDomain;
            if (allowedDomains.length > 0) {
              if (!allowedDomains.includes(domain)) return badRequest("Domain tidak diizinkan");
            } else if (fallbackDomain) {
              if (domain !== fallbackDomain) return badRequest("Domain tidak diizinkan");
            } else {
              return badRequest("Domain belum dikonfigurasi");
            }
          } else {
            if (domain && domain !== fallbackDomain) return badRequest("Domain tidak diizinkan");
            domain = fallbackDomain;
          }

          const cnt = await env.DB.prepare(
            `SELECT COUNT(*) as c FROM aliases WHERE user_id = ? AND disabled = 0`
          ).bind(me.id).first();
          if (Number(cnt?.c ?? 0) >= me.alias_limit) return forbidden("Limit mail tercapai");

          const t = nowSec();
          try {
            if (hasDomain) {
              await env.DB.prepare(
                `INSERT INTO aliases (local_part, domain, user_id, disabled, created_at) VALUES (?, ?, ?, 0, ?)`
              ).bind(local, domain, me.id, t).run();
            } else {
              await env.DB.prepare(
                `INSERT INTO aliases (local_part, user_id, disabled, created_at) VALUES (?, ?, 0, ?)`
              ).bind(local, me.id, t).run();
            }
          } catch (e) {
            const msg = String(e && e.message ? e.message : e);
            if (msg.toUpperCase().includes("UNIQUE")) return badRequest("Mail sudah dipakai");
            log.error("Alias DB error", { error: msg });
            return json({ ok: false, error: "DB error" }, 500);
          }

          log.info("Alias created", { local, domain, user: me.username });
          return json({ ok: true });
        }

        if (path.startsWith("/api/aliases/") && request.method === "DELETE") {
          const local = decodeURIComponent(path.slice("/api/aliases/".length)).toLowerCase();
          const domain = (url.searchParams.get("domain") || "").trim().toLowerCase();
          if (!validLocalPart(local)) return badRequest("Mail invalid");

          const hasDomain = await aliasesHasDomain(env);
          if (hasDomain) {
            if (!domain) return badRequest("Domain required");
            const own = await env.DB.prepare(
              `SELECT local_part FROM aliases WHERE local_part = ? AND domain = ? AND user_id = ?`
            ).bind(local, domain, me.id).first();
            if (!own) return notFound();
            await env.DB.prepare(`DELETE FROM aliases WHERE local_part = ? AND domain = ? AND user_id = ?`)
              .bind(local, domain, me.id).run();
          } else {
            const own = await env.DB.prepare(
              `SELECT local_part FROM aliases WHERE local_part = ? AND user_id = ?`
            ).bind(local, me.id).first();
            if (!own) return notFound();
            await env.DB.prepare(`DELETE FROM aliases WHERE local_part = ? AND user_id = ?`)
              .bind(local, me.id).run();
          }

          log.info("Alias deleted", { local, domain, user: me.username });
          return json({ ok: true });
        }

        // Emails (with search support)
        if (path === "/api/emails" && request.method === "GET") {
          const alias = (url.searchParams.get("alias") || "").trim().toLowerCase();
          let domainParam = (url.searchParams.get("domain") || "").trim().toLowerCase();
          const searchQuery = (url.searchParams.get("q") || "").trim();

          if (!alias || !validLocalPart(alias)) return badRequest("alias required");

          const allowedDomains = getAllowedDomains(env);
          const fallbackDomain = allowedDomains[0] || env.DOMAIN || "";
          const aliasesDom = await aliasesHasDomain(env);
          const emailsDom = await emailsHasDomain(env);

          // Resolve ownership
          let domain = domainParam;
          if (aliasesDom) {
            if (domain) {
              const owned = await env.DB.prepare(
                `SELECT domain FROM aliases WHERE local_part = ? AND domain = ? AND user_id = ? AND disabled = 0`
              ).bind(alias, domain, me.id).first();
              if (!owned) return forbidden("Mail bukan milikmu / disabled");
              domain = owned.domain;
            } else {
              const ownedRows = await env.DB.prepare(
                `SELECT domain FROM aliases WHERE local_part = ? AND user_id = ? AND disabled = 0`
              ).bind(alias, me.id).all();
              const list = ownedRows.results || [];
              if (list.length === 0) return forbidden("Mail bukan milikmu / disabled");
              if (list.length > 1) return badRequest("domain required");
              domain = list[0].domain;
            }
          } else {
            const owned = await env.DB.prepare(
              `SELECT local_part FROM aliases WHERE local_part = ? AND user_id = ? AND disabled = 0`
            ).bind(alias, me.id).first();
            if (!owned) return forbidden("Mail bukan milikmu / disabled");
          }

          let domainForEmails = domain || fallbackDomain;

          // Build search query
          let searchWhere = "";
          const searchBinds = [];
          if (searchQuery) {
            const pattern = `%${searchQuery}%`;
            searchWhere = " AND (subject LIKE ? OR from_addr LIKE ? OR text LIKE ?)";
            searchBinds.push(pattern, pattern, pattern);
          }

          let rows;
          if (emailsDom) {
            const primary = await env.DB.prepare(
              `SELECT id, from_addr, to_addr, subject, date, created_at,
                      substr(COALESCE(text,''), 1, 180) as snippet
               FROM emails
               WHERE user_id = ? AND local_part = ? AND domain = ?${searchWhere}
               ORDER BY created_at DESC
               LIMIT 50`
            ).bind(me.id, alias, domainForEmails, ...searchBinds).all();

            if (!primary.results || primary.results.length === 0) {
              const alt = await env.DB.prepare(
                `SELECT id, from_addr, to_addr, subject, date, created_at,
                        substr(COALESCE(text,''), 1, 180) as snippet
                 FROM emails
                 WHERE user_id = ? AND local_part = ?${searchWhere}
                 ORDER BY created_at DESC
                 LIMIT 50`
              ).bind(me.id, alias, ...searchBinds).all();
              rows = alt;
            } else {
              rows = primary;
            }
          } else {
            rows = await env.DB.prepare(
              `SELECT id, from_addr, to_addr, subject, date, created_at,
                      substr(COALESCE(text,''), 1, 180) as snippet
               FROM emails
               WHERE user_id = ? AND local_part = ?${searchWhere}
               ORDER BY created_at DESC
               LIMIT 50`
            ).bind(me.id, alias, ...searchBinds).all();
          }

          return json({ ok: true, emails: rows.results || [] });
        }

        if (path.startsWith("/api/emails/") && request.method === "GET") {
          const id = decodeURIComponent(path.slice("/api/emails/".length));
          const row = await env.DB.prepare(
            `SELECT id, from_addr, to_addr, subject, date, text, html, raw_key, created_at
             FROM emails WHERE id = ? AND user_id = ?`
          ).bind(id, me.id).first();
          if (!row) return notFound();
          return json({ ok: true, email: row });
        }

        if (path.startsWith("/api/emails/") && request.method === "DELETE") {
          const id = decodeURIComponent(path.slice("/api/emails/".length));
          const row = await env.DB.prepare(`SELECT raw_key FROM emails WHERE id = ? AND user_id = ?`)
            .bind(id, me.id).first();
          if (!row) return notFound();
          await env.DB.prepare(`DELETE FROM emails WHERE id = ? AND user_id = ?`)
            .bind(id, me.id).run();
          if (row.raw_key && env.MAIL_R2) ctx.waitUntil(env.MAIL_R2.delete(row.raw_key));
          return json({ ok: true });
        }

        // ===== Admin endpoints =====
        if (path === "/api/admin/users" && request.method === "GET") {
          if (me.role !== "admin") return forbidden("Forbidden");
          const rows = await env.DB.prepare(
            `SELECT u.id, u.username, u.email, u.role, u.alias_limit, u.disabled, u.created_at,
                    COUNT(a.local_part) as alias_count
             FROM users u LEFT JOIN aliases a ON a.user_id = u.id
             GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200`
          ).all();
          const users = (rows.results || []).map((u) => ({
            ...u,
            created_at: new Date(u.created_at * 1000).toISOString(),
            alias_count: Number(u.alias_count || 0),
          }));
          return json({ ok: true, users });
        }

        if (path === "/api/admin/emails" && request.method === "GET") {
          if (me.role !== "admin") return forbidden("Forbidden");
          const rows = await env.DB.prepare(
            `SELECT e.id, e.from_addr, e.to_addr, e.subject, e.date, e.created_at,
                    substr(COALESCE(e.text,''), 1, 180) as snippet,
                    u.username, u.email as user_email
             FROM emails e JOIN users u ON u.id = e.user_id
             ORDER BY e.created_at DESC LIMIT 200`
          ).all();
          return json({ ok: true, emails: rows.results || [] });
        }

        if (path.startsWith("/api/admin/emails/") && request.method === "GET") {
          if (me.role !== "admin") return forbidden("Forbidden");
          const id = decodeURIComponent(path.slice("/api/admin/emails/".length));
          const row = await env.DB.prepare(
            `SELECT e.id, e.from_addr, e.to_addr, e.subject, e.date, e.text, e.html, e.raw_key, e.created_at,
                    u.username, u.email as user_email
             FROM emails e JOIN users u ON u.id = e.user_id WHERE e.id = ?`
          ).bind(id).first();
          if (!row) return notFound();
          return json({ ok: true, email: row });
        }

        if (path.startsWith("/api/admin/users/") && path.endsWith("/aliases") && request.method === "GET") {
          if (me.role !== "admin") return forbidden("Forbidden");
          const userId = decodeURIComponent(path.slice("/api/admin/users/".length, path.length - "/aliases".length));
          const hasDomain = await aliasesHasDomain(env);
          const allowedDomains = getAllowedDomains(env);
          const fallbackDomain = allowedDomains[0] || env.DOMAIN || "";

          const rows = hasDomain
            ? await env.DB.prepare(
              `SELECT local_part, domain, disabled, created_at FROM aliases WHERE user_id = ? ORDER BY created_at DESC`
            ).bind(userId).all()
            : await env.DB.prepare(
              `SELECT local_part, disabled, created_at FROM aliases WHERE user_id = ? ORDER BY created_at DESC`
            ).bind(userId).all();

          const aliases = (rows.results || []).map((a) => ({
            ...a,
            domain: a.domain || fallbackDomain,
            created_at: new Date(a.created_at * 1000).toISOString(),
          }));
          return json({ ok: true, aliases });
        }

        if (path.startsWith("/api/admin/users/") && request.method === "PATCH") {
          if (me.role !== "admin") return forbidden("Forbidden");
          const userId = decodeURIComponent(path.slice("/api/admin/users/".length));
          const body = await readJson(request);
          if (!body) return badRequest("JSON required");

          const alias_limit = body.alias_limit !== undefined ? safeInt(body.alias_limit, NaN) : undefined;
          const disabled = body.disabled !== undefined ? safeInt(body.disabled, NaN) : undefined;

          if (alias_limit !== undefined && (!Number.isFinite(alias_limit) || alias_limit < 0 || alias_limit > 1000))
            return badRequest("alias_limit invalid");
          if (disabled !== undefined && !(disabled === 0 || disabled === 1))
            return badRequest("disabled invalid");

          const sets = [];
          const binds = [];
          if (alias_limit !== undefined) { sets.push("alias_limit = ?"); binds.push(alias_limit); }
          if (disabled !== undefined) { sets.push("disabled = ?"); binds.push(disabled); }
          if (sets.length === 0) return badRequest("No fields");

          binds.push(userId);
          await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
          log.info("Admin updated user", { userId, changes: sets });
          return json({ ok: true });
        }

        if (path.startsWith("/api/admin/users/") && request.method === "DELETE") {
          if (me.role !== "admin") return forbidden("Forbidden");
          const userId = decodeURIComponent(path.slice("/api/admin/users/".length));

          if (userId === me.id) return badRequest("Tidak bisa menghapus akun sendiri");

          const u = await env.DB.prepare(`SELECT id, role FROM users WHERE id = ?`).bind(userId).first();
          if (!u) return notFound();

          if (u.role === "admin") {
            const c = await env.DB.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'admin'`).first();
            if (Number(c?.c ?? 0) <= 1) return badRequest("Tidak bisa menghapus admin terakhir");
          }

          await deleteUserCascade(env, userId, ctx);
          log.info("Admin deleted user", { userId });
          return json({ ok: true });
        }

        return notFound();
      } catch (e) {
        log.error("API error", { error: e && e.stack ? e.stack : String(e) });
        return json({ ok: false, error: "Server error" }, 500);
      }
    }

    return notFound();
  },

  // ==================== Email handler ====================
  async email(message, env, ctx) {
    const log = createLogger("email-handler", env);

    try {
      const allowedDomains = getAllowedDomains(env);
      const hasAliasDomain = await aliasesHasDomain(env);
      const hasEmailDomain = await emailsHasDomain(env);
      const fallbackDomain = allowedDomains[0] || env.DOMAIN || "";
      const to = String(message.to || "").toLowerCase();
      const [local, toDomain] = to.split("@");

      if (!local || !toDomain || !allowedDomains.includes(toDomain)) {
        message.setReject("Bad recipient");
        return;
      }

      if (!hasAliasDomain && fallbackDomain && toDomain !== fallbackDomain) {
        message.setReject("Bad recipient");
        return;
      }

      const row = hasAliasDomain
        ? await env.DB.prepare(
          `SELECT a.local_part, a.domain, a.user_id, a.disabled as alias_disabled,
                  u.disabled as user_disabled
           FROM aliases a JOIN users u ON u.id = a.user_id
           WHERE a.local_part = ? AND a.domain = ?`
        ).bind(local, toDomain).first()
        : await env.DB.prepare(
          `SELECT a.local_part, a.user_id, a.disabled as alias_disabled,
                  u.disabled as user_disabled
           FROM aliases a JOIN users u ON u.id = a.user_id
           WHERE a.local_part = ?`
        ).bind(local).first();

      if (!row || row.alias_disabled || row.user_disabled) {
        message.setReject("Unknown recipient");
        return;
      }

      const maxStore = safeInt(env.MAX_STORE_BYTES, 262144);
      if (message.rawSize && message.rawSize > maxStore) {
        message.setReject("Message too large");
        return;
      }

      const ab = await new Response(message.raw).arrayBuffer();
      const parser = new PostalMime();
      const parsed = await parser.parse(ab);

      const id = crypto.randomUUID();
      const t = nowSec();

      const subject = parsed.subject || "";
      const date = parsed.date ? new Date(parsed.date).toISOString() : "";
      const fromAddr = parsed.from && parsed.from.address ? parsed.from.address : message.from || "";
      const toAddr = message.to || "";

      const maxTextChars = safeInt(env.MAX_TEXT_CHARS, 200000);
      const text = (parsed.text || "").slice(0, maxTextChars);
      const htmlPart = (parsed.html || "").slice(0, maxTextChars);

      let raw_key = null;
      if (env.MAIL_R2) {
        raw_key = `emails/${id}.eml`;
        ctx.waitUntil(
          env.MAIL_R2.put(raw_key, ab, { httpMetadata: { contentType: "message/rfc822" } })
        );
      }

      if (hasEmailDomain) {
        const storeDomain = row.domain || toDomain || fallbackDomain;
        await env.DB.prepare(
          `INSERT INTO emails
           (id, local_part, domain, user_id, from_addr, to_addr, subject, date, text, html, raw_key, size, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(id, row.local_part, storeDomain, row.user_id, fromAddr, toAddr, subject, date, text, htmlPart, raw_key, ab.byteLength || message.rawSize || 0, t).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO emails
           (id, local_part, user_id, from_addr, to_addr, subject, date, text, html, raw_key, size, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(id, row.local_part, row.user_id, fromAddr, toAddr, subject, date, text, htmlPart, raw_key, ab.byteLength || message.rawSize || 0, t).run();
      }

      log.info("Email received", { to: toAddr, from: fromAddr, subject: subject.slice(0, 80) });
    } catch (e) {
      log.error("Email handler error", { error: e && e.stack ? e.stack : String(e) });
      message.setReject("Temporary processing error");
    }
  },
};
