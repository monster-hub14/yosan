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
  // Clear data in dependency order to avoid FK violations
  await db.categoryTarget.deleteMany();
  await db.expense.deleteMany();
  await db.pendingImport.deleteMany();
  await db.receipt.deleteMany();
  await db.category.deleteMany();
  await db.incomeEntry.deleteMany();
  await db.incomeSource.deleteMany();
  await db.savingsGoal.deleteMany();
  await db.recurringExpense.deleteMany();
  await db.budgetMembership.deleteMany();
  await db.budget.deleteMany();
  await db.userAIControl.deleteMany();
  await db.aIUsageLog.deleteMany();
  await db.aIProviderConfig.deleteMany();
  await db.emailConfig.deleteMany();
  await db.emailForwardingConfig.deleteMany();
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

  // Comprehensive hierarchical category tree
  const topLevelCategories = [
    { name: "Housing", color: "#6366f1", icon: "home", sortOrder: 0 },
    { name: "Food & Dining", color: "#f59e0b", icon: "utensils", sortOrder: 1 },
    { name: "Transportation", color: "#3b82f6", icon: "car", sortOrder: 2 },
    { name: "Healthcare", color: "#ef4444", icon: "heart-pulse", sortOrder: 3 },
    { name: "Recreation", color: "#8b5cf6", icon: "waves", sortOrder: 4 },
    { name: "Shopping", color: "#ec4899", icon: "shopping-bag", sortOrder: 5 },
    { name: "Utilities", color: "#14b8a6", icon: "zap", sortOrder: 6 },
    { name: "Subscriptions", color: "#f97316", icon: "repeat", sortOrder: 7 },
    { name: "Personal Care", color: "#84cc16", icon: "sparkles", sortOrder: 8 },
    { name: "Education", color: "#0ea5e9", icon: "graduation-cap", sortOrder: 9 },
    { name: "Other", color: "#6b7280", icon: "circle-dot", sortOrder: 10 },
  ];

  const topCats: Record<string, string> = {};
  for (const cat of topLevelCategories) {
    const created = await db.category.create({
      data: { budgetId: budget.id, name: cat.name, color: cat.color, icon: cat.icon, isDefault: true, sortOrder: cat.sortOrder },
    });
    topCats[cat.name] = created.id;
  }

  // Subcategories
  const subcategories: Array<{ parent: string; name: string; color?: string; icon?: string; sortOrder?: number }> = [
    // Housing
    { parent: "Housing", name: "Rent / Mortgage", icon: "building", sortOrder: 0 },
    { parent: "Housing", name: "Insurance (Home)", icon: "shield", sortOrder: 1 },
    { parent: "Housing", name: "Maintenance & Repairs", icon: "wrench", sortOrder: 2 },
    { parent: "Housing", name: "Furnishings", icon: "sofa", sortOrder: 3 },
    // Food & Dining
    { parent: "Food & Dining", name: "Groceries", icon: "shopping-cart", sortOrder: 0 },
    { parent: "Food & Dining", name: "Restaurants", icon: "fork-knife", sortOrder: 1 },
    { parent: "Food & Dining", name: "Coffee & Cafes", icon: "coffee", sortOrder: 2 },
    { parent: "Food & Dining", name: "Takeout & Delivery", icon: "package", sortOrder: 3 },
    // Transportation
    { parent: "Transportation", name: "Fuel", icon: "fuel", sortOrder: 0 },
    { parent: "Transportation", name: "Vehicle Maintenance", icon: "wrench", sortOrder: 1 },
    { parent: "Transportation", name: "Insurance (Auto)", icon: "shield", sortOrder: 2 },
    { parent: "Transportation", name: "Public Transit", icon: "bus", sortOrder: 3 },
    { parent: "Transportation", name: "Parking & Tolls", icon: "parking-circle", sortOrder: 4 },
    { parent: "Transportation", name: "Rideshare", icon: "car-taxi-front", sortOrder: 5 },
    // Healthcare
    { parent: "Healthcare", name: "Doctor Visits", icon: "stethoscope", sortOrder: 0 },
    { parent: "Healthcare", name: "Prescriptions", icon: "pill", sortOrder: 1 },
    { parent: "Healthcare", name: "Dental", icon: "smile", sortOrder: 2 },
    { parent: "Healthcare", name: "Vision", icon: "eye", sortOrder: 3 },
    { parent: "Healthcare", name: "Insurance (Health)", icon: "shield", sortOrder: 4 },
    // Recreation
    { parent: "Recreation", name: "Fishing & Boating", icon: "anchor", sortOrder: 0 },
    { parent: "Recreation", name: "Hiking & Camping", icon: "tent", sortOrder: 1 },
    { parent: "Recreation", name: "Sports & Fitness", icon: "dumbbell", sortOrder: 2 },
    { parent: "Recreation", name: "Hobbies", icon: "palette", sortOrder: 3 },
    { parent: "Recreation", name: "Travel & Vacations", icon: "plane", sortOrder: 4 },
    { parent: "Recreation", name: "Movies & Shows", icon: "film", sortOrder: 5 },
    // Shopping
    { parent: "Shopping", name: "Clothing & Apparel", icon: "shirt", sortOrder: 0 },
    { parent: "Shopping", name: "Electronics", icon: "smartphone", sortOrder: 1 },
    { parent: "Shopping", name: "Household Supplies", icon: "package", sortOrder: 2 },
    { parent: "Shopping", name: "Gifts", icon: "gift", sortOrder: 3 },
    // Utilities
    { parent: "Utilities", name: "Electric", icon: "zap", sortOrder: 0 },
    { parent: "Utilities", name: "Gas (Home)", icon: "flame", sortOrder: 1 },
    { parent: "Utilities", name: "Water & Sewage", icon: "droplets", sortOrder: 2 },
    { parent: "Utilities", name: "Internet", icon: "wifi", sortOrder: 3 },
    { parent: "Utilities", name: "Phone", icon: "phone", sortOrder: 4 },
    // Subscriptions
    { parent: "Subscriptions", name: "Streaming (Video)", icon: "tv", sortOrder: 0 },
    { parent: "Subscriptions", name: "Streaming (Music)", icon: "music", sortOrder: 1 },
    { parent: "Subscriptions", name: "Software & Apps", icon: "app-window", sortOrder: 2 },
    { parent: "Subscriptions", name: "Memberships", icon: "badge-check", sortOrder: 3 },
    // Personal Care
    { parent: "Personal Care", name: "Hair & Grooming", icon: "scissors", sortOrder: 0 },
    { parent: "Personal Care", name: "Skincare & Cosmetics", icon: "sparkles", sortOrder: 1 },
    { parent: "Personal Care", name: "Gym", icon: "dumbbell", sortOrder: 2 },
    // Education
    { parent: "Education", name: "Tuition & Courses", icon: "graduation-cap", sortOrder: 0 },
    { parent: "Education", name: "Books & Supplies", icon: "book-open", sortOrder: 1 },
    { parent: "Education", name: "Childcare", icon: "baby", sortOrder: 2 },
  ];

  for (const sub of subcategories) {
    await db.category.create({
      data: {
        budgetId: budget.id,
        name: sub.name,
        icon: sub.icon,
        color: (await db.category.findUnique({ where: { id: topCats[sub.parent] }, select: { color: true } }))?.color ?? "#6b7280",
        isDefault: true,
        parentId: topCats[sub.parent],
        sortOrder: sub.sortOrder ?? 0,
      },
    });
  }

  console.log(`✓ Created comprehensive category hierarchy (${topLevelCategories.length} top-level + ${subcategories.length} subcategories)`);

  const foodCategory = await db.category.findFirst({
    where: { budgetId: budget.id, name: "Groceries" },
  });
  const transportCategory = await db.category.findFirst({
    where: { budgetId: budget.id, name: "Fuel" },
  });
  const housingCategory = await db.category.findFirst({
    where: { budgetId: budget.id, name: "Rent / Mortgage" },
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
        addedById: admin.id,
      },
    });
  }

  console.log(`✓ Created ${expensesData.length} sample expenses`);

  // Set some category targets
  const groceriesCat = await db.category.findFirst({ where: { budgetId: budget.id, name: "Groceries" } });
  const diningCat = await db.category.findFirst({ where: { budgetId: budget.id, name: "Restaurants" } });
  const fuelCat = await db.category.findFirst({ where: { budgetId: budget.id, name: "Fuel" } });

  await db.categoryTarget.createMany({
    data: [
      ...(groceriesCat ? [{ budgetId: budget.id, categoryId: groceriesCat.id, amount: 400, periodType: "monthly" }] : []),
      ...(diningCat ? [{ budgetId: budget.id, categoryId: diningCat.id, amount: 150, periodType: "monthly" }] : []),
      ...(fuelCat ? [{ budgetId: budget.id, categoryId: fuelCat.id, amount: 100, periodType: "monthly" }] : []),
    ],
  });

  console.log("✓ Created category targets");

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
