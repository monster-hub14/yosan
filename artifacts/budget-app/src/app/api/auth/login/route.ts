import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSessionToken } from "@/lib/auth/session";
import {
  createSetupToken,
  verifySetupToken,
  SETUP_COOKIE,
  SETUP_MAX_AGE,
} from "@/lib/auth/setup-token";

const SESSION_COOKIE = "budget_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });

    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });

    const isProd = process.env.NODE_ENV === "production";

    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_MAX_AGE,
      secure: isProd,
    });

    // Re-issue the signed setup token on every login so the middleware can verify
    // setup state without hitting the DB. This handles the case where cookies were
    // cleared after setup was completed.
    const existingSetupToken = request.cookies.get(SETUP_COOKIE)?.value;
    const setupAlreadyVerified = existingSetupToken
      ? await verifySetupToken(existingSetupToken)
      : false;

    if (!setupAlreadyVerified) {
      const progress = await db.setupProgress.findUnique({
        where: { id: "singleton" },
        select: { completedAt: true },
      });
      if (progress?.completedAt) {
        const setupToken = await createSetupToken();
        response.cookies.set(SETUP_COOKIE, setupToken, {
          httpOnly: true,
          sameSite: "lax", // Lax allows top-level navigation (e.g., redirect after OAuth). Post-setup, /api/setup/* requires ADMIN auth via guardSetupRoute(), so CSRF is not a risk.
          path: "/",
          maxAge: SETUP_MAX_AGE,
        });
      }
    }

    return response;
  } catch (err) {
    console.error("[auth/login]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
