import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireBudgetRead, requireBudgetManage, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetRead(session, id);
  if (access instanceof NextResponse) return access;

  const budget = await db.budget.findUnique({
    where: { id },
    select: {
      ownerId: true,
      budgetType: true,
      owner: { select: { id: true, name: true, email: true } },
      memberships: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
      soloShares: {
        where: { isActive: true },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!budget) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ budget });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetManage(session, id);
  if (access instanceof NextResponse) return access;

  const budget = await db.budget.findUnique({
    where: { id },
    select: { budgetType: true, ownerId: true },
  });
  if (!budget) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { userId, role = "MEMBER", email } = await request.json();

  let targetUserId = userId;

  if (!targetUserId && email) {
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    targetUserId = user.id;
  }

  if (!targetUserId) {
    return NextResponse.json({ error: "userId or email required" }, { status: 400 });
  }

  if (targetUserId === budget.ownerId) {
    return NextResponse.json({ error: "Owner cannot be added as member" }, { status: 400 });
  }

  if (budget.budgetType === "SHARED") {
    const validRoles = ["ADMIN", "MEMBER"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role for shared budget" }, { status: 400 });
    }

    const membership = await db.budgetMembership.upsert({
      where: { budgetId_userId: { budgetId: id, userId: targetUserId } },
      create: { budgetId: id, userId: targetUserId, role },
      update: { role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({ membership }, { status: 201 });
  } else {
    const validRoles = ["VIEWER", "HELPER", "CO_OWNER"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role for solo budget" }, { status: 400 });
    }

    const existing = await db.budgetSoloShare.findFirst({
      where: { budgetId: id, userId: targetUserId },
    });

    if (existing) {
      const share = await db.budgetSoloShare.update({
        where: { id: existing.id },
        data: { role, isActive: true },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      return NextResponse.json({ share });
    }

    const share = await db.budgetSoloShare.create({
      data: { budgetId: id, userId: targetUserId, role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({ share }, { status: 201 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetManage(session, id);
  if (access instanceof NextResponse) return access;

  const { userId, shareId } = await request.json();

  if (shareId) {
    await db.budgetSoloShare.update({
      where: { id: shareId, budgetId: id },
      data: { isActive: false },
    });
  } else if (userId) {
    await db.budgetMembership.deleteMany({
      where: { budgetId: id, userId },
    });
    await db.budgetSoloShare.updateMany({
      where: { budgetId: id, userId },
      data: { isActive: false },
    });
  } else {
    return NextResponse.json({ error: "userId or shareId required" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
