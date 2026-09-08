import { ForbiddenException, Injectable } from '@nestjs/common';
import type { DashboardSummaryScope } from '../contracts/dashboard-summary.types';
import { DashboardSummaryProvider } from '../contracts/dashboard-summary-provider.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { RisksDashboardService } from './risks-dashboard.service';

@Injectable()
@RegisterProvider('dashboard-summary', 'risks')
export class RisksDashboardSummaryProvider extends DashboardSummaryProvider {
  constructor(private readonly dashboard: RisksDashboardService) {
    super();
  }

  async getSummary(viewerEmployeeId: string, scope?: DashboardSummaryScope) {
    if (scope?.subjectIds) {
      try {
        const data = await this.dashboard.getScopedData(
          viewerEmployeeId,
          scope.subjectIds,
        );
        return {
          providerId: 'risks' as const,
          status: 'available' as const,
          counts: data.counts,
          rows: data.rows,
        };
      } catch {
        return { providerId: 'risks', status: 'unavailable' as const };
      }
    }

    try {
      const access = await this.dashboard.getAccess(viewerEmployeeId);
      if (!access.canAccess) {
        throw new ForbiddenException(
          'Risk dashboard summary is not accessible',
        );
      }
      const summary = await this.dashboard.getSummary(viewerEmployeeId);
      return {
        providerId: 'risks' as const,
        status: 'available' as const,
        counts: summary.counts,
        rows: [],
      };
    } catch {
      return { providerId: 'risks', status: 'unavailable' as const };
    }
  }
}
