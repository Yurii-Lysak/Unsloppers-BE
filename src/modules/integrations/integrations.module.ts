import { Global, Module } from '@nestjs/common';
import { ExternalIdentityMapping } from '../contracts/external-identity-mapping.contract';
import { TimetrackerModule } from '../timetracker/timetracker.module';
import { ExternalIdentityMappingService } from './external-identity-mapping.service';
import { LeavesController } from './leaves.controller';
import { LeavesSectionProvider } from './leaves-section.provider';
import { LeavesSyncService } from './leaves-sync.service';

/**
 * `integrations` — Epic 13 external feeds. Story 13.1 owns C5 and the S10
 * section provider; Story 13.2 adds the C3 writer here.
 */
@Global()
@Module({
  imports: [TimetrackerModule],
  controllers: [LeavesController],
  providers: [
    ExternalIdentityMappingService,
    {
      provide: ExternalIdentityMapping,
      useExisting: ExternalIdentityMappingService,
    },
    LeavesSyncService,
    LeavesSectionProvider,
  ],
  exports: [ExternalIdentityMapping, LeavesSectionProvider, LeavesSyncService],
})
export class IntegrationsModule {}
