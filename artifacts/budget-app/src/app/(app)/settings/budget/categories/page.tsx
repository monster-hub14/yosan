import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveBudgetId } from "@/lib/active-budget";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tag } from "lucide-react";
import { CategoriesClient } from "./categories-client";

export const metadata: Metadata = { title: "Categories | Settings | Yosan AI" };

export default async function CategoriesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const budgetId = await getActiveBudgetId(session.userId);
  if (!budgetId) redirect("/dashboard");

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Tag className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>Expense Categories</CardTitle>
              <CardDescription>Manage your budget&apos;s category hierarchy</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CategoriesClient budgetId={budgetId} isAdmin={session.role === "ADMIN"} />
        </CardContent>
      </Card>
    </div>
  );
}
