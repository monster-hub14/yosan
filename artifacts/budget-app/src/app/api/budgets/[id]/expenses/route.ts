import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetRead, requireBudgetWrite } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { computeSafeToSpend } from "@/lib/safe-to-spend";
import { computePayPeriod, getPeriodsPerMonth } from "@/lib/pay-period";

interface Params { params: Promise<{ id: string }> }

async function calcSafeToSpend(budgetId: string, periodStart: Date, periodEnd: Date) {
  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    include: {
      incomeSources: { where: { isActive: true } },
      savingsGoals: { where: { isActive: true } },
      recurringExpenses: { where: { isActive: true } },
    },
  });
  if (!budget) return null;

  const primarySource = budget.incomeSources[0] ?? null;
  const payPeriod = primarySource
    ? computePayPeriod(primarySource.frequency, primarySource.nextPayDate, budget.incomeSources.reduce((s, i) => s + i.amount, 0), primarySource.customDays)
    : null;

  if (!payPeriod) return null;

  const [expenses] = await Promise.all([
    db.expense.aggregate({
      where: { budgetId, date: { gte: periodStart, lte: periodEnd } },
      _sum: { amount: true },
    }),
  ]);

  let savingsReserve = 0;
  for (const goal of budget.savingsGoals) {
    if (goal.perPaycheckAmount !== null) savingsReserve += goal.perPaycheckAmount;
    else if (goal.isMonthlyGoal && primarySource) {
      savingsReserve += goal.targetAmount / getPeriodsPerMonth(primarySource.frequency, primarySource.customDays);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = budget.recurringExpenses
    .filter((r) => r.nextDueDate && new Date(r.nextDueDate) >= today && new Date(r.nextDueDate) <= payPeriod.end)
    .reduce((s, r) => s + r.amount, 0);

  return computeSafeToSpend({
    period: payPeriod,
    savingsReservePerPeriod: savingsReserve,
    upcomingRecurringBeforeNextPayday: upcoming,
    confirmedExpensesThisPeriod: expenses._sum.amount ?? 0,
  });
}

export async function GET(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id: budgetId } = await params;
  const access = await requireBudgetRead(session, budgetId);
  if (access instanceof NextResponse) return access;

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");
  const search = searchParams.get("search");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));
  const skip = (page - 1) * limit;

  const where = {
    budgetId,
    ...(categoryId ? { categoryId } : {}),
    ...(dateFrom || dateTo
      ? { date: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo + "T23:59:59") } : {}) } }
      : {}),
    ...(search
      ? { OR: [{ merchant: { contains: search } }, { description: { contains: search } }, { notes: { contains: search } }] }
      : {}),
  };

  const [expenses, total] = await Promise.all([
    db.expense.findMany({
      where,
      include: { category: { select: { id: true, name: true, color: true, icon: true, parentId: true } }, addedBy: { select: { id: true, name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    db.expense.count({ where }),
  ]);

  return NextResponse.json({ expenses, total, page, limit, pages: Math.ceil(total / limit) });
}

export async function POST(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id: budgetId } = await params;
  const access = await requireBudgetWrite(session, budgetId);
  if (access instanceof NextResponse) return access;

  const body = await request.json() as {
    amount: number;
    date: string;
    merchant?: string;
    description?: string;
    notes?: string;
    categoryId?: string;
    receiptId?: string;
  };

  if (!body.amount || body.amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
  }
  if (!body.date) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 });
  }

  // Validate categoryId: must belong to this budget or be a global default, and must be a leaf node
  if (body.categoryId) {
    const cat = await db.category.findUnique({ where: { id: body.categoryId } });
    if (!cat || (cat.budgetId !== null && cat.budgetId !== budgetId) || (cat.budgetId === null && !cat.isDefault)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    const hasChildren = await db.category.count({ where: { parentId: body.categoryId } });
    if (hasChildren > 0) {
      return NextResponse.json({ error: "Cannot assign a parent category — choose a sub-category" }, { status: 400 });
    }
  }

  const expense = await db.expense.create({
    data: {
      budgetId,
      amount: parseFloat(String(body.amount)),
      date: new Date(body.date),
      merchant: body.merchant?.trim() || null,
      description: body.description?.trim() || null,
      notes: body.notes?.trim() || null,
      categoryId: body.categoryId || null,
      receiptId: body.receiptId || null,
      addedById: session.userId,
    },
    include: { category: { select: { id: true, name: true, color: true, icon: true } } },
  });

  const expDate = new Date(body.date);
  const periodStart = new Date(expDate.getFullYear(), expDate.getMonth(), 1);
  const periodEnd = new Date(expDate.getFullYear(), expDate.getMonth() + 1, 0, 23, 59, 59);
  const safeToSpend = await calcSafeToSpend(budgetId, periodStart, periodEnd);

  return NextResponse.json({ expense, safeToSpend }, { status: 201 });
}
