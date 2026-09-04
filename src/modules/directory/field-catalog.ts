import {
  BUILTIN_FIELD_IDS,
  FieldSpec,
} from '../contracts/field-registry.contract';

export const BUILTIN_FIELD_SPECS: FieldSpec[] = [
  {
    id: BUILTIN_FIELD_IDS.name,
    name: 'Name',
    type: 'text',
    source: 'builtin',
    sortable: true,
    filterable: true,
  },
  {
    id: BUILTIN_FIELD_IDS.grade,
    name: 'Grade',
    type: 'text',
    source: 'builtin',
    sortable: true,
    filterable: true,
    editable: true,
  },
  {
    id: BUILTIN_FIELD_IDS.position,
    name: 'Position',
    type: 'text',
    source: 'builtin',
    sortable: true,
    filterable: true,
    editable: true,
  },
  {
    id: BUILTIN_FIELD_IDS.department,
    name: 'Department',
    type: 'text',
    source: 'builtin',
    sortable: true,
    filterable: true,
  },
  {
    id: BUILTIN_FIELD_IDS.employment_type,
    name: 'Employment type',
    type: 'text',
    source: 'builtin',
    sortable: true,
    filterable: true,
    editable: true,
  },
  {
    id: BUILTIN_FIELD_IDS.years_with_company,
    name: 'Years with company',
    type: 'number',
    source: 'derived',
    sortable: true,
    filterable: true,
  },
];

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const MIN_PAGE = 1;
