"use client";

import { TrendingUp, TrendingDown, DollarSign, PiggyBank } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReportSummary } from "./use-reports";
import { fmtCurrency } from "./use-reports";

interface SummaryCardsProps {
  summary: ReportSummary;
  currency?: string;
}

export function SummaryCards({ summary, currency = "USD" }: SummaryCardsProps) {
  const netPositive = summary.net >= 0;

  const cards = [
    {
      label: "Total Income",
      value: fmtCurrency(summary.income, currency),
      icon: TrendingUp,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Total Expenses",
      value: fmtCurrency(summary.expenses, currency),
      icon: TrendingDown,
      color: "text-rose-500",
      bg: "bg-rose-500/10",
    },
    {
      label: "Net",
      value: (netPositive ? "+" : "") + fmtCurrency(summary.net, currency),
      icon: DollarSign,
      color: netPositive ? "text-emerald-500" : "text-rose-500",
      bg: netPositive ? "bg-emerald-500/10" : "bg-rose-500/10",
    },
    {
      label: "Saved (snapshot)",
      value: fmtCurrency(summary.saved, currency),
      icon: PiggyBank,
      color: "text-violet-500",
      bg: "bg-violet-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <Card key={card.label} className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
                  <p className={cn("text-lg font-bold tabular-nums", card.color)}>{card.value}</p>
                </div>
                <div className={cn("p-2 rounded-lg shrink-0", card.bg)}>
                  <Icon className={cn("w-4 h-4", card.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
