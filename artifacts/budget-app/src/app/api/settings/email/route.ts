import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";

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

  const body = await request.json() as {
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    fromAddress?: string;
    fromName?: string;
    isEnabled?: boolean;
  };

  const { smtpHost, smtpPort, smtpUser, smtpPass, fromAddress, fromName, isEnabled } = body;

  // Resolve the password: if masked (unchanged), keep existing
  let resolvedEncryptedPass: string | null | undefined = undefined;
  if (smtpPass && smtpPass !== "••••••••") {
    resolvedEncryptedPass = await encrypt(smtpPass);
  } else if (!smtpPass) {
    resolvedEncryptedPass = null;
  }
  // If smtpPass === "••••••••", keep existing (don't include in update)

  const config = await db.emailConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      smtpHost: smtpHost || null,
      smtpPort: smtpPort || 587,
      smtpUser: smtpUser || null,
      smtpPass: resolvedEncryptedPass ?? null,
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
      ...(resolvedEncryptedPass !== undefined ? { smtpPass: resolvedEncryptedPass } : {}),
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

/** Internal helper — decrypt SMTP password for sending (not exposed to client) */
export async function getDecryptedSmtpPass(): Promise<string | null> {
  const config = await db.emailConfig.findUnique({ where: { id: "singleton" } });
  if (!config?.smtpPass) return null;
  try { return await decrypt(config.smtpPass); } catch { return null; }
}
