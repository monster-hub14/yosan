/**
 * Server-only categorization service.
 * Checks ItemMemory/MerchantMemory first, then calls AI.
 * NEVER import from client components.
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

  // 1. Check ItemMemory for exact or close match
  const itemMemory = await db.itemMemory.findFirst({
    where: { budgetId, itemName: { equals: normalizedItem } },
    include: { defaultCategory: { select: { id: true, name: true } } },
  });

  if (itemMemory?.defaultCategory) {
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
    return {
      categoryId: null,
      categoryName: null,
      confidence: "low",
      fromMemory: false,
      isAmbiguous: true,
      clarificationQuestion: `What category does "${itemDescription}" belong to?`,
      suggestedOptions: ["Food & Dining", "Shopping", "Transportation", "Utilities", "Other"],
    };
  }

  // Enforce per-call rate limits against the actual requesting user
  const usageCheck = await checkAndRecordUsage(callerUserId, "categorization");
  if (!usageCheck.allowed) {
    return {
      categoryId: null,
      categoryName: null,
      confidence: "low",
      fromMemory: false,
      isAmbiguous: true,
      clarificationQuestion: `What category does "${itemDescription}" belong to? (${usageCheck.reason})`,
      suggestedOptions: ["Food & Dining", "Shopping", "Transportation", "Utilities", "Other"],
    };
  }

  // Get budget categories for context
  const categories = await db.category.findMany({
    where: { OR: [{ budgetId }, { isDefault: true }] },
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

    return {
      categoryId: parsed.categoryId ?? null,
      categoryName: parsed.categoryName ?? null,
      confidence: (["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium") as "high" | "medium" | "low",
      fromMemory: false,
      isAmbiguous: parsed.isAmbiguous === true,
      clarificationQuestion: parsed.clarificationQuestion ?? null,
      suggestedOptions: Array.isArray(parsed.suggestedOptions) ? parsed.suggestedOptions : [],
    };
  } catch {
    return {
      categoryId: null,
      categoryName: null,
      confidence: "low",
      fromMemory: false,
      isAmbiguous: true,
      clarificationQuestion: `What category does "${itemDescription}" belong to?`,
      suggestedOptions: ["Food & Dining", "Shopping", "Transportation", "Utilities", "Other"],
    };
  }
}

export async function saveItemMemory(
  budgetId: string,
  itemDescription: string,
  categoryId: string
): Promise<void> {
  const itemName = itemDescription.toLowerCase().trim();
  await db.itemMemory.upsert({
    where: { budgetId_itemName: { budgetId, itemName } },
    create: { budgetId, itemName, defaultCategoryId: categoryId, lastUsedAt: new Date() },
    update: { defaultCategoryId: categoryId, lastUsedAt: new Date() },
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
