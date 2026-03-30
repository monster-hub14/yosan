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

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{daysElapsed}d elapsed</span>
            <span>{daysRemaining}d remaining</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-right">{progress.toFixed(0)}% through period</p>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Next paycheck</p>
              <p className="text-sm font-semibold">{formatDate(nextPayDate)}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Period income</p>
            <p className="text-sm font-semibold text-emerald-400">
              {formatCurrency(periodIncome, currency)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
