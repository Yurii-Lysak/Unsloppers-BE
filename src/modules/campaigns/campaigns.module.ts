import { Module } from '@nestjs/common';
import { DirectoryModule } from '../directory/directory.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

/**
 * `campaigns` — Story 10.1: create/list/get/update-while-draft for
 * `FormCampaign`. Story 10.2 adds draft audience save/preview/resolve.
 * Activation (10.3, which calls C6 `ActionItemCreation.createCampaignActionItems`)
 * extends this module later.
 */
@Module({
  imports: [DirectoryModule],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
