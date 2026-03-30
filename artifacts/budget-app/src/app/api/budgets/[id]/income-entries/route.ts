import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireBudgetRead, requireBudgetWrite, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetRead(session, id);
  if (access instanceof NextResponse) return access;

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const after = searchParams.get("after");

  const entries = await db.incomeEntry.findMany({
    where: {
      budgetId: id,
      ...(after ? { date: { gte: new Date(after) } } : {}),
    },
    orderBy: { date: "desc" },
    take: Math.min(limit, 200),
    include: {
      incomeSource: { select: { id: true, name: true, frequency: true } },
      user: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ entries });
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

  const { amount, date, note, incomeSourceId } = await request.json();

  if (typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
  }
  if (!date) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 });
  }

  const entry = await db.incomeEntry.create({
    data: {
      budgetId: id,
      userId: session.userId,
      amount,
      date: new Date(date),
      note: note?.trim() || null,
      incomeSourceId: incomeSourceId || null,
    },
    include: {
      incomeSource: { select: { id: true, name: true, frequency: true } },
      user: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ entry }, { status: 201 });
}
