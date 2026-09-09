import { Injectable } from '@nestjs/common';
import { DashboardSummaryProvider } from '../contracts/dashboard-summary-provider.contract';
import { EmployeeListLeavesReader } from '../contracts/employee-list-leaves.contract';
import type {
  DashboardSummaryScope,
  DashboardTableCellFragment,
} from '../contracts/dashboard-summary.types';
import { RegisterProvider } from '../registry/register-provider.decorator';

@Injectable()
@RegisterProvider('dashboard-summary', 'leave')
export class LeaveDashboardSummaryProvider extends DashboardSummaryProvider {
  constructor(private readonly leavesReader: EmployeeListLeavesReader) {
    super();
  }

  async getSummary(_viewerEmployeeId: string, scope?: DashboardSummaryScope) {
    const subjectIds = scope?.subjectIds ?? [];
    if (subjectIds.length === 0) {
      return {
        providerId: 'leave' as const,
        status: 'available' as const,
        cells: {},
      };
    }

    try {
      const cells: Record<string, DashboardTableCellFragment> = {};
      for (const employeeId of subjectIds) {
        const cell = await this.leavesReader.formatListCell(employeeId, false);
        cells[employeeId] = {
          value: cell.value,
          unavailable: cell.unavailable,
          stale: cell.stale ?? false,
        };
      }

      return {
        providerId: 'leave' as const,
        status: 'available' as const,
        cells,
      };
    } catch {
      return { providerId: 'leave', status: 'unavailable' as const };
    }
  }
}
