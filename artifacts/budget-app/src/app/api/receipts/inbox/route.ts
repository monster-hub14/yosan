import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetRead } from "@/lib/auth/permissions";
import { getActiveBudgetId } from "@/lib/active-budget";
import { db } from "@/lib/db";
import { ImportStatus } from "@prisma/client";

const VALID_STATUSES = new Set<string>(Object.values(ImportStatus));

function toValidStatuses(raw: string): ImportStatus[] {
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => VALID_STATUSES.has(s)) as ImportStatus[];
}

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { searchParams } = new URL(request.url);
  let budgetId = searchParams.get("budgetId");
  if (!budgetId) budgetId = await getActiveBudgetId(session.userId);
  if (!budgetId) return NextResponse.json({ error: "No active budget" }, { status: 400 });

  const access = await requireBudgetRead(session, budgetId);
  if (access instanceof NextResponse) return access;

  const statusParam = searchParams.get("status") ?? "NEEDS_REVIEW,PENDING,PROCESSING";
  const statuses = toValidStatuses(statusParam);

  const imports = await db.pendingImport.findMany({
    where: { budgetId, status: { in: statuses } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      receipt: {
        select: {
          id: true,
          originalFilename: true,
          storedFilename: true,
          mimeType: true,
          uploadedAt: true,
        },
      },
      user: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ imports });
}
