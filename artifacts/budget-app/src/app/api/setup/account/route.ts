import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

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
    const existing = await db.setupProgress.findUnique({ where: { id: "singleton" } });
    if (existing?.adminAccountCreated) {
      return NextResponse.json({ error: "Setup already completed" }, { status: 400 });
    }

    const userCount = await db.user.count();
    if (userCount > 0) {
      return NextResponse.json({ error: "Admin account already exists" }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { email, name, password, budgetName, currency } = body as {
      email?: string;
      name?: string;
      password?: string;
      budgetName?: string;
      currency?: string;
    };

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: "Email, name, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await db.user.create({
      data: {
        email: email.toLowerCase().trim(),
        name: name.trim(),
        passwordHash,
        role: "ADMIN",
      },
    });

    const budget = await db.budget.create({
      data: {
        name: (budgetName?.trim()) || `${name.trim()}'s Budget`,
        currency: currency || "USD",
        ownerId: user.id,
        categories: {
          create: DEFAULT_CATEGORIES.map((c) => ({ ...c, isDefault: true })),
        },
      },
    });

    await db.setupProgress.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        adminAccountCreated: true,
        firstBudgetCreated: true,
      },
      update: {
        adminAccountCreated: true,
        firstBudgetCreated: true,
      },
    });

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      budget: { id: budget.id, name: budget.name, currency: budget.currency },
    });
  } catch (err) {
    console.error("[setup/account]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
