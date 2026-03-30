import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardSetupRoute } from "@/lib/auth/setup-guard";
import { seedDefaultCategories } from "@/lib/default-categories";

export async function POST(request: NextRequest) {
  try {
    const denied = await guardSetupRoute(request);
    if (denied) return denied;

    const progress = await db.setupProgress.findUnique({ where: { id: "singleton" } });
    if (!progress?.adminAccountCreated) {
      return NextResponse.json(
        { error: "Create admin account first" },
        { status: 400 }
      );
    }

    const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
    if (!admin) {
      return NextResponse.json({ error: "Admin user not found" }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { name, currency } = body as { name?: string; currency?: string };

    if (!name) {
      return NextResponse.json({ error: "Budget name is required" }, { status: 400 });
    }

    const budget = await db.budget.create({
      data: {
        name: name.trim(),
        currency: currency || "USD",
        ownerId: admin.id,
      },
    });

    await seedDefaultCategories(db, budget.id);

    await db.setupProgress.update({
      where: { id: "singleton" },
      data: { firstBudgetCreated: true },
    });

    return NextResponse.json({ budget });
  } catch (err) {
    console.error("[setup/budget]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
