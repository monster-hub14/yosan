/**
 * Inbound email webhook for receipt forwarding.
 *
 * Compatible with:
 *  - Mailgun (multipart/form-data with "From", "To", "subject", "body-plain", "attachment-N")
 *  - Postal / Stalwart (JSON POST: { from, to, subject, text, html, attachments:[{filename,content_type,data(base64)}] })
 *  - Cloudmailin (JSON: { envelope.to, plain, html, attachments:[{file_name,content_type,content(base64)}] })
 *
 * Flow:
 *  1. Parse the forwarded email (multipart or JSON).
 *  2. Look up the budget via the inbound address token in the "To" header.
 *  3. Save any image/PDF attachments to the uploads dir.
 *  4. Create a Receipt + PendingImport record (status PENDING).
 *
 * Auth: shared webhook secret via WEBHOOK_EMAIL_SECRET env var (optional but recommended).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { processReceipt } from "@/lib/ai/process-receipt";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";
const WEBHOOK_SECRET = process.env.WEBHOOK_EMAIL_SECRET;

const RECEIPT_MIME_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/gif", "image/heic", "image/heif",
  "application/pdf",
]);

interface ParsedEmail {
  from: string;
  to: string[];
  subject: string;
  bodyText: string;
  attachments: Array<{ filename: string; contentType: string; data: Buffer }>;
}

async function parseMailgunMultipart(req: NextRequest): Promise<ParsedEmail> {
  const form = await req.formData();
  const get = (k: string) => (form.get(k) as string | null) ?? "";

  const toRaw = get("To") || get("recipient");
  const attachments: ParsedEmail["attachments"] = [];

  const count = parseInt(get("attachment-count") || "0", 10);
  for (let i = 1; i <= count; i++) {
    const file = form.get(`attachment-${i}`) as File | null;
    if (!file) continue;
    const buf = Buffer.from(await file.arrayBuffer());
    attachments.push({ filename: file.name, contentType: file.type, data: buf });
  }

  return {
    from: get("From") || get("sender"),
    to: toRaw.split(",").map((s) => s.trim()),
    subject: get("subject"),
    bodyText: get("body-plain") || get("stripped-text"),
    attachments,
  };
}

async function parseJsonEmail(body: Record<string, unknown>): Promise<ParsedEmail> {
  const toRaw =
    (body.to as string | undefined) ??
    ((body.envelope as Record<string, string> | undefined)?.to ?? "");

  const rawAttachments = (body.attachments as Array<Record<string, unknown>> | undefined) ?? [];
  const attachments: ParsedEmail["attachments"] = [];
  for (const att of rawAttachments) {
    const contentType = (att.content_type ?? att.type ?? "") as string;
    const filename = (att.filename ?? att.file_name ?? att.name ?? "attachment") as string;
    const b64 = (att.data ?? att.content ?? att.body ?? "") as string;
    if (!b64) continue;
    const data = Buffer.from(b64, "base64");
    attachments.push({ filename, contentType, data });
  }

  return {
    from: (body.from ?? (body.envelope as Record<string, string> | undefined)?.from ?? "") as string,
    to: toRaw.split(",").map((s: string) => s.trim()),
    subject: (body.subject ?? "") as string,
    bodyText: (body.text ?? body.plain ?? "") as string,
    attachments,
  };
}

function extractTokenFromAddresses(toAddresses: string[], inboundAddress: string): boolean {
  return toAddresses.some(
    (addr) => addr.toLowerCase().includes(inboundAddress.toLowerCase())
  );
}

function verifySignature(req: NextRequest): boolean {
  if (!WEBHOOK_SECRET) return true;
  const sig = req.headers.get("x-webhook-signature") ?? req.headers.get("x-mailgun-signature");
  if (!sig) return false;
  const ts = req.headers.get("x-webhook-timestamp") ?? "";
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET)
    .update(ts)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!verifySignature(req)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let email: ParsedEmail;
  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      email = await parseMailgunMultipart(req);
    } else {
      const body = await req.json() as Record<string, unknown>;
      email = await parseJsonEmail(body);
    }
  } catch (err) {
    console.error("[email-webhook] parse error", err);
    return NextResponse.json({ error: "Parse error" }, { status: 400 });
  }

  const allForwardingConfigs = await db.emailForwardingConfig.findMany({
    where: { isEnabled: true },
    select: { budgetId: true, inboundAddress: true, budget: { select: { ownerId: true } } },
  });

  const matched = allForwardingConfigs.find((cfg) =>
    extractTokenFromAddresses(email.to, cfg.inboundAddress)
  );

  if (!matched) {
    return NextResponse.json({ error: "No matching enabled forwarding address" }, { status: 404 });
  }

  const { budgetId, budget } = matched;
  const budgetDir = path.join(UPLOAD_DIR, budgetId);
  await mkdir(budgetDir, { recursive: true });

  const imageAttachments = email.attachments.filter(
    (a) => RECEIPT_MIME_TYPES.has(a.contentType.toLowerCase())
  );

  const results: { pendingId: string; filename: string | null }[] = [];

  // Allowlisted extensions for received attachments
  const ALLOWED_EXTENSIONS: Record<string, string> = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
    "image/webp": "webp", "image/gif": "gif",
    "image/heic": "heic", "image/heif": "heif",
    "application/pdf": "pdf",
  };

  if (imageAttachments.length > 0) {
    for (const att of imageAttachments) {
      // Derive extension strictly from MIME type — never from untrusted filename
      const ext = ALLOWED_EXTENSIONS[att.contentType.toLowerCase()] ?? "bin";
      const storedFilename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const resolvedBudgetDir = path.resolve(budgetDir);
      const resolvedFilePath = path.resolve(resolvedBudgetDir, storedFilename);
      // Guard: resolved path must stay within the budget upload directory
      if (!resolvedFilePath.startsWith(resolvedBudgetDir + path.sep)) {
        console.error("[email-webhook] path traversal blocked:", resolvedFilePath);
        continue;
      }
      await writeFile(resolvedFilePath, att.data);

      const receipt = await db.receipt.create({
        data: {
          budgetId,
          uploadedById: budget.ownerId,
          originalFilename: att.filename,
          storedFilename,
          mimeType: att.contentType,
          fileSize: att.data.length,
          status: "PENDING",
        },
      });

      const pending = await db.pendingImport.create({
        data: {
          budgetId,
          userId: budget.ownerId,
          receiptId: receipt.id,
          status: "PROCESSING",
          data: JSON.stringify({
            emailFrom: email.from,
            emailSubject: email.subject,
            emailBodySnippet: email.bodyText.slice(0, 500),
            source: "email",
          }),
        },
      });

      processReceipt(pending.id, receipt.id, budgetId, budget.ownerId, resolvedFilePath, att.contentType)
        .catch((err) => console.error("[email-webhook] AI processing error:", err));

      results.push({ pendingId: pending.id, filename: att.filename });
    }
  } else {
    const pending = await db.pendingImport.create({
      data: {
        budgetId,
        userId: budget.ownerId,
        status: "PENDING",
        data: JSON.stringify({
          emailFrom: email.from,
          emailSubject: email.subject,
          emailBody: email.bodyText.slice(0, 2000),
          source: "email_text",
        }),
      },
    });
    results.push({ pendingId: pending.id, filename: null });
  }

  return NextResponse.json({ received: results.length, items: results });
}
