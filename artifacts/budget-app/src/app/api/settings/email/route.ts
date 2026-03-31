import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!isSessionPayload(session)) return session;

  const config = await db.emailConfig.findUnique({ where: { id: "singleton" } });

  console.log(
    `[email/settings] GET: found=${!!config} host=${config?.smtpHost ?? "(none)"} enabled=${config?.isEnabled ?? false}`
  );

  return NextResponse.json({
    config: config
      ? {
          smtpHost: config.smtpHost,
          smtpPort: config.smtpPort,
          smtpEncryption: config.smtpEncryption ?? "STARTTLS",
          smtpUser: config.smtpUser,
          smtpPass: config.smtpPass ? "••••••••" : "",
          fromAddress: config.fromAddress,
          fromName: config.fromName,
          isEnabled: config.isEnabled,
          lastTestedAt: config.lastTestedAt?.toISOString() ?? null,
          lastTestOk: config.lastTestOk ?? null,
          lastTestError: config.lastTestError ?? null,
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
    smtpEncryption?: string;
    smtpUser?: string;
    smtpPass?: string;
    fromAddress?: string;
    fromName?: string;
    isEnabled?: boolean;
  };

  const { smtpHost, smtpPort, smtpEncryption, smtpUser, smtpPass, fromAddress, fromName, isEnabled } = body;

  // Resolve the password: if masked (unchanged placeholder), keep existing
  let resolvedEncryptedPass: string | null | undefined = undefined;
  if (smtpPass && smtpPass !== "••••••••") {
    resolvedEncryptedPass = await encrypt(smtpPass);
  } else if (!smtpPass) {
    resolvedEncryptedPass = null;
  }
  // If smtpPass === "••••••••", keep existing (don't include in update)

  console.log(
    `[email/settings] PUT: host=${smtpHost ?? "(none)"} port=${smtpPort ?? "(none)"} enc=${smtpEncryption ?? "(none)"} user=${smtpUser ?? "(none)"} passwordChanged=${resolvedEncryptedPass !== undefined} enabled=${isEnabled ?? false}`
  );

  const config = await db.emailConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      smtpHost: smtpHost || null,
      smtpPort: smtpPort || 587,
      smtpEncryption: smtpEncryption || "STARTTLS",
      smtpUser: smtpUser || null,
      smtpPass: resolvedEncryptedPass ?? null,
      fromAddress: fromAddress || null,
      fromName: fromName || "Yosan AI",
      isEnabled: isEnabled ?? false,
    },
    update: {
      smtpHost: smtpHost || null,
      smtpPort: smtpPort || 587,
      smtpEncryption: smtpEncryption || "STARTTLS",
      smtpUser: smtpUser || null,
      fromAddress: fromAddress || null,
      fromName: fromName || "Yosan AI",
      isEnabled: isEnabled ?? false,
      ...(resolvedEncryptedPass !== undefined ? { smtpPass: resolvedEncryptedPass } : {}),
    },
  });

  console.log(`[email/settings] PUT: saved host=${config.smtpHost ?? "(none)"} enabled=${config.isEnabled}`);

  return NextResponse.json({
    config: {
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpEncryption: config.smtpEncryption ?? "STARTTLS",
      smtpUser: config.smtpUser,
      smtpPass: config.smtpPass ? "••••••••" : "",
      fromAddress: config.fromAddress,
      fromName: config.fromName,
      isEnabled: config.isEnabled,
      lastTestedAt: config.lastTestedAt?.toISOString() ?? null,
      lastTestOk: config.lastTestOk ?? null,
      lastTestError: config.lastTestError ?? null,
    },
  });
}
