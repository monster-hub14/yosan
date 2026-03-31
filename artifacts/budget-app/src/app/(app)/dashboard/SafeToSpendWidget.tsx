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

const RING_R = 42;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;

const statusConfig = {
  "on-track": {
    label: "Looking good",
    subLabel: "You're on track — keep it up",
    healthFraction: 0.78,
    colorVar: "--status-healthy-hsl",
    bgVar: "--status-healthy-bg",
    borderVar: "--status-healthy-border",
    glowVar: "--status-healthy-glow",
    dotClass: "bg-emerald-500",
  },
  caution: {
    label: "Worth watching",
    subLabel: "A little tighter than usual — worth keeping an eye on",
    healthFraction: 0.42,
    colorVar: "--status-caution-hsl",
    bgVar: "--status-caution-bg",
    borderVar: "--status-caution-border",
    glowVar: "--status-caution-glow",
    dotClass: "bg-amber-500",
  },
  "at-risk": {
    label: "Let's look at this",
    subLabel: "Budget is stretched — let's review together",
    healthFraction: 0.12,
    colorVar: "--status-risk-hsl",
    bgVar: "--status-risk-bg",
    borderVar: "--status-risk-border",
    glowVar: "--status-risk-glow",
    dotClass: "bg-rose-500",
  },
} as const;

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

  const cfg = statusConfig[status];
  const dashOffset = CIRCUMFERENCE * (1 - cfg.healthFraction);

  return (
    <motion.div
      key={status}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{
        background: `var(${cfg.bgVar})`,
        borderColor: `var(${cfg.borderVar})`,
        boxShadow: `0 0 0 1px var(${cfg.borderVar}), 0 4px 20px var(${cfg.glowVar})`,
      }}
      className="rounded-2xl border p-5 sm:p-6 flex gap-5 items-center"
    >
      {/* Arc ring */}
      <div className="relative flex-shrink-0 w-[104px] h-[104px]">
        <svg viewBox="0 0 104 104" className="w-full h-full -rotate-90">
          {/* Track */}
          <circle
            cx={52}
            cy={52}
            r={RING_R}
            fill="none"
            stroke="currentColor"
            strokeWidth={6}
            className="text-border opacity-30"
          />
          {/* Fill */}
          <motion.circle
            cx={52}
            cy={52}
            r={RING_R}
            fill="none"
            stroke={`hsl(var(${cfg.colorVar}))`}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.1 }}
          />
        </svg>
        {/* Center pulsing dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn("w-3 h-3 rounded-full", cfg.dotClass)}
            style={{ boxShadow: `0 0 8px var(${cfg.glowVar})` }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Safe to spend today
          </p>
          <span
            className="flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: `var(${cfg.bgVar})`,
              color: `hsl(var(${cfg.colorVar}))`,
            }}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full inline-block", cfg.dotClass)} />
            {cfg.label}
          </span>
        </div>

        <div
          className="text-4xl sm:text-5xl font-black tabular-nums tracking-tight"
          style={{ color: `hsl(var(${cfg.colorVar}))` }}
        >
          {amount < 0 && <span>−</span>}
          <motion.span>{display}</motion.span>
          <span className="text-lg sm:text-xl font-semibold text-muted-foreground ml-1">/day</span>
        </div>

        <p className="text-sm text-muted-foreground mt-2">
          {cfg.subLabel}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {daysRemaining === 1
            ? "1 day remaining in this pay period"
            : `${daysRemaining} days remaining in this pay period`}
        </p>
      </div>
    </motion.div>
  );
}
