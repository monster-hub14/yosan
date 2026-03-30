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
 *   clarifications?: [{question, categoryId, categoryName, itemDescription}],
 *   duplicateResolution?: "keep_new" | "keep_existing" | null
 *   // if omitted and duplicate found, returns 409 with warning
 * }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id } = await params;
  const body = await request.json() as {
    merchant?: string | null;
    date?: string | null;
    total?: number | null;
    notes?: string | null;
    categoryId?: string | null;
    items?: Array<{
      description: string;
      amount: number;
      quantity?: number;
      categoryId?: string | null;
      isAmbiguous?: boolean;
    }>;
    clarifications?: Array<{
      question?: string | null;
      categoryId?: string | null;
      categoryName?: string | null;
      itemDescription?: string | null;
    }>;
    duplicateResolution?: string | null;
  };

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
  const duplicateResolution: string | null = body.duplicateResolution ?? null;

  // Handle "keep_existing" — user chose to discard this new import
  if (duplicateResolution === "keep_existing") {
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

  // Handle "merge" — merge the new receipt's items/notes into the existing matched expense
  if (duplicateResolution?.startsWith("merge:")) {
    const targetExpenseId = duplicateResolution.slice("merge:".length);
    const targetExpense = await db.expense.findFirst({
      where: { id: targetExpenseId, budgetId: pending.budgetId },
      select: { id: true, amount: true, notes: true, receiptId: true },
    });
    if (!targetExpense) {
      return NextResponse.json({ error: "Merge target not found" }, { status: 404 });
    }
    const parsedDataForMerge = JSON.parse(pending.data || "{}") as { items?: Array<{ description: string; amount: number; quantity?: number }> };
    const mergeItems = body.items ?? parsedDataForMerge.items ?? [];

    const mergeReceiptId = pending.receiptId ?? targetExpense.receiptId;
    await db.$transaction(async (tx) => {
      // Add receipt items to the existing expense
      if (mergeItems.length > 0 && mergeReceiptId) {
        await tx.receiptItem.createMany({
          data: mergeItems.map((item) => ({
            receiptId: mergeReceiptId,
            expenseId: targetExpense.id,
            name: item.description,
            price: item.amount,
            quantity: item.quantity ?? 1,
          })),
        });
      }
      // Merge the totals
      if (total != null) {
        await tx.expense.update({
          where: { id: targetExpense.id },
          data: {
            amount: targetExpense.amount + total,
            notes: [targetExpense.notes, notes].filter(Boolean).join(" | ") || targetExpense.notes || null,
          },
        });
      }
      // Mark this import as discarded (merged into existing)
      await tx.pendingImport.update({
        where: { id },
        data: {
          status: "DISCARDED",
          confirmedAt: new Date(),
          confirmedById: session.userId,
          expenseId: targetExpense.id,
        },
      });
      if (pending.receiptId) {
        await tx.receipt.update({
          where: { id: pending.receiptId },
          data: { status: "DISCARDED" },
        });
      }
    });
    return NextResponse.json({ ok: true, action: "merged", expenseId: targetExpenseId });
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
        resolutionOptions: [
          { value: "keep_new", label: "Save as new expense" },
          { value: `merge:${duplicate.matchedExpenseId}`, label: "Merge into existing expense" },
          { value: "keep_existing", label: "Discard this receipt (keep existing)" },
        ],
      }, { status: 409 });
    }
  }
  // "keep_new" or no duplicate found — proceed to create expense

  // Build items from body or pending import data
  const parsedData = JSON.parse(pending.data || "{}") as {
    items?: Array<{
      description: string;
      amount: number;
      quantity: number;
      categoryId?: string | null;
      categorySuggestion?: { categoryId?: string | null; isAmbiguous?: boolean } | null;
    }>;
  };
  const items = body.items ?? parsedData.items ?? [];

  // Create Expense + ReceiptItems in a transaction
  const expense = await db.$transaction(async (tx) => {
    const newExpense = await tx.expense.create({
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
          expenseId: newExpense.id,
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
        expenseId: newExpense.id,
      },
    });

    // Update receipt status
    if (pending.receiptId) {
      await tx.receipt.update({
        where: { id: pending.receiptId },
        data: { status: "CONFIRMED" },
      });
    }

    // Persist clarification answers: {question, categoryId (= the answer), categoryName, itemDescription}
    const clarifications = body.clarifications ?? [];
    for (const c of clarifications) {
      if (c.question && c.categoryName) {
        await tx.clarificationHistory.create({
          data: {
            receiptId: pending.receiptId ?? undefined,
            question: c.question,
            answer: c.categoryName,
            context: c.itemDescription ?? null,
          },
        }).catch(() => {}); // Non-fatal
      }
    }

    return newExpense;
  });

  // Fire-and-forget: save memory ONLY for non-ambiguous items
  // Build a set of ambiguous item descriptions from clarifications (answered by user) and body items
  const ambiguousItemDescs = new Set<string>(
    (body.clarifications ?? [])
      .filter((c) => c.itemDescription)
      .map((c) => (c.itemDescription ?? "").toLowerCase())
  );

  if (merchant && categoryId) {
    saveMerchantMemory(pending.budgetId, merchant, categoryId).catch(() => {});
  }
  for (const item of items) {
    const resolvedCatId = item.categoryId ?? categoryId;
    const isAmbiguous =
      ("isAmbiguous" in item && item.isAmbiguous === true) ||
      ("categorySuggestion" in item && (item as { categorySuggestion?: { isAmbiguous?: boolean } | null }).categorySuggestion?.isAmbiguous === true) ||
      ambiguousItemDescs.has((item.description ?? "").toLowerCase());
    if (item.description && resolvedCatId && !isAmbiguous) {
      saveItemMemory(pending.budgetId, item.description, resolvedCatId).catch(() => {});
    }
  }

  return NextResponse.json({ expense, ok: true }, { status: 201 });
}
