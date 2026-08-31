-- Story 7.2: soft-delete audit columns and partial unique index for active timeline rows.
-- Re-create after soft-delete is allowed because deleted rows are excluded from the key.

-- Drop the full unique index from Wave-0 / Story 7.1 (created as UNIQUE INDEX, not CONSTRAINT).
DROP INDEX IF EXISTS "timeline_events_employeeId_type_effectiveDate_source_key";

-- AlterTable
ALTER TABLE "timeline_events"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedById" TEXT;

-- CreateIndex (non-unique lookup index replacing @@unique in schema)
CREATE INDEX "timeline_events_employeeId_type_effectiveDate_source_idx" ON "timeline_events"("employeeId", "type", "effectiveDate", "source");

-- Partial unique index: active rows only (WHERE deletedAt IS NULL).
CREATE UNIQUE INDEX "timeline_events_active_key" ON "timeline_events"("employeeId", "type", "effectiveDate", "source") WHERE "deletedAt" IS NULL;
