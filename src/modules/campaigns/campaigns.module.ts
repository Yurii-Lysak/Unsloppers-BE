import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

/**
 * `campaigns` — Story 10.1: create/list/get/update-while-draft for
 * `FormCampaign`. Story 10.2 adds draft audience save/preview/resolve.
 * Story 10.3 adds activation, which calls C6
 * `ActionItemCreation.createCampaignActionItems` inside the same
 * `prisma.$transaction` as the atomic draft-to-active flip. `ActionItemCreation`
 * is exported by the `@Global()` `ActionItemsModule`, so no explicit import is
 * needed here — `CampaignsService` injects it directly.
 */
@Module({
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
