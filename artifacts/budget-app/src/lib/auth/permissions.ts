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

/**
 * Verify that `user` has the required membership role for `budgetId`.
 * Access is granted if:
 *   1. The user is an instance-level ADMIN (superuser override), OR
 *   2. The user is the budget owner, OR
 *   3. The user has an explicit BudgetMembership row with a role >= minRole.
 *
 * BudgetSoloShare (token-based links) are intentionally NOT checked here because
 * they are not tied to a specific user account. Solo-share access should be
 * validated separately by the route handler using the share token from the request.
 */
export async function requireBudgetAccess(
  user: SessionPayload,
  budgetId: string,
  minRole: BudgetAccessRole = "MEMBER"
): Promise<{ membership: { role: string } } | NextResponse> {
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
    },
  });

  if (!budget) {
    return NextResponse.json({ error: "Budget not found" }, { status: 404 });
  }

  // Budget owner gets full admin access
  if (budget.ownerId === user.userId) {
    return { membership: { role: "ADMIN" } };
  }

  const membership = budget.memberships[0];
  if (!membership) {
    return forbidden("No access to this budget");
  }

  if (minRole === "ADMIN" && membership.role !== "ADMIN") {
    return forbidden("Budget admin access required");
  }

  return { membership };
}

/**
 * Verify a BudgetSoloShare token grants access to the specified budget.
 * Returns the share record if valid and active, or an error NextResponse.
 */
export async function requireBudgetShareAccess(
  shareToken: string,
  budgetId: string
): Promise<{ share: { role: string; budgetId: string } } | NextResponse> {
  const share = await db.budgetSoloShare.findUnique({
    where: { shareToken },
    select: { budgetId: true, role: true, isActive: true, expiresAt: true },
  });

  if (!share || !share.isActive) {
    return NextResponse.json({ error: "Invalid or expired share link" }, { status: 403 });
  }

  if (share.expiresAt && share.expiresAt < new Date()) {
    return NextResponse.json({ error: "Share link has expired" }, { status: 403 });
  }

  if (share.budgetId !== budgetId) {
    return NextResponse.json({ error: "Share token does not match budget" }, { status: 403 });
  }

  return { share };
}

export function isSessionPayload(
  value: SessionPayload | NextResponse
): value is SessionPayload {
  return !(value instanceof NextResponse);
}
