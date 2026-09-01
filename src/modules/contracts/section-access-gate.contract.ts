import {
  ResolvedAudience,
  SectionAccessLevel,
  SectionId,
} from './access-resolver.contract';

/**
 * C1 section gate for parallel routes (Story 1.8 / AD-5).
 * Owner (real implementation): `access` module.
 */
export abstract class SectionAccessGate {
  abstract requireSection(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
    sectionId: SectionId,
    minLevel?: SectionAccessLevel,
  ): Promise<ResolvedAudience>;

  abstract listGrantedSections(audience: ResolvedAudience): SectionId[];
}
