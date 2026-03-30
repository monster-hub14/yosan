import { Metadata } from "next";
import { TrendingDown } from "lucide-react";

export const metadata: Metadata = { title: "Expenses | Budget" };

export default function ExpensesPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
      <TrendingDown className="w-10 h-10 text-muted-foreground/50" />
      <div>
        <h2 className="text-xl font-semibold">Expenses</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Expense management is coming in the next update.
        </p>
      </div>
    </div>
  );
}
