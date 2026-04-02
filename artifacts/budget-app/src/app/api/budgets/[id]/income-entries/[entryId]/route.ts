import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireBudgetWrite, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { notifySharedBudgetActivity } from "@/lib/notify-shared-budget-activity";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { id, entryId } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetWrite(session, id);
  if (access instanceof NextResponse) return access;

  const body = await request.json().catch(() => ({}));
  const { amount, date, note, incomeSourceId } = body as Record<string, unknown>;

  const existing = await db.incomeEntry.findFirst({ where: { id: entryId, budgetId: id } });
  if (!existing) {
    return NextResponse.json({ error: "Income entry not found" }, { status: 404 });
  }

  const updated = await db.incomeEntry.update({
    where: { id: entryId },
    data: {
      ...(typeof amount === "number" && amount > 0 ? { amount } : {}),
      ...(date ? { date: new Date(date as string) } : {}),
      ...(typeof note === "string" ? { note: note.trim() || null } : {}),
      ...(incomeSourceId !== undefined ? { incomeSourceId: (incomeSourceId as string) || null } : {}),
    },
    include: {
      incomeSource: { select: { id: true, name: true, frequency: true } },
      user: { select: { id: true, name: true } },
    },
  });

  // Notify other budget members of shared_budget_activity (fire-and-forget)
  notifySharedBudgetActivity({
    budgetId: id,
    actorId: session.userId,
    activityType: "income",
    amount: updated.amount,
    description: updated.note || "",
  }).catch((err) => console.error("[income-entries/patch] shared activity notify failed:", err));

  return NextResponse.json({ entry: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { id, entryId } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetWrite(session, id);
  if (access instanceof NextResponse) return access;

  await db.incomeEntry.delete({ where: { id: entryId, budgetId: id } });

  return NextResponse.json({ ok: true });
}
