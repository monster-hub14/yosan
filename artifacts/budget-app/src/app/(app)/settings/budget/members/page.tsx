import { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Budget Members | Settings | Budget",
};

export default function BudgetMembersPage() {
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
            Member management features are coming soon. You can invite users from the Users settings page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
