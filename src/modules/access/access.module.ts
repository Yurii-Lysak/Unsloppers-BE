import { Global, Module } from '@nestjs/common';
import { PermissionChecker } from '../contracts/permission-checker.contract';
import { AccessResolver } from '../contracts/access-resolver.contract';
import { SectionAccessGate } from '../contracts/section-access-gate.contract';
import { AccessResolverService } from './access-resolver.service';
import { ProjectAssignment } from '../contracts/project-assignment.contract';
import { ProjectAssignmentService } from './project-assignment.service';
import { PeoplePartnerAssignmentService } from './people-partner-assignment.service';
import { PermissionCheckerService } from './permission-checker.service';
import { FunctionalRoleService } from './functional-role.service';
import { FunctionalRoleAssignmentService } from './functional-role-assignment.service';
import {
  FunctionalRolesController,
  PermissionsCatalogController,
} from './functional-roles.controller';
import { EmployeeFunctionalRolesController } from './employee-functional-roles.controller';
import { ProfileController } from './profile.controller';
import { SharedLinkController } from './shared-link.controller';
import { ProfileAssemblerService } from './profile-assembler.service';
import { SharedLinkService } from './shared-link.service';
import { IdentitySectionProvider } from './identity-section.provider';
import { ProjectsSectionProvider } from './projects-section.provider';
import { SectionAccessGateService } from './section-access-gate.service';

/**
 * `access` — implements C1 `AccessResolver`, C3 `ProjectAssignment`, and C8
 * `PermissionChecker` for real, taking over DI tokens that `contracts`
 * deliberately leaves unbound. @Global() so every feature module can inject
 * these tokens without importing this module explicitly.
 *
 * Story 1.3 — `PeoplePartnerAssignmentService` is the internal write path for
 * `Employee.peoplePartnerId`; PP resolution lives in `AccessResolverService`.
 *
 * Story 1.4 — functional roles, permissions, and the admin REST surface
 * (`FunctionalRolesController`, `PermissionsCatalogController`). First
 * controllers in this module — deliberate exception to the no-controller note
 * in older stories; DTOs/entities/swagger follow `nest-modules.md`.
 */
@Global()
@Module({
  controllers: [
    FunctionalRolesController,
    PermissionsCatalogController,
    EmployeeFunctionalRolesController,
    ProfileController,
    SharedLinkController,
  ],
  providers: [
    { provide: AccessResolver, useClass: AccessResolverService },
    { provide: ProjectAssignment, useClass: ProjectAssignmentService },
    { provide: PermissionChecker, useClass: PermissionCheckerService },
    PeoplePartnerAssignmentService,
    FunctionalRoleService,
    FunctionalRoleAssignmentService,
    ProfileAssemblerService,
    SharedLinkService,
    IdentitySectionProvider,
    ProjectsSectionProvider,
    { provide: SectionAccessGate, useClass: SectionAccessGateService },
  ],
  exports: [
    AccessResolver,
    ProjectAssignment,
    PermissionChecker,
    PeoplePartnerAssignmentService,
    FunctionalRoleAssignmentService,
    ProfileAssemblerService,
    SectionAccessGate,
  ],
})
export class AccessModule {}
