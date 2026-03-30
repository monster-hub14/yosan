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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStatic(pathname)) return NextResponse.next();

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const session = sessionToken ? await verifySessionToken(sessionToken) : null;

  // All /api/auth/* routes are always accessible
  if (isAuthApiPath(pathname)) return NextResponse.next();

  // Determine setup state from cookie OR from a valid session.
  // A valid budget_session JWT can only exist after setup account creation,
  // so its presence is authoritative proof that setup has been done.
  const cookieSetupDone = request.cookies.get(SETUP_COOKIE)?.value === "done";
  const setupDone = cookieSetupDone || session !== null;

  // /setup paths
  if (isSetupPath(pathname)) {
    if (setupDone) {
      // Post-setup: setup routes require admin auth
      if (!session || session.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/login", request.url));
      }
    }
    return NextResponse.next();
  }

  // /login is always accessible; redirect already-authenticated users away
  if (pathname === "/login") {
    if (session && setupDone) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // All other routes require setup to be done first
  if (!setupDone) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Setup not complete" }, { status: 503 });
    }
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  // Setup done but not authenticated
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
