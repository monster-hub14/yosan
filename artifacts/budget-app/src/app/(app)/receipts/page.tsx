import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ReceiptsLanding } from "./receipts-landing";

export const metadata: Metadata = { title: "Receipts | Yosan AI" };

export default async function ReceiptsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const firstMembership = await db.budgetMembership.findFirst({
    where: { userId: session.userId },
    select: { budgetId: true },
    orderBy: { createdAt: "asc" },
  });

  return <ReceiptsLanding defaultBudgetId={firstMembership?.budgetId} />;
}
