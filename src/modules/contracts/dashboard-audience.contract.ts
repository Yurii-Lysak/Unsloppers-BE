export interface DashboardProjectGroup {
  projectId: string;
  projectName: string;
  subjectIds: string[];
}

/**
 * C1-scoped dashboard population listing — implemented in `access`, consumed
 * by `dashboards` (Story 12.1). Never widens beyond the variant's reach.
 */
export abstract class DashboardAudience {
  abstract listManagerSubordinateIds(
    viewerEmployeeId: string,
  ): Promise<string[]>;

  abstract listProjectGroups(
    viewerEmployeeId: string,
    responsibility: 'dm' | 'pm',
  ): Promise<DashboardProjectGroup[]>;
}
