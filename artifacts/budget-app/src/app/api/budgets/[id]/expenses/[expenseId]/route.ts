import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetWrite } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { computeSafeToSpend } from "@/lib/safe-to-spend";
import { computePayPeriod, getPeriodsPerMonth } from "@/lib/pay-period";

interface Params { params: Promise<{ id: string; expenseId: string }> }

async function calcSafeToSpend(budgetId: string) {
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

  // Always use the actual pay period window (not calendar month) for accurate safe-to-spend
  const expenses = await db.expense.aggregate({
    where: { budgetId, date: { gte: payPeriod.start, lte: payPeriod.end } },
    _sum: { amount: true },
  });

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

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id: budgetId, expenseId } = await params;
  const access = await requireBudgetWrite(session, budgetId);
  if (access instanceof NextResponse) return access;

  const existing = await db.expense.findUnique({ where: { id: expenseId } });
  if (!existing || existing.budgetId !== budgetId) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  const body = await request.json() as {
    amount?: number;
    date?: string;
    merchant?: string | null;
    description?: string | null;
    notes?: string | null;
    categoryId?: string | null;
  };

  if (body.amount !== undefined && body.amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
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

  const expense = await db.expense.update({
    where: { id: expenseId },
    data: {
      ...(body.amount !== undefined ? { amount: parseFloat(String(body.amount)) } : {}),
      ...(body.date !== undefined ? { date: new Date(body.date) } : {}),
      ...(body.merchant !== undefined ? { merchant: body.merchant?.trim() || null } : {}),
      ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
    },
    include: { category: { select: { id: true, name: true, color: true, icon: true } } },
  });

  const safeToSpend = await calcSafeToSpend(budgetId);

  return NextResponse.json({ expense, safeToSpend });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id: budgetId, expenseId } = await params;
  const access = await requireBudgetWrite(session, budgetId);
  if (access instanceof NextResponse) return access;

  const existing = await db.expense.findUnique({ where: { id: expenseId } });
  if (!existing || existing.budgetId !== budgetId) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  await db.expense.delete({ where: { id: expenseId } });

  const safeToSpend = await calcSafeToSpend(budgetId);
  return NextResponse.json({ ok: true, safeToSpend });
}
