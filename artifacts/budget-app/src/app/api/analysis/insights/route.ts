import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { requireBudgetRead } from "@/lib/auth/permissions";
import { getActiveBudgetId } from "@/lib/active-budget";
import { db } from "@/lib/db";
import { generateInsights, persistInsight } from "@/lib/ai/insights";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { searchParams } = new URL(request.url);
  const budgetId = searchParams.get("budgetId") ?? (await getActiveBudgetId(session.userId));
  if (!budgetId) return NextResponse.json({ error: "No budget found" }, { status: 404 });

  const access = await requireBudgetRead(session, budgetId);
  if (access instanceof NextResponse) return access;

  const refresh = searchParams.get("refresh") === "1";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);

  if (refresh) {
    // Generate fresh analysis
    try {
      const result = await generateInsights(budgetId, session.userId);
      await persistInsight(budgetId, result);
      return NextResponse.json({ analysis: result, refreshed: true });
    } catch (err) {
      console.error("[analysis] generateInsights failed:", err);
      return NextResponse.json({ error: "Analysis generation failed" }, { status: 500 });
    }
  }

  // Return stored insights
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
