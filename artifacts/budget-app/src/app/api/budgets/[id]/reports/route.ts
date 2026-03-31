import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetRead } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { getActivePeriodBounds } from "@/lib/active-period";
import { computePayPeriod, getPayDatesInRange } from "@/lib/pay-period";
import type { PayFrequency } from "@prisma/client";

interface Params { params: Promise<{ id: string }> }

function getPreviousPeriodStart(
  currentStart: Date,
  frequency: PayFrequency,
  customDays?: number | null
): Date {
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

interface TimeSeriesPoint {
  key: string;
  label: string;
  amount: number;
}

function buildTimeSeries(
  expenses: Array<{ date: Date; amount: number }>,
  startDate: Date,
  endDate: Date
): TimeSeriesPoint[] {
  const ms = endDate.getTime() - startDate.getTime();
  const days = Math.round(ms / 86400000);

  if (days <= 14) {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const key = e.date.toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + e.amount);
    }
    const result: TimeSeriesPoint[] = [];
    const cur = new Date(startDate);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    while (cur <= end) {
      const key = cur.toISOString().slice(0, 10);
      const [yr, mo, da] = key.split("-");
      const d = new Date(Number(yr), Number(mo) - 1, Number(da));
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      result.push({ key, label, amount: map.get(key) ?? 0 });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  } else if (days <= 90) {
    // Weekly — zero-fill all weeks in range
    const map = new Map<string, number>();
    for (const e of expenses) {
      const d = new Date(e.date);
      const dow = d.getDay();
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - dow);
      weekStart.setHours(0, 0, 0, 0);
      const key = weekStart.toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + e.amount);
    }
    const result: TimeSeriesPoint[] = [];
    const cur = new Date(startDate);
    cur.setDate(cur.getDate() - cur.getDay()); // rewind to Sunday of first week
    cur.setHours(0, 0, 0, 0);
    while (cur <= endDate) {
      const key = cur.toISOString().slice(0, 10);
      const label = cur.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      result.push({ key, label, amount: map.get(key) ?? 0 });
      cur.setDate(cur.getDate() + 7);
    }
    return result;
  } else {
    // Monthly — zero-fill all months in range
    const map = new Map<string, number>();
    for (const e of expenses) {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, (map.get(key) ?? 0) + e.amount);
    }
    const result: TimeSeriesPoint[] = [];
    const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const lastMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    while (cur <= lastMonth) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
      const label = cur.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      result.push({ key, label, amount: map.get(key) ?? 0 });
      cur.setMonth(cur.getMonth() + 1);
    }
    return result;
  }
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

  let startDate: Date;
  let endDate: Date;

  if (startRaw && endRaw) {
    startDate = new Date(startRaw + "T00:00:00");
    endDate = new Date(endRaw + "T23:59:59");

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
    }
    if (startDate > endDate) {
      return NextResponse.json({ error: "start must be before or equal to end." }, { status: 400 });
    }
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

    // Start the period one day after the previous pay date so that
    // getPayDatesInRange counts only the single upcoming paycheck, not
    // both the prior and upcoming pay dates within the same window.
    const ppStart = new Date(pp.start);
    ppStart.setDate(ppStart.getDate() + 1);
    payPeriod = { start: ppStart.toISOString(), end: pp.end.toISOString() };

    // Last period ends on the previous pay date (pp.start) and starts
    // one day after the pay date before that.
    const lastPayEnd = pp.start;
    const lastPayStartRaw = getPreviousPeriodStart(pp.start, src.frequency, src.customDays);
    const lastPayStart = new Date(lastPayStartRaw);
    lastPayStart.setDate(lastPayStart.getDate() + 1);
    lastPayPeriod = { start: lastPayStart.toISOString(), end: lastPayEnd.toISOString() };
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

  // Projected income: count pay dates that fall in [startDate, endDate] for each active source
  const projectedIncome = (budget?.incomeSources ?? []).reduce((sum, src) => {
    const payDates = getPayDatesInRange(src.frequency, src.nextPayDate, startDate, endDate, src.customDays);
    return sum + payDates.length * src.amount;
  }, 0);

  // All logged income entries in range (bonuses, side income, manually logged paychecks, etc.)
  const loggedIncomeAgg = await db.incomeEntry.aggregate({
    where: { budgetId, date: { gte: startDate, lte: endDate } },
    _sum: { amount: true },
  });
  // Total income = projected (from pay schedule) + all logged entries.
  // This ensures both schedule-based income and any manually recorded amounts are captured.
  const income = projectedIncome + (loggedIncomeAgg._sum.amount ?? 0);

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const net = income - totalExpenses;

  // Saved = money left over after expenses (unspent income for the selected period)
  const saved = Math.max(0, net);

  // Server-side adaptive time-series aggregation
  const timeSeries = buildTimeSeries(
    expenses.map(e => ({ date: e.date, amount: e.amount })),
    startDate,
    endDate
  );

  return NextResponse.json({
    summary: { income, expenses: totalExpenses, net, saved },
    expenseRows,
    timeSeries,
    payPeriod,
    lastPayPeriod,
    dateRange: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
  });
}
