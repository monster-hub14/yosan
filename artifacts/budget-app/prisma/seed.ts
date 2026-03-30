import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "SAFETY: Seed script must not run in production. Set NODE_ENV=development."
  );
}

const db = new PrismaClient();

async function main() {
  console.log("🌱 Seeding development database...");

  await db.setupProgress.deleteMany();
  await db.user.deleteMany();

  const adminHash = await bcrypt.hash("admin1234", 12);
  const userHash = await bcrypt.hash("user1234", 12);

  const admin = await db.user.create({
    data: {
      email: "admin@budget.local",
      name: "Admin User",
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });

  const regularUser = await db.user.create({
    data: {
      email: "user@budget.local",
      name: "Regular User",
      passwordHash: userHash,
      role: "USER",
    },
  });

  console.log(`✓ Created users: ${admin.email}, ${regularUser.email}`);

  const budget = await db.budget.create({
    data: {
      name: "Household Budget",
      currency: "USD",
      ownerId: admin.id,
    },
  });

  await db.budgetMembership.create({
    data: {
      budgetId: budget.id,
      userId: regularUser.id,
      role: "MEMBER",
    },
  });

  const categories = await db.category.createMany({
    data: [
      { budgetId: budget.id, name: "Housing", color: "#6366f1", icon: "home", isDefault: true },
      { budgetId: budget.id, name: "Food & Dining", color: "#f59e0b", icon: "utensils", isDefault: true },
      { budgetId: budget.id, name: "Transportation", color: "#3b82f6", icon: "car", isDefault: true },
      { budgetId: budget.id, name: "Healthcare", color: "#ef4444", icon: "heart-pulse", isDefault: true },
      { budgetId: budget.id, name: "Entertainment", color: "#8b5cf6", icon: "tv", isDefault: true },
      { budgetId: budget.id, name: "Shopping", color: "#ec4899", icon: "shopping-bag", isDefault: true },
      { budgetId: budget.id, name: "Utilities", color: "#14b8a6", icon: "zap", isDefault: true },
      { budgetId: budget.id, name: "Other", color: "#6b7280", icon: "circle-dot", isDefault: true },
    ],
  });

  console.log(`✓ Created ${categories.count} categories`);

  const foodCategory = await db.category.findFirst({
    where: { budgetId: budget.id, name: "Food & Dining" },
  });

  const transportCategory = await db.category.findFirst({
    where: { budgetId: budget.id, name: "Transportation" },
  });

  const housingCategory = await db.category.findFirst({
    where: { budgetId: budget.id, name: "Housing" },
  });

  await db.incomeSource.create({
    data: {
      budgetId: budget.id,
      name: "Primary Salary",
      amount: 3500,
      frequency: "BIWEEKLY",
      nextPayDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await db.incomeSource.create({
    data: {
      budgetId: budget.id,
      name: "Freelance",
      amount: 800,
      frequency: "MONTHLY",
    },
  });

  console.log("✓ Created income sources");

  await db.savingsGoal.createMany({
    data: [
      {
        budgetId: budget.id,
        name: "Emergency Fund",
        targetAmount: 10000,
        currentAmount: 3200,
        targetDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
      {
        budgetId: budget.id,
        name: "Vacation",
        targetAmount: 3000,
        currentAmount: 750,
        targetDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      },
    ],
  });

  console.log("✓ Created savings goals");

  await db.recurringExpense.createMany({
    data: [
      {
        budgetId: budget.id,
        categoryId: housingCategory?.id,
        name: "Rent",
        amount: 1500,
        frequency: "MONTHLY",
        nextDueDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
      },
      {
        budgetId: budget.id,
        categoryId: transportCategory?.id,
        name: "Car Insurance",
        amount: 120,
        frequency: "MONTHLY",
        nextDueDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 15),
      },
    ],
  });

  console.log("✓ Created recurring expenses");

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const expensesData = [
    { description: "Whole Foods Market", amount: 87.43, merchant: "Whole Foods", categoryId: foodCategory?.id, daysAgo: 2 },
    { description: "Gas Station", amount: 52.00, merchant: "Shell", categoryId: transportCategory?.id, daysAgo: 4 },
    { description: "Netflix", amount: 15.99, merchant: "Netflix", categoryId: null, daysAgo: 8 },
    { description: "Target Run", amount: 64.21, merchant: "Target", categoryId: null, daysAgo: 10 },
    { description: "Coffee Shop", amount: 12.50, merchant: "Blue Bottle Coffee", categoryId: foodCategory?.id, daysAgo: 1 },
    { description: "Electric Bill", amount: 95.00, merchant: "Electric Company", categoryId: housingCategory?.id, daysAgo: 5 },
    { description: "Lunch", amount: 18.75, merchant: "Chipotle", categoryId: foodCategory?.id, daysAgo: 3 },
  ];

  for (const expense of expensesData) {
    const date = new Date(year, month, now.getDate() - expense.daysAgo);
    await db.expense.create({
      data: {
        budgetId: budget.id,
        categoryId: expense.categoryId,
        amount: expense.amount,
        date,
        description: expense.description,
        merchant: expense.merchant,
      },
    });
  }

  console.log(`✓ Created ${expensesData.length} sample expenses`);

  await db.setupProgress.create({
    data: {
      id: "singleton",
      adminAccountCreated: true,
      firstBudgetCreated: true,
      incomeConfigured: true,
      savingsConfigured: true,
      recurringConfigured: true,
      aiConfigured: false,
      emailConfigured: false,
      completedAt: new Date(),
    },
  });

  console.log("✓ Marked setup as complete");
  console.log("\n✅ Seed complete!");
  console.log("   Admin:   admin@budget.local / admin1234");
  console.log("   User:    user@budget.local / user1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
