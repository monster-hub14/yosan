import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isSessionPayload } from "@/lib/auth/permissions";
import { resolveAppBaseUrl } from "@/lib/gmail-base-url";

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!isSessionPayload(session)) return session;

  const isProduction = process.env.NODE_ENV === "production";
  const envRaw = process.env.APP_BASE_URL;
  const isExplicitlySet = envRaw !== undefined && envRaw.trim().length > 0;

  const result = resolveAppBaseUrl(request);

  const detectedUrl = result.ok ? result.baseUrl : null;
  const source = result.source;
  const error = result.ok ? null : result.error;

  const isHttps = detectedUrl ? detectedUrl.startsWith("https://") : false;

  const needsAction =
    !isExplicitlySet ||
    (result.ok && !isHttps && isProduction);

  const severity: "ok" | "warn" | "error" =
    !result.ok
      ? "error"
      : !isHttps && isProduction
      ? "error"
      : !isExplicitlySet
      ? "warn"
      : "ok";

  return NextResponse.json({
    isExplicitlySet,
    isProduction,
    detectedUrl,
    source,
    error,
    isHttps,
    needsAction,
    severity,
  });
}
