/**
 * Shared AI receipt processing pipeline.
 * Called after a Receipt + PendingImport are created (upload or email ingest).
 *
 * Non-blocking: caller should fire-and-forget with .catch(console.error).
 */
import { db } from "@/lib/db";
import { extractReceiptFromImage } from "./extract";
import { categorizeItem } from "./categorize";
import { isFeatureEnabled, checkAndRecordUsage } from "./usage";
import fs from "fs";

export async function processReceipt(
  pendingId: string,
  receiptId: string,
  budgetId: string,
  userId: string,
  filePath: string,
  mimeType: string
): Promise<void> {
  try {
    const extractionEnabled = await isFeatureEnabled("extraction", userId);
    if (!extractionEnabled) {
      await db.pendingImport.update({
        where: { id: pendingId },
        data: {
          status: "NEEDS_REVIEW",
          data: JSON.stringify({
            merchant: null, date: null, total: null, items: [],
            confidence: "low", error: "AI extraction is disabled",
          }),
        },
      });
      return;
    }

    const usageCheck = await checkAndRecordUsage(userId, "extraction");
    if (!usageCheck.allowed) {
      await db.pendingImport.update({
        where: { id: pendingId },
        data: {
          status: "NEEDS_REVIEW",
          data: JSON.stringify({
            merchant: null, date: null, total: null, items: [],
            confidence: "low", error: usageCheck.reason,
          }),
        },
      });
      return;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString("base64");
    const imageUrl = `data:${mimeType};base64,${base64}`;

    const extracted = await extractReceiptFromImage(
      mimeType.startsWith("application/pdf") ? null : imageUrl,
      mimeType.startsWith("application/pdf") ? "[PDF — text extraction not available]" : null
    );

    const categorizationEnabled = await isFeatureEnabled("categorization", userId);
    const categorizedItems = [];
    for (const item of extracted.items) {
      let categorySuggestion = null;
      if (categorizationEnabled) {
        try {
          categorySuggestion = await categorizeItem({
            budgetId,
            callerUserId: userId,
            itemDescription: item.description,
            merchantName: extracted.merchant,
            amount: item.amount,
          });
        } catch { /* non-fatal */ }
      }
      categorizedItems.push({ ...item, categorySuggestion });
    }

    await db.receipt.update({
      where: { id: receiptId },
      data: {
        merchantName: extracted.merchant,
        receiptDate: extracted.date ? new Date(extracted.date) : null,
        totalAmount: extracted.total,
        status: "NEEDS_REVIEW",
        processedAt: new Date(),
      },
    });

    await db.pendingImport.update({
      where: { id: pendingId },
      data: {
        status: "NEEDS_REVIEW",
        data: JSON.stringify({
          merchant: extracted.merchant,
          date: extracted.date,
          total: extracted.total,
          items: categorizedItems,
          confidence: extracted.confidence,
          error: extracted.error,
        }),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db.pendingImport.update({
      where: { id: pendingId },
      data: {
        status: "NEEDS_REVIEW",
        error: message,
        data: JSON.stringify({
          merchant: null, date: null, total: null, items: [],
          confidence: "low", error: message,
        }),
      },
    }).catch(() => {});
  }
}
