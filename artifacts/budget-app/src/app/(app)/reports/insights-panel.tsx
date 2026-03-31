"use client";

import { Lightbulb, AlertTriangle, TrendingUp, TrendingDown, PiggyBank } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReportSummary, SubcategoryGroup } from "./use-reports";
import { fmtCurrency } from "./use-reports";

interface Insight {
  icon: typeof Lightbulb;
  text: string;
  severity: "info" | "warning" | "positive";
}

function buildInsights(
  summary: ReportSummary,
  groups: SubcategoryGroup[]
): Insight[] {
  const insights: Insight[] = [];
  const { income, expenses, net, saved } = summary;

  if (expenses === 0) {
    insights.push({ icon: Lightbulb, text: "No expenses recorded in this period.", severity: "info" });
    return insights;
  }

  // Top spending category
  if (groups.length > 0) {
    const top = groups[0];
    const pctOfExpenses = expenses > 0 ? (top.amount / expenses) * 100 : 0;
    const pctOfIncome = income > 0 ? (top.amount / income) * 100 : 0;
    insights.push({
      icon: TrendingDown,
      text: `Your top spending category is ${top.name} at ${fmtCurrency(top.amount)} (${pctOfExpenses.toFixed(0)}% of all expenses${income > 0 ? `, ${pctOfIncome.toFixed(0)}% of income` : ""}).`,
      severity: pctOfIncome > 30 ? "warning" : "info",
    });
  }

  // Category consuming too much income
  if (income > 0) {
    for (const g of groups) {
      if (g.name === "Other") continue;
      const pct = (g.amount / income) * 100;
      if (pct >= 30) {
        insights.push({
          icon: AlertTriangle,
          text: `${g.name} is using ${pct.toFixed(0)}% of your income this period (${fmtCurrency(g.amount)}). Consider reviewing this area.`,
          severity: "warning",
        });
        break;
      }
    }
  }

  // Net / savings
  if (net < 0 && income > 0) {
    insights.push({
      icon: AlertTriangle,
      text: `You spent ${fmtCurrency(Math.abs(net))} more than you earned this period. Total income: ${fmtCurrency(income)}, total expenses: ${fmtCurrency(expenses)}.`,
      severity: "warning",
    });
  } else if (net >= 0 && income > 0) {
    const pct = (saved / income) * 100;
    insights.push({
      icon: PiggyBank,
      text: `You saved ${fmtCurrency(saved)} this period — ${pct.toFixed(0)}% of your income. ${pct >= 20 ? "Great work!" : "Try to aim for 20%+ in savings."}`,
      severity: pct >= 20 ? "positive" : "info",
    });
  }

  // Discretionary spending note
  if (expenses > 0) {
    const discretionary = ["Dining", "Entertainment", "Shopping", "Recreation", "Coffee", "Takeout", "Fast Food", "Gaming", "Delivery"];
    const discGroups = groups.filter(g => discretionary.some(d => g.name.toLowerCase().includes(d.toLowerCase())));
    const discTotal = discGroups.reduce((s, g) => s + g.amount, 0);
    if (discTotal > 0 && income > 0) {
      const pct = (discTotal / income) * 100;
      insights.push({
        icon: Lightbulb,
        text: `Discretionary categories (dining, entertainment, etc.) account for ${fmtCurrency(discTotal)} — ${pct.toFixed(0)}% of your income this period.`,
        severity: pct > 25 ? "warning" : "info",
      });
    }
  }

  return insights.slice(0, 5);
}

interface InsightsPanelProps {
  summary: ReportSummary;
  groups: SubcategoryGroup[];
}

export function InsightsPanel({ summary, groups }: InsightsPanelProps) {
  const insights = buildInsights(summary, groups);

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-1.5">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          Insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {insights.map((ins, i) => {
            const Icon = ins.icon;
            return (
              <li key={i} className="flex items-start gap-2.5">
                <div
                  className={cn(
                    "mt-0.5 p-1 rounded-md shrink-0",
                    ins.severity === "warning" && "bg-amber-500/10",
                    ins.severity === "positive" && "bg-emerald-500/10",
                    ins.severity === "info" && "bg-muted",
                  )}
                >
                  <Icon
                    className={cn(
                      "w-3.5 h-3.5",
                      ins.severity === "warning" && "text-amber-500",
                      ins.severity === "positive" && "text-emerald-500",
                      ins.severity === "info" && "text-muted-foreground",
                    )}
                  />
                </div>
                <p className="text-sm leading-relaxed text-foreground">{ins.text}</p>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
