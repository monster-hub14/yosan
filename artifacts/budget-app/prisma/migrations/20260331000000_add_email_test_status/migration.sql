-- AlterTable: add lastTestedAt, lastTestOk, lastTestError to EmailConfig
ALTER TABLE "EmailConfig" ADD COLUMN "lastTestedAt" DATETIME;
ALTER TABLE "EmailConfig" ADD COLUMN "lastTestOk" BOOLEAN;
ALTER TABLE "EmailConfig" ADD COLUMN "lastTestError" TEXT;
