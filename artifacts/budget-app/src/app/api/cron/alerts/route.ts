/**
 * /api/cron/alerts
 * Callable by an external cron scheduler on self-hosted setups.
 * Writes IN_APP notifications for all events regardless of email configuration.
 * Also sends email alerts when SMTP is configured and the user has EMAIL prefs enabled.
 *
 * Secure with CRON_SECRET env var: Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  sendMail,
  overspendingAlertEmail,
  weeklySummaryEmail,
  upcomingBillEmail,
  paydayReminderEmail,
  deficitRiskEmail,
  savingsGoalRiskEmail,
  receiptReminderEmail,
  receiptsNeedReviewEmail,
  incomeThresholdEmail,
} from "@/lib/email";
import { generateInsights } from "@/lib/ai/insights";
import { buildForecast } from "@/lib/forecast";
import { computePayPeriod } from "@/lib/pay-period";

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

function getNotifyEmail(
  userEmail: string,
  notifConfig: { notificationEmail: string | null } | null
): string {
  return notifConfig?.notificationEmail?.trim() || userEmail;
}

/**
 * Select the primary income source by rule:
 *  1. Prefer the first MONTHLY source (most common pay-period anchor).
 *  2. Fall back to the highest-frequency source
 *     (WEEKLY > BIWEEKLY > SEMIMONTHLY > MONTHLY > CUSTOM).
 *  3. If all else fails, return null (no sources to anchor on).
 */
function selectPrimaryIncomeSource<
  T extends { frequency: string; isActive: boolean }
>(sources: T[]): T | null {
  const active = sources.filter((s) => s.isActive);
  if (active.length === 0) return null;
  // Prefer MONTHLY as the canonical pay-period anchor
  const monthly = active.find((s) => s.frequency === "MONTHLY");
  if (monthly) return monthly;
  // Fall back by highest frequency (shortest period first)
  const frequencyRank: Record<string, number> = {
    WEEKLY: 0,
    BIWEEKLY: 1,
    SEMIMONTHLY: 2,
    MONTHLY: 3,
    CUSTOM: 4,
  };
  return active.slice().sort(
    (a, b) =>
      (frequencyRank[a.frequency] ?? 99) - (frequencyRank[b.frequency] ?? 99)
  )[0] ?? null;
}

/** Write an in-app notification, respecting the user's IN_APP preference for the event. */
async function writeInApp(params: {
  userId: string;
  budgetId: string;
  event: string;
  title: string;
  body: string;
}) {
  const { userId, budgetId, event, title, body } = params;
  // Look up the user's explicit preference row for this channel+event.
  // If a row exists and isEnabled is false → user has opted out → skip.
  // If no row exists → default is ON (opt-out model: all in-app enabled by default).
  const pref = await db.notificationPreference.findFirst({
    where: { userId, channel: "IN_APP", event },
  });
  if (pref !== null && !pref.isEnabled) return;
  await db.inAppNotification.create({
    data: { userId, budgetId, event, title, body },
  });
}

/** Check whether a user has EMAIL pref enabled for an event. */
async function hasEmailPref(userId: string, event: string): Promise<boolean> {
  const pref = await db.notificationPreference.findFirst({
    where: { userId, channel: "EMAIL", event, isEnabled: true },
  });
  return !!pref;
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { type?: string };
  const alertType = body.type ?? "all";

  const emailConfig = await db.emailConfig.findUnique({ where: { id: "singleton" } });
  const emailEnabled = emailConfig?.isEnabled ?? false;

  const budgets = await db.budget.findMany({
    include: {
      owner: { select: { id: true, email: true, name: true } },
      memberships: {
        include: { user: { select: { id: true, email: true, name: true } } },
      },
      incomeSources: { where: { isActive: true } },
      recurringExpenses: { where: { isActive: true } },
      savingsGoals: { where: { isActive: true } },
    },
  });

  const sentCount = {
    overspending: 0,
    weekly: 0,
    bills: 0,
    payday: 0,
    deficitRisk: 0,
    savingsGoalRisk: 0,
    receiptReminder: 0,
    receiptsNeedReview: 0,
    incomeThreshold: 0,
  };

  const today = new Date();

  for (const budget of budgets) {
    const allUsers = [
      budget.owner,
      ...budget.memberships.map((m) => m.user),
    ].filter((u): u is typeof budget.owner => !!u);

    const extraEmails: string[] = (() => {
      try {
        const parsed: unknown = JSON.parse(budget.additionalNotificationEmails);
        return Array.isArray(parsed) ? (parsed as string[]) : [];
      } catch { return []; }
    })();

    const userIds = allUsers.map((u) => u.id);
    const notifConfigs = await db.userNotificationConfig.findMany({
      where: { userId: { in: userIds } },
    });
    const notifConfigByUserId = new Map(notifConfigs.map((c) => [c.userId, c]));

    // ── Overspending alerts ──────────────────────────────────────────────────
    if (alertType === "all" || alertType === "overspending") {
      try {
        const analysis = await generateInsights(budget.id, budget.owner.id);
        const overspentCats = analysis.insights.filter((i) => i.type === "overspent");

        for (const user of allUsers) {
          for (const cat of overspentCats) {
            await writeInApp({
              userId: user.id,
              budgetId: budget.id,
              event: "overspending_alert",
              title: `Over budget: ${cat.categoryName}`,
              body: `You've spent ${new Intl.NumberFormat("en-US", { style: "currency", currency: budget.currency }).format(cat.actual)} in ${cat.categoryName} (target: ${new Intl.NumberFormat("en-US", { style: "currency", currency: budget.currency }).format(cat.target ?? cat.actual)}) in ${budget.name}.`,
            });
            sentCount.overspending++;

            if (emailEnabled && await hasEmailPref(user.id, "overspending_alert")) {
              const toEmail = getNotifyEmail(user.email, notifConfigByUserId.get(user.id) ?? null);
              const { subject, html } = overspendingAlertEmail({
                userName: user.name,
                budgetName: budget.name,
                categoryName: cat.categoryName,
                spent: cat.actual,
                target: cat.target ?? cat.actual,
                currency: budget.currency,
              });
              await sendMail({ to: toEmail, subject, html });
            }
          }
        }

        if (emailEnabled) {
          for (const extraEmail of extraEmails) {
            for (const cat of overspentCats) {
              const { subject, html } = overspendingAlertEmail({
                userName: budget.name,
                budgetName: budget.name,
                categoryName: cat.categoryName,
                spent: cat.actual,
                target: cat.target ?? cat.actual,
                currency: budget.currency,
              });
              await sendMail({ to: extraEmail, subject, html });
              sentCount.overspending++;
            }
          }
        }
      } catch (err) {
        console.error(`[cron/alerts] overspending check failed for budget ${budget.id}:`, err);
      }
    }

    // ── Digest summary ───────────────────────────────────────────────────────
    if (alertType === "all" || alertType === "weekly") {
      try {
        const isSunday = today.getDay() === 0;
        const isFirstOfMonth = today.getDate() === 1;

        let analysis: Awaited<ReturnType<typeof generateInsights>> | null = null;

        for (const user of allUsers) {
          const notifConfig = notifConfigByUserId.get(user.id) ?? null;
          const freq = notifConfig?.digestFrequency ?? "WEEKLY";

          const shouldSend =
            alertType === "weekly" ||
            freq === "DAILY" ||
            (freq === "WEEKLY" && isSunday) ||
            (freq === "MONTHLY" && isFirstOfMonth);
          if (!shouldSend) continue;

          if (!analysis) {
            analysis = await generateInsights(budget.id, budget.owner.id);
          }

          const topCats = analysis.insights
            .filter((i) => i.actual > 0)
            .sort((a, b) => b.actual - a.actual)
            .slice(0, 5)
            .map((i) => ({ name: i.categoryName, amount: i.actual }));

          const topLine = topCats.map((c) => `${c.name}: ${new Intl.NumberFormat("en-US", { style: "currency", currency: budget.currency }).format(c.amount)}`).join(" · ");

          await writeInApp({
            userId: user.id,
            budgetId: budget.id,
            event: "weekly_summary",
            title: `Summary: ${budget.name}`,
            body: `Total spent: ${new Intl.NumberFormat("en-US", { style: "currency", currency: budget.currency }).format(analysis.totalSpent)}${topLine ? ` — ${topLine}` : ""}`,
          });
          sentCount.weekly++;

          if (emailEnabled && await hasEmailPref(user.id, "weekly_summary")) {
            const toEmail = getNotifyEmail(user.email, notifConfig);
            const { subject, html } = weeklySummaryEmail({
              userName: user.name,
              budgetName: budget.name,
              totalSpent: analysis.totalSpent,
              totalIncome: analysis.totalBudget ?? 0,
              currency: budget.currency,
              topCategories: topCats,
              status: analysis.status,
            });
            await sendMail({ to: toEmail, subject, html });
          }
        }

        if (emailEnabled && extraEmails.length > 0) {
          if (!analysis) {
            analysis = await generateInsights(budget.id, budget.owner.id);
          }
          const topCats = analysis.insights
            .filter((i) => i.actual > 0)
            .sort((a, b) => b.actual - a.actual)
            .slice(0, 5)
            .map((i) => ({ name: i.categoryName, amount: i.actual }));
          for (const extraEmail of extraEmails) {
            const { subject, html } = weeklySummaryEmail({
              userName: budget.name,
              budgetName: budget.name,
              totalSpent: analysis.totalSpent,
              totalIncome: analysis.totalBudget ?? 0,
              currency: budget.currency,
              topCategories: topCats,
              status: analysis.status,
            });
            await sendMail({ to: extraEmail, subject, html });
            sentCount.weekly++;
          }
        }
      } catch (err) {
        console.error(`[cron/alerts] digest summary failed for budget ${budget.id}:`, err);
      }
    }

    // ── Upcoming bills ───────────────────────────────────────────────────────
    if (alertType === "all" || alertType === "bills") {
      for (const user of allUsers) {
        const notifConfig = notifConfigByUserId.get(user.id) ?? null;
        const leadDays = notifConfig?.billReminderDays ?? 3;
        const targetDate = new Date(today.getTime() + leadDays * 86400000);
        const targetDateStr = targetDate.toISOString().slice(0, 10);

        for (const rec of budget.recurringExpenses) {
          if (!rec.nextDueDate) continue;
          const dueStr = new Date(rec.nextDueDate).toISOString().slice(0, 10);
          if (dueStr !== targetDateStr) continue;

          const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: budget.currency });
          await writeInApp({
            userId: user.id,
            budgetId: budget.id,
            event: "upcoming_bill",
            title: `Bill due in ${leadDays}d: ${rec.name}`,
            body: `${rec.name} (${fmt.format(rec.amount)}) is due on ${dueStr} in ${budget.name}.`,
          });
          sentCount.bills++;

          if (emailEnabled && await hasEmailPref(user.id, "upcoming_bill")) {
            const toEmail = getNotifyEmail(user.email, notifConfig);
            const { subject, html } = upcomingBillEmail({
              userName: user.name,
              budgetName: budget.name,
              billName: rec.name,
              amount: rec.amount,
              dueDate: dueStr,
              currency: budget.currency,
            });
            await sendMail({ to: toEmail, subject, html });
          }
        }
      }

      if (emailEnabled) {
        const extraTargetDateStr = new Date(today.getTime() + 3 * 86400000).toISOString().slice(0, 10);
        for (const rec of budget.recurringExpenses) {
          if (!rec.nextDueDate) continue;
          const dueStr = new Date(rec.nextDueDate).toISOString().slice(0, 10);
          if (dueStr !== extraTargetDateStr) continue;
          for (const extraEmail of extraEmails) {
            const { subject, html } = upcomingBillEmail({
              userName: budget.name,
              budgetName: budget.name,
              billName: rec.name,
              amount: rec.amount,
              dueDate: dueStr,
              currency: budget.currency,
            });
            await sendMail({ to: extraEmail, subject, html });
            sentCount.bills++;
          }
        }
      }
    }

    // ── Payday reminders ─────────────────────────────────────────────────────
    if (alertType === "all" || alertType === "payday") {
      const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);

      for (const source of budget.incomeSources) {
        if (!source.nextPayDate) continue;
        const payStr = new Date(source.nextPayDate).toISOString().slice(0, 10);
        if (payStr !== tomorrowStr) continue;

        const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: budget.currency });
        for (const user of allUsers) {
          await writeInApp({
            userId: user.id,
            budgetId: budget.id,
            event: "payday_reminder",
            title: `Payday tomorrow — ${budget.name}`,
            body: `${fmt.format(source.amount)} from ${source.name ?? "income"} is expected tomorrow (${tomorrowStr}).`,
          });
          sentCount.payday++;

          if (emailEnabled && await hasEmailPref(user.id, "payday_reminder")) {
            const toEmail = getNotifyEmail(user.email, notifConfigByUserId.get(user.id) ?? null);
            const { subject, html } = paydayReminderEmail({
              userName: user.name,
              budgetName: budget.name,
              payAmount: source.amount,
              payDate: tomorrowStr,
              currency: budget.currency,
            });
            await sendMail({ to: toEmail, subject, html });
          }
        }

        if (emailEnabled) {
          for (const extraEmail of extraEmails) {
            const { subject, html } = paydayReminderEmail({
              userName: budget.name,
              budgetName: budget.name,
              payAmount: source.amount,
              payDate: tomorrowStr,
              currency: budget.currency,
            });
            await sendMail({ to: extraEmail, subject, html });
            sentCount.payday++;
          }
        }
      }
    }

    // ── Deficit risk ─────────────────────────────────────────────────────────
    if (alertType === "all" || alertType === "deficit_risk") {
      try {
        const forecast = await buildForecast(budget.id, budget.owner.id, 14);
        const dangerPoints = forecast.points.filter((p) => p.isDangerZone);

        if (dangerPoints.length > 0) {
          const worstBalance = Math.min(...dangerPoints.map((p) => p.balance));
          const firstDangerPoint = dangerPoints[0];
          const withinDays = Math.ceil(
            (new Date(firstDangerPoint.date).getTime() - today.getTime()) / 86400000
          );
          const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: budget.currency });

          for (const user of allUsers) {
            await writeInApp({
              userId: user.id,
              budgetId: budget.id,
              event: "deficit_risk",
              title: `Cash flow risk — ${budget.name}`,
              body: `Projected deficit of ${fmt.format(Math.abs(worstBalance))} within ${Math.max(1, withinDays)} day${withinDays !== 1 ? "s" : ""}.`,
            });
            sentCount.deficitRisk++;

            if (emailEnabled && await hasEmailPref(user.id, "deficit_risk")) {
              const toEmail = getNotifyEmail(user.email, notifConfigByUserId.get(user.id) ?? null);
              const { subject, html } = deficitRiskEmail({
                userName: user.name,
                budgetName: budget.name,
                projectedDeficit: worstBalance,
                withinDays: Math.max(1, withinDays),
                currency: budget.currency,
              });
              await sendMail({ to: toEmail, subject, html });
            }
          }

          if (emailEnabled) {
            for (const extraEmail of extraEmails) {
              const { subject, html } = deficitRiskEmail({
                userName: budget.name,
                budgetName: budget.name,
                projectedDeficit: worstBalance,
                withinDays: Math.max(1, withinDays),
                currency: budget.currency,
              });
              await sendMail({ to: extraEmail, subject, html });
              sentCount.deficitRisk++;
            }
          }
        }
      } catch (err) {
        console.error(`[cron/alerts] deficit risk check failed for budget ${budget.id}:`, err);
      }
    }

    // ── Savings goal risk ────────────────────────────────────────────────────
    if (alertType === "all" || alertType === "savings_goal_risk") {
      for (const goal of budget.savingsGoals) {
        if (!goal.targetAmount) continue;
        const progressPct = goal.targetAmount > 0
          ? (goal.currentAmount ?? 0) / goal.targetAmount
          : 0;
        if (progressPct >= 0.5) continue;

        const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: budget.currency });
        for (const user of allUsers) {
          await writeInApp({
            userId: user.id,
            budgetId: budget.id,
            event: "savings_goal_risk",
            title: `Savings goal at risk: ${goal.name}`,
            body: `${goal.name} is ${Math.round(progressPct * 100)}% funded (${fmt.format(goal.currentAmount ?? 0)} of ${fmt.format(goal.targetAmount)}).`,
          });
          sentCount.savingsGoalRisk++;

          if (emailEnabled && await hasEmailPref(user.id, "savings_goal_risk")) {
            const toEmail = getNotifyEmail(user.email, notifConfigByUserId.get(user.id) ?? null);
            const { subject, html } = savingsGoalRiskEmail({
              userName: user.name,
              budgetName: budget.name,
              goalName: goal.name,
              targetAmount: goal.targetAmount,
              currentAmount: goal.currentAmount ?? 0,
              currency: budget.currency,
            });
            await sendMail({ to: toEmail, subject, html });
          }
        }

        if (emailEnabled) {
          for (const extraEmail of extraEmails) {
            const { subject, html } = savingsGoalRiskEmail({
              userName: budget.name,
              budgetName: budget.name,
              goalName: goal.name,
              targetAmount: goal.targetAmount,
              currentAmount: goal.currentAmount ?? 0,
              currency: budget.currency,
            });
            await sendMail({ to: extraEmail, subject, html });
            sentCount.savingsGoalRisk++;
          }
        }
      }
    }

    // ── Receipt upload reminder ──────────────────────────────────────────────
    if (alertType === "all" || alertType === "receipt_reminder") {
      try {
        const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);
        const recentReceipt = await db.receipt.findFirst({
          where: { budgetId: budget.id, uploadedAt: { gte: sevenDaysAgo } },
          orderBy: { uploadedAt: "desc" },
        });

        if (!recentReceipt) {
          const lastReceipt = await db.receipt.findFirst({
            where: { budgetId: budget.id },
            orderBy: { uploadedAt: "desc" },
          });
          const daysSince = lastReceipt
            ? Math.floor((today.getTime() - new Date(lastReceipt.uploadedAt).getTime()) / 86400000)
            : 7;

          for (const user of allUsers) {
            await writeInApp({
              userId: user.id,
              budgetId: budget.id,
              event: "receipt_upload_reminder",
              title: `No receipts uploaded — ${budget.name}`,
              body: `It's been ${daysSince} day${daysSince !== 1 ? "s" : ""} since a receipt was uploaded to ${budget.name}.`,
            });
            sentCount.receiptReminder++;

            if (emailEnabled && await hasEmailPref(user.id, "receipt_upload_reminder")) {
              const toEmail = getNotifyEmail(user.email, notifConfigByUserId.get(user.id) ?? null);
              const { subject, html } = receiptReminderEmail({
                userName: user.name,
                budgetName: budget.name,
                daysSinceLastUpload: daysSince,
              });
              await sendMail({ to: toEmail, subject, html });
            }
          }

          if (emailEnabled) {
            for (const extraEmail of extraEmails) {
              const { subject, html } = receiptReminderEmail({
                userName: budget.name,
                budgetName: budget.name,
                daysSinceLastUpload: daysSince,
              });
              await sendMail({ to: extraEmail, subject, html });
              sentCount.receiptReminder++;
            }
          }
        }
      } catch (err) {
        console.error(`[cron/alerts] receipt reminder check failed for budget ${budget.id}:`, err);
      }
    }

    // ── Receipts need review ─────────────────────────────────────────────────
    if (alertType === "all" || alertType === "receipts_need_review") {
      try {
        const oneDayAgo = new Date(today.getTime() - 24 * 3600000);
        const pendingReceipts = await db.receipt.findMany({
          where: {
            budgetId: budget.id,
            status: { in: ["PENDING", "NEEDS_REVIEW"] },
            uploadedAt: { lte: oneDayAgo },
          },
          select: { id: true },
        });

        if (pendingReceipts.length > 0) {
          const count = pendingReceipts.length;
          for (const user of allUsers) {
            await writeInApp({
              userId: user.id,
              budgetId: budget.id,
              event: "receipts_need_review",
              title: `${count} receipt${count !== 1 ? "s" : ""} need${count === 1 ? "s" : ""} review`,
              body: `${count} receipt${count !== 1 ? "s" : ""} in ${budget.name} ha${count === 1 ? "s" : "ve"} been waiting for review for over 24 hours.`,
            });
            sentCount.receiptsNeedReview++;

            if (emailEnabled && await hasEmailPref(user.id, "receipts_need_review")) {
              const toEmail = getNotifyEmail(user.email, notifConfigByUserId.get(user.id) ?? null);
              const { subject, html } = receiptsNeedReviewEmail({
                userName: user.name,
                budgetName: budget.name,
                count,
              });
              await sendMail({ to: toEmail, subject, html });
            }
          }

          if (emailEnabled) {
            for (const extraEmail of extraEmails) {
              const { subject, html } = receiptsNeedReviewEmail({
                userName: budget.name,
                budgetName: budget.name,
                count,
              });
              await sendMail({ to: extraEmail, subject, html });
              sentCount.receiptsNeedReview++;
            }
          }
        }
      } catch (err) {
        console.error(`[cron/alerts] receipts_need_review check failed for budget ${budget.id}:`, err);
      }
    }

    // ── Income threshold (>80% of pay-period income spent) ───────────────────
    // Primary source is selected by rule (MONTHLY-first, then highest-frequency),
    // to derive one pay window per budget. Total income = sum of all active sources.
    if (alertType === "all" || alertType === "income_threshold") {
      try {
        const primarySource = selectPrimaryIncomeSource(budget.incomeSources);
        if (primarySource) {
          const totalIncome = budget.incomeSources
            .filter((s) => s.isActive)
            .reduce((s, src) => s + src.amount, 0);
          const period = computePayPeriod(
            primarySource.frequency,
            primarySource.nextPayDate,
            totalIncome,
            primarySource.customDays
          );

          const periodExpenses = await db.expense.aggregate({
            where: {
              budgetId: budget.id,
              date: { gte: period.start, lt: period.end },
            },
            _sum: { amount: true },
          });
          const spent = periodExpenses._sum.amount ?? 0;
          const income = period.periodIncome;
          if (income > 0) {
            const pct = (spent / income) * 100;
            if (pct >= 80) {
              const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: budget.currency });
              for (const user of allUsers) {
                await writeInApp({
                  userId: user.id,
                  budgetId: budget.id,
                  event: "income_threshold",
                  title: `${Math.round(pct)}% of period income spent`,
                  body: `You've spent ${fmt.format(spent)} of ${fmt.format(income)} (${Math.round(pct)}%) this pay period in ${budget.name}.`,
                });
                sentCount.incomeThreshold++;

                if (emailEnabled && await hasEmailPref(user.id, "income_threshold")) {
                  const toEmail = getNotifyEmail(user.email, notifConfigByUserId.get(user.id) ?? null);
                  const { subject, html } = incomeThresholdEmail({
                    userName: user.name,
                    budgetName: budget.name,
                    spent,
                    income,
                    pct,
                    currency: budget.currency,
                  });
                  await sendMail({ to: toEmail, subject, html });
                }
              }

              if (emailEnabled) {
                for (const extraEmail of extraEmails) {
                  const { subject, html } = incomeThresholdEmail({
                    userName: budget.name,
                    budgetName: budget.name,
                    spent,
                    income,
                    pct,
                    currency: budget.currency,
                  });
                  await sendMail({ to: extraEmail, subject, html });
                  sentCount.incomeThreshold++;
                }
              }
            }
          }
        }
      } catch (err) {
        console.error(`[cron/alerts] income threshold check failed for budget ${budget.id}:`, err);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    emailEnabled,
    sentCount,
    budgetsChecked: budgets.length,
  });
}
