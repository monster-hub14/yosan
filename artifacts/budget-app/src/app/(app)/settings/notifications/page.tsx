import { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell } from "lucide-react";

export const metadata: Metadata = {
  title: "Notifications | Settings | Budget",
};

export default function NotificationsPage() {
  return (
    <div className="space-y-6 max-w-xl">
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Bell className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Manage how you receive alerts and updates</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Notification preferences will be available in a future update.
            Configure email notifications by setting up SMTP in the Instance settings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
