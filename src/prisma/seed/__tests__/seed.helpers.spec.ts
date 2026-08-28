import { TimetrackerEmployee } from '../../../modules/timetracker/timetracker.types';
import {
  MAX_IDENTITY_COUNT,
  MIN_IDENTITY_COUNT,
  assertPopulationSize,
  dedupeEmployeesByEmail,
  mostRecentCompleteMonth,
  validateAccountingEmployees,
  validateAccountingReport,
  validateTalentsProjects,
  validateTalentsResponse,
} from '../seed.helpers';
import {
  PopulationSizeError,
  TimetrackerValidationError,
} from '../seed.errors';

function employee(
  overrides: Partial<TimetrackerEmployee> = {},
): TimetrackerEmployee {
  return {
    id: 1,
    email: 'a@example.com',
    name: 'A',
    hash: 'h',
    countryCode: 'US',
    days: [],
    ...overrides,
  };
}

describe('mostRecentCompleteMonth', () => {
  it('returns the previous month in the same year for a mid-year date', () => {
    expect(mostRecentCompleteMonth(new Date('2026-08-28T00:00:00Z'))).toEqual({
      month: 7,
      year: 2026,
    });
  });

  it('wraps to December of the previous year in January', () => {
    expect(mostRecentCompleteMonth(new Date('2026-01-15T00:00:00Z'))).toEqual({
      month: 12,
      year: 2025,
    });
  });
});

describe('validateAccountingEmployees', () => {
  it('accepts a well-formed record', () => {
    expect(() => validateAccountingEmployees([employee()])).not.toThrow();
  });

  it.each([
    ['email', { email: '' }],
    ['name', { name: '' }],
    ['hash', { hash: '' }],
    ['countryCode', { countryCode: '' }],
  ])(
    'throws TimetrackerValidationError when %s is missing',
    (field, overrides) => {
      expect(field).toBeTruthy();
      expect(() =>
        validateAccountingEmployees([
          employee(overrides as Partial<TimetrackerEmployee>),
        ]),
      ).toThrow(TimetrackerValidationError);
    },
  );

  it('throws when days is not an array', () => {
    expect(() =>
      validateAccountingEmployees([
        { ...employee(), days: undefined as unknown as [] },
      ]),
    ).toThrow(TimetrackerValidationError);
  });
});

describe('validateAccountingReport', () => {
  it('accepts a response with an employees array', () => {
    expect(() =>
      validateAccountingReport({
        startDate: '2026-07-01T00:00:00Z',
        endDate: '2026-07-31T00:00:00Z',
        employees: [employee()],
        dayStatuses: {},
        reportStates: {},
        dayApprovalStates: {},
      }),
    ).not.toThrow();
  });

  it('throws when employees is not an array', () => {
    expect(() =>
      validateAccountingReport({
        startDate: '2026-07-01T00:00:00Z',
        endDate: '2026-07-31T00:00:00Z',
        employees: null as unknown as [],
        dayStatuses: {},
        reportStates: {},
        dayApprovalStates: {},
      }),
    ).toThrow(TimetrackerValidationError);
  });
});

describe('validateTalentsResponse', () => {
  it('accepts a well-formed envelope', () => {
    expect(() =>
      validateTalentsResponse({
        projects: [],
        statuses: [{ value: 1, name: 'Draft' }],
        types: [{ value: 0, name: 'AllTypes' }],
      }),
    ).not.toThrow();
  });

  it('throws when statuses is not an array', () => {
    expect(() =>
      validateTalentsResponse({
        projects: [],
        statuses: null as unknown as [],
        types: [],
      }),
    ).toThrow(TimetrackerValidationError);
  });

  it('throws when types is not an array', () => {
    expect(() =>
      validateTalentsResponse({
        projects: [],
        statuses: [],
        types: null as unknown as [],
      }),
    ).toThrow(TimetrackerValidationError);
  });
});

describe('validateTalentsProjects', () => {
  const validProject = {
    id: 1,
    name: 'Project X',
    description: 'desc',
    startDate: '2026-01-01T00:00:00Z',
    status: 2,
    type: 1,
    projectManager: 'pm@example.com',
    deliveryManager: 'dm@example.com',
    members: [{ email: 'm@example.com', dateStart: '2026-01-01T00:00:00Z' }],
  };

  it('accepts a well-formed project', () => {
    expect(() =>
      validateTalentsProjects([validProject as never]),
    ).not.toThrow();
  });

  it('throws when a required project field is missing', () => {
    const withoutName: Record<string, unknown> = { ...validProject };
    delete withoutName.name;
    expect(() => validateTalentsProjects([withoutName as never])).toThrow(
      TimetrackerValidationError,
    );
  });

  it('throws when a member is missing email', () => {
    expect(() =>
      validateTalentsProjects([
        {
          ...validProject,
          members: [{ dateStart: '2026-01-01T00:00:00Z' }],
        } as never,
      ]),
    ).toThrow(TimetrackerValidationError);
  });
});

describe('dedupeEmployeesByEmail', () => {
  it('keeps the last record when two share an email', () => {
    const first = employee({ id: 1, name: 'First' });
    const second = employee({ id: 2, name: 'Second' });
    const result = dedupeEmployeesByEmail([first, second]);

    expect(result.identities).toHaveLength(1);
    expect(result.identities[0].name).toBe('Second');
    expect(result.duplicateEmails).toEqual(['a@example.com']);
  });

  it('returns no duplicates when all emails are unique', () => {
    const result = dedupeEmployeesByEmail([
      employee({ email: 'a@example.com' }),
      employee({ email: 'b@example.com' }),
    ]);
    expect(result.identities).toHaveLength(2);
    expect(result.duplicateEmails).toEqual([]);
  });

  it("dedupes case-insensitively but preserves the surviving record's original casing", () => {
    const first = employee({ id: 1, email: 'User@Example.com', name: 'First' });
    const second = employee({
      id: 2,
      email: 'user@example.com',
      name: 'Second',
    });
    const result = dedupeEmployeesByEmail([first, second]);

    expect(result.identities).toHaveLength(1);
    expect(result.identities[0].name).toBe('Second');
    expect(result.identities[0].email).toBe('user@example.com'); // not rewritten
  });
});

describe('assertPopulationSize', () => {
  it('does not throw within the [500, 2000] band', () => {
    expect(() => assertPopulationSize(MIN_IDENTITY_COUNT)).not.toThrow();
    expect(() => assertPopulationSize(MAX_IDENTITY_COUNT)).not.toThrow();
    expect(() => assertPopulationSize(1000)).not.toThrow();
  });

  it('throws below the floor, including zero (empty population)', () => {
    expect(() => assertPopulationSize(MIN_IDENTITY_COUNT - 1)).toThrow(
      PopulationSizeError,
    );
    expect(() => assertPopulationSize(0)).toThrow(PopulationSizeError);
  });

  it('throws above the ceiling', () => {
    expect(() => assertPopulationSize(MAX_IDENTITY_COUNT + 1)).toThrow(
      PopulationSizeError,
    );
  });
});
