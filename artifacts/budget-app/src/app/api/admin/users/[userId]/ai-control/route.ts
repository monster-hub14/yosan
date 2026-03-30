/**
 * GET  /api/admin/users/[userId]/ai-control  — fetch per-user AI settings
 * PUT  /api/admin/users/[userId]/ai-control  — upsert per-user AI settings
 * DELETE /api/admin/users/[userId]/ai-control — reset to global defaults
 *
 * Admin-only. Manages UserAIControl overrides.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

interface Params { params: Promise<{ userId: string }> }

async function requireAdmin(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return { error: session };
  if (session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Admin required" }, { status: 403 }) };
  }
  return { session };
}

export async function GET(request: NextRequest, { params }: Params) {
  const check = await requireAdmin(request);
  if (check.error) return check.error;

  const { userId } = await params;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, aiControl: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const global = await db.aIProviderConfig.findUnique({ where: { id: "singleton" } });

  return NextResponse.json({ user, control: user.aiControl, global });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const check = await requireAdmin(request);
  if (check.error) return check.error;

  const { userId } = await params;

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body = await request.json() as {
    aiEnabled?: boolean;
    extractionEnabled?: boolean;
    categorizationEnabled?: boolean;
    dailyLimit?: number | null;
    weeklyLimit?: number | null;
    monthlyLimit?: number | null;
  };

  const control = await db.userAIControl.upsert({
    where: { userId },
    create: {
      userId,
      aiEnabled: body.aiEnabled ?? true,
      extractionEnabled: body.extractionEnabled ?? true,
      categorizationEnabled: body.categorizationEnabled ?? true,
      dailyLimit: body.dailyLimit ?? null,
      weeklyLimit: body.weeklyLimit ?? null,
      monthlyLimit: body.monthlyLimit ?? null,
    },
    update: {
      ...(body.aiEnabled !== undefined && { aiEnabled: body.aiEnabled }),
      ...(body.extractionEnabled !== undefined && { extractionEnabled: body.extractionEnabled }),
      ...(body.categorizationEnabled !== undefined && { categorizationEnabled: body.categorizationEnabled }),
      ...(Object.prototype.hasOwnProperty.call(body, "dailyLimit") && { dailyLimit: body.dailyLimit }),
      ...(Object.prototype.hasOwnProperty.call(body, "weeklyLimit") && { weeklyLimit: body.weeklyLimit }),
      ...(Object.prototype.hasOwnProperty.call(body, "monthlyLimit") && { monthlyLimit: body.monthlyLimit }),
    },
  });

  return NextResponse.json({ control });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const check = await requireAdmin(request);
  if (check.error) return check.error;

  const { userId } = await params;

  await db.userAIControl.deleteMany({ where: { userId } });

  return NextResponse.json({ ok: true, message: "User AI controls reset to global defaults" });
}
