import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

interface Params { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id } = await params;

  const pending = await db.pendingImport.findUnique({
    where: { id },
    include: {
      receipt: true,
      user: { select: { id: true, name: true } },
    },
  });

  if (!pending) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verify budget access
  const hasBudgetAccess = await db.budget.findFirst({
    where: {
      id: pending.budgetId,
      OR: [
        { ownerId: session.userId },
        { memberships: { some: { userId: session.userId } } },
      ],
    },
    select: { id: true },
  });
  if (!hasBudgetAccess) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  return NextResponse.json({ import: pending });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id } = await params;
  const body = await request.json();

  const pending = await db.pendingImport.findUnique({ where: { id }, select: { budgetId: true } });
  if (!pending) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const hasBudgetAccess = await db.budget.findFirst({
    where: {
      id: pending.budgetId,
      OR: [
        { ownerId: session.userId },
        { memberships: { some: { userId: session.userId } } },
      ],
    },
    select: { id: true },
  });
  if (!hasBudgetAccess) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  // Allow updating the draft data (user edits)
  const allowed = ["data", "status"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      if (key === "data") updates[key] = typeof body[key] === "string" ? body[key] : JSON.stringify(body[key]);
      else updates[key] = body[key];
    }
  }

  const updated = await db.pendingImport.update({ where: { id }, data: updates });
  return NextResponse.json({ import: updated });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id } = await params;

  const pending = await db.pendingImport.findUnique({ where: { id }, select: { budgetId: true } });
  if (!pending) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const hasBudgetAccess = await db.budget.findFirst({
    where: {
      id: pending.budgetId,
      OR: [
        { ownerId: session.userId },
        { memberships: { some: { userId: session.userId } } },
      ],
    },
    select: { id: true },
  });
  if (!hasBudgetAccess) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  await db.pendingImport.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
