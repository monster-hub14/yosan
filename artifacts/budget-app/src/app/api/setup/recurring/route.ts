import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const budget = await db.budget.findFirst({ orderBy: { createdAt: "asc" } });
    if (!budget) {
      return NextResponse.json({ error: "Create a budget first" }, { status: 400 });
    }

    const { name, amount, frequency } = await request.json();

    if (!name || !amount || !frequency) {
      return NextResponse.json(
        { error: "Name, amount, and frequency are required" },
        { status: 400 }
      );
    }

    const recurring = await db.recurringExpense.create({
      data: {
        budgetId: budget.id,
        name: name.trim(),
        amount: parseFloat(amount),
        frequency,
      },
    });

    await db.setupProgress.update({
      where: { id: "singleton" },
      data: { recurringConfigured: true },
    });

    return NextResponse.json({ recurring });
  } catch (err) {
    console.error("[setup/recurring]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
