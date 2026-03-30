/**
 * POST /api/budgets/[id]/email-forwarding/test
 *
 * Creates a synthetic PendingImport as if a test email was received,
 * so the user can verify the forwarding pipeline is working end-to-end.
 * Admin/manage access required.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireBudgetManage, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

interface Params { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id: budgetId } = await params;
  const access = await requireBudgetManage(session, budgetId);
  if (access instanceof NextResponse) return access;

  const config = await db.emailForwardingConfig.findUnique({ where: { budgetId } });
  if (!config) {
    return NextResponse.json({ error: "Email forwarding not configured for this budget" }, { status: 400 });
  }
  if (!config.isEnabled) {
    return NextResponse.json({ error: "Email forwarding is currently disabled" }, { status: 400 });
  }

  // Create a synthetic pending import simulating an inbound test email
  const pending = await db.pendingImport.create({
    data: {
      budgetId,
      userId: session.userId,
      status: "NEEDS_REVIEW",
      data: JSON.stringify({
        emailFrom: "test@budget-app.local",
        emailSubject: "Test email forwarding",
        emailBody: "This is a test receipt forwarded via the email forwarding pipeline. No file attached — please manually review and discard.",
        merchant: "Test Email Forwarding",
        date: new Date().toISOString().slice(0, 10),
        total: 0,
        items: [],
        confidence: "low",
        source: "email_test",
      }),
    },
  });

  return NextResponse.json({
    ok: true,
    pendingImportId: pending.id,
    message: "Test email forwarding receipt created. Check your inbox.",
  });
}
