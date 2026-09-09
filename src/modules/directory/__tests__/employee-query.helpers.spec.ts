import { BUILTIN_FIELD_IDS } from '../../contracts/field-registry.contract';
import { matchesDateFilter, matchesFilter } from '../employee-query.helpers';

describe('employee-query.helpers date filters', () => {
  const dateField = {
    id: 'custom-date',
    name: 'Start date',
    type: 'date' as const,
    source: 'custom' as const,
    sortable: true,
    filterable: true,
  };

  it('matches is_empty for null dates', () => {
    expect(matchesDateFilter(null, 'is_empty', null)).toBe(true);
    expect(matchesDateFilter('2026-01-01', 'is_empty', null)).toBe(false);
  });

  it('matches between ranges inclusively', () => {
    expect(
      matchesDateFilter('2026-03-15', 'between', ['2026-01-01', '2026-06-30']),
    ).toBe(true);
    expect(
      matchesDateFilter('2025-12-31', 'between', ['2026-01-01', '2026-06-30']),
    ).toBe(false);
  });

  it('routes date field specs through matchesDateFilter', () => {
    expect(
      matchesFilter('2026-03-15', dateField, {
        fieldId: dateField.id,
        operator: 'gte',
        value: '2026-01-01',
      }),
    ).toBe(true);
    expect(
      matchesFilter(null, dateField, {
        fieldId: dateField.id,
        operator: 'is_empty',
        value: null,
      }),
    ).toBe(true);
  });

  it('does not treat open IDP booleans as dates', () => {
    const booleanField = {
      id: BUILTIN_FIELD_IDS.has_open_idp,
      name: 'Has open IDP',
      type: 'boolean' as const,
      source: 'derived' as const,
      sortable: true,
      filterable: true,
    };

    expect(
      matchesFilter(true, booleanField, {
        fieldId: booleanField.id,
        operator: 'eq',
        value: true,
      }),
    ).toBe(true);
  });
});
