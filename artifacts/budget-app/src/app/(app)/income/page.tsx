import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveBudgetId } from "@/lib/active-budget";
import { db } from "@/lib/db";
import IncomePage from "./IncomePage";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Wallet } from "lucide-react";

export const metadata: Metadata = { title: "Income | Yosan AI" };

export default async function IncomePageWrapper() {
  const session = await getSession();
  if (!session) redirect("/login");

  const budgetId = await getActiveBudgetId(session.userId);

  if (!budgetId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <Wallet className="w-12 h-12 text-muted-foreground" />
        <div>
          <h2 className="text-xl font-semibold">No budget selected</h2>
          <p className="text-muted-foreground text-sm mt-1">Create or join a budget to manage income.</p>
        </div>
        {session.role === "ADMIN" && (
          <Button asChild><Link href="/budgets/new">Create budget</Link></Button>
        )}
      </div>
    );
  }

  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    select: { currency: true },
  });

  return <IncomePage budgetId={budgetId} currency={budget?.currency ?? "USD"} />;
}
