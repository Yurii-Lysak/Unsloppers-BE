-- Corrective: Story 7.2 first migration used DROP CONSTRAINT but Story 7.1
-- created a UNIQUE INDEX. Drop the stale full unique index if it remains.
DROP INDEX IF EXISTS "timeline_events_employeeId_type_effectiveDate_source_key";
