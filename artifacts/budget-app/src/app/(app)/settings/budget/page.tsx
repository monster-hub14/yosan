import { Metadata } from "next";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requireBudgetAccess } from "@/lib/auth/permissions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Inbox, Wallet } from "lucide-react";

export const metadata: Metadata = {
  title: "Budget Settings | Budget",
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

  const access = await requireBudgetAccess(session, budget.id, "MEMBER");
  if (access instanceof NextResponse) {
    redirect("/dashboard");
  }

  const forwardingAddress = `receipts+${budget.id.slice(0, 8)}@your-domain`;

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
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Inbox className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle>Receipt Forwarding Address</CardTitle>
                <Badge variant="secondary" className="text-xs">Coming soon</Badge>
              </div>
              <CardDescription>
                Forward email receipts directly to this budget
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Once receipt ingestion is configured at the instance level, forward
            email receipts to the address below. The AI will parse each receipt
            and create a pending expense in this budget for your review.
          </p>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Your forwarding address
            </p>
            <code className="block text-xs bg-muted px-3 py-2 rounded font-mono text-foreground">
              {forwardingAddress}
            </code>
          </div>
          <p className="text-xs text-muted-foreground">
            Configure inbound email and your domain in{" "}
            <a href="/settings/email" className="underline hover:text-foreground">
              Instance &rsaquo; Email
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
