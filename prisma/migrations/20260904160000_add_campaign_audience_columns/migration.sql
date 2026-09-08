-- Story 10.2 — draft campaign audience definition (filters + manual add/remove).
ALTER TABLE "form_campaigns"
ADD COLUMN "audienceFilters" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "audienceAddedEmployeeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "audienceExcludedEmployeeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
