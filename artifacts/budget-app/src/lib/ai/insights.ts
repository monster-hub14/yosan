/**
 * AI Analysis / Insights Service
 * Server-only. Collects period data and generates spending insights via AI.
 */

import { db } from "@/lib/db";
import { getAIConfig, chatCompletion } from "@/lib/ai/client";
import { getActivePeriodBounds } from "@/lib/active-period";
import { getPeriodsPerMonth } from "@/lib/pay-period";

export interface SpendingInsight {
  type: "overspent" | "on_track" | "under_budget" | "tip" | "alert";
  categoryName: string;
  actual: number;
  target: number | null;
  percentUsed: number | null;
  message: string;
}

export interface AnalysisResult {
  status: "on-track" | "at-risk" | "off-track";
  statusReason: string;
  spendingPacePercent: number;
  totalSpent: number;
  totalBudget: number | null;
  safeToSpendPerDay: number | null;
  insights: SpendingInsight[];
  recommendations: string[];
  narrative: string;
  generatedByAI: boolean;
}

export async function generateInsights(budgetId: string, userId: string): Promise<AnalysisResult> {
  const { start: periodStart, end: periodEnd } = await getActivePeriodBounds(budgetId);
  const now = new Date();

  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    include: {
      incomeSources: { where: { isActive: true } },
      savingsGoals: { where: { isActive: true } },
      recurringExpenses: { where: { isActive: true } },
      expenses: {
        where: { date: { gte: periodStart, lte: periodEnd } },
        include: { category: true },
      },
      categories: {
        include: { targets: { where: { budgetId } }, children: true },
      },
    },
  });

  if (!budget) throw new Error("Budget not found");

  const primarySource = budget.incomeSources[0] ?? null;
  const periodIncome = budget.incomeSources.reduce((s, i) => s + i.amount, 0);
  const totalSpent = budget.expenses.reduce((s, e) => s + e.amount, 0);

  const daysInPeriod = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000));
  const daysElapsed = Math.max(1, Math.round((Math.min(now.getTime(), periodEnd.getTime()) - periodStart.getTime()) / 86400000));
  const spendingPacePercent = Math.round((daysElapsed / daysInPeriod) * 100);
  const spentPacePercent = periodIncome > 0 ? Math.round((totalSpent / periodIncome) * 100) : 0;

  // Savings reserve
  let savingsReserve = 0;
  if (primarySource) {
    const ppm = getPeriodsPerMonth(primarySource.frequency, primarySource.customDays ?? undefined);
    for (const goal of budget.savingsGoals) {
      if (goal.perPaycheckAmount != null) savingsReserve += goal.perPaycheckAmount;
      else if (goal.isMonthlyGoal) savingsReserve += goal.targetAmount / ppm;
    }
  }

  // Category spending
  const spendingByCategory = new Map<string, number>();
  for (const expense of budget.expenses) {
    if (expense.categoryId) {
      spendingByCategory.set(expense.categoryId, (spendingByCategory.get(expense.categoryId) ?? 0) + expense.amount);
    }
  }

  // Roll up children into parents
  const catMap = new Map(budget.categories.map((c) => [c.id, c]));
  const parentTotals = new Map<string, number>();
  for (const [catId, amount] of spendingByCategory) {
    const cat = catMap.get(catId);
    if (cat?.parentId) {
      parentTotals.set(cat.parentId, (parentTotals.get(cat.parentId) ?? 0) + amount);
    }
    parentTotals.set(catId, (parentTotals.get(catId) ?? 0) + amount);
  }

  // Build insights
  const insights: SpendingInsight[] = [];
  const topCategories = budget.categories
    .filter((c) => !c.parentId)
    .map((c) => {
      const actual = parentTotals.get(c.id) ?? 0;
      const target = c.targets[0]?.amount ?? null;
      const percentUsed = target ? Math.round((actual / target) * 100) : null;
      return { cat: c, actual, target, percentUsed };
    })
    .filter((x) => x.actual > 0)
    .sort((a, b) => b.actual - a.actual);

  for (const { cat, actual, target, percentUsed } of topCategories.slice(0, 8)) {
    if (target && percentUsed !== null && percentUsed >= 100) {
      insights.push({
        type: "overspent",
        categoryName: cat.name,
        actual,
        target,
        percentUsed,
        message: `Over budget: spent $${actual.toFixed(2)} of $${target.toFixed(2)} (${percentUsed}%)`,
      });
    } else if (target && percentUsed !== null && percentUsed >= 80) {
      insights.push({
        type: "alert",
        categoryName: cat.name,
        actual,
        target,
        percentUsed,
        message: `Approaching limit: $${actual.toFixed(2)} of $${target.toFixed(2)} used (${percentUsed}%)`,
      });
    } else {
      insights.push({
        type: actual > 0 ? "on_track" : "under_budget",
        categoryName: cat.name,
        actual,
        target,
        percentUsed,
        message: target
          ? `On track: $${actual.toFixed(2)} of $${target.toFixed(2)} (${percentUsed}%)`
          : `Spent $${actual.toFixed(2)} this period`,
      });
    }
  }

  // Determine overall status
  const spendingRatio = periodIncome > 0 ? (totalSpent + savingsReserve) / periodIncome : 0;
  const paceRatio = spendingPacePercent / 100;
  const overspentCount = insights.filter((i) => i.type === "overspent").length;

  let status: "on-track" | "at-risk" | "off-track";
  let statusReason: string;
  if (overspentCount > 0 || spendingRatio > 0.95) {
    status = "off-track";
    statusReason = overspentCount > 0
      ? `${overspentCount} categor${overspentCount === 1 ? "y" : "ies"} over budget`
      : "Spending exceeds income for this period";
  } else if (spendingRatio > paceRatio + 0.15) {
    status = "at-risk";
    statusReason = "Spending pace is ahead of schedule";
  } else {
    status = "on-track";
    statusReason = "Spending is within expected range";
  }

  const safeToSpendPerDay = periodIncome > 0
    ? Math.max(0, (periodIncome - savingsReserve - totalSpent) / Math.max(1, daysInPeriod - daysElapsed))
    : null;

  // Try AI for narrative + recommendations
  let narrative = buildFallbackNarrative(status, totalSpent, periodIncome, spentPacePercent, spendingPacePercent, insights);
  let recommendations = buildFallbackRecommendations(status, insights, safeToSpendPerDay);
  let generatedByAI = false;

  try {
    const config = await getAIConfig();
    const aiConfig = await db.aIProviderConfig.findUnique({ where: { id: "singleton" } });
    if (config && aiConfig?.insightsEnabled) {
      const categoryLines = topCategories
        .slice(0, 6)
        .map(({ cat, actual, target, percentUsed }) => {
          const targetStr = target ? ` (target: $${target.toFixed(0)}, ${percentUsed}% used)` : "";
          return `- ${cat.name}: $${actual.toFixed(2)}${targetStr}`;
        })
        .join("\n");

      const prompt = `You are a personal finance advisor analyzing a household budget. Be direct, practical, and specific.

Budget period: ${periodStart.toDateString()} – ${periodEnd.toDateString()}
Income this period: $${periodIncome.toFixed(2)}
Total spent: $${totalSpent.toFixed(2)} (${spentPacePercent}% of income)
Period elapsed: ${spendingPacePercent}% of days used
Savings reserve per period: $${savingsReserve.toFixed(2)}
Overall status: ${status}

Spending by category:
${categoryLines || "No categorized expenses yet"}

Provide JSON with:
{
  "narrative": "2-3 sentences summarizing spending patterns and overall health",
  "recommendations": ["actionable recommendation 1", "actionable recommendation 2", "actionable recommendation 3"]
}`;

      const response = await chatCompletion(config, [
        { role: "system", content: "You are a personal finance advisor. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ], { maxTokens: 512, jsonMode: true });

      const parsed = JSON.parse(response.content) as { narrative?: string; recommendations?: string[] };
      if (parsed.narrative) narrative = parsed.narrative;
      if (parsed.recommendations?.length) recommendations = parsed.recommendations.slice(0, 5);
      generatedByAI = true;
      // Usage is recorded by the calling route via recordUsage() after this function returns.
    }
  } catch (err) {
    console.warn("[insights] AI generation failed, using fallback:", err);
  }

  return {
    status,
    statusReason,
    spendingPacePercent,
    totalSpent,
    totalBudget: periodIncome > 0 ? periodIncome : null,
    safeToSpendPerDay,
    insights,
    recommendations,
    narrative,
    generatedByAI,
  };
}

function buildFallbackNarrative(
  status: string,
  totalSpent: number,
  periodIncome: number,
  spentPct: number,
  pacePct: number,
  insights: SpendingInsight[]
): string {
  const overspent = insights.filter((i) => i.type === "overspent");
  if (status === "off-track") {
    if (overspent.length > 0) {
      return `You are over budget in ${overspent.map((i) => i.categoryName).join(" and ")}. You've spent $${totalSpent.toFixed(2)} (${spentPct}% of your period income) while ${pacePct}% of the pay period has elapsed. Review these categories and consider adjusting your spending.`;
    }
    return `You've spent $${totalSpent.toFixed(2)} this period, which is ${spentPct}% of your income — the period is only ${pacePct}% complete. Reduce discretionary spending to stay on track.`;
  }
  if (status === "at-risk") {
    return `Your spending is slightly ahead of pace. At $${totalSpent.toFixed(2)} (${spentPct}% of income) with ${pacePct}% of the period elapsed, you may want to ease up on discretionary purchases.`;
  }
  return `You're on track this period. Spending $${totalSpent.toFixed(2)} (${spentPct}% of income) with ${pacePct}% of the period elapsed is a healthy pace. Keep it up!`;
}

function buildFallbackRecommendations(
  status: string,
  insights: SpendingInsight[],
  safeToSpendPerDay: number | null
): string[] {
  const recs: string[] = [];
  const overspent = insights.filter((i) => i.type === "overspent");
  const approaching = insights.filter((i) => i.type === "alert");

  for (const cat of overspent.slice(0, 2)) {
    recs.push(`Review ${cat.categoryName} spending — you're ${Math.round((cat.percentUsed ?? 100) - 100)}% over your target.`);
  }
  for (const cat of approaching.slice(0, 1)) {
    recs.push(`Monitor ${cat.categoryName} — you've used ${cat.percentUsed}% of your budget with the period still ongoing.`);
  }
  if (status === "on-track" && safeToSpendPerDay !== null) {
    recs.push(`You have approximately $${safeToSpendPerDay.toFixed(2)} per day available for the rest of this period.`);
  }
  if (recs.length === 0) {
    recs.push("Set category spending targets to track your progress more accurately.");
    recs.push("Review recurring bills to ensure they match your expected amounts.");
  }
  return recs;
}

function getWeekStart(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().slice(0, 10);
}

export async function persistInsight(budgetId: string, result: AnalysisResult): Promise<string> {
  const insight = await db.insight.create({
    data: {
      budgetId,
      type: "BUDGET_ALERT",
      title: `Spending Analysis — ${result.status === "on-track" ? "On Track" : result.status === "at-risk" ? "At Risk" : "Off Track"}`,
      body: result.narrative,
      severity: result.status === "off-track" ? "high" : result.status === "at-risk" ? "medium" : "info",
      metadata: JSON.stringify({
        status: result.status,
        statusReason: result.statusReason,
        spendingPacePercent: result.spendingPacePercent,
        totalSpent: result.totalSpent,
        totalBudget: result.totalBudget,
        safeToSpendPerDay: result.safeToSpendPerDay,
        insights: result.insights,
        recommendations: result.recommendations,
        generatedByAI: result.generatedByAI,
      }),
    },
  });
  return insight.id;
}
