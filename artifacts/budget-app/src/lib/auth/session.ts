import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import type { SessionPayload } from "./types";

export type { SessionPayload };

const COOKIE_NAME = "budget_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET is missing or too short. Must be at least 32 characters."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getSessionFromRequest(
  request: NextRequest
): Promise<SessionPayload | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function makeSessionCookie(token: string): string {
  const isProd = process.env.NODE_ENV === "production";
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    "HttpOnly",
    `Max-Age=${COOKIE_MAX_AGE}`,
    "Path=/",
    "SameSite=Strict", // Prevents cross-site cookie inclusion (CSRF mitigation via SameSite strategy)
    isProd ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
  return attrs;
}

export function makeClearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Max-Age=0; Path=/; SameSite=Strict`; // Same SameSite strategy for logout
}
