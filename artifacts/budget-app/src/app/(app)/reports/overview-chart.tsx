"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReportSummary } from "./use-reports";
import { fmtCurrency } from "./use-reports";

interface OverviewChartProps {
  summary: ReportSummary;
  currency?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold tabular-nums">{fmtCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function OverviewChart({ summary, currency = "USD" }: OverviewChartProps) {
  const data = [
    {
      name: "Period",
      Income: summary.income,
      Expenses: summary.expenses,
      Saved: summary.saved,
    },
  ];

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Income vs Expenses vs Saved</CardTitle>
      </CardHeader>
      <CardContent>
        {summary.income === 0 && summary.expenses === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
            No data for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" hide />
              <YAxis
                tickFormatter={v => fmtCurrency(v, currency).replace(/\.00$/, "")}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={72}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", radius: 4 }} />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                formatter={v => <span style={{ color: "hsl(var(--foreground))" }}>{v}</span>}
              />
              <Bar dataKey="Income" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={80} />
              <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={80} />
              <Bar dataKey="Saved" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={80} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
