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

    const { name, amount, frequency, nextPayDate } = await request.json();

    if (!name || !amount || !frequency) {
      return NextResponse.json(
        { error: "Name, amount, and frequency are required" },
        { status: 400 }
      );
    }

    const source = await prisma.incomeSource.create({
      data: {
        budgetId: budget.id,
        name: name.trim(),
        amount: parseFloat(amount),
        frequency,
        nextPayDate: nextPayDate ? new Date(nextPayDate) : null,
      },
    });

    await prisma.setupProgress.update({
      where: { id: "singleton" },
      data: { incomeConfigured: true },
    });

    return NextResponse.json({ source });
  } catch (err) {
    console.error("[setup/income]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
