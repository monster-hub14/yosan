-- Schema drift catch-up migration for Yosan AI (self-hosted).
--
-- Covers all differences between migrations 1-12 and the target schema.
--
-- Deployment:
--   Fresh install : prisma migrate deploy  (SQL runs normally)
--   Live dev DB   : prisma migrate resolve --applied 20260402120000_schema_drift_patch

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- ---------------------------------------------------------------------------
-- 1. New tables (absent from migrations 1-12)
-- ---------------------------------------------------------------------------

CREATE TABLE "CategoryTarget" (
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

CREATE TABLE "AIUsageLog" (
    "id"         TEXT     NOT NULL PRIMARY KEY,
    "userId"     TEXT     NOT NULL,
    "feature"    TEXT     NOT NULL,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowDate" TEXT     NOT NULL,
    CONSTRAINT "AIUsageLog_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "UserAIControl" (
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
-- 2. Pre-redefine ALTER TABLE ADD COLUMN statements
--
--    These add the manually-patched drift columns to the tables that will be
--    redefined below.  Adding them here (before the redefine) ensures the
--    INSERT...SELECT can copy their values, preserving live data.
--
--    ItemMemory has no FK-related redefine, so its ALTER TABLE is the only
--    schema change needed for those columns.
-- ---------------------------------------------------------------------------

ALTER TABLE "ClarificationHistory" ADD COLUMN "context" TEXT;

ALTER TABLE "Expense" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';

ALTER TABLE "ItemMemory" ADD COLUMN "isAmbiguous"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ItemMemory" ADD COLUMN "ambiguousQuestion"  TEXT;

ALTER TABLE "PendingImport" ADD COLUMN "expenseId"      TEXT;
ALTER TABLE "PendingImport" ADD COLUMN "confirmedById"   TEXT;
ALTER TABLE "PendingImport" ADD COLUMN "confirmedAt"     DATETIME;

-- ---------------------------------------------------------------------------
-- 3. Table redefinitions
--
--    Required for:
--      ClarificationHistory : receiptId NOT NULL → nullable (no ALTER TABLE syntax)
--      Expense              : FK constraint on addedById (added without FK in mig 12)
--      PendingImport        : FK constraints on expenseId/confirmedById
--      GmailOAuthConfig     : remove DEFAULT CURRENT_TIMESTAMP on updatedAt
--      GmailConnection      : replace inline UNIQUE with named index
--                             (SQLite 3.46 cannot drop sqlite_autoindex_* entries)
--      GmailLabelConfig     : same reason as GmailConnection
--
--    All INSERT...SELECT lists include the drift columns added in step 2.
-- ---------------------------------------------------------------------------

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
    ("id", "receiptId", "question", "answer", "context", "createdAt")
SELECT  "id", "receiptId", "question", "answer", "context", "createdAt"
FROM    "ClarificationHistory";

DROP TABLE "ClarificationHistory";
ALTER TABLE "new_ClarificationHistory" RENAME TO "ClarificationHistory";

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
    ("id", "budgetId", "categoryId", "addedById", "amount", "currency",
     "date", "description", "merchant", "notes", "receiptId", "createdAt", "updatedAt")
SELECT  "id", "budgetId", "categoryId", "addedById", "amount", "currency",
        "date", "description", "merchant", "notes", "receiptId", "createdAt", "updatedAt"
FROM    "Expense";

DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";

CREATE TABLE "new_PendingImport" (
    "id"             TEXT     NOT NULL PRIMARY KEY,
    "budgetId"       TEXT     NOT NULL,
    "userId"         TEXT     NOT NULL,
    "receiptId"      TEXT,
    "expenseId"      TEXT,
    "confirmedById"  TEXT,
    "confirmedAt"    DATETIME,
    "status"         TEXT     NOT NULL DEFAULT 'PENDING',
    "data"           TEXT     NOT NULL DEFAULT '{}',
    "error"          TEXT,
    "gmailMessageId" TEXT,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      DATETIME NOT NULL,
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
    ("id", "budgetId", "userId", "receiptId", "expenseId", "confirmedById",
     "confirmedAt", "status", "data", "error", "gmailMessageId", "createdAt", "updatedAt")
SELECT  "id", "budgetId", "userId", "receiptId", "expenseId", "confirmedById",
        "confirmedAt", "status", "data", "error", "gmailMessageId", "createdAt", "updatedAt"
FROM    "PendingImport";

DROP TABLE "PendingImport";
ALTER TABLE "new_PendingImport" RENAME TO "PendingImport";

CREATE TABLE "new_GmailOAuthConfig" (
    "id"           TEXT     NOT NULL PRIMARY KEY DEFAULT 'singleton',
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
    ("id", "userId", "accessToken", "refreshToken",
     "tokenEmail", "expiresAt", "connectedAt", "isRevoked")
SELECT  "id", "userId", "accessToken", "refreshToken",
        "tokenEmail", "expiresAt", "connectedAt", "isRevoked"
FROM    "GmailConnection";

DROP TABLE "GmailConnection";
ALTER TABLE "new_GmailConnection" RENAME TO "GmailConnection";

CREATE TABLE "new_GmailLabelConfig" (
    "id"                  TEXT     NOT NULL PRIMARY KEY,
    "userId"              TEXT     NOT NULL,
    "selectedLabelIds"    TEXT     NOT NULL DEFAULT '[]',
    "selectedLabelNames"  TEXT     NOT NULL DEFAULT '{}',
    "lastSyncAt"          DATETIME,
    "lastSyncError"       TEXT,
    "syncCutoffDate"      DATETIME,
    "maxPerSync"          INTEGER  NOT NULL DEFAULT 50,
    "syncIntervalMinutes" INTEGER  NOT NULL DEFAULT 60,
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
-- 4. Indexes
--    ItemMemory_budgetId_itemName_key already exists from migration 1; omitted.
--    PendingImport_gmailMessageId_idx already exists from migration 6; but
--    the PendingImport table redefine above drops it, so it must be recreated.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "CategoryTarget_budgetId_categoryId_key"
    ON "CategoryTarget"("budgetId", "categoryId");

CREATE INDEX "AIUsageLog_userId_feature_windowDate_idx"
    ON "AIUsageLog"("userId", "feature", "windowDate");

CREATE UNIQUE INDEX "UserAIControl_userId_key"
    ON "UserAIControl"("userId");

CREATE UNIQUE INDEX "PendingImport_expenseId_key"
    ON "PendingImport"("expenseId");

CREATE INDEX "PendingImport_gmailMessageId_idx"
    ON "PendingImport"("gmailMessageId");

CREATE UNIQUE INDEX "GmailConnection_userId_key"
    ON "GmailConnection"("userId");

CREATE UNIQUE INDEX "GmailLabelConfig_userId_key"
    ON "GmailLabelConfig"("userId");
