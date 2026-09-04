import { Module } from '@nestjs/common';
import { RisksController } from './risks.controller';
import { RisksSectionProvider } from './risks-section.provider';
import { RisksService } from './risks.service';

@Module({
  controllers: [RisksController],
  providers: [RisksService, RisksSectionProvider],
  exports: [RisksService],
})
export class RisksModule {}
