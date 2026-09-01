import { Global, Module } from '@nestjs/common';
import { ExternalIdentityMapping } from '../contracts/external-identity-mapping.contract';
import { ExternalIdentityMappingService } from './external-identity-mapping.service';
import { LeavesController } from './leaves.controller';
import { LeavesSectionProvider } from './leaves-section.provider';
import { LeavesSyncService } from './leaves-sync.service';
import { ProjectAssignmentMapper } from './project-assignment.mapper';
import { ProjectsSyncScheduler } from './projects-sync.scheduler';
import { ProjectsSyncService } from './projects-sync.service';

/**
 * `integrations` — Epic 13 external feeds. Story 13.1 owns C5 and the S10
 * section provider; Story 13.2 adds the C3 writer here.
 */
@Global()
@Module({
  controllers: [LeavesController],
  providers: [
    ExternalIdentityMappingService,
    {
      provide: ExternalIdentityMapping,
      useExisting: ExternalIdentityMappingService,
    },
    LeavesSyncService,
    LeavesSectionProvider,
    ProjectAssignmentMapper,
    ProjectsSyncService,
    ProjectsSyncScheduler,
  ],
  exports: [
    ExternalIdentityMapping,
    LeavesSectionProvider,
    LeavesSyncService,
    ProjectsSyncService,
  ],
})
export class IntegrationsModule {}
