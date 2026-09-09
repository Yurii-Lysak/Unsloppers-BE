import { Module } from '@nestjs/common';
import { CdsSectionProvider } from './cds-section.provider';
import { CdsService } from './cds.service';
import { IdpRecordsController } from './idp-records.controller';

@Module({
  controllers: [IdpRecordsController],
  providers: [CdsService, CdsSectionProvider],
  exports: [CdsService],
})
export class CdsModule {}
