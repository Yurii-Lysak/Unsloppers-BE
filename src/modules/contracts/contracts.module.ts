import { Global, Module } from '@nestjs/common';
import { FieldRegistry } from './field-registry.contract';
import { FieldRegistryStub } from './stubs/field-registry.stub';

/**
 * `contracts` — C1-C8 abstract-class DI tokens, each bound to a Wave-0 stub
 * (AD-2). @Global() so every feature module can inject a token without
 * importing this module explicitly; providers are still listed in `exports`
 * because @Global() alone does not make them injectable elsewhere.
 *
 * C1 `AccessResolver`, C3 `ProjectAssignment`, and C8 `PermissionChecker` are
 * deliberately left unbound here — the `access` module implements them
 * directly (Stories 1.1, 1.2, 1.4), mirroring how C7 `CurrentUserProvider` is
 * left for `auth` to implement.
 *
 * C4 `TimelineEventWriter` is left unbound for the `timeline` module (Story 7.1).
 *
 * C6 `ActionItemCreation` is left unbound for the `action-items` module (Story 4.1).
 *
 * C5 `ExternalIdentityMapping` is left for `integrations` to implement
 * (Story 13.1), mirroring the C1/C4 moves above.
 *
 * This module is a deliberate, recognized exception to `nest-modules.md`'s
 * standard module anatomy — no controller, no DTO/entities/swagger folder.
 * Do not "fix" it to match `users`.
 */
@Global()
@Module({
  providers: [{ provide: FieldRegistry, useClass: FieldRegistryStub }],
  exports: [FieldRegistry],
})
export class ContractsModule {}
