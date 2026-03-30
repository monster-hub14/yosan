/**
 * Server-only duplicate detection module.
 * Compares new pending import against existing expenses.
 * NEVER import from client components.
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

export async function detectDuplicate(
  budgetId: string,
  merchant: string | null,
  total: number | null,
  date: string | null // YYYY-MM-DD
): Promise<DuplicateResult> {
  if (!total || !date) {
    return { confidence: "none", matchedExpenseId: null, reason: null };
  }

  const checkDate = new Date(date);
  const normalizedMerchant = normalizeMerchant(merchant);

  // Look for expenses within ±3 days with similar total
  const startWindow = new Date(checkDate);
  startWindow.setDate(startWindow.getDate() - 3);
  const endWindow = new Date(checkDate);
  endWindow.setDate(endWindow.getDate() + 3);

  const candidates = await db.expense.findMany({
    where: {
      budgetId,
      date: { gte: startWindow, lte: endWindow },
      amount: { gte: total - 0.02, lte: total + 0.02 },
    },
    select: { id: true, merchant: true, amount: true, date: true },
  });

  for (const expense of candidates) {
    const expenseMerchant = normalizeMerchant(expense.merchant);
    const daysDiff = dateDiffDays(checkDate, new Date(expense.date));
    const amountMatch = Math.abs(expense.amount - total) <= 0.01;
    const merchantMatch = normalizedMerchant && expenseMerchant
      ? normalizedMerchant === expenseMerchant
      : true;

    if (amountMatch && merchantMatch && daysDiff === 0) {
      return {
        confidence: "high",
        matchedExpenseId: expense.id,
        reason: `Exact match: ${merchant ?? "same"} for $${total} on ${date}`,
      };
    }

    if (amountMatch && daysDiff <= 2) {
      return {
        confidence: "possible",
        matchedExpenseId: expense.id,
        reason: `Similar transaction: $${total} within 2 days`,
      };
    }
  }

  return { confidence: "none", matchedExpenseId: null, reason: null };
}
