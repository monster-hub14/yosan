import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { buildAuthUrl } from "@/lib/gmail";
import { randomBytes } from "crypto";
import { SignJWT } from "jose";

const FLOW_COOKIE = "gmail_oauth_flow";
const FLOW_MAX_AGE = 600; // 10 minutes

function getRedirectUri(request: NextRequest): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/settings/gmail/callback`;
}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? "";
  return new TextEncoder().encode(secret);
}

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const oauthCfg = await db.gmailOAuthConfig.findUnique({ where: { id: "singleton" } });
  if (!oauthCfg?.clientId || !oauthCfg?.clientSecret) {
    return NextResponse.json(
      { ok: false, error: "Gmail OAuth is not configured by admin" },
      { status: 503 }
    );
  }

  const clientId = decrypt(oauthCfg.clientId) ?? oauthCfg.clientId;
  const state = randomBytes(16).toString("hex");

  // Sign a Lax flow token containing userId + state nonce.
  // SameSite=Lax is required so browsers send it after the Google redirect.
  const flowToken = await new SignJWT({ userId: session.userId, state })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getSecret());

  const redirectUri = getRedirectUri(request);
  const authUrl = buildAuthUrl(clientId, redirectUri, state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(FLOW_COOKIE, flowToken, {
    httpOnly: true,
    sameSite: "lax", // Must be Lax — Strict cookies are NOT sent after cross-site redirect
    maxAge: FLOW_MAX_AGE,
    path: "/",
  });

  return response;
}
