import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireBudgetManage, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { randomBytes } from "crypto";

interface Params { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id: budgetId } = await params;
  const access = await requireBudgetManage(session, budgetId);
  if (access instanceof NextResponse) return access;

  const config = await db.emailForwardingConfig.findUnique({ where: { budgetId } });

  return NextResponse.json({
    enabled: config?.isEnabled ?? false,
    inboundAddress: config?.inboundAddress ?? null,
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id: budgetId } = await params;
  const access = await requireBudgetManage(session, budgetId);
  if (access instanceof NextResponse) return access;

  const body = await request.json().catch(() => ({}));
  const regenerate = body.regenerate === true;

  const existing = await db.emailForwardingConfig.findUnique({ where: { budgetId } });

  if (existing && !regenerate) {
    return NextResponse.json({
      enabled: existing.isEnabled,
      inboundAddress: existing.inboundAddress,
    });
  }

  const token = randomBytes(12).toString("hex");
  const emailConfig = await db.emailConfig.findUnique({ where: { id: "singleton" } });
  const domain = process.env.INBOUND_EMAIL_DOMAIN
    || (emailConfig?.fromAddress?.includes("@") ? emailConfig.fromAddress.split("@")[1] : null)
    || "receipts.example.com";
  const inboundAddress = `receipt-${token}@${domain}`;

  const config = await db.emailForwardingConfig.upsert({
    where: { budgetId },
    create: { budgetId, inboundAddress, isEnabled: true },
    update: { inboundAddress, isEnabled: true },
  });

  return NextResponse.json({
    enabled: config.isEnabled,
    inboundAddress: config.inboundAddress,
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id: budgetId } = await params;
  const access = await requireBudgetManage(session, budgetId);
  if (access instanceof NextResponse) return access;

  const body = await request.json();

  const existing = await db.emailForwardingConfig.findUnique({ where: { budgetId } });
  if (!existing) {
    return NextResponse.json({ error: "Email forwarding not configured" }, { status: 404 });
  }

  const config = await db.emailForwardingConfig.update({
    where: { budgetId },
    data: { isEnabled: body.isEnabled },
  });

  return NextResponse.json({
    enabled: config.isEnabled,
    inboundAddress: config.inboundAddress,
  });
}
