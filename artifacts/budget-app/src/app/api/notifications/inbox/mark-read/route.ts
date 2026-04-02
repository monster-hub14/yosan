import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const body = await request.json() as { id?: string; all?: boolean };

  if (body.all) {
    await db.inAppNotification.updateMany({
      where: { userId: session.userId, isRead: false },
      data: { isRead: true },
    });
  } else if (body.id) {
    await db.inAppNotification.updateMany({
      where: { id: body.id, userId: session.userId },
      data: { isRead: true },
    });
  }

  const unreadCount = await db.inAppNotification.count({
    where: { userId: session.userId, isRead: false },
  });

  return NextResponse.json({ ok: true, unreadCount });
}
