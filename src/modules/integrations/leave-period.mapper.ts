import {
  DayApprovalState,
  DayStatus,
  WorkingDay,
} from '../timetracker/timetracker.types';

/** Wire-safe leave type slugs derived from TimeTracker `DayStatus`. */
export type LeaveTypeSlug =
  'vacation' | 'unpaid_leave' | 'sick' | 'one_day_sick' | 'compensated_day_off';

export type LeaveApprovalSlug =
  'no_approval_needed' | 'pending_approval' | 'approved' | 'unknown';

export interface NormalizedLeavePeriod {
  type: LeaveTypeSlug;
  startDate: string;
  endDate: string;
  approvalState: LeaveApprovalSlug;
}

const LEAVE_DAY_STATUSES: ReadonlyMap<DayStatus, LeaveTypeSlug> = new Map([
  [DayStatus.Vacation, 'vacation'],
  [DayStatus.UnpaidLeave, 'unpaid_leave'],
  [DayStatus.Sick, 'sick'],
  [DayStatus.OneDaySick, 'one_day_sick'],
  [DayStatus.CompensatedDayOff, 'compensated_day_off'],
]);

export function isLeaveDayStatus(status: DayStatus): boolean {
  return LEAVE_DAY_STATUSES.has(status);
}

export function mapDayStatusToLeaveType(
  status: DayStatus,
): LeaveTypeSlug | null {
  return LEAVE_DAY_STATUSES.get(status) ?? null;
}

export function mapApprovalState(
  state: DayApprovalState | null | undefined,
): LeaveApprovalSlug {
  switch (state) {
    case DayApprovalState.NoApprovalNeeded:
      return 'no_approval_needed';
    case DayApprovalState.PendingApproval:
      return 'pending_approval';
    case DayApprovalState.Approved:
      return 'approved';
    default:
      return 'unknown';
  }
}

/**
 * Groups consecutive calendar days sharing the same leave type and approval
 * state into normalized periods (ISO date strings, inclusive bounds).
 */
export function groupLeavePeriods(days: WorkingDay[]): NormalizedLeavePeriod[] {
  const leaveDays = days
    .filter((day) => isLeaveDayStatus(day.dayStatus))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (leaveDays.length === 0) {
    return [];
  }

  const periods: NormalizedLeavePeriod[] = [];
  let currentType = mapDayStatusToLeaveType(leaveDays[0].dayStatus)!;
  let currentApproval = mapApprovalState(leaveDays[0].dayApprovalState);
  let rangeStart = leaveDays[0].date;
  let rangeEnd = leaveDays[0].date;

  for (let index = 1; index < leaveDays.length; index += 1) {
    const day = leaveDays[index];
    const type = mapDayStatusToLeaveType(day.dayStatus)!;
    const approval = mapApprovalState(day.dayApprovalState);
    const previous = leaveDays[index - 1];
    const consecutive =
      nextCalendarDay(previous.date) === day.date &&
      type === currentType &&
      approval === currentApproval;

    if (consecutive) {
      rangeEnd = day.date;
      continue;
    }

    periods.push({
      type: currentType,
      startDate: rangeStart,
      endDate: rangeEnd,
      approvalState: currentApproval,
    });
    currentType = type;
    currentApproval = approval;
    rangeStart = day.date;
    rangeEnd = day.date;
  }

  periods.push({
    type: currentType,
    startDate: rangeStart,
    endDate: rangeEnd,
    approvalState: currentApproval,
  });

  return periods;
}

function nextCalendarDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
