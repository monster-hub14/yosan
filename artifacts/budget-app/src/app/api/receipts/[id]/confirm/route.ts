import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetWrite } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { saveItemMemory, saveMerchantMemory } from "@/lib/ai/categorize";
import { detectDuplicate } from "@/lib/ai/duplicate-detect";

interface Params { params: Promise<{ id: string }> }

/**
 * POST /api/receipts/[id]/confirm
 *
 * Confirms a pending import and creates an Expense record.
 *
 * Body: {
 *   merchant?, date?, total?, notes?, categoryId?,
 *   items?: [{description, amount, quantity, categoryId?}],
 *   duplicateResolution?: "keep_new" | "keep_existing" | "skip" | null
 *   // if omitted and duplicate found, returns 409 with warning
 * }
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

  const access = await requireBudgetWrite(session, pending.budgetId);
  if (access instanceof NextResponse) return access;

  const budget = await db.budget.findUnique({
    where: { id: pending.budgetId },
    select: { id: true, currency: true },
  });
  if (!budget) return NextResponse.json({ error: "Budget not found" }, { status: 404 });

  const merchant: string | null = body.merchant ?? null;
  const dateStr: string | null = body.date ?? null;
  const total: number | null = body.total != null ? parseFloat(String(body.total)) : null;
  const categoryId: string | null = body.categoryId ?? null;
  const notes: string | null = body.notes ?? null;

  // duplicateResolution values:
  //   null / undefined = first-time check
  //   "keep_new"       = save this receipt, ignore potential duplicate
  //   "keep_existing"  = discard this pending import (keep existing expense as-is)
  //   "skip"           = same as discard for UI purposes
  const duplicateResolution: string | null = body.duplicateResolution ?? null;

  // Handle "keep_existing" — user chose to not save the new expense
  if (duplicateResolution === "keep_existing" || duplicateResolution === "skip") {
    await db.$transaction(async (tx) => {
      await tx.pendingImport.update({
        where: { id },
        data: { status: "DISCARDED" },
      });
      if (pending.receiptId) {
        await tx.receipt.update({
          where: { id: pending.receiptId },
          data: { status: "DISCARDED" },
        });
      }
    });
    return NextResponse.json({ ok: true, action: "discarded" });
  }

  // Duplicate check (only if not already resolved)
  if (!duplicateResolution) {
    const duplicate = await detectDuplicate(pending.budgetId, merchant, total, dateStr);
    if (duplicate.confidence === "high" || duplicate.confidence === "possible") {
      return NextResponse.json({
        duplicateWarning: true,
        confidence: duplicate.confidence,
        matchedExpenseId: duplicate.matchedExpenseId,
        reason: duplicate.reason,
        // Client should display these choices and re-POST with duplicateResolution set
        resolutionOptions: [
          { value: "keep_new", label: "Save as new expense" },
          { value: "keep_existing", label: "Discard this receipt (keep existing)" },
        ],
      }, { status: 409 });
    }
  }
  // "keep_new" or no duplicate found — proceed to create expense

  // Build items from body or pending import data
  const parsedData = JSON.parse(pending.data || "{}");
  const items: Array<{
    description: string;
    amount: number;
    quantity: number;
    categoryId?: string | null;
  }> = body.items ?? parsedData.items ?? [];

  // Create Expense + ReceiptItems in a transaction
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

    // Save receipt items linked to receipt (if any)
    if (items.length > 0 && pending.receiptId) {
      await tx.receiptItem.createMany({
        data: items.map((item) => ({
          receiptId: pending.receiptId!,
          expenseId: expense.id,
          name: item.description,
          price: item.amount,
          quantity: item.quantity ?? 1,
        })),
      });
    }

    // Confirm the pending import and link to the expense
    await tx.pendingImport.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        confirmedById: session.userId,
        expenseId: expense.id,
      },
    });

    // Update receipt status
    if (pending.receiptId) {
      await tx.receipt.update({
        where: { id: pending.receiptId },
        data: { status: "CONFIRMED" },
      });
    }

    // Persist any clarification answers from body
    const clarifications: Array<{ question: string; answer: string; itemDescription?: string }> =
      body.clarifications ?? [];
    for (const c of clarifications) {
      if (c.question && c.answer) {
        await tx.clarificationHistory.create({
          data: {
            receiptId: pending.receiptId ?? undefined,
            question: c.question,
            answer: c.answer,
            context: c.itemDescription ?? null,
          },
        }).catch(() => {}); // Non-fatal
      }
    }

    return expense;
  });

  // Fire-and-forget: save memory for future categorization
  if (merchant && categoryId) {
    saveMerchantMemory(pending.budgetId, merchant, categoryId).catch(() => {});
  }
  for (const item of items) {
    const resolvedCatId = item.categoryId ?? categoryId;
    if (item.description && resolvedCatId) {
      saveItemMemory(pending.budgetId, item.description, resolvedCatId).catch(() => {});
    }
  }

  return NextResponse.json({ expense, ok: true }, { status: 201 });
}
