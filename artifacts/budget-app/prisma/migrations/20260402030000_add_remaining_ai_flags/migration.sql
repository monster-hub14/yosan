ALTER TABLE "AIProviderConfig"
ADD COLUMN "categorizationEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "AIProviderConfig"
ADD COLUMN "recurringCategorizationEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "AIProviderConfig"
ADD COLUMN "insightsEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "AIProviderConfig"
ADD COLUMN "forecastingEnabled" BOOLEAN NOT NULL DEFAULT false;