import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetRead, requireBudgetWrite } from "@/lib/auth/permissions";
import { getActiveBudgetId } from "@/lib/active-budget";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { searchParams } = new URL(request.url);
  let budgetId = searchParams.get("budgetId");
  if (!budgetId) budgetId = await getActiveBudgetId(session.userId);

  if (budgetId) {
    const access = await requireBudgetRead(session, budgetId);
    if (access instanceof NextResponse) return access;
  }

  const flat = await db.category.findMany({
    where: {
      OR: [
        ...(budgetId ? [{ budgetId }] : []),
        { isDefault: true, budgetId: null },
      ],
    },
    include: {
      targets: budgetId ? { where: { budgetId } } : false,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  // Build tree from flat list
  const byId = new Map(flat.map((c) => ({ ...c, children: [] as typeof flat })).map((c) => [c.id, c]));
  const roots: typeof flat = [];

  for (const cat of byId.values()) {
    if (cat.parentId && byId.has(cat.parentId)) {
      byId.get(cat.parentId)!.children.push(cat);
    } else {
      roots.push(cat);
    }
  }

  return NextResponse.json({ categories: roots, flat });
}

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const body = await request.json() as {
    name: string;
    budgetId?: string;
    parentId?: string;
    color?: string;
    icon?: string;
    isDefault?: boolean;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  let budgetId = body.budgetId;
  if (!budgetId) budgetId = await getActiveBudgetId(session.userId) ?? undefined;

  if (budgetId) {
    const access = await requireBudgetWrite(session, budgetId);
    if (access instanceof NextResponse) return access;
  } else if (body.isDefault) {
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can create global default categories" }, { status: 403 });
    }
  }

  if (body.parentId) {
    const parent = await db.category.findUnique({ where: { id: body.parentId } });
    if (!parent) return NextResponse.json({ error: "Parent category not found" }, { status: 404 });
    if (parent.parentId) return NextResponse.json({ error: "Cannot nest more than 2 levels" }, { status: 400 });
  }

  const category = await db.category.create({
    data: {
      name: body.name.trim(),
      budgetId: budgetId ?? null,
      parentId: body.parentId ?? null,
      color: body.color ?? "#6b7280",
      icon: body.icon ?? null,
      isDefault: body.isDefault ?? false,
    },
  });

  return NextResponse.json({ category }, { status: 201 });
}
