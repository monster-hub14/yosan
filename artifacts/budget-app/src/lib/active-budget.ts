import { cookies } from "next/headers";
import { db } from "./db";

const ACTIVE_BUDGET_COOKIE = "budget_active_id";

/**
 * Budget accessibility predicate — user can access a budget if they are:
 *   - The owner
 *   - A BudgetMembership member
 *   - A BudgetSoloShare recipient (active, non-expired, with userId set)
 */
function buildBudgetAccessWhere(userId: string) {
  const now = new Date();
  return {
    OR: [
      { ownerId: userId },
      { memberships: { some: { userId } } },
      {
        soloShares: {
          some: {
            userId,
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
      },
    ],
  };
}

export async function getActiveBudgetId(userId: string): Promise<string | null> {
  const jar = await cookies();
  const fromCookie = jar.get(ACTIVE_BUDGET_COOKIE)?.value;

  if (fromCookie) {
    const accessible = await db.budget.findFirst({
      where: { id: fromCookie, ...buildBudgetAccessWhere(userId) },
      select: { id: true },
    });
    if (accessible) return accessible.id;
  }

  const first = await db.budget.findFirst({
    where: buildBudgetAccessWhere(userId),
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  return first?.id ?? null;
}

export async function getUserBudgets(userId: string) {
  const now = new Date();
  return db.budget.findMany({
    where: buildBudgetAccessWhere(userId),
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      currency: true,
      budgetType: true,
      ownerId: true,
      memberships: {
        where: { userId },
        select: { role: true },
        take: 1,
      },
      soloShares: {
        where: {
          userId,
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { role: true },
        take: 1,
      },
    },
  });
}

export { ACTIVE_BUDGET_COOKIE };
