-- Add additional notification email addresses to budgets (stored as JSON array string)
ALTER TABLE "Budget" ADD COLUMN "additionalNotificationEmails" TEXT NOT NULL DEFAULT '[]';
