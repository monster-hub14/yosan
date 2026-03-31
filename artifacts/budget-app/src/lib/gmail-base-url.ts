/**
 * Proxy-aware base URL resolver for Gmail OAuth routes.
 *
 * Priority order:
 *  1. APP_BASE_URL env var — authoritative override (must be a valid absolute
 *     URL with no path beyond the root).
 *  2. x-forwarded-proto + x-forwarded-host request headers — set by reverse
 *     proxies (Replit, nginx, Caddy, Traefik …).
 *  3. request.url — last resort; may be the internal loopback address.
 *
 * The result is always `scheme://host` — no trailing slash, no path.
 */

import { type NextRequest } from "next/server";

export type BaseUrlResult =
  | { ok: true; baseUrl: string; source: string }
  | { ok: false; error: string; source: string };

/**
 * Resolve the public-facing app base URL from the incoming request.
 * Returns a discriminated union so callers can fail fast on errors.
 */
export function resolveAppBaseUrl(request: NextRequest): BaseUrlResult {
  // ── Priority 1: APP_BASE_URL env var ────────────────────────────────────
  const envRaw = process.env.APP_BASE_URL;
  if (envRaw !== undefined) {
    const result = normalizeAppBaseUrl(envRaw);
    if (!result.ok) {
      return {
        ok: false,
        error: `APP_BASE_URL is set but invalid — ${result.error}`,
        source: "APP_BASE_URL env",
      };
    }
    return { ok: true, baseUrl: result.value, source: "APP_BASE_URL env" };
  }

  // ── Priority 2: Proxy headers ────────────────────────────────────────────
  // x-forwarded-proto and x-forwarded-host may be comma-separated lists
  // (first entry is the original client-side value).
  const fwdProto = request.headers.get("x-forwarded-proto");
  const fwdHost = request.headers.get("x-forwarded-host");
  if (fwdProto && fwdHost) {
    const scheme = fwdProto.split(",")[0].trim();
    const host = fwdHost.split(",")[0].trim();
    if (scheme && host) {
      return {
        ok: true,
        baseUrl: `${scheme}://${host}`,
        source: "x-forwarded-proto + x-forwarded-host",
      };
    }
  }

  // ── Priority 3: request.url (fallback) ──────────────────────────────────
  const url = new URL(request.url);
  return {
    ok: true,
    baseUrl: `${url.protocol}//${url.host}`,
    source: "request.url (fallback)",
  };
}

/**
 * Normalize a raw APP_BASE_URL value.
 * - Trims whitespace
 * - Strips trailing slashes
 * - Requires an absolute URL (http or https)
 * - Rejects values with a non-root pathname
 *
 * Returns `{ ok: true, value }` or `{ ok: false, error }`.
 */
function normalizeAppBaseUrl(
  raw: string
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return { ok: false, error: "value is empty" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: `not a valid URL: "${trimmed}"` };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      error: `scheme must be http or https, got "${parsed.protocol}"`,
    };
  }

  // pathname will be "/" for a bare origin — any other non-empty path is invalid
  if (parsed.pathname && parsed.pathname !== "/") {
    return {
      ok: false,
      error: `must not include a path — got "${parsed.pathname}". Set APP_BASE_URL to just the origin, e.g. https://yourdomain.com`,
    };
  }

  return { ok: true, value: parsed.origin };
}
