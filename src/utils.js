// src/utils.js — Shared utilities

const encoder = new TextEncoder();

// -------------------- Security/Hashing constants --------------------
const PBKDF2_MAX_ITERS = 100000;
const PBKDF2_MIN_ITERS = 10000;

// -------------------- Response helpers --------------------
export function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
            ...headers,
        },
    });
}

export function html(body, status = 200, headers = {}) {
    return new Response(body, {
        status,
        headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
            ...headers,
        },
    });
}

export function badRequest(msg) {
    return json({ ok: false, error: msg }, 400);
}
export function unauthorized(msg = "Unauthorized") {
    return json({ ok: false, error: msg }, 401);
}
export function forbidden(msg = "Forbidden") {
    return json({ ok: false, error: msg }, 403);
}
export function notFound() {
    return json({ ok: false, error: "Not found" }, 404);
}

// -------------------- Utils --------------------
export function safeInt(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

export function nowSec() {
    return Math.floor(Date.now() / 1000);
}

export function clampPbkdf2Iters(n) {
    const x = safeInt(n, PBKDF2_MAX_ITERS);
    return Math.min(PBKDF2_MAX_ITERS, Math.max(PBKDF2_MIN_ITERS, x));
}

export function pbkdf2Iters(env) {
    return clampPbkdf2Iters(env.PBKDF2_ITERS ?? PBKDF2_MAX_ITERS);
}

export function base64Url(bytes) {
    const bin = String.fromCharCode(...bytes);
    const b64 = btoa(bin);
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(b64url) {
    const b64 = String(b64url || "").replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(b64 + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

export async function sha256Base64Url(inputBytes) {
    const digest = await crypto.subtle.digest("SHA-256", inputBytes);
    return base64Url(new Uint8Array(digest));
}

export async function pbkdf2HashBase64Url(password, saltBytes, iterations) {
    const it = safeInt(iterations, 0);
    if (it > PBKDF2_MAX_ITERS) {
        const err = new Error(
            `PBKDF2 iterations too high for Workers (max ${PBKDF2_MAX_ITERS}, got ${it}).`
        );
        err.name = "NotSupportedError";
        throw err;
    }

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: it },
        keyMaterial,
        256
    );

    return base64Url(new Uint8Array(bits));
}

// -------------------- Cookie helpers --------------------
export function getCookie(request, name) {
    const cookie = request.headers.get("cookie") || "";
    const parts = cookie.split(";").map((p) => p.trim());
    for (const p of parts) {
        const [k, ...rest] = p.split("=");
        if (k === name) return rest.join("=");
    }
    return null;
}

export function setCookieHeader(name, value, opts = {}) {
    const { httpOnly = true, secure = true, sameSite = "Lax", path = "/", maxAge } = opts;
    let c = `${name}=${value}; Path=${path}; SameSite=${sameSite}`;
    if (httpOnly) c += "; HttpOnly";
    if (secure) c += "; Secure";
    if (typeof maxAge === "number") c += `; Max-Age=${maxAge}`;
    return c;
}

// -------------------- Validation --------------------
export async function readJson(request) {
    try {
        const ct = request.headers.get("content-type") || "";
        if (!ct.toLowerCase().includes("application/json")) return null;
        return await request.json();
    } catch {
        return null;
    }
}

export function validLocalPart(local) {
    return /^[a-z0-9][a-z0-9._+-]{0,63}$/.test(local);
}

// -------------------- Schema migration helpers --------------------
let USERS_HAS_PASS_ITERS = null;
let ALIASES_HAS_DOMAIN = null;
let EMAILS_HAS_DOMAIN = null;

export async function usersHasPassIters(env) {
    if (USERS_HAS_PASS_ITERS !== null) return USERS_HAS_PASS_ITERS;
    try {
        const res = await env.DB.prepare(`PRAGMA table_info(users)`).all();
        USERS_HAS_PASS_ITERS = (res.results || []).some((r) => r?.name === "pass_iters");
    } catch {
        USERS_HAS_PASS_ITERS = false;
    }
    return USERS_HAS_PASS_ITERS;
}

export async function aliasesHasDomain(env) {
    if (ALIASES_HAS_DOMAIN !== null) return ALIASES_HAS_DOMAIN;
    try {
        const res = await env.DB.prepare(`PRAGMA table_info(aliases)`).all();
        ALIASES_HAS_DOMAIN = (res.results || []).some((r) => r?.name === "domain");
    } catch {
        ALIASES_HAS_DOMAIN = false;
    }
    return ALIASES_HAS_DOMAIN;
}

export async function emailsHasDomain(env) {
    if (EMAILS_HAS_DOMAIN !== null) return EMAILS_HAS_DOMAIN;
    try {
        const res = await env.DB.prepare(`PRAGMA table_info(emails)`).all();
        EMAILS_HAS_DOMAIN = (res.results || []).some((r) => r?.name === "domain");
    } catch {
        EMAILS_HAS_DOMAIN = false;
    }
    return EMAILS_HAS_DOMAIN;
}

export function getAllowedDomains(env) {
    const domainsStr = env.ALLOWED_DOMAINS || env.DOMAIN || "";
    return domainsStr
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter((d) => d.length > 0);
}

// -------------------- HTML escape --------------------
export function esc(s) {
    return (s || "").replace(/[&<>"']/g, (m) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
    );
}
