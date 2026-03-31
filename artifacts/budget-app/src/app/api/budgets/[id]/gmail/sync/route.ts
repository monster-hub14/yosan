import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetWrite } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  fetchMessageIds,
  fetchMessageDetail,
  downloadAttachment,
  GmailRevokedError,
} from "@/lib/gmail";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

function getUploadDir(budgetId: string): string {
  const base = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
  return path.join(base, budgetId);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: budgetId } = await params;

  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetWrite(session, budgetId);
  if (access instanceof NextResponse) return access;

  const conn = await db.gmailConnection.findUnique({ where: { userId: session.userId } });
  if (!conn) {
    return NextResponse.json(
      { ok: false, error: "Gmail not connected", reconnect_required: true },
      { status: 400 }
    );
  }
  if (conn.isRevoked) {
    return NextResponse.json(
      { ok: false, error: "Gmail token revoked. Please reconnect.", reconnect_required: true },
      { status: 401 }
    );
  }

  const labelCfg = await db.gmailLabelConfig.findUnique({ where: { userId: session.userId } });
  if (!labelCfg) {
    return NextResponse.json(
      { ok: false, error: "No Gmail labels selected. Configure Gmail import first." },
      { status: 400 }
    );
  }

  let selectedLabelIds: string[] = [];
  try { selectedLabelIds = JSON.parse(labelCfg.selectedLabelIds); } catch { /* ignore */ }

  if (selectedLabelIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No Gmail labels selected. Configure Gmail import first." },
      { status: 400 }
    );
  }

  try {
    const messageIds = await fetchMessageIds(session.userId, selectedLabelIds, {
      maxResults: labelCfg.maxPerSync,
      cutoffDate: labelCfg.syncCutoffDate ?? undefined,
    });

    if (messageIds.length === 0) {
      await db.gmailLabelConfig.update({
        where: { userId: session.userId },
        data: { lastSyncAt: new Date(), lastSyncError: null },
      });
      return NextResponse.json({ ok: true, imported: 0, skipped: 0 });
    }

    const existingImports = await db.pendingImport.findMany({
      where: {
        budgetId,
        gmailMessageId: { in: messageIds },
      },
      select: { gmailMessageId: true },
    });

    const alreadyImported = new Set(
      existingImports.map((i) => i.gmailMessageId).filter(Boolean) as string[]
    );

    const newIds = messageIds.filter((id) => !alreadyImported.has(id));
    let imported = 0;
    const skipped = messageIds.length - newIds.length;

    const uploadDir = getUploadDir(budgetId);
    fs.mkdirSync(uploadDir, { recursive: true });

    for (const msgId of newIds) {
      try {
        const detail = await fetchMessageDetail(session.userId, msgId);

        const storedAttachments: {
          originalFilename: string;
          storedFilename: string;
          mimeType: string;
          size: number;
        }[] = [];

        for (const att of detail.attachments) {
          if (att.size > MAX_ATTACHMENT_SIZE) continue;
          try {
            const buf = await downloadAttachment(session.userId, msgId, att.attachmentId);
            const ext = path.extname(att.filename) || ".bin";
            const storedFilename = `gmail-${Date.now()}-${randomUUID()}${ext}`;
            const filePath = path.join(uploadDir, storedFilename);
            fs.writeFileSync(filePath, buf);
            storedAttachments.push({
              originalFilename: att.filename,
              storedFilename,
              mimeType: att.mimeType,
              size: att.size,
            });
          } catch {
            // Skip attachment if download fails
          }
        }

        const importData = {
          source: "gmail",
          sender: detail.sender,
          subject: detail.subject,
          receivedAt: detail.receivedAt.toISOString(),
          textBody: detail.textBody.slice(0, 8000),
          htmlBody: detail.htmlBody.slice(0, 20000),
          attachments: storedAttachments,
        };

        await db.pendingImport.create({
          data: {
            budgetId,
            userId: session.userId,
            status: "NEEDS_REVIEW",
            gmailMessageId: msgId,
            data: JSON.stringify(importData),
          },
        });

        imported++;
      } catch (msgErr) {
        console.error(`[gmail/sync] Failed to import message ${msgId}:`, msgErr);
      }
    }

    await db.gmailLabelConfig.update({
      where: { userId: session.userId },
      data: { lastSyncAt: new Date(), lastSyncError: null },
    });

    return NextResponse.json({ ok: true, imported, skipped });
  } catch (err) {
    const isRevoked = err instanceof GmailRevokedError;
    const msg = err instanceof Error ? err.message : "Sync failed";

    await db.gmailLabelConfig.update({
      where: { userId: session.userId },
      data: { lastSyncError: msg },
    }).catch(() => {});

    return NextResponse.json(
      { ok: false, error: msg, reconnect_required: isRevoked },
      { status: isRevoked ? 401 : 500 }
    );
  }
}
