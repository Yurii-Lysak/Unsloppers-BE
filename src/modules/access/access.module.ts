import { Global, Module } from '@nestjs/common';
import { AccessResolver } from '../contracts/access-resolver.contract';
import { AccessResolverService } from './access-resolver.service';
import { ProjectAssignment } from '../contracts/project-assignment.contract';
import { ProjectAssignmentService } from './project-assignment.service';
import { PeoplePartnerAssignmentService } from './people-partner-assignment.service';

/**
 * `access` — implements C1 `AccessResolver` for real, taking over the DI
 * token that `contracts` deliberately leaves unbound (mirroring how C7
 * `CurrentUserProvider` is left for `auth` to implement). @Global() so every
 * feature module can inject `AccessResolver` without importing this module
 * explicitly; still exported because @Global() alone does not make it
 * injectable elsewhere.
 *
 * Story 1.2 — also implements C3 `ProjectAssignment` for real, unbinding it
 * from `ContractsModule`'s Wave-0 stub (`access` is C3's owner per
 * `interface-contracts.md`), mirroring Story 1.1's C1 move above.
 *
 * Story 1.3 — `PeoplePartnerAssignmentService` is the internal write path for
 * `Employee.peoplePartnerId`; PP resolution lives in `AccessResolverService`.
 *
 * Deliberate, recognized exception to `nest-modules.md`'s standard module
 * anatomy — no controller, no DTO/entities/swagger folder, mirroring
 * `registry.module.ts`. Do not "fix" it to match `users`.
 */
@Global()
@Module({
  providers: [
    { provide: AccessResolver, useClass: AccessResolverService },
    { provide: ProjectAssignment, useClass: ProjectAssignmentService },
    PeoplePartnerAssignmentService,
  ],
  exports: [AccessResolver, ProjectAssignment, PeoplePartnerAssignmentService],
})
export class AccessModule {}
