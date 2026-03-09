// src/auth.js — Auth/session helpers

import {
    safeInt, nowSec, base64Url, base64UrlToBytes, sha256Base64Url,
    pbkdf2HashBase64Url, pbkdf2Iters, getCookie,
} from "./utils.js";
import { createLogger } from "./logger.js";

// -------------------- Session helpers --------------------
export async function getUserBySession(request, env) {
    const log = createLogger("auth", env);
    const raw = getCookie(request, "session");
    if (!raw) return null;

    const tokenHash = await sha256Base64Url(new TextEncoder().encode(raw));
    const row = await env.DB.prepare(
        `SELECT s.user_id, s.expires_at,
            u.id, u.username, u.email, u.role, u.alias_limit, u.disabled
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`
    )
        .bind(tokenHash)
        .first();

    if (!row) return null;
    if (row.expires_at <= nowSec()) return null;
    if (row.disabled) return null;

    return {
        id: row.user_id,
        username: row.username,
        email: row.email,
        role: row.role,
        alias_limit: row.alias_limit,
    };
}

export async function createSession(env, userId, ttlSeconds) {
    const log = createLogger("auth", env);
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = base64Url(tokenBytes);
    const tokenHash = await sha256Base64Url(new TextEncoder().encode(token));
    const t = nowSec();

    await env.DB.prepare(
        `INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`
    )
        .bind(tokenHash, userId, t + ttlSeconds, t)
        .run();

    log.info("Session created", { userId });
    return token;
}

export async function destroySession(request, env) {
    const log = createLogger("auth", env);
    const raw = getCookie(request, "session");
    if (!raw) return;

    const tokenHash = await sha256Base64Url(new TextEncoder().encode(raw));
    await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`)
        .bind(tokenHash)
        .run();

    log.info("Session destroyed");
}

export async function cleanupExpired(env) {
    const t = nowSec();
    try {
        await env.DB.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).bind(t).run();
        await env.DB.prepare(`DELETE FROM reset_tokens WHERE expires_at <= ?`).bind(t).run();
    } catch {
        // non-critical
    }
}

// -------------------- Delete user cascade --------------------
export async function deleteUserCascade(env, userId, ctx) {
    const log = createLogger("auth", env);

    // Collect R2 keys for deletion
    const emailRows = await env.DB.prepare(
        `SELECT raw_key FROM emails WHERE user_id = ? AND raw_key IS NOT NULL`
    )
        .bind(userId)
        .all();

    const rawKeys = (emailRows.results || [])
        .map((r) => r.raw_key)
        .filter((k) => k);

    // Delete DB records (cascade handles aliases/emails if FK set)
    await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(userId).run();
    await env.DB.prepare(`DELETE FROM reset_tokens WHERE user_id = ?`).bind(userId).run();
    await env.DB.prepare(`DELETE FROM emails WHERE user_id = ?`).bind(userId).run();
    await env.DB.prepare(`DELETE FROM aliases WHERE user_id = ?`).bind(userId).run();
    await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();

    // R2 cleanup (non-blocking)
    if (rawKeys.length > 0 && env.MAIL_R2) {
        ctx.waitUntil(
            Promise.allSettled(rawKeys.map((k) => env.MAIL_R2.delete(k)))
        );
    }

    log.info("User deleted cascade", { userId, r2Keys: rawKeys.length });
}

// -------------------- Reset email (Resend) --------------------
export async function sendResetEmail(env, toEmail, token) {
    const log = createLogger("auth", env);

    if (!env.RESEND_API_KEY) {
        log.warn("RESEND_API_KEY not set, skipping reset email");
        return;
    }

    const base = env.APP_BASE_URL || "";
    const link = base ? `${base}/reset#token=${encodeURIComponent(token)}` : "";

    const subject = "Reset password";
    const bodyHtml = `
    <div style="font-family:Arial,sans-serif">
      <h3 style="margin:0 0 10px">Reset Password</h3>
      <p>Gunakan token berikut untuk reset password:</p>
      <p style="font-size:16px"><b>${token}</b></p>
      ${link ? `<p>Atau klik link: <a href="${link}">${link}</a></p>` : ""}
      <p style="color:#64748b">Jika bukan kamu, abaikan email ini.</p>
    </div>
  `;

    const from = env.RESET_FROM || `Org_Lemah <no-reply@${env.DOMAIN}>`;

    log.info("Sending reset email", { toEmail, from });

    const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from,
            to: [toEmail],
            subject,
            html: bodyHtml,
        }),
    });

    if (!r.ok) {
        const txt = await r.text().catch(() => "");
        log.error("Reset email failed", { status: r.status, body: txt.slice(0, 800) });
        return;
    }

    log.info("Reset email sent", { toEmail });
}
