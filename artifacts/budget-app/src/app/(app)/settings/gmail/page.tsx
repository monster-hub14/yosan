import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { GmailSettingsClient } from "./gmail-settings-client";

export const metadata: Metadata = {
  title: "Gmail Import | Yosan AI",
};

export default async function GmailSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const budgets = await import("@/lib/db").then(({ db }) =>
    db.budget.findMany({
      where: {
        OR: [
          { ownerId: session.userId },
          { memberships: { some: { userId: session.userId } } },
        ],
      },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    })
  );

  return <GmailSettingsClient budgets={budgets} />;
}
