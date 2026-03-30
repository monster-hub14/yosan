/**
 * POST /api/analysis/refresh
 * Explicit AI-driven refresh with rate-limit enforcement.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetRead } from "@/lib/auth/permissions";
import { getActiveBudgetId } from "@/lib/active-budget";
import { generateInsights, persistInsight } from "@/lib/ai/insights";
import { checkAndRecordUsage } from "@/lib/ai/usage";

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const body = await request.json() as { budgetId?: string };
  const budgetId = body.budgetId ?? (await getActiveBudgetId(session.userId));
  if (!budgetId) return NextResponse.json({ error: "No budget found" }, { status: 404 });

  const access = await requireBudgetRead(session, budgetId);
  if (access instanceof NextResponse) return access;

  // Enforce AI usage limits for insights feature
  const usageCheck = await checkAndRecordUsage(session.userId, "insights");
  if (!usageCheck.allowed) {
    return NextResponse.json(
      {
        error: usageCheck.reason ?? "AI usage limit reached",
        usageLimitReached: true,
        dailyCount: usageCheck.dailyCount,
        weeklyCount: usageCheck.weeklyCount,
        monthlyCount: usageCheck.monthlyCount,
      },
      { status: 429 }
    );
  }

  try {
    const result = await generateInsights(budgetId, session.userId);
    const insightId = await persistInsight(budgetId, result);
    return NextResponse.json({
      analysis: result,
      insightId,
      usage: {
        dailyCount: usageCheck.dailyCount,
        weeklyCount: usageCheck.weeklyCount,
        monthlyCount: usageCheck.monthlyCount,
      },
    }, { status: 201 });
  } catch (err) {
    console.error("[analysis/refresh] failed:", err);
    return NextResponse.json({ error: "Analysis generation failed" }, { status: 500 });
  }
}
