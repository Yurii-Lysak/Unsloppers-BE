import { Injectable } from '@nestjs/common';

/**
 * The single injection point for "what time is it".
 *
 * Several requirements are time-dependent — the project-assignment freshness
 * window, shared-link expiry, action-item overdue state, and assessment
 * recency. Read against the wall clock, none of them can be tested
 * deterministically: a test either sleeps, or narrows a config window until it
 * verifies less than it appears to. Application code therefore takes the time
 * from here and never calls `new Date()` or `Date.now()` directly, so a test
 * can substitute `FixedClock` and move time on purpose.
 */
export abstract class Clock {
  abstract now(): Date;

  /** Milliseconds since the epoch, for comparisons and arithmetic. */
  abstract nowMs(): number;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }

  nowMs(): number {
    return Date.now();
  }
}
