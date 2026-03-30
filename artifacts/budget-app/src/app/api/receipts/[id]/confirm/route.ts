import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { saveItemMemory, saveMerchantMemory } from "@/lib/ai/categorize";
import { detectDuplicate } from "@/lib/ai/duplicate-detect";

interface Params { params: Promise<{ id: string }> }

/**
 * POST /api/receipts/[id]/confirm
 * Confirms a pending import and creates an Expense record.
 * Body: { items: [...], merchant, date, total, categoryId? }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id } = await params;
  const body = await request.json();

  const pending = await db.pendingImport.findUnique({
    where: { id },
    include: { receipt: true },
  });
  if (!pending) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pending.status === "CONFIRMED" || pending.status === "DISCARDED") {
    return NextResponse.json({ error: `Already ${pending.status.toLowerCase()}` }, { status: 409 });
  }

  const budget = await db.budget.findFirst({
    where: {
      id: pending.budgetId,
      OR: [
        { ownerId: session.userId },
        { memberships: { some: { userId: session.userId } } },
      ],
    },
    select: { id: true, currency: true },
  });
  if (!budget) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const merchant: string | null = body.merchant ?? null;
  const dateStr: string | null = body.date ?? null;
  const total: number | null = body.total != null ? parseFloat(body.total) : null;
  const categoryId: string | null = body.categoryId ?? null;
  const notes: string | null = body.notes ?? null;
  const forceConfirm: boolean = body.forceConfirm === true;

  // Duplicate check
  if (!forceConfirm) {
    const duplicate = await detectDuplicate(pending.budgetId, merchant, total, dateStr);
    if (duplicate.confidence === "high") {
      return NextResponse.json({
        duplicateWarning: true,
        confidence: "high",
        matchedExpenseId: duplicate.matchedExpenseId,
        reason: duplicate.reason,
        message: "A very similar expense already exists. Use forceConfirm=true to save anyway.",
      }, { status: 409 });
    }
    if (duplicate.confidence === "possible") {
      return NextResponse.json({
        duplicateWarning: true,
        confidence: "possible",
        matchedExpenseId: duplicate.matchedExpenseId,
        reason: duplicate.reason,
        message: "A similar expense may already exist. Use forceConfirm=true to save anyway.",
      }, { status: 409 });
    }
  }

  // Build items from body or pending import data
  const parsedData = JSON.parse(pending.data || "{}");
  const items: Array<{
    description: string;
    amount: number;
    quantity: number;
    categoryId?: string | null;
  }> = body.items ?? parsedData.items ?? [];

  // Create Expense + ExpenseItems in a transaction
  const expense = await db.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        budgetId: pending.budgetId,
        categoryId: categoryId || undefined,
        merchant,
        date: dateStr ? new Date(dateStr) : new Date(),
        amount: total ?? 0,
        currency: budget.currency || "USD",
        notes,
        receiptId: pending.receiptId ?? undefined,
        addedById: session.userId,
      },
    });

    if (items.length > 0 && pending.receiptId) {
      await tx.receiptItem.createMany({
        data: items.map((item) => ({
          receiptId: pending.receiptId!,
          expenseId: expense.id,
          name: item.description,
          price: item.amount,
          quantity: item.quantity ?? 1,
          category: (item.categoryId || categoryId) ? undefined : undefined,
        })),
      });
    }

    await tx.pendingImport.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        confirmedById: session.userId,
        expenseId: expense.id,
      },
    });

    if (pending.receipt?.id) {
      await tx.receipt.update({
        where: { id: pending.receipt.id },
        data: { status: "CONFIRMED" },
      });
    }

    return expense;
  });

  // Fire-and-forget: save memory for future categorization
  if (merchant && categoryId) {
    saveMerchantMemory(pending.budgetId, merchant, categoryId).catch(() => {});
  }
  for (const item of items) {
    if (item.description && (item.categoryId || categoryId)) {
      saveItemMemory(pending.budgetId, item.description, (item.categoryId ?? categoryId)!).catch(() => {});
    }
  }

  return NextResponse.json({ expense, ok: true }, { status: 201 });
}
