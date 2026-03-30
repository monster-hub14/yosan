import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
interface Params { params: Promise<{ id: string }> }

// PATCH may only transition to non-terminal statuses.
// Terminal transitions (CONFIRMED, DISCARDED) must go through /confirm or /discard.
const PATCHABLE_STATUSES = new Set(["NEEDS_REVIEW", "SAVED_FOR_LATER", "PENDING"]);

async function verifyAccess(userId: string, importId: string) {
  const pending = await db.pendingImport.findUnique({
    where: { id: importId },
    select: { budgetId: true, status: true },
  });
  if (!pending) return null;

  const budget = await db.budget.findFirst({
    where: {
      id: pending.budgetId,
      OR: [
        { ownerId: userId },
        { memberships: { some: { userId } } },
      ],
    },
    select: { id: true },
  });
  if (!budget) return null;

  return pending;
}

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

  const budget = await db.budget.findFirst({
    where: {
      id: pending.budgetId,
      OR: [
        { ownerId: session.userId },
        { memberships: { some: { userId: session.userId } } },
      ],
    },
    select: { id: true },
  });
  if (!budget) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  return NextResponse.json({ import: pending });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id } = await params;
  const body = await request.json() as {
    merchant?: string | null;
    date?: string | null;
    total?: number | null;
    notes?: string | null;
    categoryId?: string | null;
    status?: string;
    data?: unknown;
  };

  const existing = await verifyAccess(session.userId, id);
  if (!existing) return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });

  const updatePayload: Record<string, unknown> = {};

  // Allow updating the data JSON blob (top-level or merged fields)
  if ("data" in body && body.data !== undefined) {
    updatePayload.data = typeof body.data === "string" ? body.data : JSON.stringify(body.data);
  } else if (
    "merchant" in body || "date" in body || "total" in body ||
    "notes" in body || "categoryId" in body
  ) {
    // Merge editable fields into the existing data blob
    let current: Record<string, unknown> = {};
    try {
      const pendingFull = await db.pendingImport.findUnique({ where: { id }, select: { data: true } });
      current = JSON.parse(pendingFull?.data ?? "{}") as Record<string, unknown>;
    } catch { /* ignore parse failures */ }

    if ("merchant" in body) current.merchant = body.merchant ?? null;
    if ("date" in body) current.date = body.date ?? null;
    if ("total" in body) current.total = body.total ?? null;
    if ("notes" in body) current.notes = body.notes ?? null;
    if ("categoryId" in body) current.categoryId = body.categoryId ?? null;
    updatePayload.data = JSON.stringify(current);
  }

  if ("status" in body && typeof body.status === "string") {
    const statusUp = body.status.toUpperCase();
    if (!PATCHABLE_STATUSES.has(statusUp)) {
      return NextResponse.json(
        { error: `Cannot set status to ${statusUp} via this endpoint. Use /confirm or /discard instead.` },
        { status: 400 }
      );
    }
    updatePayload.status = statusUp;
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await db.pendingImport.update({ where: { id }, data: updatePayload });
  return NextResponse.json({ import: updated });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id } = await params;

  const existing = await verifyAccess(session.userId, id);
  if (!existing) return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });

  await db.pendingImport.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
