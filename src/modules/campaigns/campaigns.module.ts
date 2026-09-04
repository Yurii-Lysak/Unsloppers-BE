import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

/**
 * `campaigns` — Story 10.1: create/list/get/update-while-draft for
 * `FormCampaign`. Audience building (10.2) and activation (10.3, which calls
 * C6 `ActionItemCreation.createCampaignActionItems`) extend this module later.
 */
@Module({
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
