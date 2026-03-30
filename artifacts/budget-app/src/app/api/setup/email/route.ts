import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardSetupRoute } from "@/lib/auth/setup-guard";
import { encrypt } from "@/lib/encryption";

export async function POST(request: NextRequest) {
  try {
    const denied = await guardSetupRoute(request);
    if (denied) return denied;

    const { smtpHost, smtpPort, smtpUser, smtpPass, fromAddress, fromName } =
      await request.json() as {
        smtpHost?: string;
        smtpPort?: number;
        smtpUser?: string;
        smtpPass?: string;
        fromAddress?: string;
        fromName?: string;
      };

    if (!smtpHost) {
      return NextResponse.json({ error: "SMTP host is required" }, { status: 400 });
    }

    const encryptedPass = smtpPass ? await encrypt(smtpPass) : null;

    await prisma.emailConfig.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        smtpHost: smtpHost.trim(),
        smtpPort: smtpPort ? parseInt(String(smtpPort)) : 587,
        smtpUser: smtpUser?.trim() || null,
        smtpPass: encryptedPass,
        fromAddress: fromAddress?.trim() || null,
        fromName: fromName?.trim() || "Budget App",
        isEnabled: true,
      },
      update: {
        smtpHost: smtpHost.trim(),
        smtpPort: smtpPort ? parseInt(String(smtpPort)) : 587,
        smtpUser: smtpUser?.trim() || null,
        smtpPass: encryptedPass,
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
