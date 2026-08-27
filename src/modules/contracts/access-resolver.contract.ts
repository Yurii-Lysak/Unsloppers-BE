/**
 * C1 — AccessResolver
 *
 * Resolves what a viewer may see about a subject's profile. This is one of
 * the two security-relevant contracts in this module (with C8
 * PermissionChecker) — a real implementation must never default to a
 * permissive grant, and neither may any stub standing in for it.
 *
 * Owner (real implementation): `access` module.
 */

/** Profile sections S1-S16, per ARCHITECTURE-SPINE.md / access-model.md. */
export type SectionId =
  | 'S1'
  | 'S2'
  | 'S3'
  | 'S4'
  | 'S5'
  | 'S6'
  | 'S7'
  | 'S8'
  | 'S9'
  | 'S10'
  | 'S11'
  | 'S12'
  | 'S13'
  | 'S14'
  | 'S15'
  | 'S16';

export type SectionAccessLevel = 'R' | 'RW' | 'none';

/** Access roles, derived from hierarchy/assignment — never assigned directly. */
export type AccessRole =
  'Self' | 'ManagerLine' | 'PP' | 'Colleague' | 'SharedLink' | 'HRAdmin';

export interface ResolvedAudience {
  role: AccessRole;
  /**
   * Plain-JSON-serializable Record — never a `Map` once this crosses an HTTP
   * boundary (AD-2). In-process composition may use a `Map` internally, but
   * this contract's return type is already the wire-safe shape.
   */
  sections: Record<SectionId, SectionAccessLevel>;
}

export abstract class AccessResolver {
  abstract resolveAudience(
    viewerId: string,
    subjectId: string,
  ): Promise<ResolvedAudience>;
}
