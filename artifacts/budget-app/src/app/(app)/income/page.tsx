import { Metadata } from "next";
import { TrendingUp } from "lucide-react";

export const metadata: Metadata = { title: "Income | Budget" };

export default function IncomePage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
      <TrendingUp className="w-10 h-10 text-muted-foreground/50" />
      <div>
        <h2 className="text-xl font-semibold">Income</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Income tracking is coming in the next update.
        </p>
      </div>
    </div>
  );
}
