"use client";

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SubcategoryGroup } from "./use-reports";
import { fmtCurrency, truncLabel } from "./use-reports";

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: SubcategoryGroup }>;
}

function SubTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold mb-1">{d.name}</p>
      <p className="tabular-nums text-foreground">{fmtCurrency(d.amount)}</p>
      <p className="text-muted-foreground text-xs">{d.percentage.toFixed(1)}% of total</p>
    </div>
  );
}

interface BarTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: SubcategoryGroup }>;
  label?: string;
}

function BarTooltip({ active, payload, label }: BarTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold mb-1">{d.name}</p>
      <p className="tabular-nums text-foreground">{fmtCurrency(d.amount)}</p>
      <p className="text-muted-foreground text-xs">{d.percentage.toFixed(1)}% of total</p>
    </div>
  );
}

interface SubcategoryChartsProps {
  groups: SubcategoryGroup[];
}

const RADIAN = Math.PI / 180;
function renderCustomLabel({
  cx, cy, midAngle, innerRadius, outerRadius, percentage,
}: {
  cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percentage: number;
}) {
  if (percentage < 5) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {percentage.toFixed(0)}%
    </text>
  );
}

export function SubcategoryCharts({ groups }: SubcategoryChartsProps) {
  if (groups.length === 0) {
    return (
      <Card className="border-border">
        <CardHeader className="pb-2"><CardTitle className="text-base">Spending Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
            No expenses in this period
          </div>
        </CardContent>
      </Card>
    );
  }

  const barData = [...groups].sort((a, b) => b.amount - a.amount);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Pie chart */}
      <Card className="border-border">
        <CardHeader className="pb-2"><CardTitle className="text-base">Spending by Subcategory</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={groups}
                dataKey="amount"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                labelLine={false}
                label={renderCustomLabel}
              >
                {groups.map((g, i) => (
                  <Cell key={g.name} fill={g.color ?? "#6366f1"} />
                ))}
              </Pie>
              <Tooltip content={<SubTooltip />} />
              <Legend
                formatter={v => <span style={{ color: "hsl(var(--foreground))", fontSize: 12 }}>{truncLabel(v, 20)}</span>}
                wrapperStyle={{ paddingTop: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Horizontal bar chart — sorted highest to lowest */}
      <Card className="border-border">
        <CardHeader className="pb-2"><CardTitle className="text-base">Top Subcategories</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <ResponsiveContainer width="100%" height={Math.max(200, barData.length * 36 + 32)}>
            <BarChart
              data={barData}
              layout="vertical"
              margin={{ top: 4, right: 60, left: 8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={v => "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0))}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tickFormatter={v => truncLabel(v, 16)}
                tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<BarTooltip />} cursor={{ fill: "hsl(var(--muted))", radius: 4 }} />
              <Bar
                dataKey="amount"
                radius={[0, 4, 4, 0]}
                maxBarSize={24}
              >
                {barData.map(g => (
                  <Cell key={g.name} fill={g.color ?? "#6366f1"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
