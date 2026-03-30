"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  CalendarDays,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  ChevronRight,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ForecastPoint {
  date: string;
  balance: number;
  isPayday: boolean;
  paydayAmount?: number;
  bills: { name: string; amount: number }[];
  isDangerZone: boolean;
}

interface ForecastResult {
  points: ForecastPoint[];
  dangerDays: number;
  minBalance: number;
  maxBalance: number;
  nextPaydates: string[];
  upcomingBills: { name: string; date: string; amount: number }[];
  aiSummary: string;
  generatedByAI: boolean;
  periodDays: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function shortDate(iso: string) {
  const [, month, day] = iso.split("-");
  return `${parseInt(month ?? "1")}/${parseInt(day ?? "1")}`;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg text-sm">
      <p className="font-medium">{label}</p>
      <p className={cn("font-semibold tabular-nums", val < 0 ? "text-red-500" : "text-green-600 dark:text-green-400")}>
        {fmt(val)}
      </p>
    </div>
  );
};

export function ForecastDashboard() {
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [days, setDays] = useState(42);

  const load = useCallback(async (d = days, showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const res = await fetch(`/api/analysis/forecast?days=${d}`);
      if (res.ok) {
        const data = await res.json() as { forecast: ForecastResult };
        setForecast(data.forecast);
      }
    } catch (err) {
      console.error("[forecast] load failed:", err);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  function changeDays(d: number) {
    setDays(d);
    load(d, true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Building cash flow projection…</span>
      </div>
    );
  }

  if (!forecast) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No forecast data available. Add an income source to get started.</p>
      </div>
    );
  }

  const chartData = forecast.points.map((p) => ({
    date: shortDate(p.date),
    balance: p.balance,
    isPayday: p.isPayday,
    hasBills: p.bills.length > 0,
    isDangerZone: p.isDangerZone,
  }));

  // Build danger zone ReferenceArea spans
  const dangerRanges: { start: string; end: string }[] = [];
  let rangeStart: string | null = null;
  for (const point of chartData) {
    if (point.isDangerZone && !rangeStart) {
      rangeStart = point.date;
    } else if (!point.isDangerZone && rangeStart) {
      dangerRanges.push({ start: rangeStart, end: point.date });
      rangeStart = null;
    }
  }
  if (rangeStart) {
    dangerRanges.push({ start: rangeStart, end: chartData[chartData.length - 1]?.date ?? rangeStart });
  }

  // Payday dates for vertical reference lines (limit to visible)
  const paydayDates = chartData
    .filter((p) => p.isPayday)
    .map((p) => p.date);

  // Bill dates for vertical reference lines
  const billDates = chartData
    .filter((p) => p.hasBills)
    .map((p) => p.date);

  const hasDanger = forecast.dangerDays > 0;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Cash Flow Forecast</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Projected balance for the next {days} days
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            {[14, 30, 42, 60].map((d) => (
              <button
                key={d}
                onClick={() => changeDays(d)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  d === days
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {d}d
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => load(days, true)}
            className="gap-1.5"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Min Balance</p>
            <p className={cn("text-xl font-bold tabular-nums", forecast.minBalance < 0 ? "text-red-600 dark:text-red-400" : "")}>
              {fmt(forecast.minBalance)}
            </p>
            {forecast.minBalance < 0 && (
              <p className="text-xs text-red-500 mt-1">Projected shortfall</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Danger Days</p>
            <p className={cn("text-xl font-bold tabular-nums", hasDanger ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400")}>
              {forecast.dangerDays}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{hasDanger ? "negative balance" : "all positive"}</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Next Payday</p>
            <p className="text-xl font-bold">
              {forecast.nextPaydates[0] ? shortDate(forecast.nextPaydates[0]) : "—"}
            </p>
            {forecast.nextPaydates[1] && (
              <p className="text-xs text-muted-foreground mt-1">then {shortDate(forecast.nextPaydates[1])}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Upcoming Bills</p>
            <p className="text-xl font-bold tabular-nums">{forecast.upcomingBills.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {forecast.upcomingBills.length > 0
                ? `Next: ${forecast.upcomingBills[0]?.name ?? ""}`
                : "none scheduled"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Balance Projection</CardTitle>
          <CardDescription className="text-xs">Estimated daily balance over the next {days} days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  interval={Math.floor(chartData.length / 6)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`}
                />
                <Tooltip content={<CustomTooltip />} />
                {/* Danger zone shaded regions */}
                {dangerRanges.map((range, i) => (
                  <ReferenceArea
                    key={`danger-${i}`}
                    x1={range.start}
                    x2={range.end}
                    fill="#ef4444"
                    fillOpacity={0.12}
                    strokeOpacity={0}
                  />
                ))}
                {/* Zero line */}
                <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} />
                {/* Payday vertical markers */}
                {paydayDates.map((d) => (
                  <ReferenceLine
                    key={`pay-${d}`}
                    x={d}
                    stroke="#22c55e"
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                    label={{ value: "Pay", position: "top", fontSize: 9, fill: "#22c55e" }}
                  />
                ))}
                {/* Bill vertical markers */}
                {billDates.map((d) => (
                  <ReferenceLine
                    key={`bill-${d}`}
                    x={d}
                    stroke="#f59e0b"
                    strokeDasharray="2 3"
                    strokeWidth={1}
                  />
                ))}
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#balanceGradient)"
                  dot={(props: { cx: number; cy: number; payload: { isPayday?: boolean } }) => {
                    if (!props.payload?.isPayday) return <></>;
                    return (
                      <circle
                        key={`dot-${props.cx}`}
                        cx={props.cx}
                        cy={props.cy}
                        r={4}
                        fill="#22c55e"
                        stroke="hsl(var(--background))"
                        strokeWidth={2}
                      />
                    );
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground justify-end">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary" /> Balance
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-px border-t-2 border-dashed border-green-500" />
              <span className="w-2 h-2 rounded-full bg-green-500" /> Payday
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-px border-t border-dashed border-amber-500" /> Bill due
            </span>
            {hasDanger && (
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-3 rounded-sm bg-red-500/20 border border-red-300/50" /> Low balance
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-px border-t-2 border-dashed border-red-500" /> Zero
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* AI Summary */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              {forecast.generatedByAI ? (
                <Sparkles className="w-4 h-4 text-violet-500" />
              ) : (
                <DollarSign className="w-4 h-4 text-muted-foreground" />
              )}
              <CardTitle className="text-sm">Cash Flow Outlook</CardTitle>
              {forecast.generatedByAI && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-300 text-violet-600 dark:text-violet-400">AI</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-relaxed">
            {forecast.aiSummary}
          </CardContent>
        </Card>

        {/* Upcoming bills + paydates */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              Upcoming Events
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {forecast.nextPaydates.slice(0, 3).map((d) => (
              <div key={`pay-${d}`} className="flex items-center justify-between py-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="font-medium text-green-700 dark:text-green-400">Payday</span>
                </div>
                <span className="text-muted-foreground">{d}</span>
              </div>
            ))}
            {forecast.upcomingBills.slice(0, 6).map((bill, i) => (
              <div key={`bill-${i}`} className="flex items-center justify-between py-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span className="truncate max-w-[180px]">{bill.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-muted-foreground text-xs">{bill.date}</span>
                  <span className="font-medium tabular-nums">{fmt(bill.amount)}</span>
                </div>
              </div>
            ))}
            {forecast.upcomingBills.length === 0 && forecast.nextPaydates.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">
                No upcoming events. Add income sources and recurring expenses to see them here.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {hasDanger && (
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-red-700 dark:text-red-300 mb-1">
              Projected negative balance on {forecast.dangerDays} day{forecast.dangerDays === 1 ? "" : "s"}
            </p>
            <p className="text-red-600 dark:text-red-400">
              Your balance may drop to {fmt(forecast.minBalance)}. Consider reducing discretionary spending or deferring large purchases until after your next paycheck.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
