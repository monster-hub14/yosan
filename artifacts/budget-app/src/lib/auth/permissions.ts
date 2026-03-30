import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "./session";
import type { SessionPayload } from "./types";
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

export function requireRole(
  user: SessionPayload,
  role: "USER" | "ADMIN"
): void | NextResponse {
  if (role === "ADMIN" && user.role !== "ADMIN") {
    return forbidden("Admin access required");
  }
}

export type BudgetAccessRole = "MEMBER" | "ADMIN";

export async function requireBudgetAccess(
  user: SessionPayload,
  budgetId: string,
  minRole: BudgetAccessRole = "MEMBER"
): Promise<
  { membership: { role: string } } | NextResponse
> {
  // Instance admins always have full access
  if (user.role === "ADMIN") {
    return { membership: { role: "ADMIN" } };
  }

  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    select: {
      ownerId: true,
      memberships: {
        where: { userId: user.userId },
        take: 1,
        select: { role: true },
      },
      soloShares: {
        where: { isActive: true },
        select: { role: true, shareToken: true },
      },
    },
  });

  if (!budget) {
    return NextResponse.json({ error: "Budget not found" }, { status: 404 });
  }

  // Budget owner
  if (budget.ownerId === user.userId) {
    return { membership: { role: "ADMIN" } };
  }

  const membership = budget.memberships[0];
  if (membership) {
    if (minRole === "ADMIN" && membership.role !== "ADMIN") {
      return forbidden("Budget admin access required");
    }
    return { membership };
  }

  // No membership — check solo share tokens (read-only access pathway)
  // Solo shares are token-based and don't confer write access
  if (minRole === "MEMBER" && budget.soloShares.length > 0) {
    return { membership: { role: "VIEWER" } };
  }

  return forbidden("No access to this budget");
}

export function isSessionPayload(
  value: SessionPayload | NextResponse
): value is SessionPayload {
  return !(value instanceof NextResponse);
}
