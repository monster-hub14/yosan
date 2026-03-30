/**
 * Server-only receipt extraction service.
 * Sends image/text to the configured AI provider and returns structured data.
 * NEVER import from client components.
 */

import { getAIConfig, chatCompletion, AIClientError } from "./client";
import type { AIConfig } from "./client";

export interface ExtractedItem {
  description: string;
  amount: number;
  quantity: number;
  confidence: "high" | "medium" | "low";
}

export interface ExtractedReceipt {
  merchant: string | null;
  date: string | null; // ISO date YYYY-MM-DD
  total: number | null;
  items: ExtractedItem[];
  rawText?: string;
  confidence: "high" | "medium" | "low";
  error?: string;
}

const FALLBACK: ExtractedReceipt = {
  merchant: null,
  date: null,
  total: null,
  items: [],
  confidence: "low",
  error: "AI extraction unavailable",
};

const SYSTEM_PROMPT = `You are a receipt parser. Extract structured data from the provided receipt image or text.
Return ONLY valid JSON with this exact structure:
{
  "merchant": "Store Name or null",
  "date": "YYYY-MM-DD or null",
  "total": 12.34 or null,
  "items": [
    {
      "description": "Item name",
      "amount": 4.99,
      "quantity": 1,
      "confidence": "high|medium|low"
    }
  ],
  "overall_confidence": "high|medium|low"
}

Rules:
- merchant: normalize to proper name (e.g. "WALMART SUPERCENTER" → "Walmart")
- date: extract the purchase date, not the print date
- total: the final charged amount (after tax, discounts)
- items: include all line items visible; omit tax, tip, subtotal lines
- confidence: "high" if clearly visible, "medium" if partially legible, "low" if guessed
- overall_confidence: based on overall receipt quality`;

function buildMessages(config: AIConfig, imageUrl: string | null, rawText: string | null) {
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

  if (imageUrl) {
    if (config.provider === "OPENAI" || config.provider === "OLLAMA" || config.provider === "CUSTOM") {
      content.push({ type: "image_url", image_url: { url: imageUrl } });
    } else if (config.provider === "GOOGLE") {
      content.push({ type: "image_url", image_url: { url: imageUrl } });
    } else if (config.provider === "ANTHROPIC") {
      const base64Data = imageUrl.split(",")[1] ?? "";
      const mimeType = imageUrl.startsWith("data:image/png") ? "image/png" : "image/jpeg";
      content.push({
        type: "image",
        // Anthropic uses a different format, but we can send as text for now
        text: `[Image data: ${mimeType}, ${base64Data.length} bytes]`,
      } as unknown as { type: string; text: string });
    }
  }

  if (rawText) {
    content.push({ type: "text", text: `Receipt text:\n${rawText}` });
  }

  if (!imageUrl && !rawText) {
    content.push({ type: "text", text: "No receipt data provided." });
  }

  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: content as Parameters<typeof chatCompletion>[1][0]["content"] },
  ];
}

function parseExtractedJson(text: string): ExtractedReceipt {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  const parsed = JSON.parse(jsonMatch[0]);

  const items: ExtractedItem[] = (parsed.items ?? []).map((item: Record<string, unknown>) => ({
    description: String(item.description ?? "Unknown item"),
    amount: Number(item.amount ?? 0),
    quantity: Number(item.quantity ?? 1),
    confidence: (["high", "medium", "low"].includes(String(item.confidence)) ? item.confidence : "medium") as "high" | "medium" | "low",
  }));

  return {
    merchant: parsed.merchant ?? null,
    date: parsed.date ?? null,
    total: parsed.total != null ? Number(parsed.total) : null,
    items,
    confidence: (["high", "medium", "low"].includes(parsed.overall_confidence) ? parsed.overall_confidence : "medium") as "high" | "medium" | "low",
  };
}

export async function extractReceiptFromImage(
  imageDataUrl: string | null,
  rawText: string | null = null
): Promise<ExtractedReceipt> {
  const config = await getAIConfig();
  if (!config) return { ...FALLBACK, error: "AI is not configured or disabled" };

  try {
    const messages = buildMessages(config, imageDataUrl, rawText);
    const response = await chatCompletion(config, messages, {
      maxTokens: 1500,
      temperature: 0,
      jsonMode: config.provider === "OPENAI" || config.provider === "CUSTOM",
    });

    return parseExtractedJson(response.content);
  } catch (err) {
    if (err instanceof AIClientError) {
      return { ...FALLBACK, error: `AI error: ${err.message}` };
    }
    if (err instanceof SyntaxError) {
      return { ...FALLBACK, error: "AI returned invalid JSON" };
    }
    return { ...FALLBACK, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
