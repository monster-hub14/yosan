import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveBudgetId } from "@/lib/active-budget";
import AppShell from "@/components/layout/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const activeBudgetId = await getActiveBudgetId(session.userId);

  return (
    <AppShell user={session} activeBudgetId={activeBudgetId}>
      {children}
    </AppShell>
  );
}
