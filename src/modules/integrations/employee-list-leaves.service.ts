import { Injectable } from '@nestjs/common';
import { Clock } from '../../clock/clock.service';
import {
  EmployeeListLeaveCell,
  EmployeeListLeavesReader,
} from '../contracts/employee-list-leaves.contract';
import { LeavesSyncService } from './leaves-sync.service';

const LIST_CELL_UNAVAILABLE = 'Temporarily unavailable';

function formatLeaveRanges(
  leaves: Array<{ startDate: string; endDate: string }>,
): string {
  if (leaves.length === 0) {
    return '';
  }
  return leaves
    .map((leave) => `${leave.startDate} – ${leave.endDate}`)
    .join('; ');
}

function isActiveOnDate(
  leave: { startDate: string; endDate: string },
  asOfIsoDate: string,
): boolean {
  return leave.startDate <= asOfIsoDate && leave.endDate >= asOfIsoDate;
}

@Injectable()
export class EmployeeListLeavesService extends EmployeeListLeavesReader {
  constructor(
    private readonly leavesSync: LeavesSyncService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async formatListCell(
    subjectEmployeeId: string,
    hideLeaveType: boolean,
  ): Promise<EmployeeListLeaveCell> {
    void hideLeaveType;
    const result = await this.leavesSync.getLeavesForEmployee(subjectEmployeeId);
    if (result.availability === 'unavailable') {
      return { value: LIST_CELL_UNAVAILABLE, unavailable: true };
    }

    const asOfIsoDate = this.clock.now().toISOString().slice(0, 10);
    const currentLeaves = result.leaves
      .filter((period) => isActiveOnDate(period, asOfIsoDate))
      .map((period) => ({
        startDate: period.startDate,
        endDate: period.endDate,
      }));

    return {
      value: formatLeaveRanges(currentLeaves),
      unavailable: false,
    };
  }
}
