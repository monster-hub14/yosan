import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST() {
  try {
    const progress = await db.setupProgress.findUnique({ where: { id: "singleton" } });

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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[setup/complete]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
