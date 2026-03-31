import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isSessionPayload } from "@/lib/auth/permissions";
import { testEmailConfig } from "@/lib/email";
import { decrypt } from "@/lib/encryption";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin(request);
    if (!isSessionPayload(session)) {
      console.log("[email/test] POST: auth failed");
      return session;
    }

    let body: { toAddress?: string };
    try {
      body = await request.json() as { toAddress?: string };
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid request body", errorCode: "validation_error" },
        { status: 400 }
      );
    }

    if (!body.toAddress) {
      return NextResponse.json(
        { ok: false, error: "toAddress required", errorCode: "validation_error" },
        { status: 400 }
      );
    }

    const config = await db.emailConfig.findUnique({ where: { id: "singleton" } });

    if (!config || !config.smtpHost || !config.smtpPort) {
      console.log("[email/test] Not configured — host or port missing");
      return NextResponse.json(
        { ok: false, error: "SMTP not configured — save settings first", errorCode: "not_configured" },
        { status: 400 }
      );
    }

    const decryptedPass = config.smtpPass
      ? (() => {
          try { return decrypt(config.smtpPass!); }
          catch {
            console.error("[email/test] Failed to decrypt SMTP password");
            return undefined;
          }
        })()
      : undefined;

    console.log(
      `[email/test] Starting test — host=${config.smtpHost} port=${config.smtpPort} enc=${config.smtpEncryption ?? "STARTTLS"} user=${config.smtpUser ?? "(none)"} to=${body.toAddress}`
    );

    const result = await testEmailConfig({
      host: config.smtpHost,
      port: config.smtpPort,
      smtpEncryption: config.smtpEncryption ?? "STARTTLS",
      user: config.smtpUser ?? undefined,
      pass: decryptedPass ?? undefined,
      fromAddress: config.fromAddress ?? null,
      fromName: config.fromName ?? "Yosan AI",
      toAddress: body.toAddress,
    });

    const now = new Date();
    await db.emailConfig.update({
      where: { id: "singleton" },
      data: {
        lastTestedAt: now,
        lastTestOk: result.ok,
        lastTestError: result.ok ? null : (result.error ?? null),
      },
    });

    console.log(
      `[email/test] Result: ok=${result.ok}${result.ok ? "" : ` errorCode=${result.errorCode ?? "?"} error=${result.error}`}`
    );

    return NextResponse.json({
      ok: result.ok,
      ...(result.error ? { error: result.error } : {}),
      ...(result.errorCode ? { errorCode: result.errorCode } : {}),
      lastTestedAt: now.toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isSchemaError =
      (err as { code?: string }).code === "P2022" ||
      msg.includes("does not exist in the current database");
    console.error(`[email/test] POST: ${isSchemaError ? "Schema drift" : "Unexpected error"}:`, msg);
    return NextResponse.json(
      isSchemaError
        ? { ok: false, error: "Database schema is out of date — run migrations", errorCode: "schema_out_of_date" }
        : { ok: false, error: "Internal server error", errorCode: "internal_error" },
      { status: 500 }
    );
  }
}
