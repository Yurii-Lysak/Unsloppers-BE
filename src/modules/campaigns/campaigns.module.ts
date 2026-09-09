import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsDashboardSummaryProvider } from './campaigns-dashboard-summary.provider';
import { CampaignsService } from './campaigns.service';

/**
 * `campaigns` — Story 10.1: create/list/get/update-while-draft for
 * `FormCampaign`. Story 10.2 adds draft audience save/preview/resolve.
 * Story 10.3 adds activation, which calls C6
 * `ActionItemCreation.createCampaignActionItems` inside the same
 * `prisma.$transaction` as the atomic draft-to-active flip. Story 10.4 adds
 * creator-scoped completion read (`GET :campaignId/completion`) over the
 * campaign's action items. `ActionItemCreation`
 * is exported by the `@Global()` `ActionItemsModule`, so no explicit import is
 * needed here — `CampaignsService` injects it directly.
 */
@Module({
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignsDashboardSummaryProvider],
  exports: [CampaignsService],
})
export class CampaignsModule {}
