import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetRead } from "@/lib/auth/permissions";
import { getActiveBudgetId } from "@/lib/active-budget";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { searchParams } = new URL(request.url);
  let budgetId = searchParams.get("budgetId");
  if (!budgetId) budgetId = await getActiveBudgetId(session.userId);
  if (!budgetId) return NextResponse.json({ error: "No active budget" }, { status: 400 });

  const access = await requireBudgetRead(session, budgetId);
  if (access instanceof NextResponse) return access;

  const periodStart = searchParams.get("periodStart")
    ? new Date(searchParams.get("periodStart")!)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const periodEnd = searchParams.get("periodEnd")
    ? new Date(searchParams.get("periodEnd")!)
    : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);

  // Get all categories for the budget (budget-specific + global defaults only)
  const categories = await db.category.findMany({
    where: {
      OR: [{ budgetId }, { isDefault: true, budgetId: null }],
    },
    include: {
      targets: { where: { budgetId } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  // Get expense totals grouped by category
  const expensesByCategory = await db.expense.groupBy({
    by: ["categoryId"],
    where: {
      budgetId,
      date: { gte: periodStart, lte: periodEnd },
    },
    _sum: { amount: true },
  });

  const totalsByCategory = new Map(
    expensesByCategory.map((e) => [e.categoryId, e._sum.amount ?? 0])
  );

  // Build totals with hierarchy — collect per-category data
  const catById = new Map(categories.map((c) => ({ ...c, actual: 0, childActuals: 0 })).map((c) => [c.id, c]));

  // Assign actuals
  for (const cat of catById.values()) {
    cat.actual = totalsByCategory.get(cat.id) ?? 0;
  }

  // Roll up children into parent
  for (const cat of catById.values()) {
    if (cat.parentId && catById.has(cat.parentId)) {
      catById.get(cat.parentId)!.childActuals += cat.actual;
    }
  }

  // Build response tree
  const buildCategoryResult = (cat: ReturnType<typeof catById.get>) => {
    if (!cat) return null;
    const target = cat.targets[0]?.amount ?? null;
    const actual = cat.actual + cat.childActuals;
    const remaining = target !== null ? Math.max(0, target - actual) : null;
    const percentUsed = target !== null && target > 0 ? Math.min(200, (actual / target) * 100) : null;
    let status: "on-track" | "approaching" | "over" = "on-track";
    if (percentUsed !== null) {
      if (percentUsed >= 100) status = "over";
      else if (percentUsed >= 80) status = "approaching";
    }
    return { id: cat.id, name: cat.name, color: cat.color, icon: cat.icon, target, actual, remaining, percentUsed, status };
  };

  const roots = categories.filter((c) => !c.parentId);
  const result = roots.map((root) => {
    const rootCat = catById.get(root.id);
    const children = categories
      .filter((c) => c.parentId === root.id)
      .map((child) => buildCategoryResult(catById.get(child.id)));

    return { ...buildCategoryResult(rootCat), children };
  });

  return NextResponse.json({ totals: result, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() });
}
