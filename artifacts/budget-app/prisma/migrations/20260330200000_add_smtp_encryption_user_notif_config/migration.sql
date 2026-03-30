-- AlterTable: add smtpEncryption column to EmailConfig
ALTER TABLE "EmailConfig" ADD COLUMN "smtpEncryption" TEXT NOT NULL DEFAULT 'STARTTLS';

-- CreateTable: UserNotificationConfig
CREATE TABLE "UserNotificationConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "notificationEmail" TEXT,
    "digestFrequency" TEXT NOT NULL DEFAULT 'WEEKLY',
    "billReminderDays" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserNotificationConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex: unique constraint on UserNotificationConfig.userId
CREATE UNIQUE INDEX "UserNotificationConfig_userId_key" ON "UserNotificationConfig"("userId");
