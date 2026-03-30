/**
 * Cash Flow Projection Engine
 * Server-only. Builds a day-by-day balance projection.
 */

import { db } from "@/lib/db";
import { getAIConfig, chatCompletion } from "@/lib/ai/client";
import { computePayPeriod } from "@/lib/pay-period";

export interface ForecastPoint {
  date: string; // ISO date YYYY-MM-DD
  balance: number;
  isPayday: boolean;
  paydayAmount?: number;
  bills: { name: string; amount: number }[];
  isDangerZone: boolean;
}

export interface ForecastResult {
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

export async function buildForecast(budgetId: string, userId: string, daysAhead = 42): Promise<ForecastResult> {
  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    include: {
      incomeSources: { where: { isActive: true } },
      recurringExpenses: { where: { isActive: true } },
      savingsGoals: { where: { isActive: true } },
      expenses: {
        where: { date: { gte: new Date(Date.now() - 30 * 86400000) } },
        orderBy: { date: "asc" },
      },
    },
  });

  if (!budget) throw new Error("Budget not found");

  const primarySource = budget.incomeSources[0] ?? null;
  const periodIncome = budget.incomeSources.reduce((s, i) => s + i.amount, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Estimate daily spending rate from last 30 days
  const recentExpenses = budget.expenses.filter((e) => new Date(e.date) >= new Date(Date.now() - 30 * 86400000));
  const totalRecent = recentExpenses.reduce((s, e) => s + e.amount, 0);
  const dailySpendingRate = totalRecent / 30;

  // Compute pay period for starting balance estimation
  let startingBalance = 0;
  const paydates: Date[] = [];

  if (primarySource?.nextPayDate) {
    const payPeriod = computePayPeriod(
      primarySource.frequency,
      primarySource.nextPayDate,
      periodIncome,
      primarySource.customDays ?? undefined
    );

    // Estimate current balance: income received this period minus what's been spent
    const daysElapsed = Math.max(0, Math.round((today.getTime() - payPeriod.start.getTime()) / 86400000));
    const estimatedSpent = daysElapsed * dailySpendingRate;
    startingBalance = Math.max(0, periodIncome - estimatedSpent);

    // Build upcoming paydates
    let nextPay = new Date(payPeriod.nextPayDate);
    while (nextPay <= new Date(today.getTime() + daysAhead * 86400000)) {
      paydates.push(new Date(nextPay));
      nextPay = advanceByFrequency(nextPay, primarySource.frequency, primarySource.customDays ?? undefined);
    }
  } else {
    // No income source — project with zero balance
    startingBalance = 0;
  }

  // Build map of recurring bills by date
  const billsByDate = new Map<string, { name: string; amount: number }[]>();
  for (const rec of budget.recurringExpenses) {
    if (!rec.nextDueDate || !rec.isActive) continue;
    let dueDate = new Date(rec.nextDueDate);
    dueDate.setHours(0, 0, 0, 0);
    while (dueDate <= new Date(today.getTime() + daysAhead * 86400000)) {
      if (dueDate >= today) {
        const key = dueDate.toISOString().slice(0, 10);
        const existing = billsByDate.get(key) ?? [];
        existing.push({ name: rec.name, amount: rec.amount });
        billsByDate.set(key, existing);
      }
      dueDate = advanceByExpenseFrequency(dueDate, rec.frequency);
    }
  }

  // Build day-by-day projection
  const points: ForecastPoint[] = [];
  let balance = startingBalance;

  for (let d = 0; d < daysAhead; d++) {
    const date = new Date(today.getTime() + d * 86400000);
    const dateKey = date.toISOString().slice(0, 10);

    // Check for payday
    const isPayday = paydates.some((p) => p.toISOString().slice(0, 10) === dateKey);
    if (isPayday) balance += periodIncome;

    // Subtract recurring bills
    const bills = billsByDate.get(dateKey) ?? [];
    for (const bill of bills) {
      balance -= bill.amount;
    }

    // Subtract estimated daily spending (not on payday to avoid double-subtracting)
    if (d > 0) balance -= dailySpendingRate;

    points.push({
      date: dateKey,
      balance: Math.round(balance * 100) / 100,
      isPayday,
      paydayAmount: isPayday ? periodIncome : undefined,
      bills,
      isDangerZone: balance < 0,
    });
  }

  const dangerDays = points.filter((p) => p.isDangerZone).length;
  const balances = points.map((p) => p.balance);
  const minBalance = Math.min(...balances);
  const maxBalance = Math.max(...balances);

  const nextPaydates = paydates.slice(0, 6).map((d) => d.toISOString().slice(0, 10));
  const upcomingBills = Array.from(billsByDate.entries())
    .flatMap(([date, bills]) => bills.map((b) => ({ ...b, date })))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10);

  // AI summary
  let aiSummary = buildFallbackSummary(dangerDays, minBalance, dailySpendingRate, paydates.length, nextPaydates);
  let generatedByAI = false;

  try {
    const config = await getAIConfig();
    const aiDbConfig = await db.aIProviderConfig.findUnique({ where: { id: "singleton" } });
    if (config && aiDbConfig?.forecastingEnabled) {
      const billSummary = upcomingBills.slice(0, 5)
        .map((b) => `${b.name} ($${b.amount}) due ${b.date}`)
        .join(", ") || "none";

      const prompt = `Personal finance cash flow forecast:
- Starting balance: $${startingBalance.toFixed(2)}
- Daily spending rate (average): $${dailySpendingRate.toFixed(2)}/day
- Pay period income: $${periodIncome.toFixed(2)}
- Next paydates: ${nextPaydates.slice(0, 3).join(", ") || "unknown"}
- Upcoming bills: ${billSummary}
- Forecast period: ${daysAhead} days
- Danger days (negative balance): ${dangerDays}
- Minimum projected balance: $${minBalance.toFixed(2)}

Write a 2–3 sentence plain-language summary of this cash flow outlook. Be direct and actionable.`;

      const response = await chatCompletion(config, [
        { role: "system", content: "You are a personal finance advisor. Be concise and direct." },
        { role: "user", content: prompt },
      ], { maxTokens: 256 });

      aiSummary = response.content.trim();
      generatedByAI = true;
      // Usage is recorded by the calling route via recordUsage() after this function returns.
    }
  } catch (err) {
    console.warn("[forecast] AI summary failed, using fallback:", err);
  }

  // Persist snapshot
  await db.forecastSnapshot.create({
    data: {
      budgetId,
      forecastDate: new Date(),
      data: JSON.stringify({ points: points.slice(0, 90), dangerDays, minBalance, maxBalance, aiSummary }),
    },
  });

  return {
    points,
    dangerDays,
    minBalance,
    maxBalance,
    nextPaydates,
    upcomingBills,
    aiSummary,
    generatedByAI,
    periodDays: daysAhead,
  };
}

function buildFallbackSummary(
  dangerDays: number,
  minBalance: number,
  dailyRate: number,
  paydates: number,
  nextPaydates: string[]
): string {
  if (dangerDays > 0) {
    return `Your cash flow projection shows ${dangerDays} day${dangerDays === 1 ? "" : "s"} where your balance may go negative, reaching a low of $${minBalance.toFixed(2)}. Consider reducing discretionary spending or deferring large purchases until after your next paycheck${nextPaydates[0] ? ` on ${nextPaydates[0]}` : ""}.`;
  }
  if (minBalance < dailyRate * 3) {
    return `Your balance will get tight between paydays — at one point dropping to $${minBalance.toFixed(2)}. Keep an eye on recurring bills and avoid large discretionary purchases in those windows.`;
  }
  return `Your cash flow looks healthy for the next ${Math.round(dangerDays === 0 ? 42 : 30)} days${nextPaydates[0] ? `, with your next paycheck on ${nextPaydates[0]}` : ""}. Maintain your current spending pace to stay on track.`;
}

function advanceByFrequency(date: Date, frequency: string, customDays?: number): Date {
  const d = new Date(date);
  switch (frequency) {
    case "WEEKLY": d.setDate(d.getDate() + 7); break;
    case "BIWEEKLY": d.setDate(d.getDate() + 14); break;
    case "SEMIMONTHLY": d.setDate(d.getDate() + 15); break;
    case "MONTHLY": d.setMonth(d.getMonth() + 1); break;
    case "QUARTERLY": d.setMonth(d.getMonth() + 3); break;
    case "ANNUALLY": d.setFullYear(d.getFullYear() + 1); break;
    case "CUSTOM": d.setDate(d.getDate() + (customDays ?? 14)); break;
    default: d.setDate(d.getDate() + 14);
  }
  return d;
}

function advanceByExpenseFrequency(date: Date, frequency: string): Date {
  const d = new Date(date);
  switch (frequency) {
    case "DAILY": d.setDate(d.getDate() + 1); break;
    case "WEEKLY": d.setDate(d.getDate() + 7); break;
    case "BIWEEKLY": d.setDate(d.getDate() + 14); break;
    case "MONTHLY": d.setMonth(d.getMonth() + 1); break;
    case "QUARTERLY": d.setMonth(d.getMonth() + 3); break;
    case "ANNUALLY": d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return d;
}

function getWeekStart(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().slice(0, 10);
}
