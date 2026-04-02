import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth/session";
import { verifySetupToken } from "@/lib/auth/setup-token";

const SESSION_COOKIE = "budget_session";
const SETUP_COOKIE = "budget_setup";

const STATIC_PREFIXES = ["/_next", "/favicon.ico"];

function isStatic(pathname: string): boolean {
  return STATIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function isSetupPagePath(pathname: string): boolean {
  return pathname === "/setup" || pathname.startsWith("/setup/");
}

function isSetupApiPath(pathname: string): boolean {
  return pathname === "/api/setup" || pathname.startsWith("/api/setup/");
}

function isAuthApiPath(pathname: string): boolean {
  return pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}

/**
 * Build a proxy-aware redirect URL.
 *
 * Uses the same priority order as gmail-base-url.ts:
 *  1. x-forwarded-proto + x-forwarded-host — set by reverse proxies (Nginx Proxy Manager, Caddy …)
 *  2. APP_BASE_URL env var                 — authoritative deployment override
 *  3. request.url                          — direct access fallback
 *
 * Without this, redirects built from `request.url` would use the internal HTTP
 * scheme/host when behind a proxy, sending the browser to http:// instead of https://.
 */
function proxyAwareUrl(path: string, request: NextRequest): URL {
  const fwdProto = request.headers.get("x-forwarded-proto");
  const fwdHost = request.headers.get("x-forwarded-host");
  if (fwdProto && fwdHost) {
    const scheme = fwdProto.split(",")[0].trim();
    const host = fwdHost.split(",")[0].trim();
    if (scheme && host) return new URL(path, `${scheme}://${host}`);
  }

  const appBaseUrl = process.env.APP_BASE_URL;
  if (appBaseUrl) {
    try {
      return new URL(path, appBaseUrl);
    } catch {
      // invalid APP_BASE_URL — fall through
    }
  }

  return new URL(path, request.url);
}

/**
 * Middleware routing contract:
 *
 * Setup-state is detected via a server-signed JWT in the `budget_setup` cookie.
 * The cookie is issued at setup completion and re-issued on every login (so that
 * clearing cookies and re-logging-in restores proper routing). The signature is
 * verified with JWT_SECRET, so it cannot be forged or tampered with.
 *
 * Routing decisions:
 *
 *   STATIC / AUTH-API paths → always pass through
 *
 *   Setup NOT complete (cookie absent or invalid signature):
 *     /login         → pass through (DB-authoritative page redirects to /setup
 *                       if setup is truly not done, preventing redirect loops)
 *     /setup/*       → pass through (wizard pages)
 *     /api/setup/*   → pass through (wizard API routes, guarded per-route)
 *     /api/*         → 503 Setup not complete
 *     everything else → redirect to /setup
 *
 *   Setup complete (valid signed cookie):
 *     /login or /setup/* + session       → redirect to /dashboard
 *     /login or /setup/* + no session   → pass through
 *     /api/setup/* (post-setup)         → requires session (401 if absent),
 *                                         then per-route guardSetupRoute() returns 401
 *     /api/* + no session               → 401 Unauthorized
 *     everything else + no session      → redirect to /login?from=<path>
 *     everything else + session         → pass through
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStatic(pathname)) return NextResponse.next();
  if (isAuthApiPath(pathname)) return NextResponse.next();

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const session = sessionToken ? await verifySessionToken(sessionToken) : null;

  const setupToken = request.cookies.get(SETUP_COOKIE)?.value;
  const setupDone = setupToken ? await verifySetupToken(setupToken) : false;

  if (!setupDone) {
    // Allow setup pages and setup API routes (per-route guards handle auth)
    if (isSetupPagePath(pathname)) return NextResponse.next();
    if (isSetupApiPath(pathname)) return NextResponse.next();
    // Always allow /login — its DB-authoritative check redirects to /setup if
    // setup is truly not done, preventing /login → /setup → /login loops.
    if (pathname === "/login") return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Setup not complete" }, { status: 503 });
    }
    return NextResponse.redirect(proxyAwareUrl("/setup", request));
  }

  // Setup is complete from here on.
  // /api/setup/* is NO longer exempted — it falls through to the session check.
  // Per-route guardSetupRoute() will return 401 for post-setup calls.

  if (isSetupPagePath(pathname) || pathname === "/login") {
    if (session) return NextResponse.redirect(proxyAwareUrl("/dashboard", request));
    return NextResponse.next();
  }

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = proxyAwareUrl("/login", request);
    if (pathname !== "/") loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
