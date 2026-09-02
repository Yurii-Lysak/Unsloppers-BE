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

/**
 * Access roles, derived from hierarchy/assignment — never assigned directly.
 * Ratified 2026-08-26 set (ARCHITECTURE-SPINE.md AD-2).
 */
export type AccessRole =
  | 'Self'
  | 'ReportingLine'
  | 'ProjectLine'
  | 'PP'
  | 'Colleague'
  | 'SharedLink'
  | 'FullAccess';

export interface ResolvedAudience {
  role: AccessRole;
  /**
   * Plain-JSON-serializable Record — never a `Map` once this crosses an HTTP
   * boundary (AD-2). In-process composition may use a `Map` internally, but
   * this contract's return type is already the wire-safe shape.
   */
  sections: Record<SectionId, SectionAccessLevel>;
}

/**
 * `access-model.md` Rule 4 — Colleague whitelist (S1, S10, S11 — see the S16
 * exception below).
 *
 * S16 is a narrow, documented exception (CAP-2 / Story 1.10): the section
 * itself is granted `'R'` so a Colleague can reach per-field filtering, but
 * no field is actually visible unless its own visibility is `'colleague'` —
 * `CustomFieldVisibilityService` enforces that gate. This mirrors the
 * S7-PM and S1-mentor carve-outs, where a general grant is narrowed by a
 * later, more specific rule rather than by widening the whitelist itself.
 */
export const COLLEAGUE_SECTION_GRANTS: Record<SectionId, SectionAccessLevel> = {
  S1: 'R',
  S2: 'none',
  S3: 'none',
  S4: 'none',
  S5: 'none',
  S6: 'none',
  S7: 'none',
  S8: 'none',
  S9: 'none',
  S10: 'R',
  S11: 'R',
  S12: 'none',
  S13: 'none',
  S14: 'none',
  S15: 'none',
  S16: 'R',
};

export abstract class AccessResolver {
  abstract resolveAudience(
    viewerId: string,
    subjectId: string,
  ): Promise<ResolvedAudience>;
}
