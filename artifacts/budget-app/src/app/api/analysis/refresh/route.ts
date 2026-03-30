/**
 * POST /api/analysis/refresh
 * Explicit AI-driven refresh with rate-limit enforcement.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetRead } from "@/lib/auth/permissions";
import { getActiveBudgetId } from "@/lib/active-budget";
import { generateInsights, persistInsight } from "@/lib/ai/insights";
import { checkUsageLimit, recordUsage } from "@/lib/ai/usage";

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const body = await request.json() as { budgetId?: string };
  const budgetId = body.budgetId ?? (await getActiveBudgetId(session.userId));
  if (!budgetId) return NextResponse.json({ error: "No budget found" }, { status: 404 });

  const access = await requireBudgetRead(session, budgetId);
  if (access instanceof NextResponse) return access;

  // Check limits only — limitExceeded=true means actual quota hit (not just unconfigured AI)
  const limitCheck = await checkUsageLimit(session.userId, "insights");
  if (limitCheck.limitExceeded) {
    return NextResponse.json(
      {
        error: limitCheck.reason ?? "AI usage limit reached",
        usageLimitReached: true,
        dailyCount: limitCheck.dailyCount,
        weeklyCount: limitCheck.weeklyCount,
        monthlyCount: limitCheck.monthlyCount,
      },
      { status: 429 }
    );
  }

  const aiUnavailable = !limitCheck.allowed && !limitCheck.limitExceeded;

  try {
    const result = await generateInsights(budgetId, session.userId);
    const insightId = await persistInsight(budgetId, result);
    // Record usage only after AI actually responded
    if (result.generatedByAI) {
      await recordUsage(session.userId, "insights");
    }
    return NextResponse.json({
      analysis: result,
      insightId,
      aiUnavailable: aiUnavailable || !result.generatedByAI,
      aiUnavailableReason: aiUnavailable ? limitCheck.reason : undefined,
    }, { status: 201 });
  } catch (err) {
    console.error("[analysis/refresh] failed:", err);
    return NextResponse.json({ error: "Analysis generation failed" }, { status: 500 });
  }
}
