/**
 * /api/cron/alerts
 * Callable by an external cron scheduler on self-hosted setups.
 * Sends overspending alerts, weekly summaries, payday reminders,
 * upcoming bill notifications, deficit risk alerts, savings goal risk alerts,
 * and receipt upload reminders.
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
} from "@/lib/email";
import { generateInsights } from "@/lib/ai/insights";
import { buildForecast } from "@/lib/forecast";

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** Get the effective notification email for a user (custom address or account email). */
function getNotifyEmail(
  userEmail: string,
  notifConfig: { notificationEmail: string | null } | null
): string {
  return notifConfig?.notificationEmail?.trim() || userEmail;
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { type?: string };
  const alertType = body.type ?? "all";

  const emailConfig = await db.emailConfig.findUnique({ where: { id: "singleton" } });
  const emailEnabled = emailConfig?.isEnabled ?? false;

  if (!emailEnabled) {
    return NextResponse.json({ message: "Email not configured — skipping alert delivery", emailEnabled: false });
  }

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
  };

  const today = new Date();

  for (const budget of budgets) {
    const allUsers = [
      budget.owner,
      ...budget.memberships.map((m) => m.user),
    ].filter((u): u is typeof budget.owner => !!u);

    // Parse additional notification email addresses (budget-level, no account required)
    const extraEmails: string[] = (() => {
      try { return JSON.parse(budget.additionalNotificationEmails) as string[]; }
      catch { return []; }
    })();

    // Load per-user notification configs for bill reminder lead time + notification email
    const userIds = allUsers.map((u) => u.id);
    const notifConfigs = await db.userNotificationConfig.findMany({
      where: { userId: { in: userIds } },
    });
    const notifConfigByUserId = new Map(notifConfigs.map((c) => [c.userId, c]));

    // Overspending alerts
    if (alertType === "all" || alertType === "overspending") {
      try {
        const analysis = await generateInsights(budget.id, budget.owner.id);
        const overspentCats = analysis.insights.filter((i) => i.type === "overspent");

        for (const user of allUsers) {
          const pref = await db.notificationPreference.findFirst({
            where: { userId: user.id, channel: "EMAIL", event: "overspending_alert", isEnabled: true },
          });
          if (!pref) continue;

          const toEmail = getNotifyEmail(user.email, notifConfigByUserId.get(user.id) ?? null);
          for (const cat of overspentCats) {
            const { subject, html } = overspendingAlertEmail({
              userName: user.name,
              budgetName: budget.name,
              categoryName: cat.categoryName,
              spent: cat.actual,
              target: cat.target ?? cat.actual,
              currency: budget.currency,
            });
            await sendMail({ to: toEmail, subject, html });
            sentCount.overspending++;
          }
        }

        // Extra recipients (no preference check — explicitly configured)
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
      } catch (err) {
        console.error(`[cron/alerts] overspending check failed for budget ${budget.id}:`, err);
      }
    }

    // Digest summary — frequency per user (DAILY / WEEKLY on Sunday / MONTHLY on 1st)
    if (alertType === "all" || alertType === "weekly") {
      try {
        const isSunday = today.getDay() === 0;
        const isFirstOfMonth = today.getDate() === 1;

        // Only generate analysis if at least one user qualifies
        let analysis: Awaited<ReturnType<typeof generateInsights>> | null = null;

        for (const user of allUsers) {
          const pref = await db.notificationPreference.findFirst({
            where: { userId: user.id, channel: "EMAIL", event: "weekly_summary", isEnabled: true },
          });
          if (!pref) continue;

          const notifConfig = notifConfigByUserId.get(user.id) ?? null;
          const freq = notifConfig?.digestFrequency ?? "WEEKLY";

          // Determine whether today qualifies for this user's frequency
          const shouldSend =
            alertType === "weekly" || // forced run always sends
            freq === "DAILY" ||
            (freq === "WEEKLY" && isSunday) ||
            (freq === "MONTHLY" && isFirstOfMonth);
          if (!shouldSend) continue;

          // Lazy-load analysis once
          if (!analysis) {
            analysis = await generateInsights(budget.id, budget.owner.id);
          }

          const topCats = analysis.insights
            .filter((i) => i.actual > 0)
            .sort((a, b) => b.actual - a.actual)
            .slice(0, 5)
            .map((i) => ({ name: i.categoryName, amount: i.actual }));

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
          sentCount.weekly++;
        }

        // Extra recipients — always send if analysis was run; no frequency gating
        if (analysis && extraEmails.length > 0) {
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

    // Upcoming bills — user-configurable lead days (default 3)
    if (alertType === "all" || alertType === "bills") {
      for (const user of allUsers) {
        const pref = await db.notificationPreference.findFirst({
          where: { userId: user.id, channel: "EMAIL", event: "upcoming_bill", isEnabled: true },
        });
        if (!pref) continue;

        const notifConfig = notifConfigByUserId.get(user.id) ?? null;
        const leadDays = notifConfig?.billReminderDays ?? 3;
        const targetDate = new Date(today.getTime() + leadDays * 86400000);
        const targetDateStr = targetDate.toISOString().slice(0, 10);

        for (const rec of budget.recurringExpenses) {
          if (!rec.nextDueDate) continue;
          const dueStr = new Date(rec.nextDueDate).toISOString().slice(0, 10);
          if (dueStr !== targetDateStr) continue;

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
          sentCount.bills++;
        }
      }

      // Extra recipients — use default lead of 3 days
      const extraTargetDate = new Date(today.getTime() + 3 * 86400000);
      const extraTargetDateStr = extraTargetDate.toISOString().slice(0, 10);
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

    // Payday reminders — 1 day ahead
    if (alertType === "all" || alertType === "payday") {
      const tomorrow = new Date(today.getTime() + 86400000);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);

      for (const source of budget.incomeSources) {
        if (!source.nextPayDate) continue;
        const payStr = new Date(source.nextPayDate).toISOString().slice(0, 10);
        if (payStr !== tomorrowStr) continue;

        for (const user of allUsers) {
          const pref = await db.notificationPreference.findFirst({
            where: { userId: user.id, channel: "EMAIL", event: "payday_reminder", isEnabled: true },
          });
          if (!pref) continue;

          const toEmail = getNotifyEmail(user.email, notifConfigByUserId.get(user.id) ?? null);
          const { subject, html } = paydayReminderEmail({
            userName: user.name,
            budgetName: budget.name,
            payAmount: source.amount,
            payDate: tomorrowStr,
            currency: budget.currency,
          });
          await sendMail({ to: toEmail, subject, html });
          sentCount.payday++;
        }

        // Extra recipients
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

    // Deficit risk alerts — check cash flow forecast for negative balance within 14 days
    if (alertType === "all" || alertType === "deficit_risk") {
      try {
        const forecast = await buildForecast(budget.id, budget.owner.id, 14);
        // Use isDangerZone which includes "approaching zero" threshold
        const dangerPoints = forecast.points.filter((p) => p.isDangerZone);

        if (dangerPoints.length > 0) {
          const worstBalance = Math.min(...dangerPoints.map((p) => p.balance));
          const firstDangerPoint = dangerPoints[0];
          const firstDangerDate = new Date(firstDangerPoint.date);
          const withinDays = Math.ceil((firstDangerDate.getTime() - today.getTime()) / 86400000);

          for (const user of allUsers) {
            const pref = await db.notificationPreference.findFirst({
              where: { userId: user.id, channel: "EMAIL", event: "deficit_risk", isEnabled: true },
            });
            if (!pref) continue;

            const toEmail = getNotifyEmail(user.email, notifConfigByUserId.get(user.id) ?? null);
            const { subject, html } = deficitRiskEmail({
              userName: user.name,
              budgetName: budget.name,
              projectedDeficit: worstBalance,
              withinDays: Math.max(1, withinDays),
              currency: budget.currency,
            });
            await sendMail({ to: toEmail, subject, html });
            sentCount.deficitRisk++;
          }

          // Extra recipients
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
      } catch (err) {
        console.error(`[cron/alerts] deficit risk check failed for budget ${budget.id}:`, err);
      }
    }

    // Savings goal risk alerts — goals where progress is behind pace
    if (alertType === "all" || alertType === "savings_goal_risk") {
      for (const goal of budget.savingsGoals) {
        if (!goal.targetAmount) continue;
        const progressPct = goal.targetAmount > 0
          ? (goal.currentAmount ?? 0) / goal.targetAmount
          : 0;
        // Alert if goal is less than 50% funded and active
        if (progressPct >= 0.5) continue;

        for (const user of allUsers) {
          const pref = await db.notificationPreference.findFirst({
            where: { userId: user.id, channel: "EMAIL", event: "savings_goal_risk", isEnabled: true },
          });
          if (!pref) continue;

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
          sentCount.savingsGoalRisk++;
        }

        // Extra recipients
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

    // Receipt upload reminder — if no receipt uploaded in 7+ days
    if (alertType === "all" || alertType === "receipt_reminder") {
      try {
        const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);
        const recentReceipt = await db.receipt.findFirst({
          where: {
            budgetId: budget.id,
            uploadedAt: { gte: sevenDaysAgo },
          },
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
            const pref = await db.notificationPreference.findFirst({
              where: { userId: user.id, channel: "EMAIL", event: "receipt_upload_reminder", isEnabled: true },
            });
            if (!pref) continue;

            const toEmail = getNotifyEmail(user.email, notifConfigByUserId.get(user.id) ?? null);
            const { subject, html } = receiptReminderEmail({
              userName: user.name,
              budgetName: budget.name,
              daysSinceLastUpload: daysSince,
            });
            await sendMail({ to: toEmail, subject, html });
            sentCount.receiptReminder++;
          }

          // Extra recipients
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
      } catch (err) {
        console.error(`[cron/alerts] receipt reminder check failed for budget ${budget.id}:`, err);
      }
    }
  }

  return NextResponse.json({ ok: true, sentCount, budgetsChecked: budgets.length });
}
