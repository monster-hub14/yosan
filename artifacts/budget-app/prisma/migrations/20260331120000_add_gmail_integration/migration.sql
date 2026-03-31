-- Add Gmail OAuth admin configuration (singleton)
CREATE TABLE "GmailOAuthConfig" (
    "id"           TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "clientId"     TEXT,
    "clientSecret" TEXT,
    "updatedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add per-user Gmail OAuth connection (tokens)
CREATE TABLE "GmailConnection" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "userId"       TEXT NOT NULL UNIQUE,
    "accessToken"  TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenEmail"   TEXT NOT NULL,
    "expiresAt"    DATETIME NOT NULL,
    "connectedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRevoked"    BOOLEAN NOT NULL DEFAULT 0,
    CONSTRAINT "GmailConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Add per-user Gmail label selection and sync config
CREATE TABLE "GmailLabelConfig" (
    "id"                 TEXT NOT NULL PRIMARY KEY,
    "userId"             TEXT NOT NULL UNIQUE,
    "selectedLabelIds"   TEXT NOT NULL DEFAULT '[]',
    "selectedLabelNames" TEXT NOT NULL DEFAULT '{}',
    "lastSyncAt"         DATETIME,
    "lastSyncError"      TEXT,
    "syncCutoffDate"     DATETIME,
    "maxPerSync"         INTEGER NOT NULL DEFAULT 50,
    CONSTRAINT "GmailLabelConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Add gmailMessageId to PendingImport for deduplication
ALTER TABLE "PendingImport" ADD COLUMN "gmailMessageId" TEXT;

-- Index for fast dedup lookups
CREATE INDEX "PendingImport_gmailMessageId_idx" ON "PendingImport"("gmailMessageId");
