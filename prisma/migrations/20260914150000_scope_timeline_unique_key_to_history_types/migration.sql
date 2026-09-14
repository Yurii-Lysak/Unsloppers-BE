-- Story 9.4 bugfix: `timeline_events_active_key` (Story 7.2) enforces "at most one
-- active system/manual event per employee/type/day", which is correct for the four
-- effective-dated history tables (grade/position/department/employmentType — each is
-- a single current value, structurally coupled 1:1 via `temporal-history.extension.ts`)
-- but wrongly also applied to 'mentorshipStart'/'mentorshipEnd', which are per-pair
-- events, not per-employee current values: a mentor picking up a second mentee (or
-- ending a second pair) on the same calendar day collided with their own first event
-- on this index and surfaced as an unhandled 500 from MentorshipAssignmentService.
--
-- Scope the partial unique index to just the four history types it was designed for;
-- leave 'joining'/'extendedLeave' (declared in TIMELINE_EVENT_TYPES, not yet written
-- anywhere) under the constraint conservatively since neither writer exists yet to
-- prove they need multiple same-day events.

DROP INDEX IF EXISTS "timeline_events_active_key";

CREATE UNIQUE INDEX "timeline_events_active_key"
  ON "timeline_events"("employeeId", "type", "effectiveDate", "source")
  WHERE "deletedAt" IS NULL
    AND "type" NOT IN ('mentorshipStart', 'mentorshipEnd');
