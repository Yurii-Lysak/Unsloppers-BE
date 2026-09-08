/**
 * C12 — DepartmentDirectory (minimal, Story 6.2)
 *
 * Backs live Unit Manager routing for `resourcing`: a request's
 * `department` string (persisted verbatim by Story 6.1) is re-resolved to
 * its current manager on every read via `getDepartmentByName` — never
 * pinned to whoever held the role at request-creation time.
 *
 * Owner (real implementation): `access` module.
 */

export interface DepartmentDto {
  id: string;
  name: string;
  parentId: string | null;
  managerId: string | null;
}

export abstract class DepartmentDirectory {
  abstract getDepartmentByName(name: string): Promise<DepartmentDto | null>;

  /**
   * Direct `managerId` rows for `employeeId` plus every descendant
   * department's id (nested `parentId` walk) — the set an internal
   * resourcing candidate's current department must intersect.
   */
  abstract getManagedDepartmentIds(employeeId: string): Promise<string[]>;
}
