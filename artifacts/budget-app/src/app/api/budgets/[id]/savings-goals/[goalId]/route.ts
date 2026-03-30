import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireBudgetAccess, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { monthlyToPerPeriod } from "@/lib/pay-period";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; goalId: string }> }
) {
  const { id, goalId } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetAccess(session, id);
  if (access instanceof NextResponse) return access;

  const {
    name,
    targetAmount,
    currentAmount,
    perPaycheckAmount,
    isMonthlyGoal,
    targetDate,
    notes,
    isActive,
  } = await request.json();

  let computedPerPaycheck = perPaycheckAmount !== undefined ? perPaycheckAmount : undefined;

  if (isMonthlyGoal && typeof perPaycheckAmount === "number") {
    const activeSources = await db.incomeSource.findFirst({
      where: { budgetId: id, isActive: true },
      select: { frequency: true, customDays: true },
    });
    if (activeSources) {
      computedPerPaycheck = monthlyToPerPeriod(perPaycheckAmount, activeSources.frequency, activeSources.customDays);
    }
  }

  const goal = await db.savingsGoal.update({
    where: { id: goalId, budgetId: id },
    data: {
      ...(name ? { name: name.trim() } : {}),
      ...(typeof targetAmount === "number" ? { targetAmount } : {}),
      ...(typeof currentAmount === "number" ? { currentAmount } : {}),
      ...(computedPerPaycheck !== undefined ? { perPaycheckAmount: computedPerPaycheck } : {}),
      ...(typeof isMonthlyGoal === "boolean" ? { isMonthlyGoal } : {}),
      ...(targetDate !== undefined ? { targetDate: targetDate ? new Date(targetDate) : null } : {}),
      ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
      ...(typeof isActive === "boolean" ? { isActive } : {}),
    },
  });

  return NextResponse.json({ goal });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; goalId: string }> }
) {
  const { id, goalId } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetAccess(session, id);
  if (access instanceof NextResponse) return access;

  await db.savingsGoal.delete({ where: { id: goalId, budgetId: id } });

  return NextResponse.json({ ok: true });
}
