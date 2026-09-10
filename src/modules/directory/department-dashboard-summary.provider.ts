import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardSummaryProvider } from '../contracts/dashboard-summary-provider.contract';
import type {
  DashboardSummaryScope,
  DashboardTableCellFragment,
} from '../contracts/dashboard-summary.types';
import {
  currentHistoryValue,
  type HistoryRowSnapshot,
} from '../contracts/temporal-history.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';

@Injectable()
@RegisterProvider('dashboard-summary', 'department')
export class DepartmentDashboardSummaryProvider extends DashboardSummaryProvider {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async getSummary(_viewerEmployeeId: string, scope?: DashboardSummaryScope) {
    const subjectIds = scope?.subjectIds ?? [];

    if (subjectIds.length === 0) {
      return {
        providerId: 'department' as const,
        status: 'available' as const,
        cells: {},
      };
    }

    try {
      const employees = await this.prisma.employee.findMany({
        where: { id: { in: subjectIds } },
        select: {
          id: true,
          departmentHistory: {
            select: {
              value: true,
              effectiveFrom: true,
              effectiveTo: true,
            },
          },
        },
      });

      const cells: Record<string, DashboardTableCellFragment> = {};
      for (const employee of employees) {
        const department = currentHistoryValue(
          employee.departmentHistory as HistoryRowSnapshot[],
        );
        cells[employee.id] = {
          value: department?.value ?? '',
          unavailable: false,
        };
      }

      return {
        providerId: 'department' as const,
        status: 'available' as const,
        cells,
      };
    } catch {
      return { providerId: 'department', status: 'unavailable' as const };
    }
  }
}
