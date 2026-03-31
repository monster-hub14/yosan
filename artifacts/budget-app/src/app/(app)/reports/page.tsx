import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveBudgetId } from "@/lib/active-budget";
import { ReportsClient } from "./reports-client";

export const metadata: Metadata = { title: "Reports | Yosan AI" };

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const budgetId = await getActiveBudgetId(session.userId);
  if (!budgetId) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Custom date-range analytics, spending breakdowns, and CSV export.
        </p>
      </div>

      <ReportsClient budgetId={budgetId} />
    </div>
  );
}
