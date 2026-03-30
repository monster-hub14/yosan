import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!isSessionPayload(session)) return session;

  const config = await db.emailConfig.findUnique({ where: { id: "singleton" } });

  return NextResponse.json({
    config: config
      ? {
          smtpHost: config.smtpHost,
          smtpPort: config.smtpPort,
          smtpUser: config.smtpUser,
          smtpPass: config.smtpPass ? "••••••••" : "",
          fromAddress: config.fromAddress,
          fromName: config.fromName,
          isEnabled: config.isEnabled,
        }
      : null,
  });
}

export async function PUT(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!isSessionPayload(session)) return session;

  const { smtpHost, smtpPort, smtpUser, smtpPass, fromAddress, fromName, isEnabled } =
    await request.json();

  const config = await db.emailConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      smtpHost: smtpHost || null,
      smtpPort: smtpPort || 587,
      smtpUser: smtpUser || null,
      smtpPass: smtpPass || null,
      fromAddress: fromAddress || null,
      fromName: fromName || "Budget App",
      isEnabled: isEnabled ?? false,
    },
    update: {
      smtpHost: smtpHost || null,
      smtpPort: smtpPort || 587,
      smtpUser: smtpUser || null,
      fromAddress: fromAddress || null,
      fromName: fromName || "Budget App",
      isEnabled: isEnabled ?? false,
      ...(smtpPass && smtpPass !== "••••••••" ? { smtpPass } : {}),
    },
  });

  return NextResponse.json({
    config: {
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpUser: config.smtpUser,
      smtpPass: config.smtpPass ? "••••••••" : "",
      fromAddress: config.fromAddress,
      fromName: config.fromName,
      isEnabled: config.isEnabled,
    },
  });
}
