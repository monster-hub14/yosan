import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

function normalizeConfig(config: {
  smtpHost: string | null;
  smtpPort: number;
  smtpEncryption: string | null;
  smtpUser: string | null;
  smtpPass: string | null;
  fromAddress: string | null;
  fromName: string | null;
  isEnabled: boolean;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
}) {
  return {
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
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin(request);
    if (!isSessionPayload(session)) {
      console.log("[email/settings] GET: auth failed");
      return session;
    }

    const config = await db.emailConfig.findUnique({ where: { id: "singleton" } });

    console.log(
      `[email/settings] GET: found=${!!config} host=${config?.smtpHost ?? "(none)"} enabled=${config?.isEnabled ?? false}`
    );

    return NextResponse.json({
      ok: true,
      config: config ? normalizeConfig(config) : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isSchemaError =
      (err as { code?: string }).code === "P2022" ||
      msg.includes("does not exist in the current database");
    console.error(`[email/settings] GET: ${isSchemaError ? "Schema drift" : "Unexpected error"}:`, msg);
    return NextResponse.json(
      isSchemaError
        ? { ok: false, error: "Database schema is out of date — run migrations", errorCode: "schema_out_of_date" }
        : { ok: false, error: "Internal server error", errorCode: "internal_error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAdmin(request);
    if (!isSessionPayload(session)) {
      console.log("[email/settings] PUT: auth failed");
      return session;
    }

    let body: {
      smtpHost?: string;
      smtpPort?: number;
      smtpEncryption?: string;
      smtpUser?: string;
      smtpPass?: string;
      fromAddress?: string;
      fromName?: string;
      isEnabled?: boolean;
    };

    try {
      body = await request.json() as typeof body;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid request body", errorCode: "validation_error" },
        { status: 400 }
      );
    }

    const { smtpHost, smtpPort, smtpEncryption, smtpUser, smtpPass, fromAddress, fromName, isEnabled } = body;

    let resolvedEncryptedPass: string | null | undefined = undefined;
    if (smtpPass && smtpPass !== "••••••••") {
      resolvedEncryptedPass = await encrypt(smtpPass);
    } else if (!smtpPass) {
      resolvedEncryptedPass = null;
    }

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
      ok: true,
      config: normalizeConfig(config),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isSchemaError =
      (err as { code?: string }).code === "P2022" ||
      msg.includes("does not exist in the current database");
    console.error(`[email/settings] PUT: ${isSchemaError ? "Schema drift" : "Unexpected error"}:`, msg);
    return NextResponse.json(
      isSchemaError
        ? { ok: false, error: "Database schema is out of date — run migrations", errorCode: "schema_out_of_date" }
        : { ok: false, error: "Internal server error", errorCode: "internal_error" },
      { status: 500 }
    );
  }
}
