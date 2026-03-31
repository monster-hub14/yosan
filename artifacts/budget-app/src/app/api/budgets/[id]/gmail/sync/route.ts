import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetWrite } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { GmailRevokedError } from "@/lib/gmail";
import { runGmailSync } from "@/lib/gmail-sync";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: budgetId } = await params;

  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetWrite(session, budgetId);
  if (access instanceof NextResponse) return access;

  const conn = await db.gmailConnection.findUnique({ where: { userId: session.userId } });
  if (!conn) {
    return NextResponse.json(
      { ok: false, error: "Gmail not connected", reconnect_required: true },
      { status: 400 }
    );
  }
  if (conn.isRevoked) {
    return NextResponse.json(
      { ok: false, error: "Gmail token revoked. Please reconnect.", reconnect_required: true },
      { status: 401 }
    );
  }

  const labelCfg = await db.gmailLabelConfig.findUnique({ where: { userId: session.userId } });
  if (!labelCfg) {
    return NextResponse.json(
      { ok: false, error: "No Gmail labels selected. Configure Gmail import first." },
      { status: 400 }
    );
  }

  let selectedLabelIds: string[] = [];
  try { selectedLabelIds = JSON.parse(labelCfg.selectedLabelIds); } catch { /* ignore */ }

  if (selectedLabelIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No Gmail labels selected. Configure Gmail import first." },
      { status: 400 }
    );
  }

  try {
    const result = await runGmailSync(session.userId, budgetId, {
      selectedLabelIds,
      maxPerSync: labelCfg.maxPerSync,
      syncCutoffDate: labelCfg.syncCutoffDate ?? undefined,
      uploadedById: session.userId,
    });

    const partialError =
      result.failed > 0
        ? `${result.failed} message${result.failed !== 1 ? "s" : ""} could not be imported`
        : null;

    await db.gmailLabelConfig.update({
      where: { userId: session.userId },
      data: {
        lastSyncAt: new Date(),
        lastSyncError: partialError,
      },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
      ...(partialError ? { warning: partialError } : {}),
    });
  } catch (err) {
    const isRevoked = err instanceof GmailRevokedError;
    const msg = err instanceof Error ? err.message : "Sync failed";

    await db.gmailLabelConfig.update({
      where: { userId: session.userId },
      data: { lastSyncError: msg },
    }).catch(() => {});

    return NextResponse.json(
      { ok: false, error: msg, reconnect_required: isRevoked },
      { status: isRevoked ? 401 : 500 }
    );
  }
}
