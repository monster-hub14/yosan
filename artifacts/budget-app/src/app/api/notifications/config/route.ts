/**
 * GET /api/notifications/config
 * PUT /api/notifications/config
 * Manage per-user notification configuration:
 * - notificationEmail: address for alert delivery (separate from receipt forwarding)
 * - digestFrequency: "DAILY" | "WEEKLY" | "MONTHLY"
 * - billReminderDays: how many days ahead to alert for upcoming bills (default 3)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const config = await db.userNotificationConfig.findUnique({
    where: { userId: session.userId },
  });

  return NextResponse.json({
    config: config ?? {
      notificationEmail: null,
      digestFrequency: "WEEKLY",
      billReminderDays: 3,
    },
  });
}

export async function PUT(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const body = await request.json() as {
    notificationEmail?: string | null;
    digestFrequency?: string;
    billReminderDays?: number;
  };

  const validFrequencies = ["DAILY", "WEEKLY", "MONTHLY"];
  const digestFrequency = validFrequencies.includes(body.digestFrequency ?? "")
    ? body.digestFrequency!
    : "WEEKLY";
  const billReminderDays = Math.max(1, Math.min(30, body.billReminderDays ?? 3));
  const notificationEmail = body.notificationEmail?.trim() || null;

  const config = await db.userNotificationConfig.upsert({
    where: { userId: session.userId },
    create: {
      userId: session.userId,
      notificationEmail,
      digestFrequency,
      billReminderDays,
    },
    update: {
      notificationEmail,
      digestFrequency,
      billReminderDays,
    },
  });

  return NextResponse.json({ config });
}
