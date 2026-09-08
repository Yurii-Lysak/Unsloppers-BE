/**
 * Narrow read surface for S10 list-column enrichment (Story 3.6).
 * Owner (real implementation): `integrations` module.
 */

export type EmployeeListLeaveCell = {
  value: string;
  unavailable: boolean;
};

export abstract class EmployeeListLeavesReader {
  abstract formatListCell(
    subjectEmployeeId: string,
    hideLeaveType: boolean,
  ): Promise<EmployeeListLeaveCell>;
}
