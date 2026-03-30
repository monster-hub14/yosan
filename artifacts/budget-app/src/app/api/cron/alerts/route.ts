/**
 * /api/cron/alerts
 * Callable by an external cron scheduler on self-hosted setups.
 * Sends overspending alerts, weekly summaries, payday reminders, and upcoming bill notifications.
 *
 * Secure with CRON_SECRET env var: Authorization: Bearer <CRON_SECRET>
 * If CRON_SECRET is not set, only ADMIN users can trigger via session auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  sendMail,
  overspendingAlertEmail,
  weeklySummaryEmail,
  upcomingBillEmail,
  paydayReminderEmail,
} from "@/lib/email";
import { generateInsights } from "@/lib/ai/insights";

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  // Authorization: require CRON_SECRET bearer token
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { type?: string };
  const alertType = body.type ?? "all";

  const results: Record<string, unknown> = {};

  // Get all budgets with active income sources and members that have email enabled
  const budgets = await db.budget.findMany({
    include: {
      owner: { select: { id: true, email: true, name: true } },
      memberships: {
        include: { user: { select: { id: true, email: true, name: true } } },
      },
      incomeSources: { where: { isActive: true } },
      recurringExpenses: { where: { isActive: true } },
    },
  });

  const emailConfig = await db.emailConfig.findUnique({ where: { id: "singleton" } });
  const emailEnabled = emailConfig?.isEnabled ?? false;

  if (!emailEnabled) {
    return NextResponse.json({ message: "Email not configured — skipping alert delivery", emailEnabled: false });
  }

  const sentCount = { overspending: 0, weekly: 0, bills: 0, payday: 0 };

  for (const budget of budgets) {
    const allUsers = [
      budget.owner,
      ...budget.memberships.map((m) => m.user),
    ].filter((u): u is typeof budget.owner => !!u);

    // Overspending alerts
    if (alertType === "all" || alertType === "overspending") {
      try {
        const analysis = await generateInsights(budget.id, budget.owner.id);
        const overspentCats = analysis.insights.filter((i) => i.type === "overspent");

        for (const user of allUsers) {
          // Check notification preference
          const pref = await db.notificationPreference.findFirst({
            where: {
              userId: user.id,
              channel: "EMAIL",
              event: "overspending_alert",
              isEnabled: true,
            },
          });
          if (!pref) continue;

          for (const cat of overspentCats) {
            const { subject, html } = overspendingAlertEmail({
              userName: user.name,
              budgetName: budget.name,
              categoryName: cat.categoryName,
              spent: cat.actual,
              target: cat.target ?? cat.actual,
              currency: budget.currency,
            });
            await sendMail({ to: user.email, subject, html });
            sentCount.overspending++;
          }
        }
      } catch (err) {
        console.error(`[cron/alerts] overspending check failed for budget ${budget.id}:`, err);
      }
    }

    // Weekly summary — send on Sundays
    const today = new Date();
    const isSunday = today.getDay() === 0;
    if ((alertType === "all" && isSunday) || alertType === "weekly") {
      try {
        const analysis = await generateInsights(budget.id, budget.owner.id);
        const topCats = analysis.insights
          .filter((i) => i.actual > 0)
          .sort((a, b) => b.actual - a.actual)
          .slice(0, 5)
          .map((i) => ({ name: i.categoryName, amount: i.actual }));

        for (const user of allUsers) {
          const pref = await db.notificationPreference.findFirst({
            where: { userId: user.id, channel: "EMAIL", event: "weekly_summary", isEnabled: true },
          });
          if (!pref) continue;

          const { subject, html } = weeklySummaryEmail({
            userName: user.name,
            budgetName: budget.name,
            totalSpent: analysis.totalSpent,
            totalIncome: analysis.totalBudget ?? 0,
            currency: budget.currency,
            topCategories: topCats,
            status: analysis.status,
          });
          await sendMail({ to: user.email, subject, html });
          sentCount.weekly++;
        }
      } catch (err) {
        console.error(`[cron/alerts] weekly summary failed for budget ${budget.id}:`, err);
      }
    }

    // Upcoming bills — 3 days ahead
    if (alertType === "all" || alertType === "bills") {
      const in3Days = new Date(today.getTime() + 3 * 86400000);
      const in3DaysStr = in3Days.toISOString().slice(0, 10);

      for (const rec of budget.recurringExpenses) {
        if (!rec.nextDueDate) continue;
        const dueStr = new Date(rec.nextDueDate).toISOString().slice(0, 10);
        if (dueStr !== in3DaysStr) continue;

        for (const user of allUsers) {
          const pref = await db.notificationPreference.findFirst({
            where: { userId: user.id, channel: "EMAIL", event: "upcoming_bill", isEnabled: true },
          });
          if (!pref) continue;

          const { subject, html } = upcomingBillEmail({
            userName: user.name,
            budgetName: budget.name,
            billName: rec.name,
            amount: rec.amount,
            dueDate: dueStr,
            currency: budget.currency,
          });
          await sendMail({ to: user.email, subject, html });
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

          const { subject, html } = paydayReminderEmail({
            userName: user.name,
            budgetName: budget.name,
            payAmount: source.amount,
            payDate: tomorrowStr,
            currency: budget.currency,
          });
          await sendMail({ to: user.email, subject, html });
          sentCount.payday++;
        }
      }
    }
  }

  return NextResponse.json({ ok: true, sentCount, budgetsChecked: budgets.length });
}
