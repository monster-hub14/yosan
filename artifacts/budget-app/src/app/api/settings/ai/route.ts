import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!isSessionPayload(session)) return session;

  const config = await db.aIProviderConfig.findUnique({ where: { id: "singleton" } });

  return NextResponse.json({
    config: config
      ? {
          provider: config.provider,
          model: config.model,
          apiKey: config.apiKey ? "••••••••" : "",
          baseUrl: config.baseUrl,
          isEnabled: config.isEnabled,
        }
      : null,
  });
}

export async function PUT(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!isSessionPayload(session)) return session;

  const { provider, model, apiKey, baseUrl, isEnabled } = await request.json();

  const config = await db.aIProviderConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      provider,
      model,
      apiKey: apiKey || null,
      baseUrl: baseUrl || null,
      isEnabled: isEnabled ?? false,
    },
    update: {
      provider,
      model,
      baseUrl: baseUrl || null,
      isEnabled: isEnabled ?? false,
      ...(apiKey && apiKey !== "••••••••" ? { apiKey } : {}),
    },
  });

  return NextResponse.json({
    config: {
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey ? "••••••••" : "",
      baseUrl: config.baseUrl,
      isEnabled: config.isEnabled,
    },
  });
}
