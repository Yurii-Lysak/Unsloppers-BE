import { Global, Module } from '@nestjs/common';
import { ExternalIdentityMapping } from '../contracts/external-identity-mapping.contract';
import { EmployeeListLeavesReader } from '../contracts/employee-list-leaves.contract';
import { ExternalIdentityMappingService } from './external-identity-mapping.service';
import { EmployeeListLeavesService } from './employee-list-leaves.service';
import { LeaveDashboardSummaryProvider } from './leave-dashboard-summary.provider';
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
    EmployeeListLeavesService,
    LeaveDashboardSummaryProvider,
    {
      provide: EmployeeListLeavesReader,
      useExisting: EmployeeListLeavesService,
    },
    ProjectAssignmentMapper,
    ProjectsSyncService,
    ProjectsSyncScheduler,
  ],
  exports: [
    ExternalIdentityMapping,
    LeavesSectionProvider,
    LeavesSyncService,
    EmployeeListLeavesReader,
    ProjectsSyncService,
  ],
})
export class IntegrationsModule {}
