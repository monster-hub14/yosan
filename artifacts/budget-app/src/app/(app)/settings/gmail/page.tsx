import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getActiveBudgetId } from "@/lib/active-budget";
import { GmailSettingsClient } from "./gmail-settings-client";

export const metadata: Metadata = {
  title: "Gmail Import | Yosan AI",
};

export default async function GmailSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

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
    <GmailSettingsClient
      budgets={budgets}
      defaultBudgetId={activeBudgetId ?? budgets[0]?.id}
    />
  );
}
