import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireBudgetAccess, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetAccess(session, id);
  if (access instanceof NextResponse) return access;

  const budget = await db.budget.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      memberships: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      soloShares: {
        where: { isActive: true },
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  if (!budget) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ budget });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetAccess(session, id, "ADMIN");
  if (access instanceof NextResponse) return access;

  const { name, currency, description } = await request.json();

  const budget = await db.budget.update({
    where: { id },
    data: {
      ...(name ? { name: name.trim() } : {}),
      ...(currency ? { currency } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
    },
  });

  return NextResponse.json({ budget });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetAccess(session, id, "ADMIN");
  if (access instanceof NextResponse) return access;

  await db.budget.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
