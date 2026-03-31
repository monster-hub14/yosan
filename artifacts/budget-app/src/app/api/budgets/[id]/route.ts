import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireBudgetRead, requireBudgetManage, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetRead(session, id);
  if (access instanceof NextResponse) return access;

  const budget = await db.budget.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      memberships: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      soloShares: {
        where: { isActive: true },
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  if (!budget) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ budget });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetManage(session, id);
  if (access instanceof NextResponse) return access;

  const { name, currency, description, additionalNotificationEmails } = await request.json();

  // Validate + deduplicate additional notification emails if provided
  let additionalEmailsJson: string | undefined;
  if (additionalNotificationEmails !== undefined) {
    if (!Array.isArray(additionalNotificationEmails)) {
      return NextResponse.json({ ok: false, error: "additionalNotificationEmails must be an array" }, { status: 400 });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const raw of additionalNotificationEmails) {
      if (typeof raw !== "string") {
        return NextResponse.json({ ok: false, error: "Each email must be a string" }, { status: 400 });
      }
      const email = raw.trim().toLowerCase();
      if (!emailRegex.test(email)) {
        return NextResponse.json({ ok: false, error: `Invalid email address: ${raw}` }, { status: 400 });
      }
      if (!seen.has(email)) {
        seen.add(email);
        deduped.push(email);
      }
    }
    additionalEmailsJson = JSON.stringify(deduped);
  }

  const budget = await db.budget.update({
    where: { id },
    data: {
      ...(name ? { name: name.trim() } : {}),
      ...(currency ? { currency } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(additionalEmailsJson !== undefined ? { additionalNotificationEmails: additionalEmailsJson } : {}),
    },
  });

  return NextResponse.json({ budget });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetManage(session, id);
  if (access instanceof NextResponse) return access;

  await db.budget.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
