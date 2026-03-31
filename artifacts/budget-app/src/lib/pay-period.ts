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

/**
 * Add calendar months, clamping to the last day of the target month.
 * e.g. Jan 31 + 1 month = Feb 28 (not Feb 31).
 */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const targetMonth = d.getMonth() + months;
  d.setMonth(targetMonth);
  // If day overflowed (e.g. Jan 31 → Mar 2 when adding 1 month), clamp back
  if (d.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    d.setDate(0); // last day of the previous month
  }
  return d;
}

/**
 * Add calendar years.
 */
function addYears(date: Date, years: number): Date {
  return addMonths(date, years * 12);
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

/**
 * Advance a semimonthly anchor (1st or 15th) to the next pay date.
 * Semimonthly pay dates are always the 1st and the 15th of each month.
 */
function nextSemiMonthlyAfter(from: Date): Date {
  const year = from.getFullYear();
  const month = from.getMonth();
  const day = from.getDate();

  if (day < 15) {
    return new Date(year, month, 15);
  }
  // day >= 15: next pay is 1st of next month
  return new Date(year, month + 1, 1);
}

/**
 * Previous semimonthly pay date before 'from'.
 */
function prevSemiMonthlyBefore(from: Date): Date {
  const year = from.getFullYear();
  const month = from.getMonth();
  const day = from.getDate();

  if (day > 15) {
    return new Date(year, month, 15);
  }
  if (day > 1) {
    return new Date(year, month, 1);
  }
  // day === 1: prev is 15th of previous month
  return new Date(year, month - 1, 15);
}

/**
 * Advance `anchor` by one pay interval (calendar-aware for monthly+).
 */
function advanceByFrequency(date: Date, frequency: PayFrequency, customDays?: number | null): Date {
  switch (frequency) {
    case "WEEKLY":      return addDays(date, 7);
    case "BIWEEKLY":    return addDays(date, 14);
    case "SEMIMONTHLY": return nextSemiMonthlyAfter(date);
    case "MONTHLY":     return addMonths(date, 1);
    case "QUARTERLY":   return addMonths(date, 3);
    case "ANNUALLY":    return addYears(date, 1);
    case "CUSTOM":      return addDays(date, customDays ?? 14);
    default:            return addDays(date, 14);
  }
}

/**
 * Move `date` back by one pay interval (calendar-aware).
 */
function retreatByFrequency(date: Date, frequency: PayFrequency, customDays?: number | null): Date {
  switch (frequency) {
    case "WEEKLY":      return addDays(date, -7);
    case "BIWEEKLY":    return addDays(date, -14);
    case "SEMIMONTHLY": return prevSemiMonthlyBefore(date);
    case "MONTHLY":     return addMonths(date, -1);
    case "QUARTERLY":   return addMonths(date, -3);
    case "ANNUALLY":    return addYears(date, -1);
    case "CUSTOM":      return addDays(date, -(customDays ?? 14));
    default:            return addDays(date, -14);
  }
}

export function getIntervalDays(frequency: PayFrequency, customDays?: number | null): number {
  switch (frequency) {
    case "WEEKLY":       return 7;
    case "BIWEEKLY":     return 14;
    case "SEMIMONTHLY":  return 15; // approximate; use calendar math for actual periods
    case "MONTHLY":      return 30; // approximate for display/rough calculations
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

/**
 * Find the next upcoming pay date on or after today, starting from `anchor`.
 * Uses calendar-aware advancement.
 */
function computeNextPayDate(
  anchor: Date,
  frequency: PayFrequency,
  customDays?: number | null
): Date {
  const today = startOfDay(new Date());
  let next = startOfDay(anchor);

  if (next >= today) return next;

  // Advance until we reach or pass today
  for (let i = 0; i < 1000; i++) {
    const candidate = advanceByFrequency(next, frequency, customDays);
    if (candidate >= today) return candidate;
    next = candidate;
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
    // No pay date configured — fall back to the current calendar month so the
    // expense query always covers a meaningful window and the dashboard is useful
    // even before the user finishes income setup.
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const daysInMonth = Math.max(1, daysBetween(monthStart, monthEnd));
    const daysElapsed = Math.max(0, Math.min(daysInMonth, daysBetween(monthStart, today)));
    const daysRemaining = Math.max(0, daysBetween(today, monthEnd));
    return {
      start: monthStart,
      end: monthEnd,
      nextPayDate: monthEnd,
      daysInPeriod: daysInMonth,
      daysElapsed,
      daysRemaining,
      periodIncome: incomeAmount,
    };
  }

  const next = computeNextPayDate(new Date(nextPayDate), frequency, customDays);

  // Period start = one interval before next pay date (calendar-aware)
  const periodStart = retreatByFrequency(next, frequency, customDays);

  const daysInPeriod = Math.max(1, daysBetween(periodStart, next));
  const daysElapsed = Math.max(0, Math.min(daysInPeriod, daysBetween(periodStart, today)));
  const daysRemaining = Math.max(0, daysBetween(today, next));

  return {
    start: periodStart,
    end: next,
    nextPayDate: next,
    daysInPeriod,
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
