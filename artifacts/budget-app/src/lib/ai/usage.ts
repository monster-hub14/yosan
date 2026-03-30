/**
 * AI usage tracking and rate-limit enforcement.
 * Server-only. NEVER import from client components.
 *
 * Limit precedence (lowest wins):
 *   1. UserAIControl (per-user override, if set)
 *   2. AIProviderConfig global default
 *
 * If UserAIControl.aiEnabled is false → all features blocked regardless of global.
 */

import { db } from "@/lib/db";

export type AIFeatureKey =
  | "extraction"
  | "categorization"
  | "recurring_categorization"
  | "insights"
  | "forecasting";

function dailyWindow(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
function weeklyWindow(date = new Date()): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return `W-${d.toISOString().slice(0, 10)}`;
}
function monthlyWindow(date = new Date()): string {
  return `M-${date.toISOString().slice(0, 7)}`;
}

export interface UsageCheckResult {
  allowed: boolean;
  reason?: string;
  dailyCount: number;
  weeklyCount: number;
  monthlyCount: number;
}

export async function checkAndRecordUsage(
  userId: string,
  feature: AIFeatureKey
): Promise<UsageCheckResult> {
  const [config, userControl] = await Promise.all([
    db.aIProviderConfig.findUnique({ where: { id: "singleton" } }),
    db.userAIControl.findUnique({ where: { userId } }),
  ]);

  // Hard disable for user
  if (userControl && !userControl.aiEnabled) {
    return { allowed: false, reason: "AI is disabled for your account.", dailyCount: 0, weeklyCount: 0, monthlyCount: 0 };
  }

  // Per-feature disable for user
  if (userControl) {
    const featureMap: Partial<Record<AIFeatureKey, boolean>> = {
      extraction: userControl.extractionEnabled,
      categorization: userControl.categorizationEnabled,
      recurring_categorization: userControl.recurringCategorizationEnabled,
      insights: userControl.insightsEnabled,
      forecasting: userControl.forecastingEnabled,
    };
    if (featureMap[feature] === false) {
      return { allowed: false, reason: `AI ${feature.replace(/_/g, " ")} is disabled for your account.`, dailyCount: 0, weeklyCount: 0, monthlyCount: 0 };
    }
  }

  const now = new Date();
  const dayKey = dailyWindow(now);
  const weekKey = weeklyWindow(now);
  const monthKey = monthlyWindow(now);

  const [dayCount, weekCount, monthCount] = await Promise.all([
    db.aIUsageLog.count({ where: { userId, feature, windowDate: dayKey } }),
    db.aIUsageLog.count({ where: { userId, feature, windowDate: weekKey } }),
    db.aIUsageLog.count({ where: { userId, feature, windowDate: monthKey } }),
  ]);

  // Resolve effective limits: global cap always applies; per-user limit further restricts if set
  const minLimit = (a: number | null | undefined, b: number | null | undefined): number | null => {
    if (a != null && b != null) return Math.min(a, b);
    return (a ?? b ?? null) as number | null;
  };
  const effectiveDailyLimit = minLimit(userControl?.dailyLimit, config?.dailyLimitPerUser);
  const effectiveWeeklyLimit = minLimit(userControl?.weeklyLimit, config?.weeklyLimitPerUser);
  const effectiveMonthlyLimit = minLimit(userControl?.monthlyLimit, config?.monthlyLimitPerUser);

  if (effectiveDailyLimit != null && dayCount >= effectiveDailyLimit) {
    return {
      allowed: false,
      reason: `Daily AI limit reached (${effectiveDailyLimit}/day). Resets tomorrow.`,
      dailyCount: dayCount, weeklyCount: weekCount, monthlyCount: monthCount,
    };
  }
  if (effectiveWeeklyLimit != null && weekCount >= effectiveWeeklyLimit) {
    return {
      allowed: false,
      reason: `Weekly AI limit reached (${effectiveWeeklyLimit}/week). Resets next week.`,
      dailyCount: dayCount, weeklyCount: weekCount, monthlyCount: monthCount,
    };
  }
  if (effectiveMonthlyLimit != null && monthCount >= effectiveMonthlyLimit) {
    return {
      allowed: false,
      reason: `Monthly AI limit reached (${effectiveMonthlyLimit}/month). Resets next month.`,
      dailyCount: dayCount, weeklyCount: weekCount, monthlyCount: monthCount,
    };
  }

  await db.aIUsageLog.createMany({
    data: [
      { userId, feature, windowDate: dayKey },
      { userId, feature, windowDate: weekKey },
      { userId, feature, windowDate: monthKey },
    ],
  });

  return {
    allowed: true,
    dailyCount: dayCount + 1,
    weeklyCount: weekCount + 1,
    monthlyCount: monthCount + 1,
  };
}

export async function isFeatureEnabled(feature: AIFeatureKey, userId?: string): Promise<boolean> {
  const config = await db.aIProviderConfig.findUnique({ where: { id: "singleton" } });
  if (!config || !config.isEnabled) return false;

  if (userId) {
    const userControl = await db.userAIControl.findUnique({ where: { userId } });
    if (userControl) {
      if (!userControl.aiEnabled) return false;
      const featureMap: Partial<Record<AIFeatureKey, boolean>> = {
        extraction: userControl.extractionEnabled,
        categorization: userControl.categorizationEnabled,
        recurring_categorization: userControl.recurringCategorizationEnabled,
        insights: userControl.insightsEnabled,
        forecasting: userControl.forecastingEnabled,
      };
      if (featureMap[feature] === false) return false;
    }
  }

  switch (feature) {
    case "extraction": return config.extractionEnabled;
    case "categorization": return config.categorizationEnabled;
    case "recurring_categorization": return config.recurringCategorizationEnabled;
    case "insights": return config.insightsEnabled;
    case "forecasting": return config.forecastingEnabled;
    default: return false;
  }
}
