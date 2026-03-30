import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

interface Params { params: Promise<{ id: string }> }

/**
 * POST /api/receipts/[id]/discard
 * Marks a pending import as discarded.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id } = await params;

  const pending = await db.pendingImport.findUnique({
    where: { id },
    select: { budgetId: true, status: true, receiptId: true },
  });
  if (!pending) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pending.status === "CONFIRMED" || pending.status === "DISCARDED") {
    return NextResponse.json({ error: `Already ${pending.status.toLowerCase()}` }, { status: 409 });
  }

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

  await db.$transaction(async (tx) => {
    await tx.pendingImport.update({
      where: { id },
      data: { status: "DISCARDED" },
    });
    if (pending.receiptId) {
      await tx.receipt.update({
        where: { id: pending.receiptId },
        data: { status: "DISCARDED" },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
