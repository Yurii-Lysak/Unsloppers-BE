import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import {
  ProviderFamily,
  REGISTER_PROVIDER_FAMILY,
  REGISTER_PROVIDER_ID,
} from './register-provider.decorator';

/**
 * `registry.get()` never returns `undefined` — a caller always branches on
 * `status` instead of a possibly-missing value. This is the ratified reading
 * of AD-3's "runtime error at first call" wording (see the spec's Design
 * Notes / Spec Change Log): "unavailable" is a first-class, renderable state.
 */
export type RegistryLookupResult<T = unknown> =
  { status: 'available'; provider: T } | { status: 'unavailable' };

/**
 * `registry` — indexes every `@RegisterProvider(family, id)`-decorated
 * provider at application bootstrap via `DiscoveryService`, so
 * `access`/`directory`/`dashboards` can read cross-module data (AD-3)
 * without a direct import of the owning feature module (AD-1).
 */
@Injectable()
export class ProviderRegistryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProviderRegistryService.name);
  private readonly index = new Map<ProviderFamily, Map<string, unknown>>();

  constructor(private readonly discoveryService: DiscoveryService) {}

  onApplicationBootstrap(): void {
    const wrappers = this.discoveryService.getProviders();
    // "family::id" -> class names that claimed this key, for collision reporting.
    const claimants = new Map<string, string[]>();

    for (const wrapper of wrappers) {
      const metatype: unknown = wrapper.metatype;
      if (!metatype || typeof metatype !== 'function') {
        continue;
      }

      // Reflect.getOwnMetadata (never Reflector.get / Reflect.getMetadata,
      // which walk the prototype chain) so a plain subclass of a decorated
      // class is never silently registered under its parent's (family, id).
      const family = Reflect.getOwnMetadata(
        REGISTER_PROVIDER_FAMILY,
        metatype,
      ) as ProviderFamily | undefined;
      const id = Reflect.getOwnMetadata(REGISTER_PROVIDER_ID, metatype) as
        string | undefined;

      if (family === undefined && id === undefined) {
        continue; // not decorated at all — the common, expected case
      }

      const className = metatype.name;
      if (!family || !id) {
        // Decorated but with an invalid (e.g. empty-string) family/id — a
        // silent skip here would be exactly the "leak-shaped omission" this
        // registry exists to prevent, so it fails bootstrap loudly instead.
        throw new Error(
          `ProviderRegistryService: ${className} is decorated with @RegisterProvider but has an invalid (family, id) pair (family="${String(family)}", id="${String(id)}")`,
        );
      }

      if (!wrapper.isDependencyTreeStatic()) {
        // A REQUEST/TRANSIENT-scoped provider still has a (placeholder,
        // pre-request) `wrapper.instance` at this point, so checking for a
        // missing instance would never catch this — `isDependencyTreeStatic()`
        // is the actual, Nest-documented signal that a provider isn't a
        // stable DEFAULT-scope singleton (see register-provider.decorator.ts's
        // DEFAULT-scope requirement).
        throw new Error(
          `ProviderRegistryService: ${className} is decorated with @RegisterProvider(family="${family}", id="${id}") but is not DEFAULT-scoped — REQUEST/TRANSIENT-scoped providers cannot be statically discovered`,
        );
      }

      const instance: unknown = wrapper.instance;
      const key = `${family}::${id}`;
      const existing = claimants.get(key);
      if (existing) {
        existing.push(className);
        continue;
      }
      claimants.set(key, [className]);

      if (!this.index.has(family)) {
        this.index.set(family, new Map());
      }
      this.index.get(family)!.set(id, instance);
    }

    const collisions = [...claimants.entries()].filter(
      ([, names]) => names.length > 1,
    );
    if (collisions.length > 0) {
      const details = collisions
        .map(([key, names]) => {
          const [family, id] = key.split('::');
          return `(family="${family}", id="${id}"): ${names.join(', ')}`;
        })
        .join('; ');
      throw new Error(
        `ProviderRegistryService: duplicate (family, id) registration(s) detected — ${details}`,
      );
    }

    this.logger.log(
      `Indexed ${[...claimants.keys()].length} provider(s) across ${this.index.size} famil${this.index.size === 1 ? 'y' : 'ies'}`,
    );
  }

  /**
   * Never returns `undefined` — callers must branch on `status`. Returns
   * `{status:'unavailable'}` for a `(family, id)` with no registered
   * provider, rendered by the frontend as an explicit "temporarily
   * unavailable" state (AD-3) rather than a silent, leak-shaped omission.
   */
  get<T = unknown>(
    family: ProviderFamily,
    id: string,
  ): RegistryLookupResult<T> {
    const provider = this.index.get(family)?.get(id);
    if (provider === undefined) {
      return { status: 'unavailable' };
    }
    return { status: 'available', provider: provider as T };
  }
}
