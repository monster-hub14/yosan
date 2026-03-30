import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetWrite } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

interface Params { params: Promise<{ id: string }> }

async function verifyCanManage(session: { userId: string; role: string }, categoryId: string) {
  const cat = await db.category.findUnique({ where: { id: categoryId } });
  if (!cat) return { error: NextResponse.json({ error: "Category not found" }, { status: 404 }) };

  if (cat.isDefault && cat.budgetId === null) {
    if (session.role !== "ADMIN") {
      return { error: NextResponse.json({ error: "Only admins can modify global categories" }, { status: 403 }) };
    }
    return { cat };
  }

  if (cat.budgetId) {
    const access = await requireBudgetWrite(session as Parameters<typeof requireBudgetWrite>[0], cat.budgetId);
    if (access instanceof NextResponse) return { error: access };
  }

  return { cat };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id } = await params;
  const body = await request.json() as {
    name?: string;
    color?: string;
    icon?: string;
    parentId?: string | null;
    sortOrder?: number;
  };

  const { cat, error } = await verifyCanManage(session, id);
  if (error) return error;
  if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.parentId !== undefined && body.parentId !== null) {
    const parent = await db.category.findUnique({ where: { id: body.parentId } });
    if (!parent) return NextResponse.json({ error: "Parent category not found" }, { status: 404 });
    if (parent.parentId) return NextResponse.json({ error: "Cannot nest more than 2 levels" }, { status: 400 });
    if (body.parentId === id) return NextResponse.json({ error: "Cannot be its own parent" }, { status: 400 });
    // Parent must be in same budget or be a global default (budgetId: null, isDefault: true)
    if (cat.budgetId && parent.budgetId !== cat.budgetId && !(parent.isDefault && parent.budgetId === null)) {
      return NextResponse.json({ error: "Parent category does not belong to this budget" }, { status: 400 });
    }
  }

  const updated = await db.category.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
      ...(body.icon !== undefined ? { icon: body.icon } : {}),
      ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    },
  });

  return NextResponse.json({ category: updated });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id } = await params;

  const { cat, error } = await verifyCanManage(session, id);
  if (error) return error;
  if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const expenseCount = await db.expense.count({ where: { categoryId: id } });
  if (expenseCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${expenseCount} expense(s) use this category. Reassign them first.` },
      { status: 409 }
    );
  }

  const childCount = await db.category.count({ where: { parentId: id } });
  if (childCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete: category has ${childCount} subcategory(ies). Delete them first.` },
      { status: 409 }
    );
  }

  await db.category.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
