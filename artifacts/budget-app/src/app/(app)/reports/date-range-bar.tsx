"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PeriodBounds } from "./use-reports";

const PRESETS = [
  { id: "this-pay-period", label: "This Pay Period" },
  { id: "last-pay-period", label: "Last Pay Period" },
  { id: "this-month", label: "This Month" },
  { id: "last-month", label: "Last Month" },
  { id: "last-7-days", label: "Last 7 Days" },
];

/** Format a Date as YYYY-MM-DD using LOCAL time (avoids UTC midnight off-by-one). */
function localDateStr(d: Date): string {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

function todayStr(): string {
  return localDateStr(new Date());
}

function getPresetRange(
  id: string,
  payPeriod: PeriodBounds | null,
  lastPayPeriod: PeriodBounds | null
): PeriodBounds {
  const now = new Date();
  switch (id) {
    case "this-pay-period":
      if (payPeriod) return { start: payPeriod.start.slice(0, 10), end: payPeriod.end.slice(0, 10) };
      break;
    case "last-pay-period":
      if (lastPayPeriod) return { start: lastPayPeriod.start.slice(0, 10), end: lastPayPeriod.end.slice(0, 10) };
      break;
    case "this-month": {
      const start = localDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
      const end = localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { start, end };
    }
    case "last-month": {
      const start = localDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      const end = localDateStr(new Date(now.getFullYear(), now.getMonth(), 0));
      return { start, end };
    }
    case "last-7-days": {
      const end = todayStr();
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { start: localDateStr(s), end };
    }
  }
  const start = localDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return { start, end };
}

interface DateRangeBarProps {
  value: { start: string; end: string; preset: string };
  onChange: (range: { start: string; end: string; preset: string }) => void;
  payPeriod: PeriodBounds | null;
  lastPayPeriod: PeriodBounds | null;
}

export function DateRangeBar({ value, onChange, payPeriod, lastPayPeriod }: DateRangeBarProps) {
  const presets = useMemo(() => {
    return PRESETS.filter(p => {
      if (p.id === "this-pay-period" && !payPeriod) return false;
      if (p.id === "last-pay-period" && !lastPayPeriod) return false;
      return true;
    });
  }, [payPeriod, lastPayPeriod]);

  function handlePreset(id: string) {
    const range = getPresetRange(id, payPeriod, lastPayPeriod);
    onChange({ ...range, preset: id });
  }

  function handleDateInput(field: "start" | "end", val: string) {
    onChange({ ...value, [field]: val, preset: "custom" });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5">
        {presets.map(p => (
          <Button
            key={p.id}
            size="sm"
            variant={value.preset === p.id ? "default" : "outline"}
            className={cn("text-xs h-8 px-3", value.preset === p.id ? "" : "text-muted-foreground")}
            onClick={() => handlePreset(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 ml-auto">
        <input
          type="date"
          value={value.start}
          max={value.end || todayStr()}
          onChange={e => handleDateInput("start", e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={value.end}
          min={value.start}
          max={todayStr()}
          onChange={e => handleDateInput("end", e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>
  );
}
