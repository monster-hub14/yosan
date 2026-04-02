import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const notifications = await db.inAppNotification.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const unreadCount = await db.inAppNotification.count({
    where: { userId: session.userId, isRead: false },
  });

  return NextResponse.json({ notifications, unreadCount });
}
