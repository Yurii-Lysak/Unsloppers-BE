import { Clock } from '../../src/clock/clock.service';

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * A weekday mid-morning instant in UTC. Fixed on purpose: a test that starts
 * from "now" is a test whose result depends on the day it runs.
 */
export const DEFAULT_TEST_INSTANT = '2026-01-05T09:00:00.000Z';

/**
 * Test substitute for {@link Clock}. Time only moves when a test moves it, so a
 * freshness window, a link expiry, or an overdue threshold can be crossed in a
 * single call instead of waited out.
 */
export class FixedClock extends Clock {
  private current: Date;

  constructor(start: Date | string = DEFAULT_TEST_INSTANT) {
    super();
    this.current = new Date(start);
    this.assertValid(this.current, start);
  }

  now(): Date {
    // A copy, so a caller mutating the result cannot move the clock.
    return new Date(this.current);
  }

  nowMs(): number {
    return this.current.getTime();
  }

  /** Jumps to an absolute instant, forwards or backwards. */
  set(instant: Date | string): void {
    const next = new Date(instant);
    this.assertValid(next, instant);
    this.current = next;
  }

  /** Moves time by a signed offset in milliseconds. */
  advance(ms: number): void {
    if (!Number.isFinite(ms)) {
      throw new TypeError(
        `FixedClock.advance needs a finite offset, got ${ms}`,
      );
    }
    this.current = new Date(this.current.getTime() + ms);
  }

  private assertValid(parsed: Date, input: Date | string): void {
    if (Number.isNaN(parsed.getTime())) {
      throw new TypeError(
        `FixedClock received an invalid instant: ${String(input)}`,
      );
    }
  }
}
