import { Clock } from '../clock/clock.service';
import type { ActionItemStatus } from '../modules/contracts/action-item-creation.contract';

export function formatActionItemDueDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** UTC calendar date as epoch ms — ignores time-of-day on the instant. */
export function utcCalendarDateMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Derived overdue flag: open items only, due date strictly before today (UTC).
 * Never stored — recomputed on every read via {@link Clock}.
 */
export function isActionItemOverdue(
  status: ActionItemStatus,
  dueDate: Date,
  clock: Clock,
): boolean {
  if (status !== 'open') {
    return false;
  }
  const todayMs = utcCalendarDateMs(clock.now());
  const dueMs = utcCalendarDateMs(dueDate);
  return dueMs < todayMs;
}
