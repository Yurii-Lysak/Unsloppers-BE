import { Global, Module } from '@nestjs/common';
import { FieldRegistry } from './field-registry.contract';
import { FieldRegistryStub } from './stubs/field-registry.stub';
import { TimelineEventWriter } from './timeline-event-writer.contract';
import { TimelineEventWriterStub } from './stubs/timeline-event-writer.stub';
import { ExternalIdentityMapping } from './external-identity-mapping.contract';
import { ExternalIdentityMappingStub } from './stubs/external-identity-mapping.stub';
import { ActionItemCreation } from './action-item-creation.contract';
import { ActionItemCreationStub } from './stubs/action-item-creation.stub';
import { PermissionChecker } from './permission-checker.contract';
import { PermissionCheckerStub } from './stubs/permission-checker.stub';

/**
 * `contracts` — C1-C8 abstract-class DI tokens, each bound to a Wave-0 stub
 * (AD-2). @Global() so every feature module can inject a token without
 * importing this module explicitly; providers are still listed in `exports`
 * because @Global() alone does not make them injectable elsewhere.
 *
 * C1 `AccessResolver` is deliberately left unbound here — the `access`
 * module implements it directly (Story 1.1), mirroring how C7
 * `CurrentUserProvider` is left for `auth` to implement.
 *
 * C3 `ProjectAssignment` is likewise left unbound as of Story 1.2 — the
 * `access` module implements it directly (its CAP-1-owner per
 * `interface-contracts.md`), mirroring the C1 move above.
 *
 * This module is a deliberate, recognized exception to `nest-modules.md`'s
 * standard module anatomy — no controller, no DTO/entities/swagger folder.
 * Do not "fix" it to match `users`.
 */
@Global()
@Module({
  providers: [
    { provide: FieldRegistry, useClass: FieldRegistryStub },
    { provide: TimelineEventWriter, useClass: TimelineEventWriterStub },
    {
      provide: ExternalIdentityMapping,
      useClass: ExternalIdentityMappingStub,
    },
    { provide: ActionItemCreation, useClass: ActionItemCreationStub },
    { provide: PermissionChecker, useClass: PermissionCheckerStub },
  ],
  exports: [
    FieldRegistry,
    TimelineEventWriter,
    ExternalIdentityMapping,
    ActionItemCreation,
    PermissionChecker,
  ],
})
export class ContractsModule {}
