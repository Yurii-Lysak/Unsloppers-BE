import { Injectable } from '@nestjs/common';
import { Clock } from '../../clock/clock.service';
import { DashboardSummaryProvider } from '../contracts/dashboard-summary-provider.contract';
import { ProjectAssignment } from '../contracts/project-assignment.contract';
import type { ProjectAssignmentDto } from '../contracts/project-assignment.contract';
import type {
  DashboardSummaryScope,
  DashboardTableCellFragment,
} from '../contracts/dashboard-summary.types';
import { RegisterProvider } from '../registry/register-provider.decorator';

const CONFIRMATION_FRESHNESS_WINDOW_MS = 4 * 60 * 60 * 1000;

@Injectable()
@RegisterProvider('dashboard-summary', 'employment')
export class EmploymentDashboardSummaryProvider extends DashboardSummaryProvider {
  constructor(
    private readonly projectAssignment: ProjectAssignment,
    private readonly clock: Clock,
  ) {
    super();
  }

  async getSummary(_viewerEmployeeId: string, scope?: DashboardSummaryScope) {
    const subjectIds = scope?.subjectIds ?? [];

    if (subjectIds.length === 0) {
      return {
        providerId: 'employment' as const,
        status: 'available' as const,
        cells: {},
      };
    }

    try {
      const cells: Record<string, DashboardTableCellFragment> = {};

      for (const employeeId of subjectIds) {
        const assignments =
          await this.projectAssignment.listByEmployee(employeeId);

        const activeAssignments = assignments.filter((row) =>
          this.isAssignmentCurrentlyActive(row),
        );

        const freshAssignments = activeAssignments.filter((row) =>
          this.isAssignmentFresh(row),
        );

        const displayAssignments =
          freshAssignments.length > 0 ? freshAssignments : activeAssignments;

        const value =
          displayAssignments.length === 0
            ? ''
            : displayAssignments.map((row) => row.projectId).join(', ');

        cells[employeeId] = {
          value,
          unavailable: false,
          stale: activeAssignments.length > 0 && freshAssignments.length === 0,
        };
      }

      return {
        providerId: 'employment' as const,
        status: 'available' as const,
        cells,
      };
    } catch {
      return { providerId: 'employment', status: 'unavailable' as const };
    }
  }

  private isAssignmentFresh(row: ProjectAssignmentDto): boolean {
    if (!row.confirmed || !row.confirmedAt) {
      return false;
    }

    const nowMs = this.clock.now().getTime();
    const confirmedAtMs = new Date(row.confirmedAt).getTime();

    if (Number.isNaN(confirmedAtMs)) {
      return false;
    }

    if (confirmedAtMs > nowMs) {
      return false;
    }

    return nowMs - confirmedAtMs <= CONFIRMATION_FRESHNESS_WINDOW_MS;
  }

  private isAssignmentCurrentlyActive(row: ProjectAssignmentDto): boolean {
    const now = this.clock.now();
    const nowDateMs = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );

    const startMs = new Date(row.startDate).getTime();

    if (Number.isNaN(startMs) || startMs > nowDateMs) {
      return false;
    }

    if (row.endDate) {
      const endMs = new Date(row.endDate).getTime();

      if (!Number.isNaN(endMs) && endMs < nowDateMs) {
        return false;
      }
    }

    return true;
  }
}
