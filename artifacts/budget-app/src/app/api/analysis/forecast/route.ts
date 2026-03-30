import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetRead } from "@/lib/auth/permissions";
import { getActiveBudgetId } from "@/lib/active-budget";
import { buildForecast } from "@/lib/forecast";
import { checkUsageLimit, recordUsage } from "@/lib/ai/usage";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { searchParams } = new URL(request.url);
  const budgetId = searchParams.get("budgetId") ?? (await getActiveBudgetId(session.userId));
  if (!budgetId) return NextResponse.json({ error: "No budget found" }, { status: 404 });

  const access = await requireBudgetRead(session, budgetId);
  if (access instanceof NextResponse) return access;

  const days = Math.min(parseInt(searchParams.get("days") ?? "42"), 90);

  // Check forecasting limit — only block on limitExceeded (quota hit), not unconfigured AI
  const limitCheck = await checkUsageLimit(session.userId, "forecasting");
  if (limitCheck.limitExceeded) {
    return NextResponse.json(
      { error: limitCheck.reason ?? "AI usage limit reached", usageLimitReached: true },
      { status: 429 }
    );
  }

  try {
    const forecast = await buildForecast(budgetId, session.userId, days);
    // Record usage only if AI actually ran
    if (forecast.generatedByAI) {
      await recordUsage(session.userId, "forecasting");
    }
    return NextResponse.json({ forecast });
  } catch (err) {
    console.error("[forecast] buildForecast failed:", err);
    return NextResponse.json({ error: "Forecast generation failed" }, { status: 500 });
  }
}
