import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { buildAuthUrl, GMAIL_SCOPE } from "@/lib/gmail";
import { randomBytes } from "crypto";
import { SignJWT } from "jose";

const FLOW_COOKIE = "gmail_oauth_flow";
const FLOW_MAX_AGE = 600; // 10 minutes

function getAppBaseUrl(request: NextRequest): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function getRedirectUri(request: NextRequest): string {
  return `${getAppBaseUrl(request)}/api/settings/gmail/callback`;
}

function getEncryptionKeySource(): "ENCRYPTION_KEY" | "JWT_SECRET" | "dev-fallback" {
  if (process.env.ENCRYPTION_KEY) return "ENCRYPTION_KEY";
  if (process.env.JWT_SECRET) return "JWT_SECRET";
  return "dev-fallback";
}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? "";
  return new TextEncoder().encode(secret);
}

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const keySource = getEncryptionKeySource();
  console.log(`[gmail-auth] encryptionKeySource: ${keySource}`);

  const oauthCfg = await db.gmailOAuthConfig.findUnique({ where: { id: "singleton" } });
  if (!oauthCfg?.clientId || !oauthCfg?.clientSecret) {
    return NextResponse.json(
      { ok: false, error: "Gmail OAuth is not configured by admin" },
      { status: 503 }
    );
  }

  const clientId = decrypt(oauthCfg.clientId);
  if (!clientId) {
    console.error("[gmail-auth] decryption: FAILED for clientId — wrong encryption key?");
    return NextResponse.json(
      {
        ok: false,
        error: "Gmail OAuth credentials could not be decrypted. Re-enter your credentials in Gmail OAuth settings.",
        errorCode: "gmail_oauth_decrypt_failed",
      },
      { status: 500 }
    );
  }

  const clientSecret = decrypt(oauthCfg.clientSecret);
  if (!clientSecret) {
    console.error("[gmail-auth] decryption: FAILED for clientSecret — wrong encryption key?");
    return NextResponse.json(
      {
        ok: false,
        error: "Gmail OAuth credentials could not be decrypted. Re-enter your credentials in Gmail OAuth settings.",
        errorCode: "gmail_oauth_decrypt_failed",
      },
      { status: 500 }
    );
  }

  console.log(`[gmail-auth] decryption: ok`);
  console.log(`[gmail-auth] clientId suffix: ...${clientId.slice(-8)} (length: ${clientId.length})`);

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

  console.log(`[gmail-auth] redirectUri: ${redirectUri}`);
  console.log(`[gmail-auth] scope: ${GMAIL_SCOPE}`);
  console.log(`[gmail-auth] authUrl: ${authUrl}`);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(FLOW_COOKIE, flowToken, {
    httpOnly: true,
    sameSite: "lax", // Must be Lax — Strict cookies are NOT sent after cross-site redirect
    maxAge: FLOW_MAX_AGE,
    path: "/",
  });

  return response;
}
