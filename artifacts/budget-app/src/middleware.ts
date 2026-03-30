import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth/session";

const SETUP_COOKIE = "budget_setup";
const SESSION_COOKIE = "budget_session";

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
 * Setup-completion signal:
 *   - `budget_setup=done` cookie is written by the server at setup completion.
 *   - While the setup wizard is in progress the user may have a valid session
 *     (budget_session) acquired during step 1 (account creation) but no
 *     budget_setup cookie.
 *
 * Routing contract:
 *   - No session + no setup cookie → unauthenticated on unconfigured instance
 *       → allow /setup, redirect everything else to /setup
 *   - Session present + no setup cookie → authenticated but mid-setup
 *       → allow /setup, redirect everything else to /setup to finish wizard
 *   - No session + setup cookie ("done") → configured instance, not logged in
 *       → allow /login and /setup, redirect everything else to /login
 *   - Session present + setup cookie ("done") → fully authenticated
 *       → allow all, redirect /login to /dashboard
 *
 * The /setup page and /login page each perform their own DB-authoritative
 * cross-checks (SetupProgress.completedAt) to handle browser state edge cases
 * such as cleared/expired cookies.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStatic(pathname)) return NextResponse.next();

  // Auth API routes are always public
  if (isAuthApiPath(pathname)) return NextResponse.next();

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const session = sessionToken ? await verifySessionToken(sessionToken) : null;

  const setupDone = request.cookies.get(SETUP_COOKIE)?.value === "done";

  // --- Setup not yet complete -----------------------------------------------
  // Covers: brand-new instance (no cookie, no session) and mid-setup
  // (session from step-1 account creation, but wizard not finished).
  // NOTE: /login is always allowed so the DB-authoritative login page can handle
  // edge cases (e.g. cookies cleared after setup completed — without this the
  // middleware would redirect /login → /setup → /login in a redirect loop).
  if (!setupDone) {
    // Always allow setup paths and login through
    if (isSetupPath(pathname)) return NextResponse.next();
    if (pathname === "/login") return NextResponse.next();

    // Redirect everything else (including authenticated users) to /setup
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Setup not complete" }, { status: 503 });
    }
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  // --- Setup complete -------------------------------------------------------
  // Allow /setup/* (the page itself checks DB and redirects to /login)
  if (isSetupPath(pathname)) return NextResponse.next();

  // /login — redirect already-authenticated users away
  if (pathname === "/login") {
    if (session) return NextResponse.redirect(new URL("/dashboard", request.url));
    return NextResponse.next();
  }

  // All other routes require an authenticated session
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
