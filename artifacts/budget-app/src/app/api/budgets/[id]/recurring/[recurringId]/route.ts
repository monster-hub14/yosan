import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireBudgetAccess, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import type { ExpenseFrequency } from "@prisma/client";

const VALID_FREQUENCIES: ExpenseFrequency[] = ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; recurringId: string }> }
) {
  const { id, recurringId } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetAccess(session, id);
  if (access instanceof NextResponse) return access;

  const { name, amount, frequency, nextDueDate, categoryId, notes, isActive } =
    await request.json();

  if (frequency && !VALID_FREQUENCIES.includes(frequency)) {
    return NextResponse.json({ error: "Invalid frequency" }, { status: 400 });
  }

  const expense = await db.recurringExpense.update({
    where: { id: recurringId, budgetId: id },
    data: {
      ...(name ? { name: name.trim() } : {}),
      ...(typeof amount === "number" ? { amount } : {}),
      ...(frequency ? { frequency } : {}),
      ...(nextDueDate !== undefined ? { nextDueDate: nextDueDate ? new Date(nextDueDate) : null } : {}),
      ...(categoryId !== undefined ? { categoryId: categoryId || null } : {}),
      ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
      ...(typeof isActive === "boolean" ? { isActive } : {}),
    },
    include: { category: { select: { id: true, name: true, color: true } } },
  });

  return NextResponse.json({ expense });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; recurringId: string }> }
) {
  const { id, recurringId } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetAccess(session, id);
  if (access instanceof NextResponse) return access;

  await db.recurringExpense.delete({ where: { id: recurringId, budgetId: id } });

  return NextResponse.json({ ok: true });
}
