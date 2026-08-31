import {
  DayApprovalState,
  DayStatus,
  WorkingDay,
} from '../../timetracker/timetracker.types';
import { groupLeavePeriods } from '../leave-period.mapper';

function day(
  date: string,
  dayStatus: DayStatus,
  dayApprovalState: DayApprovalState = DayApprovalState.Approved,
): WorkingDay {
  return {
    date,
    projectId: 1,
    projectUniqueName: 'p',
    project: 'Project',
    hours: 0,
    hoursForCustomer: 0,
    overtime: 0,
    overtimeRate: 0,
    outOfScope: 0,
    dayStatus,
    dayApprovalState,
  };
}

describe('groupLeavePeriods', () => {
  it('groups consecutive vacation days into one period', () => {
    const periods = groupLeavePeriods([
      day('2026-08-25', DayStatus.Vacation),
      day('2026-08-26', DayStatus.Vacation),
      day('2026-08-27', DayStatus.Vacation),
      day('2026-08-28', DayStatus.Vacation),
      day('2026-08-29', DayStatus.Vacation),
    ]);

    expect(periods).toEqual([
      {
        type: 'vacation',
        startDate: '2026-08-25',
        endDate: '2026-08-29',
        approvalState: 'approved',
      },
    ]);
  });

  it('ignores non-leave day statuses', () => {
    const periods = groupLeavePeriods([
      day('2026-08-25', DayStatus.WorkingDay),
      day('2026-08-26', DayStatus.Weekend),
    ]);

    expect(periods).toEqual([]);
  });

  it('splits periods when leave type or approval changes', () => {
    const periods = groupLeavePeriods([
      day('2026-08-25', DayStatus.Vacation),
      day('2026-08-26', DayStatus.Sick),
      day('2026-08-27', DayStatus.Sick, DayApprovalState.PendingApproval),
    ]);

    expect(periods).toEqual([
      {
        type: 'vacation',
        startDate: '2026-08-25',
        endDate: '2026-08-25',
        approvalState: 'approved',
      },
      {
        type: 'sick',
        startDate: '2026-08-26',
        endDate: '2026-08-26',
        approvalState: 'approved',
      },
      {
        type: 'sick',
        startDate: '2026-08-27',
        endDate: '2026-08-27',
        approvalState: 'pending_approval',
      },
    ]);
  });
});
