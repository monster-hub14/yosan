import { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getActiveBudgetId, getUserBudgets } from "@/lib/active-budget";
import { computePayPeriod, getPeriodsPerMonth } from "@/lib/pay-period";
import { computeSafeToSpend } from "@/lib/safe-to-spend";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingDown, PiggyBank, Receipt, Plus, AlertCircle } from "lucide-react";
import Link from "next/link";
import SafeToSpendWidget from "./SafeToSpendWidget";
import PayPeriodCard from "./PayPeriodCard";
import { CategoryTotalsPanel } from "@/components/expenses/category-totals-panel";
import { DashboardStagger, DashboardItem } from "./DashboardMotion";

export const metadata: Metadata = { title: "Dashboard | Yosan AI" };

function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(date));
}

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86400000));
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const budgetId = await getActiveBudgetId(session.userId);

  if (!budgetId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <Wallet className="w-12 h-12 text-muted-foreground" />
        <div>
          <h2 className="text-xl font-semibold">No budget yet</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {session.role === "ADMIN"
              ? "Create your first budget to get started."
              : "You haven't been added to a budget yet."}
          </p>
        </div>
        {session.role === "ADMIN" && (
          <Button asChild>
            <Link href="/budgets/new">
              <Plus className="w-4 h-4 mr-2" />
              Create budget
            </Link>
          </Button>
        )}
      </div>
    );
  }

  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    include: {
      incomeSources: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      savingsGoals: { where: { isActive: true } },
      recurringExpenses: { where: { isActive: true }, orderBy: { nextDueDate: "asc" } },
    },
  });

  if (!budget) return null;

  const primarySource = budget.incomeSources[0] ?? null;
  const periodIncome = budget.incomeSources.reduce((sum, s) => sum + s.amount, 0);

  const payPeriod = primarySource
    ? computePayPeriod(
        primarySource.frequency,
        primarySource.nextPayDate,
        periodIncome,
        primarySource.customDays
      )
    : null;

  const periodStart = payPeriod?.start ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const periodEnd = payPeriod?.end ?? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

  const [expenseAgg, recentExpenses] = await Promise.all([
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

  const spentThisPeriod = expenseAgg._sum.amount ?? 0;

  let savingsReserve = 0;
  if (primarySource && payPeriod) {
    for (const goal of budget.savingsGoals) {
      if (goal.perPaycheckAmount !== null) {
        savingsReserve += goal.perPaycheckAmount;
      } else if (goal.isMonthlyGoal) {
        const ppm = getPeriodsPerMonth(primarySource.frequency, primarySource.customDays);
        savingsReserve += goal.targetAmount / ppm;
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
  const savingsProgress = totalSavingsTarget > 0 ? (totalSavingsCurrent / totalSavingsTarget) * 100 : 0;

  const hasIncomeSetup = budget.incomeSources.length > 0;

  return (
    <DashboardStagger className="space-y-6">
      {/* Page header */}
      <DashboardItem>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground text-sm">
              {budget.name} · {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/expenses?add=1">
              <Plus className="w-4 h-4 mr-1" />
              Add expense
            </Link>
          </Button>
        </div>
      </DashboardItem>

      {/* Income setup alert */}
      {!hasIncomeSetup && (
        <DashboardItem>
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <div className="flex-1 text-sm">
              Set up your income sources to enable pay-period calculations and safe-to-spend.
            </div>
            <Button variant="outline" size="sm" asChild className="border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10">
              <Link href="/income">Set up income</Link>
            </Button>
          </div>
        </DashboardItem>
      )}

      {/* Safe-to-spend hero widget */}
      {safeToSpend && (
        <DashboardItem>
          <SafeToSpendWidget
            amount={safeToSpend.amount}
            status={safeToSpend.status}
            currency={budget.currency}
            daysRemaining={safeToSpend.daysRemaining}
            budgetRemainingFraction={(() => {
              const totalSpendable = safeToSpend.periodIncome - savingsReserve - upcomingTotal;
              if (totalSpendable <= 0) return 0;
              return Math.max(0, Math.min(1, (totalSpendable - spentThisPeriod) / totalSpendable));
            })()}
          />
        </DashboardItem>
      )}

      {/* Summary cards row */}
      <DashboardItem>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {payPeriod && (
            <PayPeriodCard
              periodStart={payPeriod.start.toISOString()}
              periodEnd={payPeriod.end.toISOString()}
              nextPayDate={payPeriod.nextPayDate.toISOString()}
              daysElapsed={payPeriod.daysElapsed}
              daysInPeriod={payPeriod.daysInPeriod}
              daysRemaining={payPeriod.daysRemaining}
              periodIncome={payPeriod.periodIncome}
              currency={budget.currency}
            />
          )}

          <Card className="border-border">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Spending</p>
                <TrendingDown className="w-4 h-4" style={{ color: "hsl(var(--status-risk-hsl))" }} />
              </div>
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency(spentThisPeriod, budget.currency)}
              </p>
              <p className="text-xs text-muted-foreground">This pay period</p>
              {safeToSpend && (
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min((spentThisPeriod / safeToSpend.periodIncome) * 100, 100)}%`,
                      background: "hsl(var(--status-risk-hsl))",
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Savings</p>
                <PiggyBank className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency(totalSavingsCurrent, budget.currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                of {formatCurrency(totalSavingsTarget, budget.currency)} goal
              </p>
              {totalSavingsTarget > 0 && (
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(savingsProgress, 100)}%`,
                      background: "hsl(var(--status-caution-hsl))",
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardItem>

      {/* Detail sections */}
      <DashboardItem>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Recent Expenses</CardTitle>
                    <CardDescription>This pay period</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/expenses">View all</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {recentExpenses.length === 0 ? (
                  <div className="flex flex-col items-center py-8 gap-3 text-center">
                    <Receipt className="w-8 h-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">No expenses this period</p>
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/expenses?add=1">
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add expense
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {recentExpenses.map((expense) => (
                      <div
                        key={expense.id}
                        className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                            <Receipt className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {expense.description || expense.merchant || "Expense"}
                            </p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground">{formatDate(expense.date)}</p>
                              {expense.category && (
                                <Badge variant="secondary" className="text-xs py-0">{expense.category.name}</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <p className="text-sm font-semibold tabular-nums ml-3">
                          {formatCurrency(expense.amount, budget.currency)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Upcoming Bills</CardTitle>
                    <CardDescription>This pay period</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/recurring">View all</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {upcomingRecurring.length === 0 ? (
                  <div className="flex flex-col items-center py-8 gap-3 text-center">
                    <Receipt className="w-8 h-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      {budget.recurringExpenses.length === 0
                        ? "No recurring bills set up"
                        : "No bills due this period"}
                    </p>
                    {budget.recurringExpenses.length === 0 && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/recurring">
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Add bill
                        </Link>
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {upcomingRecurring.slice(0, 5).map((r) => {
                      const days = r.nextDueDate ? daysUntil(r.nextDueDate) : null;
                      return (
                        <div
                          key={r.id}
                          className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{r.name}</p>
                            {days !== null && (
                              <p className="text-xs text-muted-foreground">
                                {days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                            {days !== null && days <= 3 && (
                              <Badge variant="destructive" className="text-xs py-0">Soon</Badge>
                            )}
                            <p className="text-sm font-semibold tabular-nums">
                              {formatCurrency(r.amount, budget.currency)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Category spending sidebar */}
          <div className="hidden xl:block">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Spending by Category</CardTitle>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/categories">View all</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-4">
                <CategoryTotalsPanel budgetId={budgetId} />
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardItem>
    </DashboardStagger>
  );
}
