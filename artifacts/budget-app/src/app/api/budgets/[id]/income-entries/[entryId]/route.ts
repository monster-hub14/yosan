import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireBudgetWrite, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { id, entryId } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetWrite(session, id);
  if (access instanceof NextResponse) return access;

  await db.incomeEntry.delete({ where: { id: entryId, budgetId: id } });

  return NextResponse.json({ ok: true });
}
