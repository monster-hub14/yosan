import { Metadata } from "next";
import { PiggyBank } from "lucide-react";

export const metadata: Metadata = { title: "Savings | Budget" };

export default function SavingsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
      <PiggyBank className="w-10 h-10 text-muted-foreground/50" />
      <div>
        <h2 className="text-xl font-semibold">Savings Goals</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Savings goal tracking is coming in the next update.
        </p>
      </div>
    </div>
  );
}
