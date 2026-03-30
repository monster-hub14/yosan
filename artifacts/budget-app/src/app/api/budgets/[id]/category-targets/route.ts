import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetRead, requireBudgetWrite } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

interface Params { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id: budgetId } = await params;
  const access = await requireBudgetRead(session, budgetId);
  if (access instanceof NextResponse) return access;

  const { searchParams } = new URL(request.url);
  const periodStart = searchParams.get("periodStart")
    ? new Date(searchParams.get("periodStart")!)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const periodEnd = searchParams.get("periodEnd")
    ? new Date(searchParams.get("periodEnd")!)
    : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);

  const targets = await db.categoryTarget.findMany({
    where: { budgetId },
    include: { category: { select: { id: true, name: true, color: true, icon: true, parentId: true } } },
  });

  if (targets.length === 0) {
    return NextResponse.json({ targets: [], periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() });
  }

  // Get actuals for each target category (and their children for rollup)
  const categoryIds = targets.map((t) => t.categoryId);

  // Also fetch children of each target category for rollup
  const children = await db.category.findMany({
    where: { parentId: { in: categoryIds } },
    select: { id: true, parentId: true },
  });

  const allIds = [...categoryIds, ...children.map((c) => c.id)];

  const expensesByCategory = await db.expense.groupBy({
    by: ["categoryId"],
    where: {
      budgetId,
      categoryId: { in: allIds },
      date: { gte: periodStart, lte: periodEnd },
    },
    _sum: { amount: true },
  });

  const actuals = new Map(expensesByCategory.map((e) => [e.categoryId, e._sum.amount ?? 0]));

  // Build child→parent map for rollup
  const childParentMap = new Map(children.map((c) => [c.id, c.parentId!]));

  const enriched = targets.map((t) => {
    // Direct actuals for this category
    let actual = actuals.get(t.categoryId) ?? 0;
    // Add child actuals
    for (const [childId, parentId] of childParentMap) {
      if (parentId === t.categoryId) {
        actual += actuals.get(childId) ?? 0;
      }
    }

    const target = t.amount;
    const remaining = target > 0 ? Math.max(0, target - actual) : null;
    const percentUsed = target > 0 ? Math.min(200, (actual / target) * 100) : null;
    let status: "on-track" | "approaching" | "over" = "on-track";
    if (percentUsed !== null) {
      if (percentUsed >= 100) status = "over";
      else if (percentUsed >= 80) status = "approaching";
    }

    return {
      id: t.id,
      budgetId: t.budgetId,
      categoryId: t.categoryId,
      category: t.category,
      amount: t.amount,
      periodType: t.periodType,
      actual,
      remaining,
      percentUsed,
      status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  });

  return NextResponse.json({ targets: enriched, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id: budgetId } = await params;
  const access = await requireBudgetWrite(session, budgetId);
  if (access instanceof NextResponse) return access;

  const body = await request.json() as {
    categoryId: string;
    amount: number | null;
    periodType?: string;
  };

  if (!body.categoryId) {
    return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
  }

  const cat = await db.category.findUnique({ where: { id: body.categoryId } });
  if (!cat || (cat.budgetId !== null && cat.budgetId !== budgetId) || (cat.budgetId === null && !cat.isDefault)) {
    return NextResponse.json({ error: "Category not found or not accessible to this budget" }, { status: 404 });
  }

  if (body.amount === null || body.amount === 0) {
    await db.categoryTarget.deleteMany({ where: { budgetId, categoryId: body.categoryId } });
    return NextResponse.json({ ok: true, target: null });
  }

  if (!body.amount || body.amount < 0) {
    return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
  }

  const target = await db.categoryTarget.upsert({
    where: { budgetId_categoryId: { budgetId, categoryId: body.categoryId } },
    create: {
      budgetId,
      categoryId: body.categoryId,
      amount: parseFloat(String(body.amount)),
      periodType: body.periodType ?? "monthly",
    },
    update: {
      amount: parseFloat(String(body.amount)),
      periodType: body.periodType ?? "monthly",
    },
    include: { category: { select: { id: true, name: true, color: true, icon: true } } },
  });

  return NextResponse.json({ target });
}
