import { Metadata } from "next";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requireBudgetRead } from "@/lib/auth/permissions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet } from "lucide-react";
import { EmailForwardingPanel } from "./email-forwarding-panel";
import { AdditionalNotificationEmailsPanel } from "./additional-notification-emails-panel";

export const metadata: Metadata = {
  title: "Budget Settings | Yosan AI",
};

export default async function BudgetSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const budget = await db.budget.findFirst({
    where: {
      OR: [
        { ownerId: session.userId },
        { memberships: { some: { userId: session.userId } } },
      ],
    },
    include: {
      _count: {
        select: {
          memberships: true,
          expenses: true,
          incomeSources: true,
        },
      },
    },
  });

  if (!budget) {
    return (
      <div className="max-w-xl">
        <Card className="border-border">
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No budget found. Complete the setup wizard to create your first budget.
          </CardContent>
        </Card>
      </div>
    );
  }

  const access = await requireBudgetRead(session, budget.id);
  if (access instanceof NextResponse) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6 max-w-xl">
      {/* Budget overview */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>{budget.name}</CardTitle>
              <CardDescription>Budget overview and settings</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Currency
              </p>
              <Badge variant="secondary">{budget.currency}</Badge>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Members
              </p>
              <p className="text-sm font-medium">{budget._count.memberships + 1}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Income Sources
              </p>
              <p className="text-sm font-medium">{budget._count.incomeSources}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Total Expenses
              </p>
              <p className="text-sm font-medium">{budget._count.expenses}</p>
            </div>
          </div>
          {budget.description && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Description
              </p>
              <p className="text-sm">{budget.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receipt forwarding (budget-level) */}
      <EmailForwardingPanel budgetId={budget.id} />

      {/* Additional notification email addresses */}
      <AdditionalNotificationEmailsPanel
        budgetId={budget.id}
        initialEmails={(() => {
          try {
            const parsed: unknown = JSON.parse(budget.additionalNotificationEmails);
            return Array.isArray(parsed) ? (parsed as string[]) : [];
          } catch { return []; }
        })()}
      />
    </div>
  );
}
