import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth/session";
import { verifySetupToken } from "@/lib/auth/setup-token";

const SESSION_COOKIE = "budget_session";
const SETUP_COOKIE = "budget_setup";

const STATIC_PREFIXES = ["/_next", "/favicon.ico"];

function isStatic(pathname: string): boolean {
  return STATIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function isSetupPath(pathname: string): boolean {
  return (
    pathname === "/setup" ||
    pathname.startsWith("/setup/") ||
    pathname === "/api/setup" ||
    pathname.startsWith("/api/setup/")
  );
}

function isAuthApiPath(pathname: string): boolean {
  return pathname === "/api/auth" || pathname.startsWith("/api/auth/");
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
 *   STATIC / AUTH-API / SETUP-API paths → always pass through
 *
 *   Setup NOT complete (cookie absent or signature invalid):
 *     /login         → pass through (DB-authoritative page redirects to /setup
 *                       if setup is not done, preventing redirect loops)
 *     /setup/*       → pass through (wizard itself)
 *     /api/*         → 503 Setup not complete
 *     everything else → redirect to /setup
 *
 *   Setup complete (valid signed cookie):
 *     /login or /setup + session present → redirect to /dashboard
 *     /login or /setup + no session     → pass through
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
    if (isSetupPath(pathname)) return NextResponse.next();
    // Always allow /login — its DB-authoritative check redirects to /setup if
    // setup is truly not done, preventing /login → /setup → /login loops.
    if (pathname === "/login") return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Setup not complete" }, { status: 503 });
    }
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  // Setup is complete from here on.

  if (isSetupPath(pathname) || pathname === "/login") {
    if (session) return NextResponse.redirect(new URL("/dashboard", request.url));
    return NextResponse.next();
  }

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
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
