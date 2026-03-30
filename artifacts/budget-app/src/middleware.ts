import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth/session";

const SESSION_COOKIE = "budget_session";

const STATIC_PREFIXES = ["/_next", "/favicon.ico"];

function isStatic(pathname: string): boolean {
  return STATIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/setup" ||
    pathname.startsWith("/setup/") ||
    pathname === "/api/auth" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/setup" ||
    pathname.startsWith("/api/setup/")
  );
}

/**
 * Middleware routing contract (session-authoritative):
 *
 *   Public paths (always allowed):
 *     /login      — DB-authoritative login page checks setup completion and
 *                   redirects to /setup if the instance is not yet configured.
 *     /setup/*    — Setup wizard pages.
 *     /api/auth/* — Login / logout / me endpoints (public by design).
 *     /api/setup/*— Setup wizard API routes (guarded per-route by guardSetupRoute()).
 *
 *   Protected paths (require a valid session JWT):
 *     Everything else → 401 for API routes, redirect to /login for pages.
 *
 * Setup-state detection is intentionally delegated to the page layer
 * (login page + setup page each query SetupProgress.completedAt) so that
 * setup status is always DB-authoritative and cannot drift from cookie state.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStatic(pathname)) return NextResponse.next();

  if (isPublicPath(pathname)) return NextResponse.next();

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const session = sessionToken ? await verifySessionToken(sessionToken) : null;

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
