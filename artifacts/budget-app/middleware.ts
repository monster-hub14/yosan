import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth/session";

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

  // Auth API routes are always public
  if (isAuthApiPath(pathname)) return NextResponse.next();

  // /setup/* paths — page and route handlers do their own DB-authoritative guard
  // (SetupPage redirects to /login if completedAt is set; guardSetupRoute() does
  //  the same for API mutations). No session check needed here.
  if (isSetupPath(pathname)) return NextResponse.next();

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const session = sessionToken ? await verifySessionToken(sessionToken) : null;

  // /login — redirect already-authenticated users to the dashboard
  if (pathname === "/login") {
    if (session) return NextResponse.redirect(new URL("/dashboard", request.url));
    return NextResponse.next();
  }

  // All other routes require an authenticated session.
  // Unauthenticated users are sent to /login, which performs a DB-authoritative
  // setup check and redirects to /setup if the instance has not been configured.
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
