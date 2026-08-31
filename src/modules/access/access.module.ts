import { Global, Module } from '@nestjs/common';
import { AccessResolver } from '../contracts/access-resolver.contract';
import { AccessResolverService } from './access-resolver.service';

/**
 * `access` — implements C1 `AccessResolver` for real, taking over the DI
 * token that `contracts` deliberately leaves unbound (mirroring how C7
 * `CurrentUserProvider` is left for `auth` to implement). @Global() so every
 * feature module can inject `AccessResolver` without importing this module
 * explicitly; still exported because @Global() alone does not make it
 * injectable elsewhere.
 *
 * Deliberate, recognized exception to `nest-modules.md`'s standard module
 * anatomy — no controller, no DTO/entities/swagger folder, mirroring
 * `registry.module.ts`. Do not "fix" it to match `users`.
 */
@Global()
@Module({
  providers: [{ provide: AccessResolver, useClass: AccessResolverService }],
  exports: [AccessResolver],
})
export class AccessModule {}
