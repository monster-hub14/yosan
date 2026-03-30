import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveBudgetId } from "@/lib/active-budget";
import { db } from "@/lib/db";
import BudgetMembersPage from "./BudgetMembersPage";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Lock } from "lucide-react";

export const metadata: Metadata = { title: "Budget Members | Budget" };

export default async function BudgetMembersServerPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const budgetId = await getActiveBudgetId(session.userId);

  if (!budgetId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <Lock className="w-12 h-12 text-muted-foreground" />
        <div>
          <h2 className="text-xl font-semibold">No budget selected</h2>
          <p className="text-muted-foreground text-sm mt-1">Create a budget first to manage members.</p>
        </div>
        <Button asChild><Link href="/budgets/new">Create budget</Link></Button>
      </div>
    );
  }

  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    include: {
      memberships: { include: { user: { select: { id: true, name: true, email: true } } } },
      soloShares: { where: { isActive: true }, include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });

  if (!budget) redirect("/dashboard");

  const allUsers = await db.user.findMany({
    where: { id: { not: session.userId } },
    select: { id: true, name: true, email: true },
  });

  return (
    <BudgetMembersPage
      budget={{
        id: budget.id,
        name: budget.name,
        budgetType: budget.budgetType,
        ownerId: budget.ownerId,
      }}
      shares={budget.memberships.map((s) => ({
        id: s.id,
        role: s.role,
        user: s.user,
      }))}
      soloShares={budget.soloShares.map((s) => ({
        id: s.id,
        userId: s.userId ?? "",
        role: s.role,
        user: s.user ?? { id: "", name: "Unknown", email: "" },
      }))}
      availableUsers={allUsers}
    />
  );
}
