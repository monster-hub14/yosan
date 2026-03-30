/**
 * Server-only duplicate detection module.
 * Compares a new pending import against existing expenses.
 * NEVER import from client components.
 *
 * Matching rules (per spec):
 *   HIGH confidence    — same merchant (normalized) + amount within $0.01 + date within 2 days
 *   POSSIBLE confidence — same amount within $0.01 + date within 2 days (no merchant match)
 *
 * Candidate window: ±2 days, ±$0.01 on amount.
 */

import { db } from "@/lib/db";

export type DuplicateConfidence = "none" | "possible" | "high";

export interface DuplicateResult {
  confidence: DuplicateConfidence;
  matchedExpenseId: string | null;
  reason: string | null;
}

function normalizeMerchant(name: string | null | undefined): string {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function dateDiffDays(a: Date, b: Date): number {
  return Math.abs((a.getTime() - b.getTime()) / 86400000);
}

const AMOUNT_TOLERANCE = 0.01; // $0.01
const DATE_TOLERANCE_DAYS = 2;  // ±2 calendar days

export async function detectDuplicate(
  budgetId: string,
  merchant: string | null,
  total: number | null,
  date: string | null // YYYY-MM-DD or ISO string
): Promise<DuplicateResult> {
  if (total == null || !date) {
    return { confidence: "none", matchedExpenseId: null, reason: null };
  }

  const checkDate = new Date(date);
  if (isNaN(checkDate.getTime())) {
    return { confidence: "none", matchedExpenseId: null, reason: null };
  }

  const normalizedMerchant = normalizeMerchant(merchant);

  // Candidate window: ±2 days, ±$0.01
  const startWindow = new Date(checkDate);
  startWindow.setUTCDate(startWindow.getUTCDate() - DATE_TOLERANCE_DAYS);
  const endWindow = new Date(checkDate);
  endWindow.setUTCDate(endWindow.getUTCDate() + DATE_TOLERANCE_DAYS);

  const candidates = await db.expense.findMany({
    where: {
      budgetId,
      date: { gte: startWindow, lte: endWindow },
      amount: { gte: total - AMOUNT_TOLERANCE, lte: total + AMOUNT_TOLERANCE },
    },
    select: { id: true, merchant: true, amount: true, date: true },
    orderBy: { date: "desc" },
    take: 20,
  });

  let bestPossible: DuplicateResult | null = null;

  for (const expense of candidates) {
    const expenseMerchant = normalizeMerchant(expense.merchant);
    const daysDiff = dateDiffDays(checkDate, new Date(expense.date));
    const amountDiff = Math.abs(expense.amount - total);

    if (amountDiff > AMOUNT_TOLERANCE || daysDiff > DATE_TOLERANCE_DAYS) continue;

    const bothHaveMerchant = normalizedMerchant.length > 0 && expenseMerchant.length > 0;
    const merchantMatch = bothHaveMerchant && normalizedMerchant === expenseMerchant;

    if (merchantMatch && amountDiff <= AMOUNT_TOLERANCE && daysDiff <= DATE_TOLERANCE_DAYS) {
      // HIGH: merchant + amount + date all match
      return {
        confidence: "high",
        matchedExpenseId: expense.id,
        reason: `Likely duplicate: ${merchant} for $${total.toFixed(2)} within ${Math.round(daysDiff)} day(s)`,
      };
    }

    // POSSIBLE: amount + date match but no merchant to compare or merchants differ
    if (!bestPossible) {
      bestPossible = {
        confidence: "possible",
        matchedExpenseId: expense.id,
        reason: `Possible duplicate: $${total.toFixed(2)} within ${Math.round(daysDiff)} day(s) — merchant not confirmed`,
      };
    }
  }

  return bestPossible ?? { confidence: "none", matchedExpenseId: null, reason: null };
}
