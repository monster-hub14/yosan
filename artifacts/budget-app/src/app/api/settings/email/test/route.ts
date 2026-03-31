import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isSessionPayload } from "@/lib/auth/permissions";
import { testEmailConfig } from "@/lib/email";
import { decrypt } from "@/lib/encryption";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!isSessionPayload(session)) return session;

  const body = await request.json() as { toAddress?: string };

  if (!body.toAddress) {
    return NextResponse.json({ error: "toAddress required" }, { status: 400 });
  }

  // Always test using the saved config from DB — never unsaved in-form values
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

  // Persist test result
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
}
