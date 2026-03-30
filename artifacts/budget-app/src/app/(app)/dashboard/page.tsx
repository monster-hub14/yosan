import { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Receipt,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dashboard | Budget",
};

async function getDashboardData(userId: string) {
  const budgets = await db.budget.findMany({
    where: {
      OR: [
        { ownerId: userId },
        { memberships: { some: { userId } } },
      ],
    },
    take: 1,
    orderBy: { createdAt: "asc" },
    include: {
      incomeSources: { where: { isActive: true } },
      savingsGoals: { where: { isActive: true } },
      expenses: {
        where: {
          date: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        orderBy: { date: "desc" },
        take: 5,
        include: { category: true },
      },
    },
  });

  return budgets[0] || null;
}

function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const budget = await getDashboardData(session.userId);

  if (!budget) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <Wallet className="w-12 h-12 text-muted-foreground" />
        <div>
          <h2 className="text-xl font-semibold">No budget yet</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Create your first budget to get started
          </p>
        </div>
        <Button asChild>
          <Link href="/settings/budgets/new">
            <Plus className="w-4 h-4 mr-2" />
            Create budget
          </Link>
        </Button>
      </div>
    );
  }

  const monthlyIncome = budget.incomeSources.reduce((sum, src) => {
    switch (src.frequency) {
      case "WEEKLY": return sum + src.amount * 4.33;
      case "BIWEEKLY": return sum + src.amount * 2.165;
      case "SEMIMONTHLY": return sum + src.amount * 2;
      case "MONTHLY": return sum + src.amount;
      case "QUARTERLY": return sum + src.amount / 3;
      case "ANNUALLY": return sum + src.amount / 12;
      default: return sum + src.amount;
    }
  }, 0);

  const monthlyExpenses = budget.expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalSavingsTarget = budget.savingsGoals.reduce((sum, g) => sum + g.targetAmount, 0);
  const totalSavingsCurrent = budget.savingsGoals.reduce((sum, g) => sum + g.currentAmount, 0);

  const stats = [
    {
      label: "Monthly Income",
      value: formatCurrency(monthlyIncome, budget.currency),
      icon: TrendingUp,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "This Month's Expenses",
      value: formatCurrency(monthlyExpenses, budget.currency),
      icon: TrendingDown,
      color: "text-rose-500",
      bg: "bg-rose-500/10",
    },
    {
      label: "Remaining",
      value: formatCurrency(monthlyIncome - monthlyExpenses, budget.currency),
      icon: Wallet,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Savings Goals",
      value: `${formatCurrency(totalSavingsCurrent, budget.currency)} / ${formatCurrency(totalSavingsTarget, budget.currency)}`,
      icon: PiggyBank,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {budget.name} &middot;{" "}
            {new Date().toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/expenses/new">
            <Plus className="w-4 h-4 mr-1" />
            Add expense
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="border-border">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      {stat.label}
                    </p>
                    <p className="mt-1.5 text-xl font-bold text-foreground">
                      {stat.value}
                    </p>
                  </div>
                  <div className={`p-2 rounded-lg ${stat.bg}`}>
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Expenses</CardTitle>
                <CardDescription>This month</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/expenses">View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {budget.expenses.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-3 text-center">
                <Receipt className="w-8 h-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No expenses this month yet
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/expenses/new">
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add expense
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {budget.expenses.map((expense) => (
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
                          <p className="text-xs text-muted-foreground">
                            {formatDate(expense.date)}
                          </p>
                          {expense.category && (
                            <Badge variant="secondary" className="text-xs py-0">
                              {expense.category.name}
                            </Badge>
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
                <CardTitle className="text-base">Savings Goals</CardTitle>
                <CardDescription>Progress tracking</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/savings">View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {budget.savingsGoals.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-3 text-center">
                <PiggyBank className="w-8 h-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No savings goals yet
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/savings/new">
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add goal
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {budget.savingsGoals.slice(0, 4).map((goal) => {
                  const progress = goal.targetAmount > 0
                    ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
                    : 0;
                  return (
                    <div key={goal.id} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{goal.name}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatCurrency(goal.currentAmount, budget.currency)} /{" "}
                          {formatCurrency(goal.targetAmount, budget.currency)}
                        </p>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {progress.toFixed(0)}% complete
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
