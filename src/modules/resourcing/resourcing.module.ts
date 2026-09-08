import { Module } from '@nestjs/common';
import { ResourcingController } from './resourcing.controller';
import { ResourcingService } from './resourcing.service';

/**
 * `resourcing` — Story 6.1: create/list `ResourcingRequest` rows gated by
 * `CREATE_RESOURCING_REQUESTS`. Depends only on global `ContractsModule` /
 * `PrismaModule` patterns — injects C8 `PermissionChecker`, C3
 * `ProjectAssignment` (via Prisma reads in the service), and
 * `CurrentUserProvider`; never imports other feature modules.
 */
@Module({
  controllers: [ResourcingController],
  providers: [ResourcingService],
  exports: [ResourcingService],
})
export class ResourcingModule {}
