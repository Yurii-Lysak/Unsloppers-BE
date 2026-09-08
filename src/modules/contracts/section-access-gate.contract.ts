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

  /** True when the viewer holds S6 over at least one subject (excluding self). */
  abstract canAccessRiskDashboard(viewerEmployeeId: string): Promise<boolean>;

  /**
   * Employee IDs where C1 grants S6 via Reporting-line, Project-line, or PP.
   * Never includes the viewer's own ID.
   */
  abstract listS6SubjectIds(viewerEmployeeId: string): Promise<string[]>;
}
