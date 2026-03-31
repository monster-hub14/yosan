import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const [oauthCfg, conn, labelCfg] = await Promise.all([
    db.gmailOAuthConfig.findUnique({ where: { id: "singleton" } }),
    db.gmailConnection.findUnique({ where: { userId: session.userId } }),
    db.gmailLabelConfig.findUnique({ where: { userId: session.userId } }),
  ]);

  const oauthConfigured = !!(oauthCfg?.clientId && oauthCfg?.clientSecret);

  let status: "not_connected" | "connected" | "revoked" = "not_connected";
  if (conn) {
    status = conn.isRevoked ? "revoked" : "connected";
  }

  let selectedLabelIds: string[] = [];
  let selectedLabelNames: Record<string, string> = {};
  if (labelCfg) {
    try { selectedLabelIds = JSON.parse(labelCfg.selectedLabelIds); } catch { /* ignore */ }
    try { selectedLabelNames = JSON.parse(labelCfg.selectedLabelNames); } catch { /* ignore */ }
  }

  return NextResponse.json({
    ok: true,
    oauthConfigured,
    status,
    tokenEmail: conn?.tokenEmail ?? null,
    connectedAt: conn?.connectedAt?.toISOString() ?? null,
    selectedLabelIds,
    selectedLabelNames,
    lastSyncAt: labelCfg?.lastSyncAt?.toISOString() ?? null,
    lastSyncError: labelCfg?.lastSyncError ?? null,
    syncCutoffDate: labelCfg?.syncCutoffDate?.toISOString() ?? null,
    maxPerSync: labelCfg?.maxPerSync ?? 50,
  });
}
