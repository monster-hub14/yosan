import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getActiveBudgetId } from "@/lib/active-budget";
import { GmailOAuthForm } from "./gmail-oauth-form";

export const metadata: Metadata = {
  title: "Gmail OAuth Config | Yosan AI",
};

export default async function GmailOAuthPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const [budgets, activeBudgetId] = await Promise.all([
    db.budget.findMany({
      where: {
        OR: [
          { ownerId: session.userId },
          { memberships: { some: { userId: session.userId } } },
        ],
      },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    getActiveBudgetId(session.userId),
  ]);

  return (
    <GmailOAuthForm
      budgets={budgets}
      defaultBudgetId={activeBudgetId ?? budgets[0]?.id}
    />
  );
}
