/**
 * C3 — ProjectAssignment
 *
 * Internally-owned and queryable independent of the timetracker being live.
 * Seeded by `access`; `integrations` becomes the real writer once Epic 13
 * lands, with zero change to consumers. This table's only legitimate
 * writers are the `access` seed path and `integrations`' timetracker sync —
 * `resourcing` reads it but never writes to it.
 *
 * `confirmed`/`confirmedAt` (AD-8) are part of the ratified shape: Manager
 * access grants only from rows where `confirmed = true` and `confirmedAt`
 * is within a bounded freshness window, so a sticky one-time-confirmed row
 * ages out during a prolonged sync outage instead of granting access
 * indefinitely.
 */

export interface ProjectAssignmentDto {
  employeeId: string;
  projectId: string;
  pmId: string;
  dmId: string;
  startDate: string; // ISO date
  endDate: string | null; // ISO date
  confirmed: boolean;
  confirmedAt: string | null; // ISO datetime
}

export abstract class ProjectAssignment {
  abstract listByEmployee(employeeId: string): Promise<ProjectAssignmentDto[]>;
  abstract listByProject(projectId: string): Promise<ProjectAssignmentDto[]>;
}
