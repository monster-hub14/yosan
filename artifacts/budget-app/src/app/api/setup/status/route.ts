import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const progress = await db.setupProgress.findUnique({
      where: { id: "singleton" },
    });

    return NextResponse.json({
      progress: progress || {
        adminAccountCreated: false,
        firstBudgetCreated: false,
        incomeConfigured: false,
        savingsConfigured: false,
        recurringConfigured: false,
        aiConfigured: false,
        emailConfigured: false,
        completedAt: null,
      },
      isComplete: !!progress?.completedAt,
    });
  } catch (err) {
    console.error("[setup/status]", err);
    return NextResponse.json(
      { error: "Database not initialized" },
      { status: 503 }
    );
  }
}
