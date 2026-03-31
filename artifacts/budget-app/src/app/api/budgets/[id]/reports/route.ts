import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetRead } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { getActivePeriodBounds } from "@/lib/active-period";
import { computePayPeriod } from "@/lib/pay-period";
import type { PayFrequency } from "@prisma/client";

interface Params { params: Promise<{ id: string }> }

function getPreviousPeriodStart(currentStart: Date, frequency: PayFrequency, customDays?: number | null): Date {
  const d = new Date(currentStart);
  switch (frequency) {
    case "WEEKLY": d.setDate(d.getDate() - 7); break;
    case "BIWEEKLY": d.setDate(d.getDate() - 14); break;
    case "SEMIMONTHLY":
      if (d.getDate() === 15) { d.setDate(1); }
      else { d.setMonth(d.getMonth() - 1); d.setDate(15); }
      break;
    case "MONTHLY": d.setMonth(d.getMonth() - 1); break;
    case "QUARTERLY": d.setMonth(d.getMonth() - 3); break;
    case "ANNUALLY": d.setFullYear(d.getFullYear() - 1); break;
    case "CUSTOM": d.setDate(d.getDate() - (customDays ?? 14)); break;
    default: d.setDate(d.getDate() - 14);
  }
  return d;
}

export async function GET(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id: budgetId } = await params;
  const access = await requireBudgetRead(session, budgetId);
  if (access instanceof NextResponse) return access;

  const { searchParams } = new URL(request.url);
  const startRaw = searchParams.get("start");
  const endRaw = searchParams.get("end");

  // Determine effective date range
  let startDate: Date;
  let endDate: Date;

  if (startRaw && endRaw) {
    startDate = new Date(startRaw + "T00:00:00");
    endDate = new Date(endRaw + "T23:59:59");
  } else {
    const bounds = await getActivePeriodBounds(budgetId);
    startDate = bounds.start;
    endDate = bounds.end;
  }

  // Compute pay period bounds for preset buttons
  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    include: { incomeSources: { where: { isActive: true } } },
  });

  let payPeriod: { start: string; end: string } | null = null;
  let lastPayPeriod: { start: string; end: string } | null = null;

  if (budget?.incomeSources[0]) {
    const src = budget.incomeSources[0];
    const pp = computePayPeriod(src.frequency, src.nextPayDate, src.amount, src.customDays);
    payPeriod = { start: pp.start.toISOString(), end: pp.end.toISOString() };
    const lastStart = getPreviousPeriodStart(pp.start, src.frequency, src.customDays);
    lastPayPeriod = { start: lastStart.toISOString(), end: pp.start.toISOString() };
  }

  // Fetch all expenses in range with category info
  const expenses = await db.expense.findMany({
    where: { budgetId, date: { gte: startDate, lte: endDate } },
    include: {
      category: { select: { id: true, name: true, color: true, icon: true, parentId: true } },
    },
    orderBy: { date: "desc" },
  });

  // Resolve parent category names for subcategories
  const parentIds = [...new Set(
    expenses.map(e => e.category?.parentId).filter((id): id is string => !!id)
  )];
  const parentCategories = parentIds.length > 0
    ? await db.category.findMany({
        where: { id: { in: parentIds } },
        select: { id: true, name: true, color: true },
      })
    : [];
  const parentMap = new Map(parentCategories.map(c => [c.id, c]));

  // Build flat expense rows
  const expenseRows = expenses.map(e => {
    const cat = e.category;
    const parent = cat?.parentId ? parentMap.get(cat.parentId) ?? null : null;
    return {
      id: e.id,
      date: e.date.toISOString(),
      description: e.description,
      merchant: e.merchant,
      amount: e.amount,
      categoryId: cat?.id ?? null,
      categoryName: cat?.name ?? null,
      categoryColor: cat?.color ?? null,
      parentCategoryId: parent?.id ?? null,
      parentCategoryName: parent?.name ?? null,
    };
  });

  // Income: sum of IncomeEntry in range
  const incomeAgg = await db.incomeEntry.aggregate({
    where: { budgetId, date: { gte: startDate, lte: endDate } },
    _sum: { amount: true },
  });
  const income = incomeAgg._sum.amount ?? 0;

  // Expense total
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  const net = income - totalExpenses;
  const saved = Math.max(0, net);

  return NextResponse.json({
    summary: { income, expenses: totalExpenses, net, saved },
    expenseRows,
    payPeriod,
    lastPayPeriod,
    dateRange: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
  });
}
