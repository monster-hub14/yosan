import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";
import { exchangeCodeForTokens } from "@/lib/gmail";

function getRedirectUri(request: NextRequest): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/settings/gmail/callback`;
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

  // Require an authenticated session — do not rely on user cookie
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const savedState = request.cookies.get("gmail_oauth_state")?.value;

  if (!savedState || !state || savedState !== state) {
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

  // Bind tokens to the authenticated session user — not a client-supplied cookie
  await db.gmailConnection.upsert({
    where: { userId: session.userId },
    create: {
      userId: session.userId,
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
  response.cookies.delete("gmail_oauth_state");
  return response;
}
