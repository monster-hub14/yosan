import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { ACTIVE_BUDGET_COOKIE } from "@/lib/active-budget";

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { budgetId } = await request.json();

  const now = new Date();
  const budget = await db.budget.findFirst({
    where: {
      id: budgetId,
      OR: [
        { ownerId: session.userId },
        { memberships: { some: { userId: session.userId } } },
        {
          soloShares: {
            some: {
              userId: session.userId,
              isActive: true,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
          },
        },
      ],
    },
    select: { id: true, name: true },
  });

  if (!budget) {
    return NextResponse.json({ error: "Budget not found or not accessible" }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true, budget });
  response.cookies.set(ACTIVE_BUDGET_COOKIE, budget.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
