import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { getActiveBudgetId } from "@/lib/active-budget";
import { computePayPeriod, getPeriodsPerMonth } from "@/lib/pay-period";
import { computeSafeToSpend } from "@/lib/safe-to-spend";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const budgetId = await getActiveBudgetId(session.userId);
  if (!budgetId) {
    return NextResponse.json({ budget: null, dashboard: null });
  }

  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    include: {
      incomeSources: { where: { isActive: true } },
      savingsGoals: { where: { isActive: true } },
      recurringExpenses: { where: { isActive: true }, orderBy: { nextDueDate: "asc" } },
    },
  });

  if (!budget) return NextResponse.json({ budget: null, dashboard: null });

  const primarySource = budget.incomeSources[0] ?? null;
  const payPeriod = primarySource
    ? computePayPeriod(
        primarySource.frequency,
        primarySource.nextPayDate,
        budget.incomeSources.reduce((sum, s) => sum + s.amount, 0),
        primarySource.customDays
      )
    : null;

  const periodStart = payPeriod?.start ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const periodEnd = payPeriod?.end ?? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

  const [expenses, recentExpenses] = await Promise.all([
    db.expense.aggregate({
      where: { budgetId, date: { gte: periodStart, lte: periodEnd } },
      _sum: { amount: true },
    }),
    db.expense.findMany({
      where: { budgetId, date: { gte: periodStart } },
      orderBy: { date: "desc" },
      take: 5,
      include: { category: { select: { id: true, name: true, color: true } } },
    }),
  ]);

  const spentThisPeriod = expenses._sum.amount ?? 0;

  let savingsReserve = 0;
  if (primarySource && payPeriod) {
    for (const goal of budget.savingsGoals) {
      if (goal.perPaycheckAmount !== null) {
        savingsReserve += goal.perPaycheckAmount;
      } else if (goal.isMonthlyGoal) {
        const periodsPerMonth = getPeriodsPerMonth(primarySource.frequency, primarySource.customDays);
        savingsReserve += goal.targetAmount / periodsPerMonth;
      }
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingRecurring = budget.recurringExpenses.filter((r) => {
    if (!r.nextDueDate) return false;
    const due = new Date(r.nextDueDate);
    due.setHours(0, 0, 0, 0);
    return payPeriod ? due >= today && due <= payPeriod.end : true;
  });

  const upcomingTotal = upcomingRecurring.reduce((sum, r) => sum + r.amount, 0);

  const safeToSpend = payPeriod
    ? computeSafeToSpend({
        period: payPeriod,
        savingsReservePerPeriod: savingsReserve,
        upcomingRecurringBeforeNextPayday: upcomingTotal,
        confirmedExpensesThisPeriod: spentThisPeriod,
      })
    : null;

  const totalSavingsTarget = budget.savingsGoals.reduce((sum, g) => sum + g.targetAmount, 0);
  const totalSavingsCurrent = budget.savingsGoals.reduce((sum, g) => sum + g.currentAmount, 0);

  return NextResponse.json({
    budget: {
      id: budget.id,
      name: budget.name,
      currency: budget.currency,
      budgetType: budget.budgetType,
    },
    dashboard: {
      payPeriod: payPeriod
        ? {
            start: payPeriod.start.toISOString(),
            end: payPeriod.end.toISOString(),
            nextPayDate: payPeriod.nextPayDate.toISOString(),
            daysInPeriod: payPeriod.daysInPeriod,
            daysElapsed: payPeriod.daysElapsed,
            daysRemaining: payPeriod.daysRemaining,
            periodIncome: payPeriod.periodIncome,
          }
        : null,
      safeToSpend,
      savings: {
        totalTarget: totalSavingsTarget,
        totalCurrent: totalSavingsCurrent,
        reservePerPeriod: savingsReserve,
        goals: budget.savingsGoals,
      },
      spending: {
        thisPeriod: spentThisPeriod,
        recent: recentExpenses,
      },
      upcomingRecurring,
    },
  });
}
