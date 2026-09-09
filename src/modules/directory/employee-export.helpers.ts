import type { FieldValue } from '../contracts/field-registry.contract';

const FORMULA_PREFIX_PATTERN = /^[=+\-@]/;

export const dedupeColumnIds = (columnIds: string[]): string[] => {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const columnId of columnIds) {
    if (seen.has(columnId)) {
      continue;
    }
    seen.add(columnId);
    deduped.push(columnId);
  }
  return deduped;
};

export const sanitizeSpreadsheetString = (value: string): string => {
  if (FORMULA_PREFIX_PATTERN.test(value)) {
    return `'${value}`;
  }
  return value;
};

export const EXPORT_CELL_UNAVAILABLE = 'Temporarily unavailable';

export const formatExportCellValue = (
  value: FieldValue | undefined,
  fieldId?: string,
  fieldsUnavailable?: string[],
): string | number | boolean => {
  if (fieldId && fieldsUnavailable?.includes(fieldId)) {
    return EXPORT_CELL_UNAVAILABLE;
  }
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (typeof value === 'number') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        typeof entry === 'string'
          ? sanitizeSpreadsheetString(entry)
          : String(entry),
      )
      .join(', ');
  }
  return sanitizeSpreadsheetString(value);
};

export const buildExportFilename = (date = new Date()): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `employees-export-${year}-${month}-${day}.xlsx`;
};
