import {
  BUILTIN_FIELD_IDS,
  FieldFilter,
  FieldSpec,
  FieldValue,
  FilterOperator,
  SortOrder,
} from '../contracts/field-registry.contract';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export interface EmployeeSnapshot {
  employeeId: string;
  name: string | null;
  grade: string | null;
  position: string | null;
  department: string | null;
  employmentType: string | null;
  tenureStart: Date | null;
}

export function computeTenureYears(
  tenureStart: Date | null,
  asOf: Date,
): number | null {
  if (!tenureStart) {
    return null;
  }
  const diffMs = asOf.getTime() - tenureStart.getTime();
  if (diffMs < 0) {
    return null;
  }
  return Math.floor(diffMs / MS_PER_YEAR);
}

export function earliestDate(dates: (Date | null | undefined)[]): Date | null {
  const valid = dates.filter((date): date is Date => date instanceof Date);
  if (valid.length === 0) {
    return null;
  }
  return valid.reduce((earliest, current) =>
    current.getTime() < earliest.getTime() ? current : earliest,
  );
}

export function getCellValue(
  snapshot: EmployeeSnapshot,
  fieldId: string,
  asOf: Date,
  customValueMap?: Map<string, FieldValue>,
): FieldValue {
  if (customValueMap && !isBuiltinFieldId(fieldId)) {
    return customValueMap.get(`${snapshot.employeeId}:${fieldId}`) ?? null;
  }

  switch (fieldId) {
    case BUILTIN_FIELD_IDS.name:
      return snapshot.name;
    case BUILTIN_FIELD_IDS.grade:
      return snapshot.grade;
    case BUILTIN_FIELD_IDS.position:
      return snapshot.position;
    case BUILTIN_FIELD_IDS.department:
      return snapshot.department;
    case BUILTIN_FIELD_IDS.employment_type:
      return snapshot.employmentType;
    case BUILTIN_FIELD_IDS.years_with_company:
      return computeTenureYears(snapshot.tenureStart, asOf);
    default:
      return null;
  }
}

export interface HistoryRowSnapshot {
  value: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export function currentHistoryValue(
  rows: HistoryRowSnapshot[],
): HistoryRowSnapshot | null {
  if (rows.length === 0) {
    return null;
  }
  const open = rows.find((row) => row.effectiveTo === null);
  if (open) {
    return open;
  }
  return rows.reduce((latest, row) =>
    row.effectiveFrom.getTime() > latest.effectiveFrom.getTime() ? row : latest,
  );
}

function compareValues(a: FieldValue, b: FieldValue): number {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return Number(a) - Number(b);
  }
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

export function sortSnapshots(
  snapshots: EmployeeSnapshot[],
  fieldId: string,
  order: SortOrder,
  asOf: Date,
  customValueMap?: Map<string, FieldValue>,
): EmployeeSnapshot[] {
  const direction = order === 'asc' ? 1 : -1;
  return [...snapshots].sort((left, right) => {
    const comparison = compareValues(
      getCellValue(left, fieldId, asOf, customValueMap),
      getCellValue(right, fieldId, asOf, customValueMap),
    );
    if (comparison === 0) {
      return left.employeeId.localeCompare(right.employeeId) * direction;
    }
    return comparison * direction;
  });
}

function normalizeText(value: FieldValue | string[]): string {
  if (Array.isArray(value)) {
    return value.join(',');
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function matchesTextFilter(
  cellValue: FieldValue,
  operator: FilterOperator,
  rawFilterValue: FieldValue | string[],
): boolean {
  const cellText = normalizeText(cellValue).toLowerCase();
  const filterText = normalizeText(rawFilterValue).toLowerCase();

  switch (operator) {
    case 'eq':
      return cellText === filterText;
    case 'neq':
      return cellText !== filterText;
    case 'contains':
      return cellText.includes(filterText);
    default:
      return false;
  }
}

function matchesNumberFilter(
  cellValue: FieldValue,
  operator: FilterOperator,
  rawFilterValue: FieldValue | string[],
): boolean {
  if (typeof cellValue !== 'number' || Array.isArray(rawFilterValue)) {
    return false;
  }
  const filterNumber =
    typeof rawFilterValue === 'number'
      ? rawFilterValue
      : Number(rawFilterValue);
  if (Number.isNaN(filterNumber)) {
    return false;
  }

  switch (operator) {
    case 'eq':
      return cellValue === filterNumber;
    case 'neq':
      return cellValue !== filterNumber;
    case 'gt':
      return cellValue > filterNumber;
    case 'gte':
      return cellValue >= filterNumber;
    case 'lt':
      return cellValue < filterNumber;
    case 'lte':
      return cellValue <= filterNumber;
    default:
      return false;
  }
}

function matchesBooleanFilter(
  cellValue: FieldValue,
  operator: FilterOperator,
  rawFilterValue: FieldValue | string[],
): boolean {
  if (typeof cellValue !== 'boolean' || Array.isArray(rawFilterValue)) {
    return false;
  }
  const filterBoolean =
    typeof rawFilterValue === 'boolean'
      ? rawFilterValue
      : rawFilterValue === 'true';
  return operator === 'eq'
    ? cellValue === filterBoolean
    : cellValue !== filterBoolean;
}

function matchesSelectFilter(
  cellValue: FieldValue,
  operator: FilterOperator,
  rawFilterValue: FieldValue | string[],
): boolean {
  if (operator === 'in') {
    if (!Array.isArray(rawFilterValue)) {
      return false;
    }
    if (Array.isArray(cellValue)) {
      return rawFilterValue.some((entry) => cellValue.includes(String(entry)));
    }
    const cellText = normalizeText(cellValue);
    return rawFilterValue.some((entry) => entry === cellText);
  }
  return matchesTextFilter(cellValue, operator, rawFilterValue);
}

export function matchesFilter(
  cellValue: FieldValue,
  field: FieldSpec,
  filter: FieldFilter,
): boolean {
  switch (field.type) {
    case 'number':
      return matchesNumberFilter(cellValue, filter.operator, filter.value);
    case 'boolean':
      return matchesBooleanFilter(cellValue, filter.operator, filter.value);
    case 'select':
    case 'multi_select':
      return matchesSelectFilter(cellValue, filter.operator, filter.value);
    case 'text':
    case 'date':
      return matchesTextFilter(cellValue, filter.operator, filter.value);
    default: {
      const _exhaustive: never = field.type;
      void _exhaustive;
      return false;
    }
  }
}

export function applyFilters(
  snapshots: EmployeeSnapshot[],
  filters: FieldFilter[],
  fieldById: Map<string, FieldSpec>,
  asOf: Date,
  customValueMap?: Map<string, FieldValue>,
): EmployeeSnapshot[] {
  if (filters.length === 0) {
    return snapshots;
  }

  return snapshots.filter((snapshot) =>
    filters.every((filter) => {
      const field = fieldById.get(filter.fieldId);
      if (!field) {
        return false;
      }
      const cellValue = getCellValue(
        snapshot,
        filter.fieldId,
        asOf,
        customValueMap,
      );
      return matchesFilter(cellValue, field, filter);
    }),
  );
}

export const TEXT_FILTER_OPERATORS: FilterOperator[] = [
  'eq',
  'neq',
  'contains',
];

export const NUMBER_FILTER_OPERATORS: FilterOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
];

export const SELECT_FILTER_OPERATORS: FilterOperator[] = ['eq', 'neq', 'in'];

export const BOOLEAN_FILTER_OPERATORS: FilterOperator[] = ['eq', 'neq'];

export function allowedOperatorsForField(field: FieldSpec): FilterOperator[] {
  switch (field.type) {
    case 'number':
      return NUMBER_FILTER_OPERATORS;
    case 'boolean':
      return BOOLEAN_FILTER_OPERATORS;
    case 'select':
    case 'multi_select':
      return SELECT_FILTER_OPERATORS;
    case 'text':
    case 'date':
      return TEXT_FILTER_OPERATORS;
    default: {
      const _exhaustive: never = field.type;
      void _exhaustive;
      return [];
    }
  }
}

export function isBuiltinFieldId(fieldId: string): boolean {
  return Object.values(BUILTIN_FIELD_IDS).includes(
    fieldId as (typeof BUILTIN_FIELD_IDS)[keyof typeof BUILTIN_FIELD_IDS],
  );
}
