import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isSessionPayload } from "@/lib/auth/permissions";
import { testEmailConfig } from "@/lib/email";
import { decrypt } from "@/lib/encryption";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!isSessionPayload(session)) return session;

  const body = await request.json() as {
    toAddress?: string;
    host?: string;
    port?: number;
    user?: string;
    pass?: string;
    fromAddress?: string;
    fromName?: string;
  };

  if (!body.toAddress) {
    return NextResponse.json({ error: "toAddress required" }, { status: 400 });
  }

  // If no host provided, use the saved config
  if (!body.host) {
    const config = await db.emailConfig.findUnique({ where: { id: "singleton" } });
    if (!config || !config.smtpHost || !config.fromAddress) {
      return NextResponse.json({ error: "SMTP not configured" }, { status: 400 });
    }
    const decryptedPass = config.smtpPass
      ? (() => { try { return decrypt(config.smtpPass!); } catch { return undefined; } })()
      : undefined;

    const result = await testEmailConfig({
      host: config.smtpHost,
      port: config.smtpPort,
      smtpEncryption: (config as { smtpEncryption?: string }).smtpEncryption ?? "STARTTLS",
      user: config.smtpUser ?? undefined,
      pass: decryptedPass ?? undefined,
      fromAddress: config.fromAddress,
      fromName: config.fromName ?? "Yosan AI",
      toAddress: body.toAddress,
    });
    return NextResponse.json(result);
  }

  const result = await testEmailConfig({
    host: body.host,
    port: body.port ?? 587,
    user: body.user,
    pass: body.pass,
    fromAddress: body.fromAddress ?? "noreply@budget.local",
    fromName: body.fromName ?? "Yosan AI",
    toAddress: body.toAddress,
  });

  return NextResponse.json(result);
}
