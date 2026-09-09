import type { FieldQueryResultDto } from './field-registry.contract';

/**
 * AD-3 field provider — one implementation per derived list field,
 * discovered via `@RegisterProvider('field', <fieldId>)`.
 */
export abstract class FieldProvider {
  abstract queryValues(employeeIds: string[]): Promise<FieldQueryResultDto[]>;
}
