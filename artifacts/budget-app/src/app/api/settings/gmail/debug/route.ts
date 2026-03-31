import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { buildAuthUrl, GMAIL_SCOPE } from "@/lib/gmail";

function getAppBaseUrl(request: NextRequest): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function getEncryptionKeySource(): "ENCRYPTION_KEY" | "JWT_SECRET" | "dev-fallback" {
  if (process.env.ENCRYPTION_KEY) return "ENCRYPTION_KEY";
  if (process.env.JWT_SECRET) return "JWT_SECRET";
  return "dev-fallback";
}

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!isSessionPayload(session)) return session;

  const cfg = await db.gmailOAuthConfig.findUnique({ where: { id: "singleton" } });

  if (!cfg) {
    return NextResponse.json({
      ok: false,
      error: "No Gmail OAuth config found in DB",
      decryptionOk: false,
      clientIdSuffix: null,
      clientIdLength: null,
      rawClientIdLength: null,
      hasClientSecret: false,
      encryptionKeySource: getEncryptionKeySource(),
      appBaseUrl: getAppBaseUrl(request),
      appBaseUrlSource: "request.host",
      redirectUri: `${getAppBaseUrl(request)}/api/settings/gmail/callback`,
      scope: GMAIL_SCOPE,
      authUrlPreview: null,
      configUpdatedAt: null,
    });
  }

  const encryptionKeySource = getEncryptionKeySource();
  const appBaseUrl = getAppBaseUrl(request);
  const redirectUri = `${appBaseUrl}/api/settings/gmail/callback`;

  const decryptedClientId = cfg.clientId ? decrypt(cfg.clientId) : null;
  const decryptedSecret = cfg.clientSecret ? decrypt(cfg.clientSecret) : null;
  // decryptionOk reflects what auth route actually needs: both credentials must decrypt
  const decryptionOk = decryptedClientId !== null && decryptedSecret !== null;
  const hasClientSecret = decryptedSecret !== null && decryptedSecret.length > 0;

  const clientIdSuffix = decryptedClientId ? `...${decryptedClientId.slice(-8)}` : null;
  const clientIdLength = decryptedClientId ? decryptedClientId.length : null;

  const authUrlPreview = decryptedClientId
    ? buildAuthUrl(decryptedClientId, redirectUri, "debug-preview-state")
    : null;

  return NextResponse.json({
    ok: true,
    decryptionOk,
    clientIdSuffix,
    clientIdLength,
    rawClientIdLength: cfg.clientId?.length ?? null,
    hasClientSecret,
    encryptionKeySource,
    appBaseUrl,
    appBaseUrlSource: "request.host",
    redirectUri,
    scope: GMAIL_SCOPE,
    authUrlPreview,
    configUpdatedAt: cfg.updatedAt,
  });
}
