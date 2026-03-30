import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireBudgetRead, requireBudgetWrite, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import type { ExpenseFrequency } from "@prisma/client";

const VALID_FREQUENCIES: ExpenseFrequency[] = ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetRead(session, id);
  if (access instanceof NextResponse) return access;

  const recurring = await db.recurringExpense.findMany({
    where: { budgetId: id },
    orderBy: [{ nextDueDate: "asc" }, { name: "asc" }],
    include: { category: { select: { id: true, name: true, color: true } } },
  });

  return NextResponse.json({ recurring });
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

  const { name, amount, frequency = "MONTHLY", nextDueDate, categoryId, notes } =
    await request.json();

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
  }
  if (!VALID_FREQUENCIES.includes(frequency)) {
    return NextResponse.json({ error: "Invalid frequency" }, { status: 400 });
  }

  const expense = await db.recurringExpense.create({
    data: {
      budgetId: id,
      name: name.trim(),
      amount,
      frequency,
      nextDueDate: nextDueDate ? new Date(nextDueDate) : null,
      categoryId: categoryId || null,
      notes: notes?.trim() || null,
    },
    include: { category: { select: { id: true, name: true, color: true } } },
  });

  return NextResponse.json({ expense }, { status: 201 });
}
