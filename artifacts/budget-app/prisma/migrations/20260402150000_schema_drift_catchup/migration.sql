-- =============================================================================
-- Schema drift catch-up: items missing from migrations 1–12 that are required
-- by schema.prisma. Intended for FRESH INSTALLS (new Docker/self-hosted DBs).
--
-- LIVE DB (dev/prod): do NOT run this SQL. All items are already present.
-- Instead mark as applied:
--   prisma migrate resolve --applied 20260402150000_schema_drift_catchup
--
-- Design principles:
--   • CREATE TABLE IF NOT EXISTS  — idempotent, safe on any DB
--   • ALTER TABLE ADD COLUMN      — additive; SQLite 3.37+ allows NOT NULL + DEFAULT
--   • CREATE INDEX IF NOT EXISTS  — idempotent
--   • One mandatory table redefine (ClarificationHistory: receiptId NOT NULL → nullable)
--   • Skipped: GmailConnection/GmailLabelConfig auto-index renames (cosmetic; SQLite
--     auto-indexes cannot be safely dropped via DROP INDEX without a full rewrite)
--   • Skipped: GmailOAuthConfig.updatedAt DEFAULT removal (cosmetic; Prisma always
--     sets this value explicitly — DB default is never used at runtime)
--   • Skipped: Expense.addedById FK constraint (SQLite FK enforcement is OFF by
--     default; Prisma does not rely on DB-level FK enforcement for SQLite)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. New tables (absent from all 12 prior migrations)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "CategoryTarget" (
    "id"         TEXT     NOT NULL PRIMARY KEY,
    "budgetId"   TEXT     NOT NULL,
    "categoryId" TEXT     NOT NULL,
    "amount"     REAL     NOT NULL,
    "periodType" TEXT     NOT NULL DEFAULT 'monthly',
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  DATETIME NOT NULL,
    CONSTRAINT "CategoryTarget_budgetId_fkey"
        FOREIGN KEY ("budgetId")   REFERENCES "Budget"   ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CategoryTarget_categoryId_fkey"
        FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AIUsageLog" (
    "id"         TEXT     NOT NULL PRIMARY KEY,
    "userId"     TEXT     NOT NULL,
    "feature"    TEXT     NOT NULL,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowDate" TEXT     NOT NULL,
    CONSTRAINT "AIUsageLog_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "UserAIControl" (
    "id"                             TEXT     NOT NULL PRIMARY KEY,
    "userId"                         TEXT     NOT NULL,
    "aiEnabled"                      BOOLEAN  NOT NULL DEFAULT true,
    "extractionEnabled"              BOOLEAN  NOT NULL DEFAULT true,
    "categorizationEnabled"          BOOLEAN  NOT NULL DEFAULT true,
    "recurringCategorizationEnabled" BOOLEAN  NOT NULL DEFAULT true,
    "insightsEnabled"                BOOLEAN  NOT NULL DEFAULT true,
    "forecastingEnabled"             BOOLEAN  NOT NULL DEFAULT true,
    "dailyLimit"                     INTEGER,
    "weeklyLimit"                    INTEGER,
    "monthlyLimit"                   INTEGER,
    "updatedAt"                      DATETIME NOT NULL,
    CONSTRAINT "UserAIControl_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------------
-- 2. Missing columns (additive ALTER TABLE ADD COLUMN)
--
-- SQLite 3.37+ permits adding a NOT NULL column with a constant DEFAULT to an
-- existing table without a full table rebuild. All six statements below meet
-- that requirement.
--
-- On a fresh DB these columns do not exist yet (migrations 1–12 never add
-- them), so these statements run cleanly.
-- ---------------------------------------------------------------------------

ALTER TABLE "Expense"        ADD COLUMN "currency"          TEXT     NOT NULL DEFAULT 'USD';
ALTER TABLE "ItemMemory"     ADD COLUMN "isAmbiguous"        BOOLEAN  NOT NULL DEFAULT false;
ALTER TABLE "ItemMemory"     ADD COLUMN "ambiguousQuestion"  TEXT;
ALTER TABLE "PendingImport"  ADD COLUMN "expenseId"          TEXT;
ALTER TABLE "PendingImport"  ADD COLUMN "confirmedById"      TEXT;
ALTER TABLE "PendingImport"  ADD COLUMN "confirmedAt"        DATETIME;

-- ---------------------------------------------------------------------------
-- 3. ClarificationHistory — mandatory table redefine
--
-- receiptId was declared NOT NULL in the init migration (migration 1) but
-- schema.prisma has it as String? (nullable). SQLite cannot change column
-- nullability via ALTER TABLE; the rename-copy-drop pattern is required.
--
-- The "context" column is added at the same time since the table is rebuilt.
-- The INSERT copies all columns from the old schema (id, receiptId, question,
-- answer, createdAt). "context" defaults to NULL for all pre-existing rows,
-- which is the correct behaviour.
--
-- On a fresh DB, ClarificationHistory typically has zero rows (it is populated
-- only when the AI asks clarifying questions during receipt processing).
-- Risk: minimal.
-- ---------------------------------------------------------------------------

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ClarificationHistory" (
    "id"        TEXT     NOT NULL PRIMARY KEY,
    "receiptId" TEXT,
    "question"  TEXT     NOT NULL,
    "answer"    TEXT     NOT NULL,
    "context"   TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClarificationHistory_receiptId_fkey"
        FOREIGN KEY ("receiptId") REFERENCES "Receipt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_ClarificationHistory"
    ("id", "receiptId", "question", "answer", "createdAt")
SELECT  "id", "receiptId", "question", "answer", "createdAt"
FROM    "ClarificationHistory";

DROP TABLE "ClarificationHistory";
ALTER TABLE "new_ClarificationHistory" RENAME TO "ClarificationHistory";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- ---------------------------------------------------------------------------
-- 4. Indexes for new tables and new columns
-- IF NOT EXISTS makes each statement idempotent.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "CategoryTarget_budgetId_categoryId_key"
    ON "CategoryTarget"("budgetId", "categoryId");

CREATE INDEX IF NOT EXISTS "AIUsageLog_userId_feature_windowDate_idx"
    ON "AIUsageLog"("userId", "feature", "windowDate");

CREATE UNIQUE INDEX IF NOT EXISTS "UserAIControl_userId_key"
    ON "UserAIControl"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "PendingImport_expenseId_key"
    ON "PendingImport"("expenseId");
