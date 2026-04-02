import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isSessionPayload, requireBudgetRead, requireBudgetWrite } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { computeSafeToSpend } from "@/lib/safe-to-spend";
import { computePayPeriod, getPeriodsPerMonth } from "@/lib/pay-period";
import { sendMail, memberActivityEmail } from "@/lib/email";

interface Params { params: Promise<{ id: string }> }

async function calcSafeToSpend(budgetId: string) {
  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    include: {
      incomeSources: { where: { isActive: true } },
      savingsGoals: { where: { isActive: true } },
      recurringExpenses: { where: { isActive: true } },
    },
  });
  if (!budget) return null;

  const primarySource = budget.incomeSources[0] ?? null;
  const payPeriod = primarySource
    ? computePayPeriod(primarySource.frequency, primarySource.nextPayDate, budget.incomeSources.reduce((s, i) => s + i.amount, 0), primarySource.customDays)
    : null;

  if (!payPeriod) return null;

  // Always use the actual pay period window (not calendar month) for accurate safe-to-spend
  const expenses = await db.expense.aggregate({
    where: { budgetId, date: { gte: payPeriod.start, lte: payPeriod.end } },
    _sum: { amount: true },
  });

  let savingsReserve = 0;
  for (const goal of budget.savingsGoals) {
    if (goal.perPaycheckAmount !== null) savingsReserve += goal.perPaycheckAmount;
    else if (goal.isMonthlyGoal && primarySource) {
      savingsReserve += goal.targetAmount / getPeriodsPerMonth(primarySource.frequency, primarySource.customDays);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = budget.recurringExpenses
    .filter((r) => r.nextDueDate && new Date(r.nextDueDate) >= today && new Date(r.nextDueDate) <= payPeriod.end)
    .reduce((s, r) => s + r.amount, 0);

  return computeSafeToSpend({
    period: payPeriod,
    savingsReservePerPeriod: savingsReserve,
    upcomingRecurringBeforeNextPayday: upcoming,
    confirmedExpensesThisPeriod: expenses._sum.amount ?? 0,
  });
}

async function getActivePeriodBounds(budgetId: string): Promise<{ start: Date; end: Date }> {
  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    include: { incomeSources: { where: { isActive: true } } },
  });
  const primarySource = budget?.incomeSources[0] ?? null;
  if (primarySource) {
    const payPeriod = computePayPeriod(
      primarySource.frequency,
      primarySource.nextPayDate,
      primarySource.amount,
      primarySource.customDays
    );
    return { start: payPeriod.start, end: payPeriod.end };
  }
  // Fallback to calendar month
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  };
}

export async function GET(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id: budgetId } = await params;
  const access = await requireBudgetRead(session, budgetId);
  if (access instanceof NextResponse) return access;

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");
  const search = searchParams.get("search");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const all = searchParams.get("all") === "true"; // explicit opt-in to full history
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));
  const skip = (page - 1) * limit;

  // Default to active pay period when no date filters are supplied and not requesting all
  let periodStart: Date | undefined;
  let periodEnd: Date | undefined;
  if (!dateFrom && !dateTo && !all) {
    const bounds = await getActivePeriodBounds(budgetId);
    periodStart = bounds.start;
    periodEnd = bounds.end;
  }

  const where = {
    budgetId,
    ...(categoryId ? { categoryId } : {}),
    ...(dateFrom || dateTo
      ? { date: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo + "T23:59:59") } : {}) } }
      : periodStart && periodEnd
        ? { date: { gte: periodStart, lte: periodEnd } }
        : {}),
    ...(search
      ? { OR: [{ merchant: { contains: search } }, { description: { contains: search } }, { notes: { contains: search } }] }
      : {}),
  };

  const [expenses, total] = await Promise.all([
    db.expense.findMany({
      where,
      include: { category: { select: { id: true, name: true, color: true, icon: true, parentId: true } }, addedBy: { select: { id: true, name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    db.expense.count({ where }),
  ]);

  return NextResponse.json({
    expenses,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    periodStart: periodStart?.toISOString() ?? dateFrom ?? null,
    periodEnd: periodEnd?.toISOString() ?? dateTo ?? null,
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const session = await requireAuth(request);
  if (!isSessionPayload(session)) return session;

  const { id: budgetId } = await params;
  const access = await requireBudgetWrite(session, budgetId);
  if (access instanceof NextResponse) return access;

  const body = await request.json() as {
    amount: number;
    date: string;
    merchant?: string;
    description?: string;
    notes?: string;
    categoryId?: string;
    receiptId?: string;
  };

  if (!body.amount || body.amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
  }
  if (!body.date) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 });
  }

  // Validate categoryId: must belong to this budget or be a global default, and must be a leaf node
  if (body.categoryId) {
    const cat = await db.category.findUnique({ where: { id: body.categoryId } });
    if (!cat || (cat.budgetId !== null && cat.budgetId !== budgetId) || (cat.budgetId === null && !cat.isDefault)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    const hasChildren = await db.category.count({ where: { parentId: body.categoryId } });
    if (hasChildren > 0) {
      return NextResponse.json({ error: "Cannot assign a parent category — choose a sub-category" }, { status: 400 });
    }
  }

  const expense = await db.expense.create({
    data: {
      budgetId,
      amount: parseFloat(String(body.amount)),
      date: new Date(body.date),
      merchant: body.merchant?.trim() || null,
      description: body.description?.trim() || null,
      notes: body.notes?.trim() || null,
      categoryId: body.categoryId || null,
      receiptId: body.receiptId || null,
      addedById: session.userId,
    },
    include: { category: { select: { id: true, name: true, color: true, icon: true } } },
  });

  const safeToSpend = await calcSafeToSpend(budgetId);

  // Notify other budget members of shared_budget_activity (fire-and-forget)
  notifySharedBudgetActivity({
    budgetId,
    actorId: session.userId,
    activityType: "expense",
    amount: expense.amount,
    description: expense.merchant || expense.description || "",
  }).catch((err) => console.error("[expenses] shared activity notify failed:", err));

  return NextResponse.json({ expense, safeToSpend }, { status: 201 });
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
