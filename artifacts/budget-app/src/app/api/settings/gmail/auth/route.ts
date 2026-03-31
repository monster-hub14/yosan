import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { buildAuthUrl } from "@/lib/gmail";
import { randomBytes } from "crypto";

function getRedirectUri(request: NextRequest): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/settings/gmail/callback`;
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

  const redirectUri = getRedirectUri(request);
  const authUrl = buildAuthUrl(clientId, redirectUri, state);

  const response = NextResponse.redirect(authUrl);
  // State cookie — used solely for CSRF check in callback.
  // The callback binds tokens to the authenticated server session (not this cookie).
  response.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
