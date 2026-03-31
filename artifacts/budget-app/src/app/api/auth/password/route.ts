import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { sendMail, passwordChangedEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { currentPassword, newPassword } = await request.json();

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Both passwords are required" }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { passwordHash: true, email: true, name: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.user.update({
    where: { id: session.userId },
    data: { passwordHash },
  });

  // Fire-and-forget: send password-changed confirmation email
  const { subject, html } = passwordChangedEmail({ userName: user.name, userEmail: user.email });
  sendMail({ to: user.email, subject, html }).catch((err) => {
    console.warn("[password] Failed to send password-changed email:", err instanceof Error ? err.message : String(err));
  });

  return NextResponse.json({ ok: true });
}
