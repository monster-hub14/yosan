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
 * Map a BudgetSoloShare role string to a BudgetAccessRole tier.
 * CO_OWNER → "ADMIN", everything else (VIEWER, HELPER) → "MEMBER"
 */
function soloRoleToAccessTier(role: string): BudgetAccessRole {
  return role === "CO_OWNER" ? "ADMIN" : "MEMBER";
}

/**
 * Verify access to a budget.
 *
 * Access is granted if ANY of the following conditions are met:
 *   1. `user.role === "ADMIN"` — instance-level superuser override.
 *   2. `user.userId === budget.ownerId` — budget owner.
 *   3. The user has a `BudgetMembership` row with a role >= minRole.
 *   4. The user has an active, non-expired `BudgetSoloShare` (authenticated user sharing)
 *      with a solo role that maps to >= minRole.
 *   5. A valid `shareToken` is provided that matches an active `BudgetSoloShare`
 *      for this budget with a role >= minRole (anonymous/token-based access).
 *
 * @param user        Authenticated session, or null for share-token-only access.
 * @param budgetId    The target budget.
 * @param minRole     Minimum required role (default: "MEMBER").
 * @param shareToken  Optional share token for BudgetSoloShare validation.
 */
export async function requireBudgetAccess(
  user: SessionPayload | null,
  budgetId: string,
  minRole: BudgetAccessRole = "MEMBER",
  shareToken?: string
): Promise<{ membership: { role: string } } | NextResponse> {
  if (user) {
    if (user.role === "ADMIN") {
      return { membership: { role: "ADMIN" } };
    }

    const now = new Date();

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
          where: {
            userId: user.userId,
            isActive: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          take: 1,
          select: { role: true },
        },
      },
    });

    if (!budget) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

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

    const soloShare = budget.soloShares[0];
    if (soloShare) {
      const tier = soloRoleToAccessTier(soloShare.role);
      if (minRole === "ADMIN" && tier !== "ADMIN") {
        return forbidden("Budget admin access required");
      }
      return { membership: { role: soloShare.role } };
    }
  }

  if (shareToken) {
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

    const shareRoleIsAdmin = share.role === "CO_OWNER";
    if (minRole === "ADMIN" && !shareRoleIsAdmin) {
      return forbidden("Insufficient share permissions");
    }

    return { membership: { role: share.role } };
  }

  if (!user) {
    return unauthorized();
  }

  return forbidden("No access to this budget");
}

/**
 * Verify a BudgetSoloShare token grants access to the specified budget.
 * This is a convenience wrapper — prefer requireBudgetAccess with shareToken for
 * combined membership+share checks.
 */
export async function requireBudgetShareAccess(
  shareToken: string,
  budgetId: string
): Promise<{ share: { role: string; budgetId: string } } | NextResponse> {
  const result = await requireBudgetAccess(null, budgetId, "MEMBER", shareToken);
  if (result instanceof NextResponse) return result;
  return { share: { role: result.membership.role, budgetId } };
}

export function isSessionPayload(
  value: SessionPayload | NextResponse
): value is SessionPayload {
  return !(value instanceof NextResponse);
}
