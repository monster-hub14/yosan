import { Metadata } from "next";
import { BarChart3 } from "lucide-react";

export const metadata: Metadata = { title: "Reports | Yosan AI" };

export default function ReportsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
      <BarChart3 className="w-10 h-10 text-muted-foreground/50" />
      <div>
        <h2 className="text-xl font-semibold">Reports & Analytics</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Financial reports and AI-powered insights are coming in the next update.
        </p>
      </div>
    </div>
  );
}
