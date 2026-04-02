import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireBudgetRead, requireBudgetWrite, isSessionPayload } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { sendMail, memberActivityEmail } from "@/lib/email";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetRead(session, id);
  if (access instanceof NextResponse) return access;

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const after = searchParams.get("after");

  const entries = await db.incomeEntry.findMany({
    where: {
      budgetId: id,
      ...(after ? { date: { gte: new Date(after) } } : {}),
    },
    orderBy: { date: "desc" },
    take: Math.min(limit, 200),
    include: {
      incomeSource: { select: { id: true, name: true, frequency: true } },
      user: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ entries });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const access = await requireBudgetWrite(session, id);
  if (access instanceof NextResponse) return access;

  const { amount, date, note, incomeSourceId } = await request.json();

  if (typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
  }
  if (!date) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 });
  }

  const entry = await db.incomeEntry.create({
    data: {
      budgetId: id,
      userId: session.userId,
      amount,
      date: new Date(date),
      note: note?.trim() || null,
      incomeSourceId: incomeSourceId || null,
    },
    include: {
      incomeSource: { select: { id: true, name: true, frequency: true } },
      user: { select: { id: true, name: true } },
    },
  });

  // Notify other budget members of shared_budget_activity (fire-and-forget)
  notifySharedBudgetActivity({
    budgetId: id,
    actorId: session.userId,
    activityType: "income",
    amount: entry.amount,
    description: entry.note || "",
  }).catch((err) => console.error("[income-entries] shared activity notify failed:", err));

  return NextResponse.json({ entry }, { status: 201 });
}

async function notifySharedBudgetActivity(params: {
  budgetId: string;
  actorId: string;
  activityType: "expense" | "income";
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

  const actor = budget.owner.id === params.actorId
    ? budget.owner
    : budget.memberships.find((m) => m.user.id === params.actorId)?.user;
  const actorName = actor?.name ?? "A team member";

  const allUsers = [
    budget.owner,
    ...budget.memberships.map((m) => m.user),
  ].filter((u): u is typeof budget.owner => !!u);

  const otherUsers = allUsers.filter((u) => u.id !== params.actorId);
  if (otherUsers.length === 0) return;

  const emailConfig = await db.emailConfig.findUnique({ where: { id: "singleton" } });
  const emailEnabled = emailConfig?.isEnabled ?? false;

  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: budget.currency });
  const typeLabel = params.activityType === "expense" ? "expense" : "income entry";
  const icon = params.activityType === "expense" ? "💸" : "💰";

  for (const user of otherUsers) {
    const inAppDisabled = await db.notificationPreference.findFirst({
      where: { userId: user.id, channel: "IN_APP", event: "shared_budget_activity", isEnabled: false },
    });
    if (!inAppDisabled) {
      await db.inAppNotification.create({
        data: {
          userId: user.id,
          budgetId: params.budgetId,
          event: "shared_budget_activity",
          title: `${icon} ${actorName} added a ${typeLabel}`,
          body: `${actorName} added ${fmt.format(params.amount)}${params.description ? ` — ${params.description}` : ""} in ${budget.name}.`,
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
