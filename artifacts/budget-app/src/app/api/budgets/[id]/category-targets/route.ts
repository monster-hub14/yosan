import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetRead, requireBudgetWrite } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

interface Params { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id: budgetId } = await params;
  const access = await requireBudgetRead(session, budgetId);
  if (access instanceof NextResponse) return access;

  const targets = await db.categoryTarget.findMany({
    where: { budgetId },
    include: { category: { select: { id: true, name: true, color: true, icon: true, parentId: true } } },
  });

  return NextResponse.json({ targets });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id: budgetId } = await params;
  const access = await requireBudgetWrite(session, budgetId);
  if (access instanceof NextResponse) return access;

  const body = await request.json() as {
    categoryId: string;
    amount: number | null;
    periodType?: string;
  };

  if (!body.categoryId) {
    return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
  }

  const cat = await db.category.findUnique({ where: { id: body.categoryId } });
  if (!cat) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  if (body.amount === null || body.amount === 0) {
    await db.categoryTarget.deleteMany({ where: { budgetId, categoryId: body.categoryId } });
    return NextResponse.json({ ok: true, target: null });
  }

  if (!body.amount || body.amount < 0) {
    return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
  }

  const target = await db.categoryTarget.upsert({
    where: { budgetId_categoryId: { budgetId, categoryId: body.categoryId } },
    create: {
      budgetId,
      categoryId: body.categoryId,
      amount: parseFloat(String(body.amount)),
      periodType: body.periodType ?? "monthly",
    },
    update: {
      amount: parseFloat(String(body.amount)),
      periodType: body.periodType ?? "monthly",
    },
    include: { category: { select: { id: true, name: true, color: true, icon: true } } },
  });

  return NextResponse.json({ target });
}
