import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { smtpHost, smtpPort, smtpUser, smtpPass, fromAddress, fromName } =
      await request.json();

    if (!smtpHost) {
      return NextResponse.json({ error: "SMTP host is required" }, { status: 400 });
    }

    await db.emailConfig.upsert({
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

    await db.setupProgress.update({
      where: { id: "singleton" },
      data: { emailConfigured: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[setup/email]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
