import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardSetupRoute } from "@/lib/auth/setup-guard";

const DEFAULT_CATEGORIES = [
  { name: "Housing", color: "#6366f1", icon: "home" },
  { name: "Food & Dining", color: "#f59e0b", icon: "utensils" },
  { name: "Transportation", color: "#3b82f6", icon: "car" },
  { name: "Healthcare", color: "#ef4444", icon: "heart-pulse" },
  { name: "Entertainment", color: "#8b5cf6", icon: "tv" },
  { name: "Shopping", color: "#ec4899", icon: "shopping-bag" },
  { name: "Utilities", color: "#14b8a6", icon: "zap" },
  { name: "Education", color: "#f97316", icon: "book-open" },
  { name: "Personal Care", color: "#84cc16", icon: "sparkles" },
  { name: "Other", color: "#6b7280", icon: "circle-dot" },
];

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
        categories: {
          create: DEFAULT_CATEGORIES.map((c) => ({ ...c, isDefault: true })),
        },
      },
    });

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
