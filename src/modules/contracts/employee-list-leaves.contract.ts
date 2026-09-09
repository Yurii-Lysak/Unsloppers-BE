/**
 * Narrow read surface for S10 list-column enrichment (Story 3.6).
 * Owner (real implementation): `integrations` module.
 */

export type EmployeeListLeaveCell = {
  value: string;
  unavailable: boolean;
  /** True when last-known leave data is served after a sync failure (AD-8). */
  stale?: boolean;
};

export abstract class EmployeeListLeavesReader {
  abstract formatListCell(
    subjectEmployeeId: string,
    hideLeaveType: boolean,
  ): Promise<EmployeeListLeaveCell>;
}
