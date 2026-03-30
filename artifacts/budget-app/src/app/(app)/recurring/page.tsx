import { Metadata } from "next";
import { RefreshCw } from "lucide-react";

export const metadata: Metadata = { title: "Recurring Bills | Budget" };

export default function RecurringPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
      <RefreshCw className="w-10 h-10 text-muted-foreground/50" />
      <div>
        <h2 className="text-xl font-semibold">Recurring Bills</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Manage subscriptions and recurring expenses. Coming in the next update.
        </p>
      </div>
    </div>
  );
}
