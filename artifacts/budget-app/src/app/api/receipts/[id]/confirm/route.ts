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
    isRecurring?: boolean;
    frequency?: string;
  };

  const pending = await db.pendingImport.findUnique({
    where: { id },
    include: { receipt: true },
  });
  if (!pending) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pending.status === "DISCARDED") {
    return NextResponse.json({ error: "Already discarded" }, { status: 409 });
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
  const isRecurring: boolean = body.isRecurring === true;
  const frequency: string = body.frequency ?? "MONTHLY";

  // Handle "save as recurring bill" — create a RecurringExpense instead of an Expense
  if (isRecurring) {
    const VALID_FREQUENCIES = ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"];
    const safeFrequency = VALID_FREQUENCIES.includes(frequency) ? frequency : "MONTHLY";
    await db.$transaction(async (tx) => {
      await tx.recurringExpense.create({
        data: {
          budgetId: pending.budgetId,
          categoryId: categoryId || undefined,
          name: merchant || "Unknown",
          amount: total ?? 0,
          frequency: safeFrequency as "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY",
          notes: notes || undefined,
        },
      });
      await tx.pendingImport.delete({ where: { id } });
      if (pending.receiptId) {
        await tx.receipt.update({
          where: { id: pending.receiptId },
          data: { status: "CONFIRMED" },
        });
      }
    });
    return NextResponse.json({ ok: true, action: "recurring" }, { status: 201 });
  }

  // Handle "keep_existing" — user chose to discard this new import
  if (duplicateResolution === "keep_existing") {
    await db.$transaction(async (tx) => {
      await tx.pendingImport.delete({ where: { id } });
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
      // Link any new receipt items to the existing expense without inflating the total.
      // The incoming receipt is a duplicate — we preserve the existing canonical amount
      // and only merge supporting data (items, receipt linkage, notes).
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
      // Append notes if provided, but do NOT change amount (would double-count)
      if (notes && notes !== targetExpense.notes) {
        await tx.expense.update({
          where: { id: targetExpense.id },
          data: {
            notes: [targetExpense.notes, notes].filter(Boolean).join(" | ") || targetExpense.notes || null,
          },
        });
      }
      await tx.pendingImport.delete({ where: { id } });
      if (pending.receiptId) {
        await tx.receipt.update({
          where: { id: pending.receiptId },
          data: { status: "CONFIRMED" },
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

  // Guard against clearly-wrong dates (e.g. abbreviated year "26" stored as year 0026 by Chrome).
  // Only enforced here, on the expense-creation path — not on discard/merge paths above.
  if (dateStr) {
    const parsedYear = new Date(dateStr).getFullYear();
    if (isNaN(parsedYear) || parsedYear < 2000) {
      return NextResponse.json(
        { error: "Expense date appears incorrect (year before 2000). Please correct the date — use four digits for the year (e.g. 2026)." },
        { status: 400 }
      );
    }
  }

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

    await tx.pendingImport.delete({ where: { id } });

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
