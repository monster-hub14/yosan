/**
 * GET /api/settings/email-status
 * Returns whether email is configured and enabled — safe for all authenticated users.
 * Does NOT expose any SMTP credentials.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

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
    isEnabled: config?.isEnabled ?? false,
    fromName: config?.fromName ?? "Yosan AI",
    smtpHost: smtpConfigured,
    lastTestOk: config?.lastTestOk ?? null,
  });
}
