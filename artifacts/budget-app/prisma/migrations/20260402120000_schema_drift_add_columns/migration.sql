-- =============================================================================
-- Schema drift catch-up part 1 of 2: add missing columns via ALTER TABLE.
--
-- PURPOSE: Ensures every column needed by the subsequent table-redefinition
-- migration (20260402150000_schema_drift_catchup) already exists in the old
-- tables, so those redefinitions can include them in INSERT/SELECT lists and
-- preserve any existing data.
--
-- FRESH INSTALL (DB after migrations 1–12): all statements run cleanly.
-- LIVE DB (columns already manually patched): mark this migration applied
--   without running the SQL:
--   prisma migrate resolve --applied 20260402120000_schema_drift_add_columns
--
-- SQLite 3.37+ allows NOT NULL columns with a constant DEFAULT to be added
-- via ALTER TABLE without a full table rebuild.
-- =============================================================================

-- ClarificationHistory: context column (receiptId nullability change handled
-- in part 2 via table redefine; this just adds the new context column first).
ALTER TABLE "ClarificationHistory" ADD COLUMN "context" TEXT;

-- Expense: currency was referenced by Prisma client from day one but never
-- added to migration history. NOT NULL with DEFAULT is allowed by SQLite 3.37+.
ALTER TABLE "Expense" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';

-- ItemMemory: AI ambiguity tracking columns.
ALTER TABLE "ItemMemory" ADD COLUMN "isAmbiguous"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ItemMemory" ADD COLUMN "ambiguousQuestion"  TEXT;

-- PendingImport: import-to-expense linkage and confirmation tracking.
ALTER TABLE "PendingImport" ADD COLUMN "expenseId"    TEXT;
ALTER TABLE "PendingImport" ADD COLUMN "confirmedById" TEXT;
ALTER TABLE "PendingImport" ADD COLUMN "confirmedAt"   DATETIME;
