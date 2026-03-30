import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const budgets = await db.budget.findMany({
    where: {
      OR: [
        { ownerId: session.userId },
        { memberships: { some: { userId: session.userId } } },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      memberships: {
        select: { userId: true, role: true, user: { select: { id: true, name: true, email: true } } },
      },
      _count: { select: { expenses: true, incomeSources: true } },
    },
  });

  return NextResponse.json({ budgets });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!isSessionPayload(session)) return session;

  const { name, currency = "USD", description, budgetType = "SHARED", memberIds = [] } =
    await request.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "Budget name is required" }, { status: 400 });
  }

  const budget = await db.budget.create({
    data: {
      name: name.trim(),
      currency,
      description: description?.trim() || null,
      budgetType,
      ownerId: session.userId,
      memberships: {
        create: memberIds
          .filter((id: string) => id !== session.userId)
          .map((userId: string) => ({ userId, role: "MEMBER" as const })),
      },
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      memberships: {
        select: { userId: true, role: true, user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  return NextResponse.json({ budget }, { status: 201 });
}
