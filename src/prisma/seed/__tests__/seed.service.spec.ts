import { PrismaService } from '../../prisma.service';
import { TimetrackerService } from '../../../modules/timetracker/timetracker.service';
import { TimetrackerApiError } from '../../../modules/timetracker/timetracker.errors';
import {
  AccountingReportResponse,
  GetTalentProjectsResponse,
  TimetrackerEmployee,
} from '../../../modules/timetracker/timetracker.types';
import { SeedService } from '../seed.service';
import {
  PopulationSizeError,
  TimetrackerValidationError,
} from '../seed.errors';

function employee(
  overrides: Partial<TimetrackerEmployee> = {},
): TimetrackerEmployee {
  return {
    id: 1,
    email: 'user1@example.com',
    name: 'User One',
    hash: 'hash-1',
    countryCode: 'US',
    days: [],
    ...overrides,
  };
}

function manyEmployees(count: number): TimetrackerEmployee[] {
  return Array.from({ length: count }, (_unused, index) =>
    employee({
      id: index + 1,
      email: `user${index + 1}@example.com`,
      name: `User ${index + 1}`,
    }),
  );
}

function accountingResponse(
  employees: TimetrackerEmployee[],
): AccountingReportResponse {
  return {
    startDate: '2026-07-01T00:00:00Z',
    endDate: '2026-07-31T00:00:00Z',
    employees,
    dayStatuses: {},
    reportStates: {},
    dayApprovalStates: {},
  };
}

function talentsResponse(
  projects: GetTalentProjectsResponse['projects'] = [],
): GetTalentProjectsResponse {
  return { projects, statuses: [], types: [] };
}

/**
 * Minimal jest-mocked PrismaService — only the delegates SeedService
 * touches. Mock functions are returned as plain local bindings (`userUpsert`,
 * `gradeCreate`, ...) rather than read back off `prisma.user.upsert` in
 * assertions — reaching through the (cast-to-)`PrismaService`-typed object
 * trips `@typescript-eslint/unbound-method` since it looks like an unbound
 * class method access from the type checker's point of view.
 */
function makePrismaMock() {
  const users = new Map<
    string,
    {
      id: string;
      email: string;
      name?: string;
      hash?: string;
      countryCode?: string;
    }
  >();
  const employees = new Map<string, { id: string; userId: string }>();
  const openHistoryRows = new Set<string>(); // key: `${employeeId}:${dimension}`

  const historyDelegate = (dimension: string) => {
    const findFirst = jest.fn(({ where }: { where: { employeeId: string } }) =>
      Promise.resolve(
        openHistoryRows.has(`${where.employeeId}:${dimension}`)
          ? { id: 'existing-row' }
          : null,
      ),
    );
    const create = jest.fn(({ data }: { data: { employeeId: string } }) => {
      openHistoryRows.add(`${data.employeeId}:${dimension}`);
      return Promise.resolve({ id: 'new-row', ...data });
    });
    return { findFirst, create };
  };

  const userUpsert = jest.fn(
    ({
      where,
      create,
      update,
    }: {
      where: { email: string };
      create: {
        email: string;
        name?: string;
        hash?: string;
        countryCode?: string;
      };
      update: Record<string, unknown>;
    }) => {
      const existing = users.get(where.email);
      if (existing) {
        Object.assign(existing, update);
        return Promise.resolve(existing);
      }
      const created = { id: `user-${users.size + 1}`, ...create };
      users.set(where.email, created);
      return Promise.resolve(created);
    },
  );

  const employeeUpsert = jest.fn(({ where }: { where: { userId: string } }) => {
    const existing = employees.get(where.userId);
    if (existing) {
      return Promise.resolve(existing);
    }
    const created = {
      id: `employee-${employees.size + 1}`,
      userId: where.userId,
    };
    employees.set(where.userId, created);
    return Promise.resolve(created);
  });

  const grade = historyDelegate('grade');
  const position = historyDelegate('position');
  const department = historyDelegate('department');
  const employmentType = historyDelegate('employmentType');

  const prisma = {
    user: { upsert: userUpsert },
    employee: { upsert: employeeUpsert },
    gradeHistory: grade,
    positionHistory: position,
    departmentHistory: department,
    employmentTypeHistory: employmentType,
  };

  return {
    prisma: prisma as unknown as PrismaService,
    users,
    employees,
    userUpsert,
    gradeCreate: grade.create,
    positionCreate: position.create,
    departmentCreate: department.create,
    employmentTypeCreate: employmentType.create,
  };
}

function makeTimetrackerMock(
  accounting: AccountingReportResponse,
  talents: GetTalentProjectsResponse,
): {
  service: TimetrackerService;
  fetchAccountingReport: jest.Mock;
  fetchTalentsProjects: jest.Mock;
} {
  const fetchAccountingReport = jest.fn().mockResolvedValue(accounting);
  const fetchTalentsProjects = jest.fn().mockResolvedValue(talents);
  return {
    service: {
      fetchAccountingReport,
      fetchTalentsProjects,
    } as unknown as TimetrackerService,
    fetchAccountingReport,
    fetchTalentsProjects,
  };
}

describe('SeedService', () => {
  const now = new Date('2026-08-28T00:00:00Z');

  it('fresh DB: creates a User/Employee for every returned identity and seeds initial history', async () => {
    const employees = manyEmployees(500);
    const {
      prisma,
      userUpsert,
      gradeCreate,
      positionCreate,
      departmentCreate,
      employmentTypeCreate,
    } = makePrismaMock();
    const { service: timetracker } = makeTimetrackerMock(
      accountingResponse(employees),
      talentsResponse(),
    );

    const summary = await new SeedService(prisma, timetracker).run(now);

    expect(summary.identitiesUpserted).toBe(500);
    expect(userUpsert).toHaveBeenCalledTimes(500);
    expect(gradeCreate).toHaveBeenCalledTimes(500);
    expect(positionCreate).toHaveBeenCalledTimes(500);
    expect(departmentCreate).toHaveBeenCalledTimes(500);
    expect(employmentTypeCreate).toHaveBeenCalledTimes(500);
  });

  it('passes the most recent complete calendar month to the Accounting endpoint', async () => {
    const employees = manyEmployees(500);
    const { prisma } = makePrismaMock();
    const { service: timetracker, fetchAccountingReport } = makeTimetrackerMock(
      accountingResponse(employees),
      talentsResponse(),
    );

    await new SeedService(prisma, timetracker).run(now);

    expect(fetchAccountingReport).toHaveBeenCalledWith({
      month: 7,
      year: 2026,
    });
  });

  it('idempotent rerun, unchanged data: no duplicate history rows, exits without throwing', async () => {
    const employees = manyEmployees(500);
    const {
      prisma,
      userUpsert,
      gradeCreate,
      positionCreate,
      departmentCreate,
      employmentTypeCreate,
    } = makePrismaMock();
    const { service: timetracker } = makeTimetrackerMock(
      accountingResponse(employees),
      talentsResponse(),
    );
    const service = new SeedService(prisma, timetracker);

    await service.run(now);
    gradeCreate.mockClear();
    positionCreate.mockClear();
    departmentCreate.mockClear();
    employmentTypeCreate.mockClear();
    userUpsert.mockClear();

    await service.run(now);

    // Users are still upserted (update branch) but no new history rows.
    expect(userUpsert).toHaveBeenCalledTimes(500);
    expect(gradeCreate).not.toHaveBeenCalled();
    expect(positionCreate).not.toHaveBeenCalled();
    expect(departmentCreate).not.toHaveBeenCalled();
    expect(employmentTypeCreate).not.toHaveBeenCalled();
  });

  it('already-seeded DB, upstream data changed: updates the existing row in place', async () => {
    const { prisma, users } = makePrismaMock();
    const original = employee();
    const { service: timetracker1 } = makeTimetrackerMock(
      accountingResponse(manyEmployees(500)),
      talentsResponse(),
    );
    const service = new SeedService(prisma, timetracker1);
    await service.run(now);

    const changed = manyEmployees(500);
    changed[0] = {
      ...changed[0],
      name: 'Renamed',
      countryCode: 'CA',
      hash: 'new-hash',
    };
    const { service: timetracker2 } = makeTimetrackerMock(
      accountingResponse(changed),
      talentsResponse(),
    );
    await new SeedService(prisma, timetracker2).run(now);

    const updated = users.get(changed[0].email);
    expect(updated).toMatchObject({
      name: 'Renamed',
      countryCode: 'CA',
      hash: 'new-hash',
    });
    void original;
  });

  it('either endpoint unreachable: rejects, and no rows are written', async () => {
    const { prisma, userUpsert } = makePrismaMock();
    const timetracker = {
      fetchAccountingReport: jest
        .fn()
        .mockRejectedValue(
          new TimetrackerApiError('POST /api/accounting/report', 401),
        ),
      fetchTalentsProjects: jest.fn(),
    } as unknown as TimetrackerService;

    await expect(
      new SeedService(prisma, timetracker).run(now),
    ).rejects.toBeInstanceOf(TimetrackerApiError);
    expect(userUpsert).not.toHaveBeenCalled();
  });

  it('Talents endpoint unreachable: rejects, and no rows are written', async () => {
    const { prisma, userUpsert } = makePrismaMock();
    const timetracker = {
      fetchAccountingReport: jest
        .fn()
        .mockResolvedValue(accountingResponse(manyEmployees(500))),
      fetchTalentsProjects: jest
        .fn()
        .mockRejectedValue(
          new TimetrackerApiError('GET /api/projects/talents', 401),
        ),
    } as unknown as TimetrackerService;

    await expect(
      new SeedService(prisma, timetracker).run(now),
    ).rejects.toBeInstanceOf(TimetrackerApiError);
    expect(userUpsert).not.toHaveBeenCalled();
  });

  it('delivered list smaller than 500: halts before writing', async () => {
    const { prisma, userUpsert } = makePrismaMock();
    const { service: timetracker } = makeTimetrackerMock(
      accountingResponse(manyEmployees(300)),
      talentsResponse(),
    );

    await expect(
      new SeedService(prisma, timetracker).run(now),
    ).rejects.toBeInstanceOf(PopulationSizeError);
    expect(userUpsert).not.toHaveBeenCalled();
  });

  it('delivered list larger than 2000: halts before writing', async () => {
    const { prisma, userUpsert } = makePrismaMock();
    const { service: timetracker } = makeTimetrackerMock(
      accountingResponse(manyEmployees(2001)),
      talentsResponse(),
    );

    await expect(
      new SeedService(prisma, timetracker).run(now),
    ).rejects.toBeInstanceOf(PopulationSizeError);
    expect(userUpsert).not.toHaveBeenCalled();
  });

  it('empty population: halts the same as "smaller than 500"', async () => {
    const { prisma, userUpsert } = makePrismaMock();
    const { service: timetracker } = makeTimetrackerMock(
      accountingResponse([]),
      talentsResponse(),
    );

    await expect(
      new SeedService(prisma, timetracker).run(now),
    ).rejects.toBeInstanceOf(PopulationSizeError);
    expect(userUpsert).not.toHaveBeenCalled();
  });

  it('malformed Accounting response: fails loudly, no writes', async () => {
    const { prisma, userUpsert } = makePrismaMock();
    const employees = manyEmployees(500);
    employees[10] = { ...employees[10], email: '' }; // deliberately malformed for the test
    const { service: timetracker } = makeTimetrackerMock(
      accountingResponse(employees),
      talentsResponse(),
    );

    await expect(
      new SeedService(prisma, timetracker).run(now),
    ).rejects.toBeInstanceOf(TimetrackerValidationError);
    expect(userUpsert).not.toHaveBeenCalled();
  });

  it('malformed Talents response: fails loudly, no writes', async () => {
    const { prisma, userUpsert } = makePrismaMock();
    const { service: timetracker } = makeTimetrackerMock(
      accountingResponse(manyEmployees(500)),
      {
        projects: [
          {
            id: 1,
            name: 'Proj',
            description: 'd',
            startDate: '2026-01-01T00:00:00Z',
            status: 2,
            type: 1,
            projectManager: 'pm@example.com',
            deliveryManager: 'dm@example.com',
            members: [{ dateStart: '2026-01-01T00:00:00Z' } as never],
          },
        ],
        statuses: [],
        types: [],
      },
    );

    await expect(
      new SeedService(prisma, timetracker).run(now),
    ).rejects.toBeInstanceOf(TimetrackerValidationError);
    expect(userUpsert).not.toHaveBeenCalled();
  });

  it('identities absent from the latest TimeTracker response are left untouched', async () => {
    const firstRun = manyEmployees(500);
    const removedEmail = firstRun[0].email;
    const { prisma, users } = makePrismaMock();
    const { service: timetracker1 } = makeTimetrackerMock(
      accountingResponse(firstRun),
      talentsResponse(),
    );
    await new SeedService(prisma, timetracker1).run(now);
    expect(users.has(removedEmail)).toBe(true);

    const secondRun = [
      ...firstRun.slice(1),
      employee({
        id: 501,
        email: 'user501@example.com',
        name: 'User 501',
      }),
    ];
    const { service: timetracker2 } = makeTimetrackerMock(
      accountingResponse(secondRun),
      talentsResponse(),
    );
    await new SeedService(prisma, timetracker2).run(now);

    expect(users.size).toBe(501);
    expect(users.has(removedEmail)).toBe(true);
    expect(users.get(removedEmail)).toMatchObject({
      email: removedEmail,
      name: firstRun[0].name,
    });
  });

  it('in-fetch email dedup: keeps the last record, writes once, no failure', async () => {
    const { prisma } = makePrismaMock();
    const base = manyEmployees(500);
    const duplicate = { ...base[0], name: 'Duplicate Name' };
    const { service: timetracker } = makeTimetrackerMock(
      accountingResponse([...base, duplicate]),
      talentsResponse(),
    );

    const summary = await new SeedService(prisma, timetracker).run(now);

    expect(summary.identitiesUpserted).toBe(500);
    expect(summary.duplicateEmailsSkipped).toBe(1);
  });

  it('orphaned Talents membership: skipped with a warning, run still succeeds', async () => {
    const { prisma } = makePrismaMock();
    const identities = manyEmployees(500);
    const talents = talentsResponse([
      {
        id: 1,
        name: 'Proj',
        description: 'd',
        startDate: '2026-01-01T00:00:00Z',
        status: 2,
        type: 1,
        projectManager: 'pm@example.com',
        deliveryManager: 'dm@example.com',
        members: [
          { email: identities[0].email, dateStart: '2026-01-01T00:00:00Z' },
          { email: 'orphan@example.com', dateStart: '2026-01-01T00:00:00Z' },
        ],
      },
    ]);
    const { service: timetracker } = makeTimetrackerMock(
      accountingResponse(identities),
      talents,
    );

    const summary = await new SeedService(prisma, timetracker).run(now);

    expect(summary.orphanedTalentsMemberships).toBe(1);
    expect(summary.identitiesUpserted).toBe(500);
  });

  it('Talents membership matching an identity only by differing email case: not flagged as orphaned', async () => {
    const { prisma } = makePrismaMock();
    const identities = manyEmployees(500);
    identities[0] = { ...identities[0], email: 'User1@Example.com' };
    const talents = talentsResponse([
      {
        id: 1,
        name: 'Proj',
        description: 'd',
        startDate: '2026-01-01T00:00:00Z',
        status: 2,
        type: 1,
        projectManager: 'pm@example.com',
        deliveryManager: 'dm@example.com',
        members: [
          { email: 'user1@example.com', dateStart: '2026-01-01T00:00:00Z' },
        ],
      },
    ]);
    const { service: timetracker } = makeTimetrackerMock(
      accountingResponse(identities),
      talents,
    );

    const summary = await new SeedService(prisma, timetracker).run(now);

    expect(summary.orphanedTalentsMemberships).toBe(0);
  });
});
