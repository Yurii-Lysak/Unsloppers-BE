/**
 * C4 — TimelineEventWriter
 *
 * Anything that changes a tracked field (grade, position, department,
 * FTE<->subcontractor, extended leave, mentorship pair start/end, joining)
 * calls `recordTimelineEvent` instead of writing timeline rows itself.
 * Owner (real implementation): `timeline` module (Epic 7); stubbed until
 * then per Story 1.20's cross-story note.
 */

export type TimelineEventSource = 'system' | 'manual';

/**
 * Minimal transaction surface C4 needs when participating in a caller's open
 * DB transaction. Defined here (not via Prisma imports) so contracts stay
 * ORM-agnostic per AD-2 / dependency-cruiser rules.
 */
export interface TimelineEventWriteContext {
  timelineEvent: {
    create(args: {
      data: {
        employeeId: string;
        type: string;
        effectiveDate: Date;
        oldValue: unknown;
        newValue: unknown;
        source: string;
        authorId?: string | null;
      };
    }): Promise<{ id: string }>;
    update(args: {
      where: { id: string };
      data: { systemWriteSkippedAt: Date };
    }): Promise<{ id: string }>;
  };
}

export abstract class TimelineEventWriter {
  /**
   * `oldValue`/`newValue` are always the raw typed value for `type` (e.g. an
   * enum value, an ISO date, a boolean) — never a pre-formatted string; the
   * timeline UI formats per `type` at render time (AD-7).
   *
   * When `tx` is supplied, writes use that interactive transaction client so
   * history + timeline rows commit or roll back atomically (AD-7). When
   * omitted, failures are logged for retry and do not throw (integration
   * soft-fail path).
   */
  abstract recordTimelineEvent(
    employeeId: string,
    type: string,
    effectiveDate: string,
    oldValue: unknown,
    newValue: unknown,
    source: TimelineEventSource,
    authorId?: string,
    tx?: TimelineEventWriteContext,
  ): Promise<void>;

  /**
   * Attaches skip metadata to an existing MANUAL TimelineEvent when a
   * system-sourced write would have overwritten it in the same effective
   * window (D2) — never creates a separate timeline row for the skip itself.
   */
  abstract markSystemWriteSkipped(
    manualEventId: string,
    skippedAt: string,
    tx?: TimelineEventWriteContext,
  ): Promise<void>;
}
