import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

const VALID_EVENTS = [
  "overspending_alert",
  "budget_approaching",
  "weekly_summary",
  "upcoming_bill",
  "payday_reminder",
  "new_insight",
  "deficit_risk",
  "savings_goal_risk",
  "receipt_upload_reminder",
];

const VALID_CHANNELS = ["EMAIL", "IN_APP"] as const;

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const prefs = await db.notificationPreference.findMany({
    where: { userId: session.userId },
    orderBy: [{ channel: "asc" }, { event: "asc" }],
  });

  return NextResponse.json({ prefs });
}

export async function PUT(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const body = await request.json() as {
    channel: "EMAIL" | "IN_APP";
    event: string;
    isEnabled: boolean;
    budgetId?: string | null;
  }[];

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "Expected array of preference updates" }, { status: 400 });
  }

  const results = await Promise.all(
    body.map(async (item) => {
      if (!VALID_CHANNELS.includes(item.channel as "EMAIL" | "IN_APP")) return null;
      if (!VALID_EVENTS.includes(item.event)) return null;

      const budgetId = item.budgetId ?? null;

      // Find existing pref with matching key
      const existing = await db.notificationPreference.findFirst({
        where: {
          userId: session.userId,
          budgetId: budgetId === null ? null : budgetId,
          channel: item.channel,
          event: item.event,
        },
      });

      if (existing) {
        return db.notificationPreference.update({
          where: { id: existing.id },
          data: { isEnabled: item.isEnabled },
        });
      }

      return db.notificationPreference.create({
        data: {
          userId: session.userId,
          budgetId,
          channel: item.channel,
          event: item.event,
          isEnabled: item.isEnabled,
        },
      });
    })
  );

  return NextResponse.json({ prefs: results.filter(Boolean) });
}
