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

  /**
   * Batched variant of `formatListCell` for a full list page. Fetches leave
   * data for every row in as few external TimeTracker calls as possible
   * instead of one row at a time (Story 3.6 list-performance follow-up).
   */
  abstract formatListCells(
    rows: Array<{ subjectEmployeeId: string; hideLeaveType: boolean }>,
  ): Promise<Map<string, EmployeeListLeaveCell>>;
}
