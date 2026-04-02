/**
 * Fire-and-forget helper: notify other members of a SHARED budget
 * when a non-owner actor adds or edits an expense or income entry.
 */
import { db } from "@/lib/db";
import { sendMail, memberActivityEmail } from "@/lib/email";

export async function notifySharedBudgetActivity(params: {
  budgetId: string;
  actorId: string;
  activityType: "expense" | "income";
  action?: "added" | "edited";
  amount: number;
  description: string;
}) {
  const budget = await db.budget.findUnique({
    where: { id: params.budgetId },
    include: {
      owner: { select: { id: true, email: true, name: true } },
      memberships: {
        include: { user: { select: { id: true, email: true, name: true } } },
      },
    },
  });
  if (!budget) return;

  // Only fire for SHARED budgets
  if (budget.budgetType !== "SHARED") return;

  // Only fire when the actor is NOT the owner (i.e. a member performing activity)
  if (budget.owner.id === params.actorId) return;

  const actor = budget.memberships.find((m) => m.user.id === params.actorId)?.user;
  const actorName = actor?.name ?? "A team member";

  const allUsers = [
    budget.owner,
    ...budget.memberships.map((m) => m.user),
  ].filter((u): u is typeof budget.owner => !!u);

  // Notify everyone except the actor
  const otherUsers = allUsers.filter((u) => u.id !== params.actorId);
  if (otherUsers.length === 0) return;

  const emailConfig = await db.emailConfig.findUnique({ where: { id: "singleton" } });
  const emailEnabled = emailConfig?.isEnabled ?? false;

  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: budget.currency });
  const action = params.action ?? "added";
  const typeLabel = params.activityType === "expense" ? "expense" : "income entry";
  const icon = params.activityType === "expense" ? "💸" : "💰";

  for (const user of otherUsers) {
    const inAppPref = await db.notificationPreference.findFirst({
      where: { userId: user.id, channel: "IN_APP", event: "shared_budget_activity" },
    });
    // No row = default ON; explicit row with isEnabled=false = opted out
    if (inAppPref === null || inAppPref.isEnabled) {
      await db.inAppNotification.create({
        data: {
          userId: user.id,
          budgetId: params.budgetId,
          event: "shared_budget_activity",
          title: `${icon} ${actorName} ${action} a ${typeLabel}`,
          body: `${actorName} ${action} ${fmt.format(params.amount)}${params.description ? ` — ${params.description}` : ""} in ${budget.name}.`,
        },
      });
    }

    if (emailEnabled) {
      const emailPref = await db.notificationPreference.findFirst({
        where: { userId: user.id, channel: "EMAIL", event: "shared_budget_activity", isEnabled: true },
      });
      if (emailPref) {
        const notifConfig = await db.userNotificationConfig.findFirst({ where: { userId: user.id } });
        const toEmail = notifConfig?.notificationEmail?.trim() || user.email;
        const { subject, html } = memberActivityEmail({
          userName: user.name,
          budgetName: budget.name,
          actorName,
          activityType: params.activityType,
          amount: params.amount,
          description: params.description,
          currency: budget.currency,
        });
        await sendMail({ to: toEmail, subject, html });
      }
    }
  }
}
