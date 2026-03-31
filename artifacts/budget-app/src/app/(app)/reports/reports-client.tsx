"use client";

import { useState, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useReports, buildSubcategoryGroups } from "./use-reports";
import { DateRangeBar } from "./date-range-bar";
import { SummaryCards } from "./summary-cards";
import { OverviewChart } from "./overview-chart";
import { SubcategoryCharts } from "./subcategory-charts";
import { TrendChart } from "./trend-chart";
import { InsightsPanel } from "./insights-panel";
import { ExpenseTable } from "./expense-table";

interface DateRangeState {
  start: string;
  end: string;
  preset: string;
}

function getInitialDateRange(): DateRangeState {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { start, end, preset: "this-month" };
}

interface ReportsClientProps {
  budgetId: string;
}

export function ReportsClient({ budgetId }: ReportsClientProps) {
  const [dateRange, setDateRange] = useState<DateRangeState>(getInitialDateRange);

  const { data, loading, error } = useReports(budgetId, { start: dateRange.start, end: dateRange.end });

  const subcategoryGroups = useMemo(
    () => (data ? buildSubcategoryGroups(data.expenseRows) : []),
    [data]
  );

  const timeSeries = data?.timeSeries ?? [];

  return (
    <div className="space-y-6">
      {/* Date range bar */}
      <DateRangeBar
        value={dateRange}
        onChange={setDateRange}
        payPeriod={data?.payPeriod ?? null}
        lastPayPeriod={data?.lastPayPeriod ?? null}
      />

      {/* Loading / error states */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading report…</span>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          {/* Summary cards */}
          <SummaryCards summary={data.summary} />

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <OverviewChart summary={data.summary} />
            <TrendChart
              series={timeSeries}
              start={data.dateRange.start}
              end={data.dateRange.end}
            />
          </div>

          {/* Subcategory charts */}
          <SubcategoryCharts groups={subcategoryGroups} />

          {/* Insights + Table */}
          <InsightsPanel summary={data.summary} groups={subcategoryGroups} />

          {/* Expense table */}
          <ExpenseTable rows={data.expenseRows} dateRange={{ start: dateRange.start, end: dateRange.end }} />
        </div>
      )}
    </div>
  );
}
