import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

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

    const { email, name, password } = await request.json();

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

    await db.setupProgress.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", adminAccountCreated: true },
      update: { adminAccountCreated: true },
    });

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error("[setup/account]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
