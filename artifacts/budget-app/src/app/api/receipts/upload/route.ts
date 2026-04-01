import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetWrite } from "@/lib/auth/permissions";
import { getActiveBudgetId } from "@/lib/active-budget";
import { db } from "@/lib/db";
import { processReceipt } from "@/lib/ai/process-receipt";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export const config = { api: { bodyParser: false } };

const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic",
  "application/pdf",
]);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function getUploadDir(budgetId: string): string {
  const base = process.env.UPLOAD_DIR || "/app/uploads";
  return path.join(base, budgetId);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  let budgetId = request.nextUrl.searchParams.get("budgetId");
  if (!budgetId) {
    budgetId = await getActiveBudgetId(session.userId);
  }
  if (!budgetId) {
    return NextResponse.json({ error: "No active budget" }, { status: 400 });
  }

  // Verify budget access (WRITE capability)
  const access = await requireBudgetWrite(session, budgetId);
  if (access instanceof NextResponse) return access;

  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    select: { id: true, currency: true },
  });
  if (!budget) {
    return NextResponse.json({ error: "Budget not found" }, { status: 404 });
  }

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const manualData = formData.get("manual") as string | null; // JSON string for manual entries

  if (!file && !manualData) {
    return NextResponse.json({ error: "No file or manual data provided" }, { status: 400 });
  }

  // Manual entry path — skip file storage
  if (manualData && !file) {
    let manual: { merchant?: string; date?: string; total?: string | number };
    try {
      manual = JSON.parse(manualData) as typeof manual;
    } catch {
      return NextResponse.json({ error: "Invalid manual entry data" }, { status: 400 });
    }
    const pendingData = {
      merchant: manual.merchant || null,
      date: manual.date || new Date().toISOString().slice(0, 10),
      total: manual.total ? parseFloat(String(manual.total)) : null,
      items: [],
      confidence: "high" as const,
      isManual: true,
    };

    const pending = await db.pendingImport.create({
      data: {
        budgetId,
        userId: session.userId,
        status: "NEEDS_REVIEW",
        data: JSON.stringify(pendingData),
      },
    });

    return NextResponse.json({ pendingImport: pending }, { status: 201 });
  }

  // File upload path
  if (!ALLOWED_TYPES.has(file!.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Allowed: JPEG, PNG, WEBP, HEIC, PDF" },
      { status: 415 }
    );
  }

  const fileBuffer = Buffer.from(await file!.arrayBuffer());
  if (fileBuffer.length > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 413 });
  }

  const uploadDir = getUploadDir(budgetId);
  fs.mkdirSync(uploadDir, { recursive: true });

  const ext = path.extname(file!.name) || ".jpg";
  const storedFilename = `${Date.now()}-${randomUUID()}${ext}`;
  const filePath = path.join(uploadDir, storedFilename);
  fs.writeFileSync(filePath, fileBuffer);

  // Create Receipt record
  const receipt = await db.receipt.create({
    data: {
      budgetId,
      uploadedById: session.userId,
      originalFilename: sanitizeFilename(file!.name),
      storedFilename,
      mimeType: file!.type,
      fileSize: fileBuffer.length,
      status: "PENDING",
    },
  });

  // Create initial PendingImport record
  const pending = await db.pendingImport.create({
    data: {
      budgetId,
      userId: session.userId,
      receiptId: receipt.id,
      status: "PROCESSING",
      data: JSON.stringify({ merchant: null, date: null, total: null, items: [] }),
    },
  });

  // Trigger shared AI processing pipeline (non-blocking)
  processReceipt(pending.id, receipt.id, budgetId, session.userId, filePath, file!.type).catch(
    (err) => console.error("[receipt/upload] AI processing error:", err)
  );

  return NextResponse.json({ pendingImport: { ...pending, status: "PROCESSING" } }, { status: 201 });
}

