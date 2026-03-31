import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { fetchGmailLabels, GmailRevokedError } from "@/lib/gmail";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  try {
    const labels = await fetchGmailLabels(session.userId);
    return NextResponse.json({ ok: true, labels });
  } catch (err) {
    if (err instanceof GmailRevokedError) {
      return NextResponse.json(
        { ok: false, error: "Gmail token revoked. Please reconnect.", reconnect_required: true },
        { status: 401 }
      );
    }
    const msg = err instanceof Error ? err.message : "Failed to fetch labels";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  let body: {
    labelIds: string[];
    labelNames: Record<string, string>;
    syncCutoffDate?: string | null;
    maxPerSync?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { labelIds, labelNames, syncCutoffDate, maxPerSync } = body;

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

  await db.gmailLabelConfig.upsert({
    where: { userId: session.userId },
    create: {
      userId: session.userId,
      selectedLabelIds: JSON.stringify(labelIds),
      selectedLabelNames: JSON.stringify(labelNames ?? {}),
      syncCutoffDate: cutoffDate,
      maxPerSync: maxPerSyncVal,
    },
    update: {
      selectedLabelIds: JSON.stringify(labelIds),
      selectedLabelNames: JSON.stringify(labelNames ?? {}),
      syncCutoffDate: cutoffDate,
      maxPerSync: maxPerSyncVal,
    },
  });

  return NextResponse.json({ ok: true });
}
