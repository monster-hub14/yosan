import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  fetchGmailLabels,
  GmailRevokedError,
  GmailDecryptError,
  GmailRefreshError,
  GmailApiError,
} from "@/lib/gmail";

const LOG = "[gmail-labels-route]";

export async function GET(request: NextRequest) {
  console.log(`${LOG} route=entered method=GET`);

  try {
    const session = await requireAuth(request);
    if (!isSessionPayload(session)) {
      console.log(`${LOG} auth=failed`);
      return session;
    }
    console.log(`${LOG} auth=ok userId=${session.userId}`);

    const labels = await fetchGmailLabels(session.userId);
    console.log(`${LOG} result=ok labels=${labels.length}`);
    return NextResponse.json({ ok: true, labels });
  } catch (err) {
    // GmailRevokedError — connection is missing, marked revoked, or refresh token was revoked
    if (err instanceof GmailRevokedError) {
      console.error(`${LOG} errorCode=gmail_not_connected message="${err.message}"`);
      return NextResponse.json(
        {
          ok: false,
          error: "Gmail is not connected or has been disconnected. Please reconnect.",
          errorCode: "gmail_not_connected",
          reconnect_required: true,
        },
        { status: 401 }
      );
    }

    // GmailDecryptError — decrypt() returned null (corrupt/key mismatch) or empty string
    if (err instanceof GmailDecryptError) {
      // null reason → decryption failed (corrupt ciphertext or key mismatch)
      // empty reason → decrypt succeeded but produced an empty string
      // oauth_config → always a decrypt failure regardless of reason
      let code: string;
      if (err.reason === "null" || err.which === "oauth_config") {
        code = "gmail_token_decrypt_failed";
      } else if (err.which === "access") {
        code = "gmail_access_token_missing";
      } else {
        code = "gmail_refresh_token_missing";
      }
      console.error(
        `${LOG} errorCode=${code} which=${err.which} reason=${err.reason} message="${err.message}"`
      );
      return NextResponse.json(
        {
          ok: false,
          error: "Your Gmail credentials could not be read. Please reconnect your Gmail account.",
          errorCode: code,
          reconnect_required: true,
        },
        { status: 401 }
      );
    }

    // GmailRefreshError — token refresh request failed for a non-revocation reason
    if (err instanceof GmailRefreshError) {
      console.error(
        `${LOG} errorCode=internal_error (refresh_failed) googleError="${err.googleError ?? ""}" message="${err.message}"`
      );
      return NextResponse.json(
        {
          ok: false,
          error: "Gmail access token refresh failed. Please reconnect your Gmail account.",
          errorCode: "internal_error",
          reconnect_required: true,
        },
        { status: 502 }
      );
    }

    // GmailApiError — Google's API returned a non-2xx response
    if (err instanceof GmailApiError) {
      const errorCode =
        err.status === 401
          ? "gmail_api_unauthorized"
          : err.status === 403
          ? "gmail_api_forbidden"
          : "gmail_api_failed";
      const retryable = err.status >= 500;
      console.error(
        `${LOG} errorCode=${errorCode} googleStatus=${err.status} googleMessage="${err.googleMessage}"`,
        err.googleBody ?? ""
      );
      return NextResponse.json(
        {
          ok: false,
          error: `Gmail API error: ${err.googleMessage}`,
          errorCode,
          googleStatus: err.status,
          ...(retryable ? { retryable: true } : {}),
          ...(err.status === 401 ? { reconnect_required: true } : {}),
        },
        { status: err.status === 401 || err.status === 403 ? err.status : 502 }
      );
    }

    // Unknown exception — log full stack server-side, return safe message only
    const stack = err instanceof Error ? err.stack : String(err);
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} errorCode=internal_error message="${msg}" stack:`, stack);
    return NextResponse.json(
      {
        ok: false,
        error: "An internal error occurred",
        errorCode: "internal_error",
      },
      { status: 500 }
    );
  }
}

const VALID_SYNC_INTERVALS = new Set([30, 60, 360, 720, 1440]);

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  let body: {
    labelIds: string[];
    labelNames: Record<string, string>;
    syncCutoffDate?: string | null;
    maxPerSync?: number;
    syncIntervalMinutes?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { labelIds, labelNames, syncCutoffDate, maxPerSync, syncIntervalMinutes } = body;

  if (!Array.isArray(labelIds) || labelIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "At least one label must be selected" },
      { status: 400 }
    );
  }

  const maxPerSyncVal = typeof maxPerSync === "number" && maxPerSync > 0
    ? Math.min(maxPerSync, 500)
    : 50;

  const cutoffDate = syncCutoffDate ? new Date(syncCutoffDate) : null;

  const syncIntervalVal =
    typeof syncIntervalMinutes === "number" && VALID_SYNC_INTERVALS.has(syncIntervalMinutes)
      ? syncIntervalMinutes
      : 60;

  await db.gmailLabelConfig.upsert({
    where: { userId: session.userId },
    create: {
      userId: session.userId,
      selectedLabelIds: JSON.stringify(labelIds),
      selectedLabelNames: JSON.stringify(labelNames ?? {}),
      syncCutoffDate: cutoffDate,
      maxPerSync: maxPerSyncVal,
      syncIntervalMinutes: syncIntervalVal,
    },
    update: {
      selectedLabelIds: JSON.stringify(labelIds),
      selectedLabelNames: JSON.stringify(labelNames ?? {}),
      syncCutoffDate: cutoffDate,
      maxPerSync: maxPerSyncVal,
      syncIntervalMinutes: syncIntervalVal,
    },
  });

  return NextResponse.json({ ok: true });
}
