-- =============================================================================
-- Schema drift catch-up migration
-- Applies to: a fresh SQLite DB after running migrations 1–12
-- Live DB: already has all changes — mark applied instead of running SQL:
--   prisma migrate resolve --applied 20260402150000_schema_drift_catchup
--
-- Covers all items missing from the 12-migration history:
--   • 3 new tables: CategoryTarget, AIUsageLog, UserAIControl
--   • 7 table redefinitions:
--       ClarificationHistory — receiptId nullable + context column
--       Expense              — currency column + addedById FK constraint
--       GmailOAuthConfig     — remove stray DEFAULT CURRENT_TIMESTAMP from updatedAt
--       ItemMemory           — isAmbiguous + ambiguousQuestion columns
--       PendingImport        — expenseId/confirmedById/confirmedAt + FK constraints
--       GmailConnection      — replace inline UNIQUE userId with named index
--       GmailLabelConfig     — same
--
-- Note on GmailConnection/GmailLabelConfig: SQLite 3.37+ does NOT allow
-- DROP INDEX on auto-indexes (those created by inline UNIQUE/PRIMARY KEY
-- constraints). "index associated with UNIQUE or PRIMARY KEY constraint
-- cannot be dropped". A full table redefine is required to rename them.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. New tables
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
-- 2. Table redefinitions (SQLite rename/copy/drop pattern)
--
-- FK enforcement is disabled during rebuilds to avoid cascade checks on
-- intermediate table names, then restored afterwards.
--
-- INSERT SELECT column lists reflect the state of each table AFTER running
-- migrations 1–12 (fresh install). Columns being added for the first time
-- are NOT in the SELECT — they receive their DEFAULT or NULL instead.
-- ---------------------------------------------------------------------------

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- ── ClarificationHistory ───────────────────────────────────────────────────
-- Change: receiptId NOT NULL → nullable; add context TEXT column.
-- State after migrations 1–12: id, receiptId (NOT NULL), question, answer, createdAt

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

-- ── Expense ────────────────────────────────────────────────────────────────
-- Change: add currency TEXT NOT NULL DEFAULT 'USD'; add FK on addedById.
-- State after migrations 1–12: id, budgetId, categoryId, addedById (TEXT, no FK),
--   amount, date, description, merchant, notes, receiptId, createdAt, updatedAt
-- currency is NOT in the SELECT (doesn't exist yet); rows get DEFAULT 'USD'.

CREATE TABLE "new_Expense" (
    "id"          TEXT     NOT NULL PRIMARY KEY,
    "budgetId"    TEXT     NOT NULL,
    "categoryId"  TEXT,
    "addedById"   TEXT,
    "amount"      REAL     NOT NULL,
    "currency"    TEXT     NOT NULL DEFAULT 'USD',
    "date"        DATETIME NOT NULL,
    "description" TEXT,
    "merchant"    TEXT,
    "notes"       TEXT,
    "receiptId"   TEXT,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL,
    CONSTRAINT "Expense_budgetId_fkey"
        FOREIGN KEY ("budgetId")   REFERENCES "Budget"   ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_categoryId_fkey"
        FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_receiptId_fkey"
        FOREIGN KEY ("receiptId")  REFERENCES "Receipt"  ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_addedById_fkey"
        FOREIGN KEY ("addedById")  REFERENCES "User"     ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Expense"
    ("id", "budgetId", "categoryId", "addedById", "amount", "date",
     "description", "merchant", "notes", "receiptId", "createdAt", "updatedAt")
SELECT
     "id", "budgetId", "categoryId", "addedById", "amount", "date",
     "description", "merchant", "notes", "receiptId", "createdAt", "updatedAt"
FROM "Expense";

DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";

-- ── GmailOAuthConfig ───────────────────────────────────────────────────────
-- Change: remove stray DEFAULT CURRENT_TIMESTAMP from updatedAt.
-- Prisma manages @updatedAt itself; the DB default is never used at runtime
-- but causes migration history drift.

CREATE TABLE "new_GmailOAuthConfig" (
    "id"           TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "clientId"     TEXT,
    "clientSecret" TEXT,
    "updatedAt"    DATETIME NOT NULL
);

INSERT INTO "new_GmailOAuthConfig"
    ("id", "clientId", "clientSecret", "updatedAt")
SELECT  "id", "clientId", "clientSecret", "updatedAt"
FROM    "GmailOAuthConfig";

DROP TABLE "GmailOAuthConfig";
ALTER TABLE "new_GmailOAuthConfig" RENAME TO "GmailOAuthConfig";

-- ── ItemMemory ─────────────────────────────────────────────────────────────
-- Change: add isAmbiguous BOOLEAN NOT NULL DEFAULT false; add ambiguousQuestion TEXT.
-- State after migrations 1–12: id, budgetId, itemName, defaultCategoryId,
--   aliases, lastUsedAt
-- Existing named index ItemMemory_budgetId_itemName_key is dropped with the
-- table and must be recreated.

CREATE TABLE "new_ItemMemory" (
    "id"                TEXT     NOT NULL PRIMARY KEY,
    "budgetId"          TEXT     NOT NULL,
    "itemName"          TEXT     NOT NULL,
    "defaultCategoryId" TEXT,
    "aliases"           TEXT     NOT NULL DEFAULT '',
    "lastUsedAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isAmbiguous"       BOOLEAN  NOT NULL DEFAULT false,
    "ambiguousQuestion" TEXT,
    CONSTRAINT "ItemMemory_budgetId_fkey"
        FOREIGN KEY ("budgetId")          REFERENCES "Budget"   ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ItemMemory_defaultCategoryId_fkey"
        FOREIGN KEY ("defaultCategoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_ItemMemory"
    ("id", "budgetId", "itemName", "defaultCategoryId", "aliases", "lastUsedAt")
SELECT  "id", "budgetId", "itemName", "defaultCategoryId", "aliases", "lastUsedAt"
FROM    "ItemMemory";

DROP TABLE "ItemMemory";
ALTER TABLE "new_ItemMemory" RENAME TO "ItemMemory";

-- ── PendingImport ──────────────────────────────────────────────────────────
-- Change: add expenseId TEXT (UNIQUE), confirmedById TEXT, confirmedAt DATETIME;
--   add FK constraints on all reference columns.
-- State after migrations 1–12: id, budgetId, userId, receiptId, status, data,
--   error, gmailMessageId, createdAt, updatedAt
-- Existing named index PendingImport_gmailMessageId_idx is dropped with the
-- table and must be recreated.

CREATE TABLE "new_PendingImport" (
    "id"            TEXT     NOT NULL PRIMARY KEY,
    "budgetId"      TEXT     NOT NULL,
    "userId"        TEXT     NOT NULL,
    "receiptId"     TEXT,
    "expenseId"     TEXT,
    "confirmedById" TEXT,
    "confirmedAt"   DATETIME,
    "status"        TEXT     NOT NULL DEFAULT 'PENDING',
    "data"          TEXT     NOT NULL DEFAULT '{}',
    "error"         TEXT,
    "gmailMessageId" TEXT,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     DATETIME NOT NULL,
    CONSTRAINT "PendingImport_budgetId_fkey"
        FOREIGN KEY ("budgetId")      REFERENCES "Budget"  ("id") ON DELETE CASCADE  ON UPDATE CASCADE,
    CONSTRAINT "PendingImport_userId_fkey"
        FOREIGN KEY ("userId")        REFERENCES "User"    ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PendingImport_receiptId_fkey"
        FOREIGN KEY ("receiptId")     REFERENCES "Receipt" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PendingImport_confirmedById_fkey"
        FOREIGN KEY ("confirmedById") REFERENCES "User"    ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PendingImport_expenseId_fkey"
        FOREIGN KEY ("expenseId")     REFERENCES "Expense" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_PendingImport"
    ("id", "budgetId", "userId", "receiptId", "status", "data",
     "error", "gmailMessageId", "createdAt", "updatedAt")
SELECT  "id", "budgetId", "userId", "receiptId", "status", "data",
        "error", "gmailMessageId", "createdAt", "updatedAt"
FROM    "PendingImport";

DROP TABLE "PendingImport";
ALTER TABLE "new_PendingImport" RENAME TO "PendingImport";

-- ── GmailConnection ────────────────────────────────────────────────────────
-- Change: replace inline UNIQUE on userId with a separate named index.
-- SQLite 3.37+ cannot DROP an index created by an inline UNIQUE constraint
-- ("index associated with UNIQUE or PRIMARY KEY constraint cannot be dropped").
-- A full table redefine is required: the new table omits the inline UNIQUE;
-- a named CREATE UNIQUE INDEX is added after the rename.

CREATE TABLE "new_GmailConnection" (
    "id"           TEXT     NOT NULL PRIMARY KEY,
    "userId"       TEXT     NOT NULL,
    "accessToken"  TEXT     NOT NULL,
    "refreshToken" TEXT     NOT NULL,
    "tokenEmail"   TEXT     NOT NULL,
    "expiresAt"    DATETIME NOT NULL,
    "connectedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRevoked"    BOOLEAN  NOT NULL DEFAULT 0,
    CONSTRAINT "GmailConnection_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_GmailConnection"
    ("id", "userId", "accessToken", "refreshToken", "tokenEmail",
     "expiresAt", "connectedAt", "isRevoked")
SELECT  "id", "userId", "accessToken", "refreshToken", "tokenEmail",
        "expiresAt", "connectedAt", "isRevoked"
FROM    "GmailConnection";

DROP TABLE "GmailConnection";
ALTER TABLE "new_GmailConnection" RENAME TO "GmailConnection";

-- ── GmailLabelConfig ───────────────────────────────────────────────────────
-- Change: same as GmailConnection — replace inline UNIQUE userId with named index.

CREATE TABLE "new_GmailLabelConfig" (
    "id"                 TEXT     NOT NULL PRIMARY KEY,
    "userId"             TEXT     NOT NULL,
    "selectedLabelIds"   TEXT     NOT NULL DEFAULT '[]',
    "selectedLabelNames" TEXT     NOT NULL DEFAULT '{}',
    "lastSyncAt"         DATETIME,
    "lastSyncError"      TEXT,
    "syncCutoffDate"     DATETIME,
    "maxPerSync"         INTEGER  NOT NULL DEFAULT 50,
    "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    CONSTRAINT "GmailLabelConfig_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_GmailLabelConfig"
    ("id", "userId", "selectedLabelIds", "selectedLabelNames",
     "lastSyncAt", "lastSyncError", "syncCutoffDate", "maxPerSync", "syncIntervalMinutes")
SELECT  "id", "userId", "selectedLabelIds", "selectedLabelNames",
        "lastSyncAt", "lastSyncError", "syncCutoffDate", "maxPerSync", "syncIntervalMinutes"
FROM    "GmailLabelConfig";

DROP TABLE "GmailLabelConfig";
ALTER TABLE "new_GmailLabelConfig" RENAME TO "GmailLabelConfig";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- ---------------------------------------------------------------------------
-- 3. Indexes
--    Recreate indexes dropped with their tables + create new ones.
--    IF NOT EXISTS makes each statement idempotent.
-- ---------------------------------------------------------------------------

-- ItemMemory (dropped with table above; recreate)
CREATE UNIQUE INDEX IF NOT EXISTS "ItemMemory_budgetId_itemName_key"
    ON "ItemMemory"("budgetId", "itemName");

-- PendingImport (both dropped with table above; recreate)
CREATE UNIQUE INDEX IF NOT EXISTS "PendingImport_expenseId_key"
    ON "PendingImport"("expenseId");
CREATE INDEX IF NOT EXISTS "PendingImport_gmailMessageId_idx"
    ON "PendingImport"("gmailMessageId");

-- GmailConnection named index (replaces sqlite_autoindex_GmailConnection_2)
CREATE UNIQUE INDEX IF NOT EXISTS "GmailConnection_userId_key"
    ON "GmailConnection"("userId");

-- GmailLabelConfig named index (replaces sqlite_autoindex_GmailLabelConfig_2)
CREATE UNIQUE INDEX IF NOT EXISTS "GmailLabelConfig_userId_key"
    ON "GmailLabelConfig"("userId");

-- New tables
CREATE UNIQUE INDEX IF NOT EXISTS "CategoryTarget_budgetId_categoryId_key"
    ON "CategoryTarget"("budgetId", "categoryId");

CREATE INDEX IF NOT EXISTS "AIUsageLog_userId_feature_windowDate_idx"
    ON "AIUsageLog"("userId", "feature", "windowDate");

CREATE UNIQUE INDEX IF NOT EXISTS "UserAIControl_userId_key"
    ON "UserAIControl"("userId");
