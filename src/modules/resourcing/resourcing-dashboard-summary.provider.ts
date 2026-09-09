import { Injectable } from '@nestjs/common';
import { DashboardSummaryProvider } from '../contracts/dashboard-summary-provider.contract';
import type { DashboardSummaryScope } from '../contracts/dashboard-summary.types';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { ResourcingService } from './resourcing.service';

@Injectable()
@RegisterProvider('dashboard-summary', 'resourcing')
export class ResourcingDashboardSummaryProvider extends DashboardSummaryProvider {
  constructor(private readonly resourcing: ResourcingService) {
    super();
  }

  async getSummary(viewerEmployeeId: string, scope?: DashboardSummaryScope) {
    void scope;

    try {
      const requests = await this.resourcing.listAssigned(viewerEmployeeId);
      const openCount = requests.filter(
        (request) => request.status === 'open',
      ).length;

      return {
        providerId: 'resourcing' as const,
        status: 'available' as const,
        openCount,
      };
    } catch {
      return { providerId: 'resourcing', status: 'unavailable' as const };
    }
  }
}
