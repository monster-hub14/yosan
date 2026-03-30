import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetRead } from "@/lib/auth/permissions";
import { getActiveBudgetId } from "@/lib/active-budget";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { searchParams } = new URL(request.url);
  let budgetId = searchParams.get("budgetId");
  if (!budgetId) budgetId = await getActiveBudgetId(session.userId);

  if (budgetId) {
    const access = await requireBudgetRead(session, budgetId);
    if (access instanceof NextResponse) return access;
  }

  const categories = await db.category.findMany({
    where: {
      OR: [
        ...(budgetId ? [{ budgetId }] : []),
        { isDefault: true },
      ],
    },
    select: { id: true, name: true, icon: true, color: true, isDefault: true },
    orderBy: [{ isDefault: "asc" }, { name: "asc" }],
    take: 50,
  });

  return NextResponse.json({ categories });
}
