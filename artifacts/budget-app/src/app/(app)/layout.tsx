import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveBudgetId } from "@/lib/active-budget";
import AppSidebar from "@/components/layout/AppSidebar";
import AppHeader from "@/components/layout/AppHeader";
import { UploadFAB } from "@/components/receipts/upload-fab";
import { LoginReceiptPrompt } from "@/components/receipts/login-receipt-prompt";

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
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar user={session} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <AppHeader user={session} activeBudgetId={activeBudgetId} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <UploadFAB />
      <LoginReceiptPrompt />
    </div>
  );
}
