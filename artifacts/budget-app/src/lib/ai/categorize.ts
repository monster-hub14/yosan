/**
 * Server-only categorization service.
 * Checks ItemMemory/MerchantMemory first, then calls AI.
 * NEVER import from client components.
 *
 * Ambiguity persistence:
 * - When AI flags an item as ambiguous, we upsert ItemMemory with isAmbiguous=true
 *   and the clarification question, so the SAME question is shown deterministically next time.
 * - When user resolves the ambiguity (via saveItemMemory), isAmbiguous=false is stored
 *   so future receipts categorize it silently from memory.
 */

import { db } from "@/lib/db";
import { getAIConfig, chatCompletion } from "./client";
import { checkAndRecordUsage } from "./usage";

export interface CategorySuggestion {
  categoryId: string | null;
  categoryName: string | null;
  confidence: "high" | "medium" | "low";
  fromMemory: boolean;
  isAmbiguous: boolean;
  clarificationQuestion: string | null;
  suggestedOptions: string[];
}

export interface ItemCategorizationRequest {
  budgetId: string;
  /** ID of the user making the request — used for per-user rate limit enforcement. */
  callerUserId: string;
  itemDescription: string;
  merchantName?: string | null;
  amount?: number;
}

export async function categorizeItem(
  req: ItemCategorizationRequest
): Promise<CategorySuggestion> {
  const { budgetId, callerUserId, itemDescription, merchantName } = req;
  const normalizedItem = itemDescription.toLowerCase().trim();

  // 1. Check ItemMemory — handles both resolved and persistent-ambiguous states
  const itemMemory = await db.itemMemory.findFirst({
    where: { budgetId, itemName: { equals: normalizedItem } },
    include: { defaultCategory: { select: { id: true, name: true } } },
  });

  if (itemMemory) {
    if (itemMemory.isAmbiguous) {
      // Previously ambiguous — re-ask the stored clarification question deterministically
      return {
        categoryId: null,
        categoryName: null,
        confidence: "low",
        fromMemory: true,
        isAmbiguous: true,
        clarificationQuestion: itemMemory.ambiguousQuestion ?? `What category does "${itemDescription}" belong to?`,
        suggestedOptions: [],
      };
    }
    if (itemMemory.defaultCategory) {
      // Known stable mapping — return from memory (no AI call)
      return {
        categoryId: itemMemory.defaultCategory.id,
        categoryName: itemMemory.defaultCategory.name,
        confidence: "high",
        fromMemory: true,
        isAmbiguous: false,
        clarificationQuestion: null,
        suggestedOptions: [],
      };
    }
  }

  // 2. Check MerchantMemory if no item match
  if (merchantName) {
    const merchantMemory = await db.merchantMemory.findFirst({
      where: { budgetId, merchantName: merchantName.toLowerCase() },
      include: { defaultCategory: { select: { id: true, name: true } } },
    });

    if (merchantMemory?.defaultCategory) {
      return {
        categoryId: merchantMemory.defaultCategory.id,
        categoryName: merchantMemory.defaultCategory.name,
        confidence: "medium",
        fromMemory: true,
        isAmbiguous: false,
        clarificationQuestion: null,
        suggestedOptions: [],
      };
    }
  }

  // 3. Try AI categorization
  const config = await getAIConfig();
  if (!config) {
    const fallback: CategorySuggestion = {
      categoryId: null,
      categoryName: null,
      confidence: "low",
      fromMemory: false,
      isAmbiguous: true,
      clarificationQuestion: `What category does "${itemDescription}" belong to?`,
      suggestedOptions: ["Food & Dining", "Shopping", "Transportation", "Utilities", "Other"],
    };
    // Persist so re-ask is deterministic on future receipts
    await saveAmbiguousItemMemory(budgetId, normalizedItem, fallback.clarificationQuestion!).catch(() => {});
    return fallback;
  }

  const usageCheck = await checkAndRecordUsage(callerUserId, "categorization");
  if (!usageCheck.allowed) {
    const fallback: CategorySuggestion = {
      categoryId: null,
      categoryName: null,
      confidence: "low",
      fromMemory: false,
      isAmbiguous: true,
      clarificationQuestion: `What category does "${itemDescription}" belong to? (${usageCheck.reason})`,
      suggestedOptions: ["Food & Dining", "Shopping", "Transportation", "Utilities", "Other"],
    };
    await saveAmbiguousItemMemory(budgetId, normalizedItem, fallback.clarificationQuestion!).catch(() => {});
    return fallback;
  }

  const categories = await db.category.findMany({
    where: { OR: [{ budgetId }, { isDefault: true, budgetId: null }] },
    select: { id: true, name: true },
    take: 30,
  });

  const categoryList = categories.map((c) => `${c.id}: ${c.name}`).join("\n");

  const prompt = `You are a budget categorization assistant. Categorize this purchase item.

Item: "${itemDescription}"
Merchant: "${merchantName ?? "Unknown"}"

Available categories:
${categoryList || "No categories defined yet."}

Respond with JSON only:
{
  "categoryId": "the_id_or_null",
  "categoryName": "the_name_or_null",
  "confidence": "high|medium|low",
  "isAmbiguous": false,
  "clarificationQuestion": null,
  "suggestedOptions": []
}

If ambiguous (e.g., "batteries" could be electronics or auto), set isAmbiguous=true, clarificationQuestion to a short question, and suggestedOptions to 2-4 category names.
If no category fits, use categoryId=null and suggest creating one.`;

  try {
    const response = await chatCompletion(config, [
      { role: "user", content: prompt },
    ], { maxTokens: 300, temperature: 0 });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON");
    const parsed = JSON.parse(jsonMatch[0]);

    const result: CategorySuggestion = {
      categoryId: parsed.categoryId ?? null,
      categoryName: parsed.categoryName ?? null,
      confidence: (["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium") as "high" | "medium" | "low",
      fromMemory: false,
      isAmbiguous: parsed.isAmbiguous === true,
      clarificationQuestion: parsed.clarificationQuestion ?? null,
      suggestedOptions: Array.isArray(parsed.suggestedOptions) ? parsed.suggestedOptions : [],
    };

    // Persist ambiguity state so future receipts re-ask the same question without an AI call
    if (result.isAmbiguous && result.clarificationQuestion) {
      await saveAmbiguousItemMemory(budgetId, normalizedItem, result.clarificationQuestion).catch(() => {});
    }

    return result;
  } catch {
    const fallback: CategorySuggestion = {
      categoryId: null,
      categoryName: null,
      confidence: "low",
      fromMemory: false,
      isAmbiguous: true,
      clarificationQuestion: `What category does "${itemDescription}" belong to?`,
      suggestedOptions: ["Food & Dining", "Shopping", "Transportation", "Utilities", "Other"],
    };
    await saveAmbiguousItemMemory(budgetId, normalizedItem, fallback.clarificationQuestion!).catch(() => {});
    return fallback;
  }
}

/** Persist ambiguous state (deterministic re-ask on next receipt). */
async function saveAmbiguousItemMemory(
  budgetId: string,
  itemName: string,
  clarificationQuestion: string
): Promise<void> {
  await db.itemMemory.upsert({
    where: { budgetId_itemName: { budgetId, itemName } },
    create: {
      budgetId,
      itemName,
      defaultCategoryId: null,
      isAmbiguous: true,
      ambiguousQuestion: clarificationQuestion,
      lastUsedAt: new Date(),
    },
    update: {
      isAmbiguous: true,
      ambiguousQuestion: clarificationQuestion,
      lastUsedAt: new Date(),
    },
  });
}

/**
 * Save a resolved item→category mapping.
 * Clears isAmbiguous so future receipts categorize silently from memory.
 */
export async function saveItemMemory(
  budgetId: string,
  itemDescription: string,
  categoryId: string
): Promise<void> {
  const itemName = itemDescription.toLowerCase().trim();
  await db.itemMemory.upsert({
    where: { budgetId_itemName: { budgetId, itemName } },
    create: {
      budgetId,
      itemName,
      defaultCategoryId: categoryId,
      isAmbiguous: false,
      ambiguousQuestion: null,
      lastUsedAt: new Date(),
    },
    update: {
      defaultCategoryId: categoryId,
      isAmbiguous: false,
      ambiguousQuestion: null,
      lastUsedAt: new Date(),
    },
  });
}

export async function saveMerchantMemory(
  budgetId: string,
  merchantName: string,
  categoryId: string
): Promise<void> {
  const name = merchantName.toLowerCase().trim();
  await db.merchantMemory.upsert({
    where: { budgetId_merchantName: { budgetId, merchantName: name } },
    create: { budgetId, merchantName: name, defaultCategoryId: categoryId, lastUsedAt: new Date() },
    update: { defaultCategoryId: categoryId, lastUsedAt: new Date() },
  });
}
