import { Module } from '@nestjs/common';
import { ResourcingController } from './resourcing.controller';
import { ResourcingDashboardSummaryProvider } from './resourcing-dashboard-summary.provider';
import { ResourcingService } from './resourcing.service';

/**
 * `resourcing` — Story 6.1: create/list `ResourcingRequest` rows gated by
 * `CREATE_RESOURCING_REQUESTS`. Story 6.2 adds UM fulfilment (assigned list,
 * detail, proposals, submit) gated by `FULFIL_RESOURCING_REQUESTS`. Depends
 * only on global `ContractsModule`/`PrismaModule` patterns — injects C8
 * `PermissionChecker`, C12 `DepartmentDirectory`, C3 `ProjectAssignment`
 * (via Prisma reads in the service), and `CurrentUserProvider`; never
 * imports other feature modules (including `access`, which implements C12).
 */
@Module({
  controllers: [ResourcingController],
  providers: [ResourcingService, ResourcingDashboardSummaryProvider],
  exports: [ResourcingService],
})
export class ResourcingModule {}
