"use client";

import { motion } from "framer-motion";
import { Calendar, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface PayPeriodCardProps {
  periodStart: string;
  periodEnd: string;
  nextPayDate: string;
  daysElapsed: number;
  daysInPeriod: number;
  daysRemaining: number;
  periodIncome: number;
  currency: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const MILESTONES = [25, 50, 75];

export default function PayPeriodCard({
  periodStart,
  periodEnd,
  nextPayDate,
  daysElapsed,
  daysInPeriod,
  daysRemaining,
  periodIncome,
  currency,
}: PayPeriodCardProps) {
  const progress = daysInPeriod > 0 ? Math.min((daysElapsed / daysInPeriod) * 100, 100) : 0;

  return (
    <Card className="border-border">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Pay Period</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDate(periodStart)} – {formatDate(periodEnd)}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{daysElapsed}d elapsed</span>
            <span>{daysRemaining}d remaining</span>
          </div>

          {/* Progress bar with gradient and milestone ticks */}
          <div className="relative">
            {/* Milestone ticks above bar */}
            <div className="relative h-3 mb-0.5">
              {MILESTONES.map((pct) => (
                <motion.div
                  key={pct}
                  className="absolute top-0 w-px h-2 rounded-full"
                  style={{
                    left: `${pct}%`,
                    background:
                      progress >= pct
                        ? "hsl(var(--primary) / 0.7)"
                        : "hsl(var(--muted-foreground) / 0.3)",
                  }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.4, delay: 0.6 + pct * 0.004 }}
                />
              ))}
            </div>

            {/* Progress track */}
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, hsl(var(--primary) / 0.6) 0%, hsl(var(--primary)) 60%, hsl(var(--primary) / 0.85) 100%)",
                }}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94] }}
              />
            </div>

            {/* Milestone labels */}
            <div className="relative h-4 mt-0.5">
              {MILESTONES.map((pct) => (
                <span
                  key={pct}
                  className="absolute text-[9px] text-muted-foreground/60"
                  style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
                >
                  {pct}%
                </span>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-right">
            {progress.toFixed(0)}% through period
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-0.5">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Next paycheck</p>
              <p className="text-sm font-semibold">{formatDate(nextPayDate)}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Period income</p>
            <p
              className="text-sm font-semibold"
              style={{ color: "hsl(var(--status-healthy-hsl))" }}
            >
              {formatCurrency(periodIncome, currency)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
