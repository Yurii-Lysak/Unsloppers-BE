import { Injectable } from '@nestjs/common';
import type { User } from '../../generated/prisma/client';
import { Clock } from '../../clock/clock.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardSummaryProvider } from '../contracts/dashboard-summary-provider.contract';
import type { DashboardSummaryScope } from '../contracts/dashboard-summary.types';
import { RegisterProvider } from '../registry/register-provider.decorator';

@Injectable()
@RegisterProvider('dashboard-summary', 'idp')
export class IdpDashboardSummaryProvider extends DashboardSummaryProvider {
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
        providerId: 'idp' as const,
        status: 'available' as const,
        rows: [],
      };
    }

    try {
      const now = this.clock.now();
      const todayMs = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      );
      const windowStart = new Date(todayMs);
      const windowEnd = new Date(todayMs);
      windowEnd.setUTCDate(windowEnd.getUTCDate() + 30);

      const records = await this.prisma.iDPRecord.findMany({
        where: {
          employeeId: { in: subjectIds },
          completedAt: null,
          deadline: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
        orderBy: { deadline: 'asc' },
        select: {
          id: true,
          employeeId: true,
          description: true,
          deadline: true,
          employee: {
            select: {
              user: { select: { name: true, email: true } },
            },
          },
        },
      });

      return {
        providerId: 'idp' as const,
        status: 'available' as const,
        rows: records.map((record) => ({
          id: record.id,
          employeeId: record.employeeId,
          employeeDisplayName: this.displayName(record.employee.user),
          description: record.description,
          deadline: record.deadline.toISOString().slice(0, 10),
        })),
      };
    } catch {
      return { providerId: 'idp', status: 'unavailable' as const };
    }
  }

  private displayName(user: Pick<User, 'name' | 'email'>): string {
    const name = user.name?.trim();
    if (name) {
      return name;
    }
    if (user.email) {
      return user.email;
    }
    return 'Unknown';
  }
}
