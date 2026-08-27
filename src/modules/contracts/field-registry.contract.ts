/**
 * C2 — FieldRegistry
 *
 * Uniform query interface over built-in, derived, and custom fields, so
 * consumers (directory, dashboards, campaigns) never special-case custom vs.
 * built-in fields (AD-6). Owner (real implementation): `directory` module
 * (Epic 3, Story 3.2).
 */

export type FieldValueType = 'text' | 'number' | 'date' | 'boolean' | 'select';

export type FieldVisibility = 'management' | 'employee' | 'colleague';

export interface FieldDefinitionDto {
  id: string;
  name: string;
  type: FieldValueType;
  visibility: FieldVisibility;
}

export type FieldValue = string | number | boolean | null;

export interface FieldQueryOptions {
  employeeIds?: string[];
  fieldIds?: string[];
}

export interface FieldQueryResultDto {
  employeeId: string;
  fieldId: string;
  value: FieldValue;
}

export abstract class FieldRegistry {
  abstract defineField(
    name: string,
    type: FieldValueType,
    visibility: FieldVisibility,
  ): Promise<string>;

  abstract setValue(
    employeeId: string,
    fieldId: string,
    value: FieldValue,
  ): Promise<void>;

  /** Uniform query interface — the only place a consumer branches on field type is inside the real implementation, never at the call site. */
  abstract query(options: FieldQueryOptions): Promise<FieldQueryResultDto[]>;
}
