/**
 * /api/cron/gmail-sync
 *
 * Callable by an external cron scheduler (TrueNAS SCALE, Docker cron, etc.).
 * Runs Gmail sync for every user whose chosen sync interval has elapsed.
 *
 * Recommended cron schedule: every 15 minutes.
 * Each user's actual sync only fires when their chosen interval has elapsed
 * since lastSyncAt (30 min, 1 h, 6 h, 12 h, 24 h — stored in syncIntervalMinutes).
 *
 * Secured with CRON_SECRET env var:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Example call:
 *   curl -X POST https://your-host/api/cron/gmail-sync \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GmailRevokedError } from "@/lib/gmail";
import { runGmailSync } from "@/lib/gmail-sync";

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Find all users with a non-revoked Gmail connection and a label config
  // that has at least one label selected.
  const connections = await db.gmailConnection.findMany({
    where: { isRevoked: false },
    select: { userId: true },
  });
  const userIds = connections.map((c) => c.userId);

  if (userIds.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "No active Gmail connections",
      synced: 0,
      skipped: 0,
      failed: 0,
    });
  }

  const labelConfigs = await db.gmailLabelConfig.findMany({
    where: { userId: { in: userIds } },
  });

  // Load each user's active budget.
  // A user's "active" budget is the earliest-created budget they own OR belong to as a member.
  // We query owned budgets first, then fill gaps via BudgetMembership for users who
  // have no owned budget.
  const ownedBudgets = await db.budget.findMany({
    where: { ownerId: { in: userIds } },
    select: { id: true, ownerId: true },
    orderBy: { createdAt: "asc" },
  });

  const budgetByUser = new Map<string, string>();
  for (const b of ownedBudgets) {
    if (!budgetByUser.has(b.ownerId)) {
      budgetByUser.set(b.ownerId, b.id);
    }
  }

  // For users with no owned budget, fall back to their earliest membership budget
  const usersWithoutBudget = userIds.filter((uid) => !budgetByUser.has(uid));
  if (usersWithoutBudget.length > 0) {
    const memberships = await db.budgetMembership.findMany({
      where: { userId: { in: usersWithoutBudget } },
      select: { userId: true, budgetId: true, budget: { select: { createdAt: true } } },
      orderBy: { budget: { createdAt: "asc" } },
    });
    for (const m of memberships) {
      if (m.budgetId && !budgetByUser.has(m.userId)) {
        budgetByUser.set(m.userId, m.budgetId);
      }
    }
  }

  const summary = {
    synced: 0,
    skipped: 0,
    failed: 0,
    imported: 0,
    usersProcessed: [] as string[],
    usersSkipped: [] as string[],
    usersFailed: [] as string[],
  };

  for (const cfg of labelConfigs) {
    const budgetId = budgetByUser.get(cfg.userId);
    if (!budgetId) {
      console.warn(`[cron/gmail-sync] No budget found for user ${cfg.userId} — skipping`);
      summary.skipped++;
      summary.usersSkipped.push(cfg.userId);
      continue;
    }

    // Parse selected labels
    let selectedLabelIds: string[] = [];
    try { selectedLabelIds = JSON.parse(cfg.selectedLabelIds); } catch { /* ignore */ }

    if (selectedLabelIds.length === 0) {
      summary.skipped++;
      summary.usersSkipped.push(cfg.userId);
      continue;
    }

    // Check if enough time has elapsed since the last sync
    const intervalMs = (cfg.syncIntervalMinutes ?? 60) * 60 * 1000;
    const lastSync = cfg.lastSyncAt ? new Date(cfg.lastSyncAt).getTime() : 0;
    const elapsed = now.getTime() - lastSync;

    if (elapsed < intervalMs) {
      summary.skipped++;
      summary.usersSkipped.push(cfg.userId);
      continue;
    }

    // Run sync
    try {
      console.log(
        `[cron/gmail-sync] Syncing user=${cfg.userId} budget=${budgetId} interval=${cfg.syncIntervalMinutes}min`
      );

      const result = await runGmailSync(cfg.userId, budgetId, {
        selectedLabelIds,
        maxPerSync: cfg.maxPerSync,
        syncCutoffDate: cfg.syncCutoffDate ?? undefined,
        uploadedById: cfg.userId,
      });

      const partialError =
        result.failed > 0
          ? `${result.failed} message${result.failed !== 1 ? "s" : ""} could not be imported`
          : null;

      await db.gmailLabelConfig.update({
        where: { userId: cfg.userId },
        data: {
          lastSyncAt: now,
          lastSyncError: partialError,
        },
      }).catch(() => {});

      console.log(
        `[cron/gmail-sync] user=${cfg.userId} imported=${result.imported} skipped=${result.skipped} failed=${result.failed}`
      );

      summary.synced++;
      summary.imported += result.imported;
      summary.usersProcessed.push(cfg.userId);
    } catch (err) {
      const isRevoked = err instanceof GmailRevokedError;
      const msg = err instanceof Error ? err.message : "Sync failed";

      console.error(`[cron/gmail-sync] user=${cfg.userId} error:`, err);

      await db.gmailLabelConfig.update({
        where: { userId: cfg.userId },
        data: { lastSyncError: msg },
      }).catch(() => {});

      if (isRevoked) {
        await db.gmailConnection.update({
          where: { userId: cfg.userId },
          data: { isRevoked: true },
        }).catch(() => {});
      }

      summary.failed++;
      summary.usersFailed.push(cfg.userId);
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}
