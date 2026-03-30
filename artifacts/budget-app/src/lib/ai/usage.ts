/**
 * AI usage tracking and rate-limit enforcement.
 * Server-only. NEVER import from client components.
 */

import { db } from "@/lib/db";

export type AIFeatureKey =
  | "extraction"
  | "categorization"
  | "recurring_categorization"
  | "insights"
  | "forecasting";

function dailyWindow(date = new Date()): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function weeklyWindow(date = new Date()): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return `W-${d.toISOString().slice(0, 10)}`;
}

function monthlyWindow(date = new Date()): string {
  return `M-${date.toISOString().slice(0, 7)}`; // YYYY-MM
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
  const config = await db.aIProviderConfig.findUnique({ where: { id: "singleton" } });

  const now = new Date();
  const dayKey = dailyWindow(now);
  const weekKey = weeklyWindow(now);
  const monthKey = monthlyWindow(now);

  const [dayCount, weekCount, monthCount] = await Promise.all([
    db.aIUsageLog.count({ where: { userId, feature, windowDate: dayKey } }),
    db.aIUsageLog.count({ where: { userId, feature, windowDate: weekKey } }),
    db.aIUsageLog.count({ where: { userId, feature, windowDate: monthKey } }),
  ]);

  if (config) {
    if (config.dailyLimitPerUser != null && dayCount >= config.dailyLimitPerUser) {
      return {
        allowed: false,
        reason: `Daily AI limit reached (${config.dailyLimitPerUser}/day). Resets tomorrow.`,
        dailyCount: dayCount,
        weeklyCount: weekCount,
        monthlyCount: monthCount,
      };
    }
    if (config.weeklyLimitPerUser != null && weekCount >= config.weeklyLimitPerUser) {
      return {
        allowed: false,
        reason: `Weekly AI limit reached (${config.weeklyLimitPerUser}/week). Resets next week.`,
        dailyCount: dayCount,
        weeklyCount: weekCount,
        monthlyCount: monthCount,
      };
    }
    if (config.monthlyLimitPerUser != null && monthCount >= config.monthlyLimitPerUser) {
      return {
        allowed: false,
        reason: `Monthly AI limit reached (${config.monthlyLimitPerUser}/month). Resets next month.`,
        dailyCount: dayCount,
        weeklyCount: weekCount,
        monthlyCount: monthCount,
      };
    }
  }

  // Record usage in all windows
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

export async function isFeatureEnabled(feature: AIFeatureKey): Promise<boolean> {
  const config = await db.aIProviderConfig.findUnique({ where: { id: "singleton" } });
  if (!config || !config.isEnabled) return false;

  switch (feature) {
    case "extraction": return config.extractionEnabled;
    case "categorization": return config.categorizationEnabled;
    case "recurring_categorization": return config.recurringCategorizationEnabled;
    case "insights": return config.insightsEnabled;
    case "forecasting": return config.forecastingEnabled;
    default: return false;
  }
}
