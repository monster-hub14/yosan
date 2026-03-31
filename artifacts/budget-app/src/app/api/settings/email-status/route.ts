/**
 * GET /api/settings/email-status
 * Returns whether email is configured and enabled — safe for all authenticated users.
 * Does NOT expose any SMTP credentials.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    if (!isSessionPayload(session)) {
      console.log("[email-status] GET: auth failed");
      return session;
    }

    const config = await db.emailConfig.findUnique({
      where: { id: "singleton" },
      select: {
        isEnabled: true,
        fromName: true,
        smtpHost: true,
        smtpPort: true,
        lastTestOk: true,
      },
    });

    const smtpConfigured = !!(config?.smtpHost && config?.smtpPort && config.smtpPort > 0);

    return NextResponse.json({
      ok: true,
      isEnabled: config?.isEnabled ?? false,
      fromName: config?.fromName ?? "Yosan AI",
      smtpHost: smtpConfigured,
      lastTestOk: config?.lastTestOk ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isSchemaError =
      (err as { code?: string }).code === "P2022" ||
      msg.includes("does not exist in the current database");
    console.error(`[email-status] GET: ${isSchemaError ? "Schema drift" : "Unexpected error"}:`, msg);
    return NextResponse.json(
      isSchemaError
        ? { ok: false, error: "Database schema is out of date — run migrations", errorCode: "schema_out_of_date" }
        : { ok: false, error: "Internal server error", errorCode: "internal_error" },
      { status: 500 }
    );
  }
}
