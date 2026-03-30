import type { PayPeriod } from "./pay-period";

export type SpendStatus = "on-track" | "caution" | "at-risk";

export interface SafeToSpend {
  amount: number;
  status: SpendStatus;
  periodIncome: number;
  savingsReserve: number;
  upcomingRecurring: number;
  spentThisPeriod: number;
  remainingBalance: number;
  daysRemaining: number;
}

export function computeSafeToSpend(params: {
  period: PayPeriod;
  savingsReservePerPeriod: number;
  upcomingRecurringBeforeNextPayday: number;
  confirmedExpensesThisPeriod: number;
}): SafeToSpend {
  const { period, savingsReservePerPeriod, upcomingRecurringBeforeNextPayday, confirmedExpensesThisPeriod } = params;

  const remainingBalance =
    period.periodIncome
    - savingsReservePerPeriod
    - upcomingRecurringBeforeNextPayday
    - confirmedExpensesThisPeriod;

  const daysRemaining = Math.max(1, period.daysRemaining);
  const safePerDay = remainingBalance / daysRemaining;

  let status: SpendStatus;
  if (safePerDay >= 0) {
    status = "on-track";
  } else if (safePerDay >= -(period.periodIncome / period.daysInPeriod) * 0.1) {
    status = "caution";
  } else {
    status = "at-risk";
  }

  return {
    amount: safePerDay,
    status,
    periodIncome: period.periodIncome,
    savingsReserve: savingsReservePerPeriod,
    upcomingRecurring: upcomingRecurringBeforeNextPayday,
    spentThisPeriod: confirmedExpensesThisPeriod,
    remainingBalance,
    daysRemaining,
  };
}
