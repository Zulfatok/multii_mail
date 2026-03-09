// src/logger.js — Structured Logging System

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

export function createLogger(module, env) {
    const minLevel = LEVELS[(env && env.LOG_LEVEL || "info").toLowerCase()] ?? 1;

    function log(level, message, data) {
        if (LEVELS[level] < minLevel) return;
        const entry = {
            ts: new Date().toISOString(),
            level,
            module,
            msg: message,
        };
        if (data !== undefined) entry.data = data;
        const line = JSON.stringify(entry);
        if (level === "error") console.error(line);
        else if (level === "warn") console.warn(line);
        else console.log(line);
    }

    return {
        debug: (msg, data) => log("debug", msg, data),
        info: (msg, data) => log("info", msg, data),
        warn: (msg, data) => log("warn", msg, data),
        error: (msg, data) => log("error", msg, data),
    };
}
