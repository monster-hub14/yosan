import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";
import { exchangeCodeForTokens } from "@/lib/gmail";
import { resolveAppBaseUrl } from "@/lib/gmail-base-url";
import { jwtVerify } from "jose";

const FLOW_COOKIE = "gmail_oauth_flow";
const RELAY_PATH = "/settings/gmail/oauth-complete";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? "";
  return new TextEncoder().encode(secret);
}

interface GmailFlowPayload {
  userId: string;
  state: string;
}

async function verifyFlowToken(token: string): Promise<GmailFlowPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.userId !== "string" || typeof payload.state !== "string") return null;
    return { userId: payload.userId as string, state: payload.state as string };
  } catch {
    return null;
  }
}

/** Redirect to the OAuth relay page (works in both popup and same-tab contexts). */
function relayRedirect(request: NextRequest, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  // Next.js sees request.url as the internal loopback URL (http://localhost:PORT/...)
  // even when the browser navigated to the public domain. Use resolveAppBaseUrl()
  // which reads x-forwarded-proto + x-forwarded-host (set by the Replit proxy) to
  // build the correct public base URL.
  //
  // When resolveAppBaseUrl() returns ok:false (APP_BASE_URL is set but invalid),
  // fall back to the proxy headers directly — not request.url, which could be the
  // loopback address. Only use request.url as a last resort if no headers are set.
  const baseUrlResult = resolveAppBaseUrl(request);
  let base: string;
  if (baseUrlResult.ok) {
    base = baseUrlResult.baseUrl;
  } else {
    const fwdProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
    const fwdHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
    if (fwdProto && fwdHost) {
      base = `${fwdProto}://${fwdHost}`;
    } else {
      const u = new URL(request.url);
      base = `${u.protocol}//${u.host}`;
    }
  }
  return NextResponse.redirect(new URL(`${RELAY_PATH}?${qs}`, base));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return relayRedirect(request, { error });
  }

  // Validate the signed Lax flow cookie (sent even after cross-site redirect from Google)
  const flowCookie = request.cookies.get(FLOW_COOKIE)?.value;
  if (!flowCookie) {
    return relayRedirect(request, { error: "missing_flow_cookie" });
  }

  const flow = await verifyFlowToken(flowCookie);
  if (!flow) {
    return relayRedirect(request, { error: "invalid_flow_token" });
  }

  // CSRF: state in query must match state embedded in the signed flow token
  if (!state || flow.state !== state) {
    return relayRedirect(request, { error: "invalid_state" });
  }

  if (!code) {
    return relayRedirect(request, { error: "no_code" });
  }

  const oauthCfg = await db.gmailOAuthConfig.findUnique({ where: { id: "singleton" } });
  if (!oauthCfg?.clientId || !oauthCfg?.clientSecret) {
    return relayRedirect(request, { error: "oauth_not_configured" });
  }

  const clientId = decrypt(oauthCfg.clientId);
  const clientSecret = decrypt(oauthCfg.clientSecret);
  if (!clientId || !clientSecret) {
    console.error("[gmail-callback] credential decryption failed");
    return relayRedirect(request, { error: "oauth_decrypt_failed" });
  }

  // The redirect_uri sent to Google during token exchange MUST exactly match
  // the one used in the auth request. Use the same proxy-aware resolver.
  const baseUrlResult = resolveAppBaseUrl(request);
  if (!baseUrlResult.ok) {
    console.error(`[gmail-callback] base URL error: ${baseUrlResult.error}`);
    return relayRedirect(request, { error: "invalid_base_url" });
  }
  const redirectUri = `${baseUrlResult.baseUrl}/api/settings/gmail/callback`;

  let tokens: { accessToken: string; refreshToken: string; expiresAt: Date; email: string };
  try {
    tokens = await exchangeCodeForTokens(clientId, clientSecret, code, redirectUri);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "token_exchange_failed";
    return relayRedirect(request, { error: msg });
  }

  // Bind tokens to the userId from the signed flow token (tamper-evident, server-signed)
  await db.gmailConnection.upsert({
    where: { userId: flow.userId },
    create: {
      userId: flow.userId,
      accessToken: encrypt(tokens.accessToken),
      refreshToken: encrypt(tokens.refreshToken),
      tokenEmail: tokens.email,
      expiresAt: tokens.expiresAt,
      isRevoked: false,
    },
    update: {
      accessToken: encrypt(tokens.accessToken),
      refreshToken: encrypt(tokens.refreshToken),
      tokenEmail: tokens.email,
      expiresAt: tokens.expiresAt,
      isRevoked: false,
      connectedAt: new Date(),
    },
  });

  const response = relayRedirect(request, { status: "connected" });
  response.cookies.delete(FLOW_COOKIE);
  return response;
}
