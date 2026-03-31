import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { buildAuthUrl, GMAIL_SCOPE } from "@/lib/gmail";
import { resolveAppBaseUrl } from "@/lib/gmail-base-url";

function getEncryptionKeySource(): "ENCRYPTION_KEY" | "JWT_SECRET" | "dev-fallback" {
  if (process.env.ENCRYPTION_KEY) return "ENCRYPTION_KEY";
  if (process.env.JWT_SECRET) return "JWT_SECRET";
  return "dev-fallback";
}

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!isSessionPayload(session)) return session;

  const encryptionKeySource = getEncryptionKeySource();

  // Resolve base URL using the shared proxy-aware helper
  const baseUrlResult = resolveAppBaseUrl(request);
  const appBaseUrl = baseUrlResult.ok ? baseUrlResult.baseUrl : null;
  const appBaseUrlSource = baseUrlResult.source;
  const baseUrlError = baseUrlResult.ok ? null : baseUrlResult.error;
  const redirectUri = appBaseUrl ? `${appBaseUrl}/api/settings/gmail/callback` : null;

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
      encryptionKeySource,
      appBaseUrl,
      appBaseUrlSource,
      authorizedJavascriptOrigin: appBaseUrl,
      baseUrlError,
      redirectUri,
      scope: GMAIL_SCOPE,
      authUrlPreview: null,
      configUpdatedAt: null,
    });
  }

  const decryptedClientId = cfg.clientId ? decrypt(cfg.clientId) : null;
  const decryptedSecret = cfg.clientSecret ? decrypt(cfg.clientSecret) : null;
  // decryptionOk reflects what auth route actually needs: both credentials must decrypt
  const decryptionOk = decryptedClientId !== null && decryptedSecret !== null;
  const hasClientSecret = decryptedSecret !== null && decryptedSecret.length > 0;

  const clientIdSuffix = decryptedClientId ? `...${decryptedClientId.slice(-8)}` : null;
  const clientIdLength = decryptedClientId ? decryptedClientId.length : null;

  const authUrlPreview =
    decryptedClientId && redirectUri
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
    appBaseUrlSource,
    authorizedJavascriptOrigin: appBaseUrl,
    baseUrlError,
    redirectUri,
    scope: GMAIL_SCOPE,
    authUrlPreview,
    configUpdatedAt: cfg.updatedAt,
  });
}
