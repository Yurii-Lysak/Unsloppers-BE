import { ResolvedAudience } from './access-resolver.contract';

/**
 * AD-3 section provider — one implementation per S1–S16 owning module,
 * discovered via `@RegisterProvider('section', 'Sx')`.
 *
 * When called from `ProfileAssemblerService`, `audience` is always supplied
 * (C1 resolved once upstream). Dev-only direct routes may omit it; providers
 * then resolve C1 locally.
 */
export abstract class SectionProvider {
  abstract getSection(
    viewerId: string,
    subjectId: string,
    audience?: ResolvedAudience,
  ): Promise<unknown>;
}
