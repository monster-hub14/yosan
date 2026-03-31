import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { sendMail, welcomeEmail } from "@/lib/email";

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!isSessionPayload(session)) return session;

  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!isSessionPayload(session)) return session;

  const bcrypt = await import("bcryptjs");
  const { email, name, password, role } = await request.json();

  if (!email || !name || !password) {
    return NextResponse.json(
      { error: "Email, name, and password are required" },
      { status: 400 }
    );
  }

  const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.user.create({
    data: {
      email: email.toLowerCase().trim(),
      name: name.trim(),
      passwordHash,
      role: role === "ADMIN" ? "ADMIN" : "USER",
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  // Fire-and-forget: send welcome email to the newly created user
  const { subject, html } = welcomeEmail({ userName: user.name, userEmail: user.email });
  sendMail({ to: user.email, subject, html }).catch((err) => {
    console.warn("[users] Failed to send welcome email:", err instanceof Error ? err.message : String(err));
  });

  return NextResponse.json({ user }, { status: 201 });
}
