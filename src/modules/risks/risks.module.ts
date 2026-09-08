import { Module } from '@nestjs/common';
import { RisksController } from './risks.controller';
import { RisksDashboardController } from './risks-dashboard.controller';
import { RisksDashboardService } from './risks-dashboard.service';
import { RisksDashboardSummaryProvider } from './risks-dashboard-summary.provider';
import { RisksSectionProvider } from './risks-section.provider';
import { RisksService } from './risks.service';

@Module({
  controllers: [RisksController, RisksDashboardController],
  providers: [
    RisksService,
    RisksSectionProvider,
    RisksDashboardService,
    RisksDashboardSummaryProvider,
  ],
  exports: [RisksService, RisksDashboardService],
})
export class RisksModule {}
