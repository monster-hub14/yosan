import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSessionToken } from "@/lib/auth/session";

const SESSION_COOKIE = "budget_session";
const SETUP_COOKIE = "budget_setup";
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

    // If setup is complete in DB but the setup cookie isn't set (e.g. after DB migration
    // or seed), set it now so middleware can enforce proper routing.
    const existingSetupCookie = request.cookies.get(SETUP_COOKIE)?.value;
    if (existingSetupCookie !== "done") {
      const progress = await db.setupProgress.findUnique({ where: { id: "singleton" } });
      if (progress?.completedAt) {
        response.cookies.set(SETUP_COOKIE, "done", {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 365 * 10,
        });
      }
    }

    return response;
  } catch (err) {
    console.error("[auth/login]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
