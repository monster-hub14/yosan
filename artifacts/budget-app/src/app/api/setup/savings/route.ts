import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardSetupRoute } from "@/lib/auth/setup-guard";

export async function POST(request: NextRequest) {
  try {
    const denied = await guardSetupRoute(request);
    if (denied) return denied;

    const budget = await prisma.budget.findFirst({ orderBy: { createdAt: "asc" } });
    if (!budget) {
      return NextResponse.json({ error: "Create a budget first" }, { status: 400 });
    }

    const { name, targetAmount } = await request.json();

    if (!name || !targetAmount) {
      return NextResponse.json(
        { error: "Name and target amount are required" },
        { status: 400 }
      );
    }

    const goal = await prisma.savingsGoal.create({
      data: {
        budgetId: budget.id,
        name: name.trim(),
        targetAmount: parseFloat(targetAmount),
      },
    });

    await prisma.setupProgress.update({
      where: { id: "singleton" },
      data: { savingsConfigured: true },
    });

    return NextResponse.json({ goal });
  } catch (err) {
    console.error("[setup/savings]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
