"use client";

import { useEffect, useRef } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import type { SpendStatus } from "@/lib/safe-to-spend";

interface SafeToSpendWidgetProps {
  amount: number;
  status: SpendStatus;
  currency: string;
  daysRemaining: number;
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

export default function SafeToSpendWidget({
  amount,
  status,
  currency,
  daysRemaining,
}: SafeToSpendWidgetProps) {
  const spring = useSpring(0, { stiffness: 80, damping: 20 });
  const display = useTransform(spring, (v) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(v))
  );

  const prevAmount = useRef(0);

  useEffect(() => {
    spring.set(amount);
    prevAmount.current = amount;
  }, [amount, spring]);

  const statusColors = {
    "on-track": {
      text: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      dot: "bg-emerald-500",
      label: "On track",
      labelColor: "text-emerald-400",
    },
    caution: {
      text: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      dot: "bg-amber-500",
      label: "Caution",
      labelColor: "text-amber-400",
    },
    "at-risk": {
      text: "text-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
      dot: "bg-rose-500",
      label: "At risk",
      labelColor: "text-rose-400",
    },
  } as const;

  const colors = statusColors[status];

  return (
    <motion.div
      key={status}
      initial={{ opacity: 0.8, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "rounded-2xl border p-6 flex flex-col gap-3",
        colors.bg,
        colors.border
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Safe to spend today
        </p>
        <span className={cn("flex items-center gap-1.5 text-xs font-medium", colors.labelColor)}>
          <span className={cn("w-1.5 h-1.5 rounded-full inline-block", colors.dot)} />
          {colors.label}
        </span>
      </div>

      <div className={cn("text-5xl font-black tabular-nums tracking-tight", colors.text)}>
        {amount < 0 && <span>−</span>}
        <motion.span>{display}</motion.span>
        <span className="text-xl font-semibold text-muted-foreground ml-1">/day</span>
      </div>

      <p className="text-sm text-muted-foreground">
        {daysRemaining === 1
          ? "1 day remaining in pay period"
          : `${daysRemaining} days remaining in pay period`}
      </p>
    </motion.div>
  );
}
