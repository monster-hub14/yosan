import { db } from "@/lib/db";
import { computePayPeriod } from "@/lib/pay-period";

/**
 * Returns the active pay-period bounds for a budget.
 * Falls back to calendar month if no active income source is configured.
 */
export async function getActivePeriodBounds(budgetId: string): Promise<{ start: Date; end: Date }> {
  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    include: { incomeSources: { where: { isActive: true } } },
  });
  const primarySource = budget?.incomeSources[0] ?? null;
  if (primarySource) {
    const payPeriod = computePayPeriod(
      primarySource.frequency,
      primarySource.nextPayDate,
      primarySource.amount,
      primarySource.customDays
    );
    return { start: payPeriod.start, end: payPeriod.end };
  }
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  };
}
