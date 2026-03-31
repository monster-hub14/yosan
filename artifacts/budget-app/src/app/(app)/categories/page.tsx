import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveBudgetId } from "@/lib/active-budget";
import { db } from "@/lib/db";
import { computePayPeriod } from "@/lib/pay-period";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CategoryTotalsPanel } from "@/components/expenses/category-totals-panel";
import { CategoriesClient } from "@/app/(app)/settings/budget/categories/categories-client";
import { BarChart3, Tag } from "lucide-react";

export const metadata: Metadata = { title: "Categories | Yosan AI" };

export default async function CategoriesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const budgetId = await getActiveBudgetId(session.userId);
  if (!budgetId) redirect("/dashboard");

  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    include: { incomeSources: { where: { isActive: true } } },
  });

  const primarySource = budget?.incomeSources[0] ?? null;
  const payPeriod = primarySource
    ? computePayPeriod(primarySource.frequency, primarySource.nextPayDate, primarySource.amount, primarySource.customDays)
    : null;

  const periodStart = payPeriod?.start ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const periodEnd = payPeriod?.end ?? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Categories</h1>
        <p className="text-muted-foreground text-sm mt-1">Spending breakdown and category management</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Totals */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Spending This Period</CardTitle>
            </div>
            <CardDescription className="text-xs">
              {periodStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
              {periodEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <CategoryTotalsPanel
              budgetId={budgetId}
              periodStart={periodStart.toISOString()}
              periodEnd={periodEnd.toISOString()}
            />
          </CardContent>
        </Card>

        {/* Categories management */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Manage Categories</CardTitle>
            </div>
            <CardDescription className="text-xs">Add, edit, or reorganize your category hierarchy</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoriesClient budgetId={budgetId} isAdmin={session.role === "ADMIN"} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
