import { Injectable } from '@nestjs/common';
import { Clock } from '../../clock/clock.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardSummaryProvider } from '../contracts/dashboard-summary-provider.contract';
import type { DashboardSummaryScope } from '../contracts/dashboard-summary.types';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { isActionItemOverdue } from './action-item-input';

@Injectable()
@RegisterProvider('dashboard-summary', 'action-items')
export class ActionItemsDashboardSummaryProvider extends DashboardSummaryProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async getSummary(_viewerEmployeeId: string, scope?: DashboardSummaryScope) {
    const subjectIds = scope?.subjectIds ?? [];
    if (subjectIds.length === 0) {
      return {
        providerId: 'action-items' as const,
        status: 'available' as const,
        openCount: 0,
        overdueCount: 0,
      };
    }

    try {
      const items = await this.prisma.actionItem.findMany({
        where: {
          assigneeId: { in: subjectIds },
          status: 'open',
        },
        select: { status: true, dueDate: true },
      });

      let overdueCount = 0;
      for (const item of items) {
        if (isActionItemOverdue(item.status, item.dueDate, this.clock)) {
          overdueCount += 1;
        }
      }

      return {
        providerId: 'action-items' as const,
        status: 'available' as const,
        openCount: items.length,
        overdueCount,
      };
    } catch {
      return { providerId: 'action-items', status: 'unavailable' as const };
    }
  }
}
