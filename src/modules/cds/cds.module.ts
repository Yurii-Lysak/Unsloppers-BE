import { Module } from '@nestjs/common';
import { CdsSectionProvider } from './cds-section.provider';
import { CdsService } from './cds.service';

@Module({
  providers: [CdsService, CdsSectionProvider],
  exports: [CdsService],
})
export class CdsModule {}
