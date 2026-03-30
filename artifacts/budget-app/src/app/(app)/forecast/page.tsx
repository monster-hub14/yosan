import { Metadata } from "next";
import { Sparkles } from "lucide-react";

export const metadata: Metadata = { title: "Forecast | Budget" };

export default function ForecastPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
      <Sparkles className="w-10 h-10 text-muted-foreground/50" />
      <div>
        <h2 className="text-xl font-semibold">AI Forecast</h2>
        <p className="text-muted-foreground text-sm mt-1">
          AI-powered financial forecasting and projections. Coming in the next update.
        </p>
      </div>
    </div>
  );
}
