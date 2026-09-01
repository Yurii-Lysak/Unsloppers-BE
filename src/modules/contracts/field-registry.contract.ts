/**
 * C2 — FieldRegistry
 *
 * Uniform query interface over built-in, derived, and custom fields, so
 * consumers (directory, dashboards, campaigns) never special-case custom vs.
 * built-in fields (AD-6). Owner (real implementation): `directory` module
 * (Epic 3, Story 3.2).
 */

export type FieldValueType =
  'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select';

export type FieldVisibility = 'management' | 'employee' | 'colleague';

export type FieldSource = 'builtin' | 'derived' | 'custom';

export type SortOrder = 'asc' | 'desc';

export type FilterOperator =
  'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';

export interface FieldDefinitionDto {
  id: string;
  name: string;
  type: FieldValueType;
  visibility: FieldVisibility;
  options: string[];
}

export interface FieldSpec {
  id: string;
  name: string;
  type: FieldValueType;
  source: FieldSource;
  sortable: boolean;
  filterable: boolean;
  visibility?: FieldVisibility;
  options?: string[];
}

export type FieldValue = string | number | boolean | string[] | null;

export interface FieldQueryOptions {
  employeeIds?: string[];
  fieldIds?: string[];
}

export interface FieldQueryResultDto {
  employeeId: string;
  fieldId: string;
  value: FieldValue;
}

export interface FieldFilter {
  fieldId: string;
  operator: FilterOperator;
  value: FieldValue | string[];
}

export interface EmployeeListQueryOptions {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: SortOrder;
  filters?: FieldFilter[];
  visibleFieldIds?: string[];
}

export interface EmployeeRowDto {
  employeeId: string;
  cells: Record<string, FieldValue>;
}

export interface EmployeeListQueryResultDto {
  rows: EmployeeRowDto[];
  total: number;
  page: number;
  pageSize: number;
}

export const BUILTIN_FIELD_IDS = {
  name: 'name',
  grade: 'grade',
  position: 'position',
  department: 'department',
  employment_type: 'employment_type',
  years_with_company: 'years_with_company',
} as const;

export type BuiltinFieldId =
  (typeof BUILTIN_FIELD_IDS)[keyof typeof BUILTIN_FIELD_IDS];

export abstract class FieldRegistry {
  abstract defineField(
    name: string,
    type: FieldValueType,
    visibility: FieldVisibility,
    options?: string[],
  ): Promise<string>;

  abstract setValue(
    employeeId: string,
    fieldId: string,
    value: FieldValue,
  ): Promise<void>;

  /** Uniform query interface — the only place a consumer branches on field type is inside the real implementation, never at the call site. */
  abstract query(options: FieldQueryOptions): Promise<FieldQueryResultDto[]>;

  /** Catalog of built-in, derived, and custom fields available for list columns. */
  abstract listFields(): Promise<FieldSpec[]>;

  /** Server-driven sort, filter, and pagination over employee rows. */
  abstract queryEmployees(
    options: EmployeeListQueryOptions,
  ): Promise<EmployeeListQueryResultDto>;
}
