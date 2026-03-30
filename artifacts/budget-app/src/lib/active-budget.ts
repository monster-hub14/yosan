import { cookies } from "next/headers";
import { db } from "./db";

const ACTIVE_BUDGET_COOKIE = "budget_active_id";

export async function getActiveBudgetId(userId: string): Promise<string | null> {
  const jar = await cookies();
  const fromCookie = jar.get(ACTIVE_BUDGET_COOKIE)?.value;

  if (fromCookie) {
    const accessible = await db.budget.findFirst({
      where: {
        id: fromCookie,
        OR: [
          { ownerId: userId },
          { memberships: { some: { userId } } },
        ],
      },
      select: { id: true },
    });
    if (accessible) return accessible.id;
  }

  const first = await db.budget.findFirst({
    where: {
      OR: [
        { ownerId: userId },
        { memberships: { some: { userId } } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  return first?.id ?? null;
}

export async function getUserBudgets(userId: string) {
  return db.budget.findMany({
    where: {
      OR: [
        { ownerId: userId },
        { memberships: { some: { userId } } },
      ],
    },
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
    },
  });
}

export { ACTIVE_BUDGET_COOKIE };
