import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ProviderRegistryService } from './provider-registry.service';

/**
 * `registry` — depends only on `@nestjs/core`, never a feature module
 * (AD-3). @Global() so every feature module can inject
 * `ProviderRegistryService` without importing this module explicitly;
 * still exported because @Global() alone does not make it injectable
 * elsewhere.
 *
 * Deliberate, recognized exception to `nest-modules.md`'s standard module
 * anatomy — no controller, no DTO/entities/swagger folder. Do not "fix" it
 * to match `users`.
 */
@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [ProviderRegistryService],
  exports: [ProviderRegistryService],
})
export class RegistryModule {}
