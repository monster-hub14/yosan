import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "./session";
import type { SessionPayload } from "./types";
import { db } from "@/lib/db";

export function unauthorized(message = "Unauthorized"): NextResponse {
  return NextResponse.json({ ok: false, error: message, errorCode: "unauthorized" }, { status: 401 });
}

export function forbidden(message = "Forbidden"): NextResponse {
  return NextResponse.json({ ok: false, error: message, errorCode: "forbidden" }, { status: 403 });
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

/**
 * Budget permission capability requested by a route.
 *
 * - READ:    any access (Viewer, Helper, Co-owner, Member, Admin, Owner)
 * - WRITE:   can create/update/delete budget data (Helper+, Member+, Co-owner+, Admin, Owner)
 * - MANAGE:  can invite/remove members, change budget settings (Co-owner, Admin, Owner)
 *
 * Role → capabilities:
 *   Shared budget: ADMIN (owner/admin-role) → all; MEMBER → READ + WRITE
 *   Solo budget:   CO_OWNER → all; HELPER → READ + WRITE; VIEWER → READ only
 */
export type BudgetCapability = "READ" | "WRITE" | "MANAGE";

function soloRoleHasCapability(role: string, capability: BudgetCapability): boolean {
  switch (role) {
    case "CO_OWNER": return true;
    case "HELPER": return capability === "READ" || capability === "WRITE";
    case "VIEWER": return capability === "READ";
    default: return false;
  }
}

function sharedRoleHasCapability(role: string, capability: BudgetCapability): boolean {
  switch (role) {
    case "ADMIN": return true;
    case "MEMBER": return capability === "READ" || capability === "WRITE";
    default: return false;
  }
}

/**
 * Legacy tier type kept for backward compat with callers using minRole.
 * Internally maps to capabilities.
 */
export type BudgetAccessRole = "MEMBER" | "ADMIN";

function accessRoleToCapability(minRole: BudgetAccessRole): BudgetCapability {
  return minRole === "ADMIN" ? "MANAGE" : "WRITE";
}

/**
 * Verify access to a budget.
 *
 * Access is granted if the authenticated user has the required capability:
 *   1. Instance ADMIN → always granted (superuser override).
 *   2. Budget owner → always granted.
 *   3. BudgetMembership (SHARED): ADMIN → MANAGE; MEMBER → READ + WRITE.
 *   4. BudgetSoloShare (SOLO, authenticated by userId): CO_OWNER → MANAGE; HELPER → READ + WRITE; VIEWER → READ.
 *   5. shareToken (anonymous link): same solo role capability rules.
 *
 * @param user        Authenticated session, or null for share-token-only access.
 * @param budgetId    The target budget.
 * @param minRole     Minimum required role tier (MEMBER = needs WRITE, ADMIN = needs MANAGE).
 * @param shareToken  Optional share token for BudgetSoloShare validation.
 * @param capability  Override capability check (takes precedence over minRole if provided).
 */
export async function requireBudgetAccess(
  user: SessionPayload | null,
  budgetId: string,
  minRole: BudgetAccessRole = "MEMBER",
  shareToken?: string,
  capability?: BudgetCapability
): Promise<{ membership: { role: string } } | NextResponse> {
  const required = capability ?? accessRoleToCapability(minRole);
  const now = new Date();

  if (user) {
    if (user.role === "ADMIN") {
      return { membership: { role: "ADMIN" } };
    }

    const budget = await db.budget.findUnique({
      where: { id: budgetId },
      select: {
        ownerId: true,
        budgetType: true,
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
      return NextResponse.json({ ok: false, error: "Budget not found", errorCode: "not_found" }, { status: 404 });
    }

    if (budget.ownerId === user.userId) {
      return { membership: { role: "ADMIN" } };
    }

    const membership = budget.memberships[0];
    if (membership) {
      if (!sharedRoleHasCapability(membership.role, required)) {
        return forbidden("Insufficient budget permissions");
      }
      return { membership };
    }

    const soloShare = budget.soloShares[0];
    if (soloShare) {
      if (!soloRoleHasCapability(soloShare.role, required)) {
        return forbidden("Insufficient budget permissions");
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
      return NextResponse.json({ ok: false, error: "Invalid or expired share link", errorCode: "forbidden" }, { status: 403 });
    }
    if (share.expiresAt && share.expiresAt < new Date()) {
      return NextResponse.json({ ok: false, error: "Share link has expired", errorCode: "forbidden" }, { status: 403 });
    }
    if (share.budgetId !== budgetId) {
      return NextResponse.json({ ok: false, error: "Share token does not match budget", errorCode: "forbidden" }, { status: 403 });
    }

    if (!soloRoleHasCapability(share.role, required)) {
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
 * Require at least READ capability (viewers and above).
 * Use this for GET-only endpoints that should be accessible to all roles.
 */
export async function requireBudgetRead(
  user: SessionPayload | null,
  budgetId: string,
  shareToken?: string
) {
  return requireBudgetAccess(user, budgetId, "MEMBER", shareToken, "READ");
}

/**
 * Require WRITE capability (helpers and above; no viewers).
 * Use this for mutating endpoints (POST/PUT/DELETE on budget data).
 */
export async function requireBudgetWrite(
  user: SessionPayload | null,
  budgetId: string,
  shareToken?: string
) {
  return requireBudgetAccess(user, budgetId, "MEMBER", shareToken, "WRITE");
}

/**
 * Require MANAGE capability (owner / admin / co-owner only).
 * Use this for membership management, budget settings changes.
 */
export async function requireBudgetManage(
  user: SessionPayload | null,
  budgetId: string,
  shareToken?: string
) {
  return requireBudgetAccess(user, budgetId, "ADMIN", shareToken, "MANAGE");
}

/**
 * Verify a BudgetSoloShare token grants access to the specified budget.
 */
export async function requireBudgetShareAccess(
  shareToken: string,
  budgetId: string
): Promise<{ share: { role: string; budgetId: string } } | NextResponse> {
  const result = await requireBudgetAccess(null, budgetId, "MEMBER", shareToken, "READ");
  if (result instanceof NextResponse) return result;
  return { share: { role: result.membership.role, budgetId } };
}

export function isSessionPayload(
  value: SessionPayload | NextResponse
): value is SessionPayload {
  return !(value instanceof NextResponse);
}
