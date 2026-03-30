import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveBudgetId } from "@/lib/active-budget";
import { db } from "@/lib/db";
import { ExpensesClient } from "./expenses-client";
import { CategoryTotalsPanel } from "@/components/expenses/category-totals-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Expenses | Budget" };

export default async function ExpensesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const budgetId = await getActiveBudgetId(session.userId);
  if (!budgetId) redirect("/dashboard");

  const categories = await db.category.findMany({
    where: { OR: [{ budgetId }, { isDefault: true }] },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, color: true, icon: true, parentId: true },
  });

  return (
    <div className="flex gap-6 h-full">
      {/* Main expenses list */}
      <div className="flex-1 min-w-0">
        <ExpensesClient budgetId={budgetId} initialCategories={categories} />
      </div>

      {/* Sidebar: category totals */}
      <div className="w-80 shrink-0 hidden xl:block">
        <Card className="sticky top-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Spending by Category</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <CategoryTotalsPanel budgetId={budgetId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
