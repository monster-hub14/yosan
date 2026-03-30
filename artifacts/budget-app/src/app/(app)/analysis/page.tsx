import { Metadata } from "next";
import { LineChart } from "lucide-react";

export const metadata: Metadata = { title: "Analysis | Budget" };

export default function AnalysisPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
      <LineChart className="w-10 h-10 text-muted-foreground/50" />
      <div>
        <h2 className="text-xl font-semibold">Spending Analysis</h2>
        <p className="text-muted-foreground text-sm mt-1">
          AI-powered spending insights and trend analysis. Coming in the next update.
        </p>
      </div>
    </div>
  );
}
