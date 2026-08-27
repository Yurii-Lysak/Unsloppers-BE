/**
 * C5 — ExternalIdentityMapping
 *
 * A dedicated mapping table keyed by (system, externalId) rather than
 * email, supporting re-hires and identity changes via an explicit
 * `supersededBy` pointer. Owner (real implementation): `integrations`.
 */

export type ExternalIdentitySystem = 'peopleforce' | 'timetracker';

export interface ExternalIdentityMappingDto {
  system: ExternalIdentitySystem;
  externalId: string;
  employeeId: string;
  supersededBy?: string;
}

export abstract class ExternalIdentityMapping {
  abstract findByExternalId(
    system: ExternalIdentitySystem,
    externalId: string,
  ): Promise<ExternalIdentityMappingDto | null>;

  abstract listByEmployee(
    employeeId: string,
  ): Promise<ExternalIdentityMappingDto[]>;
}
