import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!isSessionPayload(session)) return session;

  const cfg = await db.gmailOAuthConfig.findUnique({ where: { id: "singleton" } });

  return NextResponse.json({
    ok: true,
    config: cfg
      ? {
          clientId: cfg.clientId ? "••••••••" : "",
          clientSecret: cfg.clientSecret ? "••••••••" : "",
          isConfigured: !!(cfg.clientId && cfg.clientSecret),
        }
      : { clientId: "", clientSecret: "", isConfigured: false },
  });
}

export async function PUT(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!isSessionPayload(session)) return session;

  let body: { clientId?: string; clientSecret?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { clientId, clientSecret } = body;

  const existing = await db.gmailOAuthConfig.findUnique({ where: { id: "singleton" } });

  const resolveClientId = (): string | null => {
    if (clientId && clientId !== "••••••••") return encrypt(clientId);
    if (clientId === "••••••••" && existing?.clientId) return existing.clientId;
    return null;
  };

  const resolveClientSecret = (): string | null => {
    if (clientSecret && clientSecret !== "••••••••") return encrypt(clientSecret);
    if (clientSecret === "••••••••" && existing?.clientSecret) return existing.clientSecret;
    return null;
  };

  const encClientId = resolveClientId();
  const encClientSecret = resolveClientSecret();

  const cfg = await db.gmailOAuthConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", clientId: encClientId, clientSecret: encClientSecret },
    update: {
      ...(encClientId !== null ? { clientId: encClientId } : {}),
      ...(encClientSecret !== null ? { clientSecret: encClientSecret } : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    config: {
      clientId: cfg.clientId ? "••••••••" : "",
      clientSecret: cfg.clientSecret ? "••••••••" : "",
      isConfigured: !!(cfg.clientId && cfg.clientSecret),
    },
  });
}
