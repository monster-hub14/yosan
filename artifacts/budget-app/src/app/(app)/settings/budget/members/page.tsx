import { Metadata } from "next";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requireBudgetAccess } from "@/lib/auth/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Budget Members | Settings | Budget",
};

export default async function BudgetMembersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const budget = await db.budget.findFirst({
    where: {
      OR: [
        { ownerId: session.userId },
        { memberships: { some: { userId: session.userId } } },
      ],
    },
    select: { id: true },
  });

  if (budget) {
    const access = await requireBudgetAccess(session, budget.id, "MEMBER");
    if (access instanceof NextResponse) redirect("/dashboard");
  }

  return (
    <div className="space-y-6 max-w-xl">
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Users className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>Budget Members</CardTitle>
              <CardDescription>Manage who can access this budget</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Member management features are coming soon. You can invite users from
            the Users settings page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
