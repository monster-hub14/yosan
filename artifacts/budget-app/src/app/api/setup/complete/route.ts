import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";

export async function POST(request: NextRequest) {
  try {
    const progress = await db.setupProgress.findUnique({ where: { id: "singleton" } });

    if (progress?.completedAt) {
      const session = await requireAuth(request);
      if (!isSessionPayload(session)) return session;
      if (session.role !== "ADMIN") {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
    }

    if (!progress?.adminAccountCreated) {
      return NextResponse.json(
        { error: "Cannot complete setup: admin account not created" },
        { status: 400 }
      );
    }

    await db.setupProgress.update({
      where: { id: "singleton" },
      data: { completedAt: new Date() },
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set("budget_setup", "done", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365 * 10,
    });
    return response;
  } catch (err) {
    console.error("[setup/complete]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
