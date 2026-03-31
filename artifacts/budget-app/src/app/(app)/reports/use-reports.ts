"use client";

import { useState, useEffect, useRef } from "react";

export interface ExpenseRow {
  id: string;
  date: string;
  description: string | null;
  merchant: string | null;
  amount: number;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  parentCategoryId: string | null;
  parentCategoryName: string | null;
}

export interface ReportSummary {
  income: number;
  expenses: number;
  net: number;
  saved: number;
}

export interface PeriodBounds {
  start: string;
  end: string;
}

export interface TimeSeriesPoint {
  key: string;
  label: string;
  amount: number;
}

export interface ReportsData {
  summary: ReportSummary;
  expenseRows: ExpenseRow[];
  timeSeries: TimeSeriesPoint[];
  payPeriod: PeriodBounds | null;
  lastPayPeriod: PeriodBounds | null;
  dateRange: PeriodBounds;
}

export function useReports(budgetId: string, dateRange: PeriodBounds) {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!budgetId || !dateRange.start || !dateRange.end) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ start: dateRange.start, end: dateRange.end });

    fetch(`/api/budgets/${budgetId}/reports?${params}`, { signal: ctrl.signal })
      .then(res => {
        if (!res.ok) throw new Error("Failed to load report");
        return res.json() as Promise<ReportsData>;
      })
      .then(d => {
        if (!ctrl.signal.aborted) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(err => {
        if (err.name !== "AbortError") {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      });

    return () => ctrl.abort();
  }, [budgetId, dateRange.start, dateRange.end]);

  return { data, loading, error };
}

export type SubcategoryGroup = {
  name: string;
  amount: number;
  percentage: number;
  color?: string;
};

const CHART_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6",
  "#8b5cf6", "#f97316", "#14b8a6", "#ec4899", "#84cc16",
  "#a78bfa", "#fb923c",
];

export function buildSubcategoryGroups(rows: ExpenseRow[], topN = 10): SubcategoryGroup[] {
  const totals = new Map<string, { amount: number; color?: string }>();

  for (const row of rows) {
    const label = row.categoryName ?? "Uncategorized";
    const existing = totals.get(label);
    if (existing) {
      existing.amount += row.amount;
    } else {
      totals.set(label, { amount: row.amount, color: row.categoryColor ?? undefined });
    }
  }

  const sorted = Array.from(totals.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.amount - a.amount);

  const total = sorted.reduce((s, g) => s + g.amount, 0);

  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const otherAmount = rest.reduce((s, g) => s + g.amount, 0);

  const result: SubcategoryGroup[] = top.map((g, i) => ({
    name: g.name,
    amount: g.amount,
    percentage: total > 0 ? (g.amount / total) * 100 : 0,
    color: g.color || CHART_COLORS[i % CHART_COLORS.length],
  }));

  if (otherAmount > 0) {
    result.push({
      name: "Other",
      amount: otherAmount,
      percentage: total > 0 ? (otherAmount / total) * 100 : 0,
      color: "#94a3b8",
    });
  }

  return result;
}


export function fmtCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export function truncLabel(s: string, max = 18): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
