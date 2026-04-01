/**
 * Shared Gmail sync logic.
 * Used by both the manual sync route (/api/budgets/[id]/gmail/sync)
 * and the hourly cron endpoint (/api/cron/gmail-sync).
 *
 * For each new message:
 *  - Image/PDF attachments → Receipt record created + processReceipt() fired (same as email webhook).
 *  - Text-only emails (no image/PDF) → AI extraction runs directly on email body text.
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  fetchMessageIds,
  fetchMessageDetail,
  downloadAttachment,
  GmailRevokedError,
} from "@/lib/gmail";
import { processReceipt } from "@/lib/ai/process-receipt";
import { extractReceiptFromImage } from "@/lib/ai/extract";
import { categorizeItem } from "@/lib/ai/categorize";
import { isFeatureEnabled, checkAndRecordUsage } from "@/lib/ai/usage";

const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

const RECEIPT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const ALLOWED_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

export interface GmailSyncResult {
  imported: number;
  skipped: number;
  failed: number;
}

function getUploadDir(budgetId: string): string {
  const base = process.env.UPLOAD_DIR || "/app/uploads";
  return path.join(base, budgetId);
}

/**
 * Run text-body AI extraction and update the PendingImport directly
 * (no Receipt record — there's no file to attach).
 */
async function processEmailBodyText(
  pendingId: string,
  userId: string,
  budgetId: string,
  textBody: string
): Promise<void> {
  try {
    const extractionEnabled = await isFeatureEnabled("extraction", userId);
    if (!extractionEnabled) {
      await db.pendingImport
        .update({
          where: { id: pendingId },
          data: {
            status: "NEEDS_REVIEW",
            data: JSON.stringify({
              merchant: null,
              date: null,
              total: null,
              items: [],
              confidence: "low",
              error: "AI extraction is disabled",
            }),
          },
        })
        .catch(() => {});
      return;
    }

    const usageCheck = await checkAndRecordUsage(userId, "extraction");
    if (!usageCheck.allowed) {
      await db.pendingImport
        .update({
          where: { id: pendingId },
          data: {
            status: "NEEDS_REVIEW",
            data: JSON.stringify({
              merchant: null,
              date: null,
              total: null,
              items: [],
              confidence: "low",
              error: usageCheck.reason,
            }),
          },
        })
        .catch(() => {});
      return;
    }

    const extracted = await extractReceiptFromImage(null, textBody);

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
        } catch {
          /* non-fatal */
        }
      }
      categorizedItems.push({ ...item, categorySuggestion });
    }

    await db.pendingImport
      .update({
        where: { id: pendingId },
        data: {
          status: "NEEDS_REVIEW",
          data: JSON.stringify({
            merchant: extracted.merchant,
            date: extracted.date,
            total: extracted.total,
            items: categorizedItems,
            confidence: extracted.confidence,
            error: extracted.error ?? null,
          }),
        },
      })
      .catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db.pendingImport
      .update({
        where: { id: pendingId },
        data: {
          status: "NEEDS_REVIEW",
          error: message,
          data: JSON.stringify({
            merchant: null,
            date: null,
            total: null,
            items: [],
            confidence: "low",
            error: message,
          }),
        },
      })
      .catch(() => {});
  }
}

/**
 * Core Gmail sync logic for a single user + budget.
 *
 * @throws GmailRevokedError — propagated so callers can handle reconnect.
 */
export async function runGmailSync(
  userId: string,
  budgetId: string,
  opts: {
    selectedLabelIds: string[];
    maxPerSync: number;
    syncCutoffDate?: Date;
    uploadedById: string;
  }
): Promise<GmailSyncResult> {
  const messageIds = await fetchMessageIds(userId, opts.selectedLabelIds, {
    maxResults: opts.maxPerSync,
    cutoffDate: opts.syncCutoffDate,
  });

  if (messageIds.length === 0) {
    return { imported: 0, skipped: 0, failed: 0 };
  }

  const existingImports = await db.pendingImport.findMany({
    where: { budgetId, gmailMessageId: { in: messageIds } },
    select: { gmailMessageId: true },
  });

  const alreadyImported = new Set(
    existingImports.map((i) => i.gmailMessageId).filter(Boolean) as string[]
  );

  const newIds = messageIds.filter((id) => !alreadyImported.has(id));
  const skipped = messageIds.length - newIds.length;
  let imported = 0;
  let failed = 0;

  const uploadDir = getUploadDir(budgetId);
  fs.mkdirSync(uploadDir, { recursive: true });

  for (const msgId of newIds) {
    try {
      const detail = await fetchMessageDetail(userId, msgId);

      // Collect image/PDF attachments only
      const receiptAttachments = detail.attachments.filter(
        (a) =>
          RECEIPT_MIME_TYPES.has(a.mimeType.toLowerCase()) &&
          a.size <= MAX_ATTACHMENT_SIZE
      );

      if (receiptAttachments.length > 0) {
        // ── Attachment path: create Receipt + PendingImport + fire processReceipt() ──
        for (const att of receiptAttachments) {
          try {
            const buf = await downloadAttachment(userId, msgId, att.attachmentId);
            const ext =
              ALLOWED_EXTENSIONS[att.mimeType.toLowerCase()] ||
              path.extname(att.filename) ||
              ".bin";
            const storedFilename = `gmail-${Date.now()}-${randomUUID()}.${ext}`;
            const resolvedUploadDir = path.resolve(uploadDir);
            const filePath = path.resolve(resolvedUploadDir, storedFilename);

            if (!filePath.startsWith(resolvedUploadDir + path.sep)) {
              console.error("[gmail-sync] path traversal blocked:", filePath);
              continue;
            }

            fs.writeFileSync(filePath, buf);

            const receipt = await db.receipt.create({
              data: {
                budgetId,
                uploadedById: opts.uploadedById,
                originalFilename: att.filename,
                storedFilename,
                mimeType: att.mimeType,
                fileSize: att.size,
                status: "PENDING",
              },
            });

            const pending = await db.pendingImport.create({
              data: {
                budgetId,
                userId,
                receiptId: receipt.id,
                status: "PROCESSING",
                gmailMessageId: msgId,
                data: JSON.stringify({
                  source: "gmail",
                  sender: detail.sender,
                  subject: detail.subject,
                  receivedAt: detail.receivedAt.toISOString(),
                }),
              },
            });

            processReceipt(
              pending.id,
              receipt.id,
              budgetId,
              userId,
              filePath,
              att.mimeType
            ).catch((err) =>
              console.error("[gmail-sync] AI processing error:", err)
            );

            imported++;
          } catch (attErr) {
            if (attErr instanceof GmailRevokedError) throw attErr;
            console.error(
              `[gmail-sync] Failed to download/process attachment for message ${msgId}:`,
              attErr
            );
            failed++;
          }
        }
      } else {
        // ── Text-only path: PendingImport only, run text AI extraction ──
        const textBody = detail.textBody.slice(0, 8000);
        const htmlBody = detail.htmlBody.slice(0, 20000);

        const pending = await db.pendingImport.create({
          data: {
            budgetId,
            userId,
            status: "PROCESSING",
            gmailMessageId: msgId,
            data: JSON.stringify({
              source: "gmail",
              sender: detail.sender,
              subject: detail.subject,
              receivedAt: detail.receivedAt.toISOString(),
              textBody,
              htmlBody,
            }),
          },
        });

        if (textBody.trim()) {
          processEmailBodyText(pending.id, userId, budgetId, textBody).catch(
            (err) =>
              console.error("[gmail-sync] text-body AI extraction error:", err)
          );
        } else {
          await db.pendingImport
            .update({
              where: { id: pending.id },
              data: { status: "NEEDS_REVIEW" },
            })
            .catch(() => {});
        }

        imported++;
      }
    } catch (msgErr) {
      if (msgErr instanceof GmailRevokedError) throw msgErr;
      console.error(`[gmail-sync] Failed to import message ${msgId}:`, msgErr);
      failed++;
    }
  }

  return { imported, skipped, failed };
}
