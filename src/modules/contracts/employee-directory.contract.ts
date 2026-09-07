/**
 * C2 companion — access-controlled employee directory reads.
 *
 * Wraps `FieldRegistry.queryEmployees` with viewer-scoped field visibility,
 * masking, and writability metadata. Owner (real implementation): `directory`
 * module (`EmployeesService`, Story 3.1).
 */
import type {
  EmployeeListQueryOptions,
  FieldSpec,
  FieldValue,
} from './field-registry.contract';

export interface EmployeeDirectoryRowDto {
  employeeId: string;
  cells: Record<string, FieldValue>;
  writableFieldIds?: string[];
}

export interface EmployeeDirectoryListResultDto {
  fields: FieldSpec[];
  rows: EmployeeDirectoryRowDto[];
  total: number;
  page: number;
  pageSize: number;
  /** Story 3.4 — true when shared-view filters referenced fields outside viewer visibility. */
  filtersHidden?: boolean;
}

export abstract class EmployeeDirectory {
  abstract listEmployees(
    viewerUserId: string,
    options: EmployeeListQueryOptions,
  ): Promise<EmployeeDirectoryListResultDto>;
}
