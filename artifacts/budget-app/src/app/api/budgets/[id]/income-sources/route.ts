import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireBudgetAccess, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import type { PayFrequency } from "@prisma/client";

const VALID_FREQUENCIES: PayFrequency[] = ["WEEKLY", "BIWEEKLY", "SEMIMONTHLY", "MONTHLY", "QUARTERLY", "ANNUALLY", "CUSTOM"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetAccess(session, id);
  if (access instanceof NextResponse) return access;

  const sources = await db.incomeSource.findMany({
    where: { budgetId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ sources });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetAccess(session, id);
  if (access instanceof NextResponse) return access;

  const { name, amount, frequency = "BIWEEKLY", customDays, nextPayDate, notes } =
    await request.json();

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
  }
  if (!VALID_FREQUENCIES.includes(frequency)) {
    return NextResponse.json({ error: "Invalid frequency" }, { status: 400 });
  }

  const source = await db.incomeSource.create({
    data: {
      budgetId: id,
      name: name.trim(),
      amount,
      frequency,
      customDays: frequency === "CUSTOM" ? (customDays ?? null) : null,
      nextPayDate: nextPayDate ? new Date(nextPayDate) : null,
      notes: notes?.trim() || null,
    },
  });

  return NextResponse.json({ source }, { status: 201 });
}
