import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export async function DELETE(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  await db.$transaction([
    db.gmailLabelConfig.deleteMany({ where: { userId: session.userId } }),
    db.gmailConnection.deleteMany({ where: { userId: session.userId } }),
  ]);

  return NextResponse.json({ ok: true });
}
