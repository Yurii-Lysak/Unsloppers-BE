import { applyDecorators, SetMetadata } from '@nestjs/common';

/**
 * The three provider families the registry indexes (AD-3). `id` uniqueness
 * is scoped per-family — two providers may share an `id` under different
 * `family` values without colliding.
 */
export type ProviderFamily = 'section' | 'field' | 'dashboard-summary';

export const REGISTER_PROVIDER_FAMILY = Symbol('registry:provider-family');
export const REGISTER_PROVIDER_ID = Symbol('registry:provider-id');

/**
 * Marks a class as discoverable by `ProviderRegistryService` under
 * `(family, id)`. The decorated class MUST stay Nest's DEFAULT scope —
 * `DiscoveryService` cannot statically enumerate REQUEST/TRANSIENT-scoped
 * providers, so a scoped provider would be silently missing from the
 * registry.
 */
export const RegisterProvider = (
  family: ProviderFamily,
  id: string,
): ClassDecorator =>
  applyDecorators(
    SetMetadata(REGISTER_PROVIDER_FAMILY, family),
    SetMetadata(REGISTER_PROVIDER_ID, id),
  );
