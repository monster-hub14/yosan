import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireBudgetRead, requireBudgetWrite, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { monthlyToPerPeriod } from "@/lib/pay-period";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetRead(session, id);
  if (access instanceof NextResponse) return access;

  const goals = await db.savingsGoal.findMany({
    where: { budgetId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ goals });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetWrite(session, id);
  if (access instanceof NextResponse) return access;

  const {
    name,
    targetAmount,
    perPaycheckAmount,
    isMonthlyGoal = false,
    targetDate,
    notes,
  } = await request.json();

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (typeof targetAmount !== "number" || targetAmount < 0) {
    return NextResponse.json({ error: "Valid target amount is required" }, { status: 400 });
  }

  let computedPerPaycheck = perPaycheckAmount ?? null;

  if (isMonthlyGoal && typeof perPaycheckAmount === "number") {
    const activeSources = await db.incomeSource.findFirst({
      where: { budgetId: id, isActive: true },
      select: { frequency: true, customDays: true },
    });
    if (activeSources) {
      computedPerPaycheck = monthlyToPerPeriod(perPaycheckAmount, activeSources.frequency, activeSources.customDays);
    }
  }

  const goal = await db.savingsGoal.create({
    data: {
      budgetId: id,
      name: name.trim(),
      targetAmount,
      perPaycheckAmount: computedPerPaycheck,
      isMonthlyGoal,
      targetDate: targetDate ? new Date(targetDate) : null,
      notes: notes?.trim() || null,
    },
  });

  return NextResponse.json({ goal }, { status: 201 });
}
