import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardSummaryProvider } from '../contracts/dashboard-summary-provider.contract';
import type { DashboardSummaryScope } from '../contracts/dashboard-summary.types';
import { RegisterProvider } from '../registry/register-provider.decorator';

@Injectable()
@RegisterProvider('dashboard-summary', 'campaigns')
export class CampaignsDashboardSummaryProvider extends DashboardSummaryProvider {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async getSummary(viewerEmployeeId: string, scope?: DashboardSummaryScope) {
    void scope;

    try {
      const openCount = await this.prisma.formCampaign.count({
        where: {
          creatorId: viewerEmployeeId,
          status: 'active',
        },
      });

      return {
        providerId: 'campaigns' as const,
        status: 'available' as const,
        openCount,
      };
    } catch {
      return { providerId: 'campaigns', status: 'unavailable' as const };
    }
  }
}
