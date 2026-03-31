"use client";

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TimeSeriesPoint } from "./use-reports";
import { fmtCurrency } from "./use-reports";

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function TrendTooltip({ active, payload, label }: TrendTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      <p className="font-semibold tabular-nums">{fmtCurrency(payload[0].value)}</p>
    </div>
  );
}

interface TrendChartProps {
  series: TimeSeriesPoint[];
  start: string;
  end: string;
}

export function TrendChart({ series, start, end }: TrendChartProps) {
  const days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000);
  const useLine = days > 90;

  const hasData = series.some(p => p.amount > 0);

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Spending Over Time
          <span className="text-xs font-normal text-muted-foreground ml-2">
            {days <= 14 ? "(daily)" : days <= 90 ? "(weekly)" : "(monthly)"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
            No expenses in this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            {useLine ? (
              <LineChart data={series} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={v => "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0))}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <Tooltip content={<TrendTooltip />} />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            ) : (
              <BarChart data={series} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={days <= 14 ? 0 : "preserveStartEnd"}
                  angle={days <= 14 ? -30 : 0}
                  textAnchor={days <= 14 ? "end" : "middle"}
                  height={days <= 14 ? 40 : 20}
                />
                <YAxis
                  tickFormatter={v => "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0))}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <Tooltip content={<TrendTooltip />} cursor={{ fill: "hsl(var(--muted))", radius: 4 }} />
                <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
