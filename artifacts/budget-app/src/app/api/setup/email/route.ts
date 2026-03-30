import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardSetupRoute } from "@/lib/auth/setup-guard";

export async function POST(request: NextRequest) {
  try {
    const denied = await guardSetupRoute(request);
    if (denied) return denied;

    const { smtpHost, smtpPort, smtpUser, smtpPass, fromAddress, fromName } =
      await request.json();

    if (!smtpHost) {
      return NextResponse.json({ error: "SMTP host is required" }, { status: 400 });
    }

    await prisma.emailConfig.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        smtpHost: smtpHost.trim(),
        smtpPort: smtpPort ? parseInt(smtpPort) : 587,
        smtpUser: smtpUser?.trim() || null,
        smtpPass: smtpPass || null,
        fromAddress: fromAddress?.trim() || null,
        fromName: fromName?.trim() || "Budget App",
        isEnabled: true,
      },
      update: {
        smtpHost: smtpHost.trim(),
        smtpPort: smtpPort ? parseInt(smtpPort) : 587,
        smtpUser: smtpUser?.trim() || null,
        smtpPass: smtpPass || null,
        fromAddress: fromAddress?.trim() || null,
        fromName: fromName?.trim() || "Budget App",
        isEnabled: true,
      },
    });

    await prisma.setupProgress.update({
      where: { id: "singleton" },
      data: { emailConfigured: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[setup/email]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
