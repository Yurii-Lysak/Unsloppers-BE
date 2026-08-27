import { Global, Module } from '@nestjs/common';
import { AccessResolver } from './access-resolver.contract';
import { AccessResolverStub } from './stubs/access-resolver.stub';
import { FieldRegistry } from './field-registry.contract';
import { FieldRegistryStub } from './stubs/field-registry.stub';
import { ProjectAssignment } from './project-assignment.contract';
import { ProjectAssignmentStub } from './stubs/project-assignment.stub';
import { TimelineEventWriter } from './timeline-event-writer.contract';
import { TimelineEventWriterStub } from './stubs/timeline-event-writer.stub';
import { ExternalIdentityMapping } from './external-identity-mapping.contract';
import { ExternalIdentityMappingStub } from './stubs/external-identity-mapping.stub';
import { ActionItemCreation } from './action-item-creation.contract';
import { ActionItemCreationStub } from './stubs/action-item-creation.stub';
import { CurrentUserProvider } from './current-user-provider.contract';
import { CurrentUserProviderStub } from './stubs/current-user-provider.stub';
import { PermissionChecker } from './permission-checker.contract';
import { PermissionCheckerStub } from './stubs/permission-checker.stub';

/**
 * `contracts` — C1-C8 abstract-class DI tokens, each bound to a Wave-0 stub
 * (AD-2). @Global() so every feature module can inject a token without
 * importing this module explicitly; providers are still listed in `exports`
 * because @Global() alone does not make them injectable elsewhere.
 *
 * This module is a deliberate, recognized exception to `nest-modules.md`'s
 * standard module anatomy — no controller, no DTO/entities/swagger folder.
 * Do not "fix" it to match `users`.
 */
@Global()
@Module({
  providers: [
    { provide: AccessResolver, useClass: AccessResolverStub },
    { provide: FieldRegistry, useClass: FieldRegistryStub },
    { provide: ProjectAssignment, useClass: ProjectAssignmentStub },
    { provide: TimelineEventWriter, useClass: TimelineEventWriterStub },
    {
      provide: ExternalIdentityMapping,
      useClass: ExternalIdentityMappingStub,
    },
    { provide: ActionItemCreation, useClass: ActionItemCreationStub },
    { provide: CurrentUserProvider, useClass: CurrentUserProviderStub },
    { provide: PermissionChecker, useClass: PermissionCheckerStub },
  ],
  exports: [
    AccessResolver,
    FieldRegistry,
    ProjectAssignment,
    TimelineEventWriter,
    ExternalIdentityMapping,
    ActionItemCreation,
    CurrentUserProvider,
    PermissionChecker,
  ],
})
export class ContractsModule {}
