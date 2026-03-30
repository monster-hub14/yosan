import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireBudgetWrite, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import type { PayFrequency } from "@prisma/client";

const VALID_FREQUENCIES: PayFrequency[] = ["WEEKLY", "BIWEEKLY", "SEMIMONTHLY", "MONTHLY", "QUARTERLY", "ANNUALLY", "CUSTOM"];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const { id, sourceId } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetWrite(session, id);
  if (access instanceof NextResponse) return access;

  const { name, amount, frequency, customDays, nextPayDate, notes, isActive } =
    await request.json();

  if (frequency && !VALID_FREQUENCIES.includes(frequency)) {
    return NextResponse.json({ error: "Invalid frequency" }, { status: 400 });
  }

  const source = await db.incomeSource.update({
    where: { id: sourceId, budgetId: id },
    data: {
      ...(name ? { name: name.trim() } : {}),
      ...(typeof amount === "number" ? { amount } : {}),
      ...(frequency ? { frequency, customDays: frequency === "CUSTOM" ? (customDays ?? null) : null } : {}),
      ...(nextPayDate !== undefined ? { nextPayDate: nextPayDate ? new Date(nextPayDate) : null } : {}),
      ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
      ...(typeof isActive === "boolean" ? { isActive } : {}),
    },
  });

  return NextResponse.json({ source });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const { id, sourceId } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetWrite(session, id);
  if (access instanceof NextResponse) return access;

  await db.incomeSource.delete({ where: { id: sourceId, budgetId: id } });

  return NextResponse.json({ ok: true });
}
