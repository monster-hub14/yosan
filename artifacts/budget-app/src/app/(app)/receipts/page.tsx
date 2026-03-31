import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveBudgetId } from "@/lib/active-budget";
import { ReceiptsLanding } from "./receipts-landing";

export const metadata: Metadata = { title: "Receipts | Yosan AI" };

export default async function ReceiptsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const activeBudgetId = await getActiveBudgetId(session.userId);

  return <ReceiptsLanding defaultBudgetId={activeBudgetId ?? undefined} />;
}
