import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, SessionPayload } from "./session";
import { db } from "@/lib/db";

export function unauthorized(message = "Unauthorized"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function requireAuth(
  request: NextRequest
): Promise<SessionPayload | NextResponse> {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  return session;
}

export async function requireAdmin(
  request: NextRequest
): Promise<SessionPayload | NextResponse> {
  const result = await requireAuth(request);
  if (result instanceof NextResponse) return result;
  if (result.role !== "ADMIN") return forbidden("Admin access required");
  return result;
}

export async function requireBudgetAccess(
  request: NextRequest,
  budgetId: string,
  minRole: "MEMBER" | "ADMIN" = "MEMBER"
): Promise<
  | { session: SessionPayload; membership: { role: string } }
  | NextResponse
> {
  const result = await requireAuth(request);
  if (result instanceof NextResponse) return result;

  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    include: {
      memberships: {
        where: { userId: result.userId },
        take: 1,
      },
    },
  });

  if (!budget) {
    return NextResponse.json({ error: "Budget not found" }, { status: 404 });
  }

  if (budget.ownerId === result.userId || result.role === "ADMIN") {
    return { session: result, membership: { role: "ADMIN" } };
  }

  const membership = budget.memberships[0];
  if (!membership) return forbidden("No access to this budget");

  if (minRole === "ADMIN" && membership.role !== "ADMIN") {
    return forbidden("Budget admin access required");
  }

  return { session: result, membership };
}

export function isSessionPayload(
  value: SessionPayload | NextResponse
): value is SessionPayload {
  return !(value instanceof NextResponse);
}
