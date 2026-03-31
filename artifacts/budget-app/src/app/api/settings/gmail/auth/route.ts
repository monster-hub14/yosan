import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { buildAuthUrl, GMAIL_SCOPE } from "@/lib/gmail";
import { resolveAppBaseUrl } from "@/lib/gmail-base-url";
import { randomBytes } from "crypto";
import { SignJWT } from "jose";

const FLOW_COOKIE = "gmail_oauth_flow";
const FLOW_MAX_AGE = 600; // 10 minutes

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

  // ── Resolve base URL (proxy-aware) ────────────────────────────────────────
  const baseUrlResult = resolveAppBaseUrl(request);
  if (!baseUrlResult.ok) {
    console.error(`[gmail-auth] base URL error: ${baseUrlResult.error}`);
    return NextResponse.json(
      {
        ok: false,
        error: baseUrlResult.error,
        errorCode: "gmail_invalid_base_url",
      },
      { status: 500 }
    );
  }
  const { baseUrl, source: baseUrlSource } = baseUrlResult;
  const redirectUri = `${baseUrl}/api/settings/gmail/callback`;
  console.log(`[gmail-auth] baseUrl: ${baseUrl} (source: ${baseUrlSource})`);
  console.log(`[gmail-auth] redirectUri: ${redirectUri}`);

  // ── HTTPS enforcement in production ───────────────────────────────────────
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && !redirectUri.startsWith("https://")) {
    console.error(
      `[gmail-auth] Blocking OAuth: redirect URI is not HTTPS in production. ` +
        `Set APP_BASE_URL to your public HTTPS URL (e.g. https://yourdomain.com).`
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          "Gmail OAuth requires HTTPS in production. " +
          "Set APP_BASE_URL to your public HTTPS URL (e.g. https://yourdomain.com) " +
          "and restart the app.",
        errorCode: "gmail_http_not_allowed_in_production",
        detectedUrl: baseUrl,
        source: baseUrlSource,
      },
      { status: 400 }
    );
  }

  // ── Credential validation ─────────────────────────────────────────────────
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
        error: "Gmail OAuth credentials could not be decrypted",
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
        error: "Gmail OAuth credentials could not be decrypted",
        errorCode: "gmail_oauth_decrypt_failed",
      },
      { status: 500 }
    );
  }

  console.log(`[gmail-auth] decryption: ok`);
  console.log(`[gmail-auth] clientId suffix: ...${clientId.slice(-8)} (length: ${clientId.length})`);
  console.log(`[gmail-auth] scope: ${GMAIL_SCOPE}`);

  // ── Build state and sign flow cookie ────────────────────────────────────
  const state = randomBytes(16).toString("hex");
  const flowToken = await new SignJWT({ userId: session.userId, state })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getSecret());

  const authUrl = buildAuthUrl(clientId, redirectUri, state);

  // Log auth URL with client_id and state redacted
  try {
    const redacted = new URL(authUrl);
    redacted.searchParams.set("client_id", "<redacted>");
    redacted.searchParams.set("state", "<redacted>");
    console.log(`[gmail-auth] authUrl (redacted): ${redacted.toString()}`);
  } catch {
    console.log("[gmail-auth] authUrl: <could not redact>");
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(FLOW_COOKIE, flowToken, {
    httpOnly: true,
    sameSite: "lax", // Must be Lax — Strict cookies are NOT sent after cross-site redirect
    maxAge: FLOW_MAX_AGE,
    path: "/",
  });

  return response;
}
