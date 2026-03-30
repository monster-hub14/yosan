import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetWrite } from "@/lib/auth/permissions";
import { getActiveBudgetId } from "@/lib/active-budget";
import { db } from "@/lib/db";
import { extractReceiptFromImage } from "@/lib/ai/extract";
import { categorizeItem } from "@/lib/ai/categorize";
import { checkAndRecordUsage, isFeatureEnabled } from "@/lib/ai/usage";
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
  const base = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
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
    const manual = JSON.parse(manualData);
    const pendingData = {
      merchant: manual.merchant || null,
      date: manual.date || new Date().toISOString().slice(0, 10),
      total: manual.total ? parseFloat(manual.total) : null,
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

  // Trigger AI extraction (non-blocking — update pending import async)
  runAIExtraction(pending.id, receipt.id, budgetId, session.userId, fileBuffer, file!.type).catch(
    (err) => console.error("[receipt/upload] AI extraction error:", err)
  );

  return NextResponse.json({ pendingImport: { ...pending, status: "PROCESSING" } }, { status: 201 });
}

async function runAIExtraction(
  pendingId: string,
  receiptId: string,
  budgetId: string,
  userId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<void> {
  try {
    const extractionEnabled = await isFeatureEnabled("extraction");
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

    // Encode image as base64 data URL
    const base64 = fileBuffer.toString("base64");
    const imageUrl = `data:${mimeType};base64,${base64}`;

    const extracted = await extractReceiptFromImage(
      mimeType.startsWith("application/pdf") ? null : imageUrl,
      mimeType.startsWith("application/pdf") ? "[PDF file — text extraction not available]" : null
    );

    // Categorize items if enabled
    const categorizationEnabled = await isFeatureEnabled("categorization");
    const categorizedItems = [];

    for (const item of extracted.items) {
      let categorySuggestion = null;
      if (categorizationEnabled) {
        try {
          const cat = await categorizeItem({
            budgetId,
            callerUserId: userId,
            itemDescription: item.description,
            merchantName: extracted.merchant,
            amount: item.amount,
          });
          categorySuggestion = cat;
        } catch {
          // Categorization failure is non-fatal
        }
      }
      categorizedItems.push({ ...item, categorySuggestion });
    }

    // Update receipt
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
    });
  }
}
