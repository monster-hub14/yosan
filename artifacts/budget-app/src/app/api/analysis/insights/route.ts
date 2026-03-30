import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetRead } from "@/lib/auth/permissions";
import { getActiveBudgetId } from "@/lib/active-budget";
import { db } from "@/lib/db";
import { generateInsights, persistInsight } from "@/lib/ai/insights";
import { checkAndRecordUsage } from "@/lib/ai/usage";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { searchParams } = new URL(request.url);
  const budgetId = searchParams.get("budgetId") ?? (await getActiveBudgetId(session.userId));
  if (!budgetId) return NextResponse.json({ error: "No budget found" }, { status: 404 });

  const access = await requireBudgetRead(session, budgetId);
  if (access instanceof NextResponse) return access;

  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);

  const insights = await db.insight.findMany({
    where: { budgetId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ insights });
}

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
    return NextResponse.json({ analysis: result, insightId }, { status: 201 });
  } catch (err) {
    console.error("[analysis] generateInsights failed:", err);
    return NextResponse.json({ error: "Analysis generation failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const body = await request.json() as { insightId: string; isRead: boolean };
  if (!body.insightId) return NextResponse.json({ error: "insightId required" }, { status: 400 });

  const insight = await db.insight.findUnique({ where: { id: body.insightId } });
  if (!insight) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await requireBudgetRead(session, insight.budgetId);
  if (access instanceof NextResponse) return access;

  const updated = await db.insight.update({
    where: { id: body.insightId },
    data: { isRead: body.isRead },
  });

  return NextResponse.json({ insight: updated });
}
