import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";
import { exchangeCodeForTokens } from "@/lib/gmail";
import { jwtVerify } from "jose";

const FLOW_COOKIE = "gmail_oauth_flow";

function getRedirectUri(request: NextRequest): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/settings/gmail/callback`;
}

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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/gmail?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  // Validate the signed Lax flow cookie (sent even after cross-site redirect from Google)
  const flowCookie = request.cookies.get(FLOW_COOKIE)?.value;
  if (!flowCookie) {
    return NextResponse.redirect(
      new URL("/settings/gmail?error=missing_flow_cookie", request.url)
    );
  }

  const flow = await verifyFlowToken(flowCookie);
  if (!flow) {
    return NextResponse.redirect(
      new URL("/settings/gmail?error=invalid_flow_token", request.url)
    );
  }

  // CSRF: state in query must match state embedded in the signed flow token
  if (!state || flow.state !== state) {
    return NextResponse.redirect(
      new URL("/settings/gmail?error=invalid_state", request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings/gmail?error=no_code", request.url)
    );
  }

  const oauthCfg = await db.gmailOAuthConfig.findUnique({ where: { id: "singleton" } });
  if (!oauthCfg?.clientId || !oauthCfg?.clientSecret) {
    return NextResponse.redirect(
      new URL("/settings/gmail?error=oauth_not_configured", request.url)
    );
  }

  const clientId = decrypt(oauthCfg.clientId) ?? oauthCfg.clientId;
  const clientSecret = decrypt(oauthCfg.clientSecret) ?? oauthCfg.clientSecret;
  const redirectUri = getRedirectUri(request);

  let tokens: { accessToken: string; refreshToken: string; expiresAt: Date; email: string };
  try {
    tokens = await exchangeCodeForTokens(clientId, clientSecret, code, redirectUri);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "token_exchange_failed";
    return NextResponse.redirect(
      new URL(`/settings/gmail?error=${encodeURIComponent(msg)}`, request.url)
    );
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

  const response = NextResponse.redirect(
    new URL("/settings/gmail?connected=1", request.url)
  );
  response.cookies.delete(FLOW_COOKIE);
  return response;
}
