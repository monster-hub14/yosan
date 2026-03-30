import type { PayFrequency } from "@prisma/client";

export interface PayPeriod {
  start: Date;
  end: Date;
  nextPayDate: Date;
  daysInPeriod: number;
  daysElapsed: number;
  daysRemaining: number;
  periodIncome: number;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

function nextSemiMonthlyDate(after: Date): Date {
  const d = new Date(after);
  const day = d.getDate();
  if (day < 15) {
    return new Date(d.getFullYear(), d.getMonth(), 15);
  }
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return next;
}

export function getIntervalDays(frequency: PayFrequency, customDays?: number | null): number {
  switch (frequency) {
    case "WEEKLY":       return 7;
    case "BIWEEKLY":     return 14;
    case "SEMIMONTHLY":  return 15;
    case "MONTHLY":      return 30;
    case "QUARTERLY":    return 91;
    case "ANNUALLY":     return 365;
    case "CUSTOM":       return customDays ?? 14;
    default:             return 14;
  }
}

export function getPeriodsPerYear(frequency: PayFrequency, customDays?: number | null): number {
  switch (frequency) {
    case "WEEKLY":       return 52;
    case "BIWEEKLY":     return 26;
    case "SEMIMONTHLY":  return 24;
    case "MONTHLY":      return 12;
    case "QUARTERLY":    return 4;
    case "ANNUALLY":     return 1;
    case "CUSTOM":       return Math.round(365 / (customDays ?? 14));
    default:             return 26;
  }
}

export function getPeriodsPerMonth(frequency: PayFrequency, customDays?: number | null): number {
  return getPeriodsPerYear(frequency, customDays) / 12;
}

function computeNextPayDateFromSeries(
  anchor: Date,
  frequency: PayFrequency,
  customDays?: number | null
): Date {
  const today = startOfDay(new Date());
  let next = startOfDay(anchor);

  if (next > today) return next;

  if (frequency === "SEMIMONTHLY") {
    let candidate = startOfDay(anchor);
    for (let i = 0; i < 730; i++) {
      const n = nextSemiMonthlyDate(addDays(candidate, 1));
      if (n >= today) return n;
      candidate = n;
    }
    return nextSemiMonthlyDate(addDays(today, 1));
  }

  const interval = getIntervalDays(frequency, customDays);
  while (next < today) {
    next = addDays(next, interval);
  }
  return next;
}

export function computePayPeriod(
  frequency: PayFrequency,
  nextPayDate: Date | null | undefined,
  incomeAmount: number,
  customDays?: number | null
): PayPeriod {
  const today = startOfDay(new Date());

  if (!nextPayDate) {
    return {
      start: today,
      end: today,
      nextPayDate: today,
      daysInPeriod: getIntervalDays(frequency, customDays),
      daysElapsed: 0,
      daysRemaining: 0,
      periodIncome: incomeAmount,
    };
  }

  const next = computeNextPayDateFromSeries(new Date(nextPayDate), frequency, customDays);
  const interval = getIntervalDays(frequency, customDays);

  let periodStart: Date;
  if (frequency === "SEMIMONTHLY") {
    const day = next.getDate();
    if (day === 15) {
      periodStart = new Date(next.getFullYear(), next.getMonth(), 1);
    } else {
      periodStart = new Date(next.getFullYear(), next.getMonth(), 15);
    }
  } else {
    periodStart = addDays(next, -interval);
  }

  const daysInPeriod = daysBetween(periodStart, next);
  const daysElapsed = Math.max(0, daysBetween(periodStart, today));
  const daysRemaining = Math.max(0, daysBetween(today, next));

  return {
    start: periodStart,
    end: next,
    nextPayDate: next,
    daysInPeriod: Math.max(1, daysInPeriod),
    daysElapsed,
    daysRemaining,
    periodIncome: incomeAmount,
  };
}

export function monthlyToPerPeriod(
  monthlyAmount: number,
  frequency: PayFrequency,
  customDays?: number | null
): number {
  return monthlyAmount / getPeriodsPerMonth(frequency, customDays);
}

export function perPeriodToMonthly(
  perPeriodAmount: number,
  frequency: PayFrequency,
  customDays?: number | null
): number {
  return perPeriodAmount * getPeriodsPerMonth(frequency, customDays);
}
