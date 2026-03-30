-- AlterTable
ALTER TABLE "IncomeSource" ADD COLUMN "customDays" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Budget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "budgetType" TEXT NOT NULL DEFAULT 'SHARED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Budget_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Budget" ("createdAt", "currency", "description", "id", "name", "ownerId", "updatedAt") SELECT "createdAt", "currency", "description", "id", "name", "ownerId", "updatedAt" FROM "Budget";
DROP TABLE "Budget";
ALTER TABLE "new_Budget" RENAME TO "Budget";
CREATE TABLE "new_BudgetSoloShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "budgetId" TEXT NOT NULL,
    "userId" TEXT,
    "shareToken" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "label" TEXT,
    "expiresAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BudgetSoloShare_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BudgetSoloShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BudgetSoloShare" ("budgetId", "createdAt", "expiresAt", "id", "isActive", "label", "role", "shareToken") SELECT "budgetId", "createdAt", "expiresAt", "id", "isActive", "label", "role", "shareToken" FROM "BudgetSoloShare";
DROP TABLE "BudgetSoloShare";
ALTER TABLE "new_BudgetSoloShare" RENAME TO "BudgetSoloShare";
CREATE UNIQUE INDEX "BudgetSoloShare_shareToken_key" ON "BudgetSoloShare"("shareToken");
CREATE TABLE "new_SavingsGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "budgetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" REAL NOT NULL,
    "currentAmount" REAL NOT NULL DEFAULT 0,
    "perPaycheckAmount" REAL,
    "isMonthlyGoal" BOOLEAN NOT NULL DEFAULT false,
    "targetDate" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavingsGoal_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SavingsGoal" ("budgetId", "createdAt", "currentAmount", "id", "isActive", "name", "notes", "targetAmount", "targetDate", "updatedAt") SELECT "budgetId", "createdAt", "currentAmount", "id", "isActive", "name", "notes", "targetAmount", "targetDate", "updatedAt" FROM "SavingsGoal";
DROP TABLE "SavingsGoal";
ALTER TABLE "new_SavingsGoal" RENAME TO "SavingsGoal";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
