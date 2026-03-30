import { Metadata } from "next";
import { Receipt } from "lucide-react";

export const metadata: Metadata = { title: "Receipts | Budget" };

export default function ReceiptsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
      <Receipt className="w-10 h-10 text-muted-foreground/50" />
      <div>
        <h2 className="text-xl font-semibold">Receipts</h2>
        <p className="text-muted-foreground text-sm mt-1">
          AI-powered receipt scanning is coming in the next update.
        </p>
      </div>
    </div>
  );
}
