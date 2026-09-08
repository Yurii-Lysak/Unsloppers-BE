import { ForbiddenException, Injectable } from '@nestjs/common';
import { DashboardSummaryProvider } from '../contracts/dashboard-summary-provider.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { RiskDashboardSummaryEntity } from './entities/risk-dashboard.entity';
import { RisksDashboardService } from './risks-dashboard.service';

@Injectable()
@RegisterProvider('dashboard-summary', 'risks')
export class RisksDashboardSummaryProvider extends DashboardSummaryProvider {
  constructor(private readonly dashboard: RisksDashboardService) {
    super();
  }

  async getSummary(
    viewerEmployeeId: string,
  ): Promise<RiskDashboardSummaryEntity> {
    const access = await this.dashboard.getAccess(viewerEmployeeId);
    if (!access.canAccess) {
      throw new ForbiddenException('Risk dashboard summary is not accessible');
    }
    return this.dashboard.getSummary(viewerEmployeeId);
  }
}
