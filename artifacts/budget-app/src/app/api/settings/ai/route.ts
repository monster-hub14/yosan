import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";

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
          extractionEnabled: config.extractionEnabled,
          categorizationEnabled: config.categorizationEnabled,
          recurringCategorizationEnabled: config.recurringCategorizationEnabled,
          insightsEnabled: config.insightsEnabled,
          forecastingEnabled: config.forecastingEnabled,
          dailyLimitPerUser: config.dailyLimitPerUser,
          weeklyLimitPerUser: config.weeklyLimitPerUser,
          monthlyLimitPerUser: config.monthlyLimitPerUser,
        }
      : null,
  });
}

export async function PUT(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!isSessionPayload(session)) return session;

  const body = await request.json();
  const {
    provider,
    model,
    apiKey,
    baseUrl,
    isEnabled,
    extractionEnabled,
    categorizationEnabled,
    recurringCategorizationEnabled,
    insightsEnabled,
    forecastingEnabled,
    dailyLimitPerUser,
    weeklyLimitPerUser,
    monthlyLimitPerUser,
  } = body;

  const limitOrNull = (v: unknown) => {
    if (v === null || v === "" || v === undefined) return null;
    const n = parseInt(String(v), 10);
    return isNaN(n) ? null : Math.max(1, n);
  };

  const sharedFields = {
    provider,
    model,
    baseUrl: baseUrl || null,
    isEnabled: isEnabled ?? false,
    extractionEnabled: extractionEnabled ?? true,
    categorizationEnabled: categorizationEnabled ?? true,
    recurringCategorizationEnabled: recurringCategorizationEnabled ?? true,
    insightsEnabled: insightsEnabled ?? true,
    forecastingEnabled: forecastingEnabled ?? false,
    dailyLimitPerUser: limitOrNull(dailyLimitPerUser),
    weeklyLimitPerUser: limitOrNull(weeklyLimitPerUser),
    monthlyLimitPerUser: limitOrNull(monthlyLimitPerUser),
  };

  // Encrypt API key before storing
  const encryptedKey = apiKey && apiKey !== "••••••••" ? encrypt(apiKey) : undefined;

  const config = await db.aIProviderConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      ...sharedFields,
      apiKey: encryptedKey ?? null,
    },
    update: {
      ...sharedFields,
      ...(encryptedKey ? { apiKey: encryptedKey } : {}),
    },
  });

  return NextResponse.json({
    config: {
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey ? "••••••••" : "",
      baseUrl: config.baseUrl,
      isEnabled: config.isEnabled,
      extractionEnabled: config.extractionEnabled,
      categorizationEnabled: config.categorizationEnabled,
      recurringCategorizationEnabled: config.recurringCategorizationEnabled,
      insightsEnabled: config.insightsEnabled,
      forecastingEnabled: config.forecastingEnabled,
      dailyLimitPerUser: config.dailyLimitPerUser,
      weeklyLimitPerUser: config.weeklyLimitPerUser,
      monthlyLimitPerUser: config.monthlyLimitPerUser,
    },
  });
}
