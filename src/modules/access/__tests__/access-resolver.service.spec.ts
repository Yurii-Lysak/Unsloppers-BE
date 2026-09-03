import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { Clock } from '../../../clock/clock.service';
import { ProjectAssignment } from '../../contracts/project-assignment.contract';
import { AccessResolverService } from '../access-resolver.service';
import { RelationshipGraphGenerationService } from '../relationship-graph-generation.service';

describe('AccessResolverService', () => {
  let service: AccessResolverService;

  type EmployeeRecord = {
    managerId?: string | null;
    peoplePartnerId?: string | null;
  };

  const employees: Record<string, EmployeeRecord> = {};
  const departments: Record<string, string | null | undefined> = {};

  const prisma = {
    employee: {
      findUnique: jest.fn(),
    },
    departmentHistory: {
      findFirst: jest.fn(),
    },
    fullAccessGrant: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  const projectAssignment = {
    listByEmployee: jest.fn(),
    listByProject: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string) =>
      key === 'HR_DEPARTMENT_VALUE' ? 'HR' : undefined,
    ),
  };

  const PP_SECTIONS = {
    S1: 'RW',
    S2: 'RW',
    S3: 'RW',
    S4: 'RW',
    S5: 'RW',
    S6: 'RW',
    S7: 'RW',
    S8: 'RW',
    S9: 'RW',
    S10: 'R',
    S11: 'R',
    S12: 'RW',
    S13: 'RW',
    S14: 'RW',
    S15: 'R',
    S16: 'RW',
  };

  const NOW = new Date('2026-08-31T12:00:00.000Z');
  // `startDate`/`endDate` are `@db.Date` — Postgres/Prisma always returns
  // these as UTC midnight of that calendar date. Tests that exercise the
  // start/end boundary use this shape, not a full-precision timestamp, so
  // they reflect what a real persisted row can actually contain.
  const TODAY = new Date(
    Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate()),
  );
  const clock = {
    now: jest.fn(() => NOW),
    nowMs: jest.fn(() => NOW.getTime()),
  };

  const cacheStore = new Map<string, unknown>();
  const graphGeneration = {
    getGeneration: jest.fn(() => 0n),
    cacheKey: jest.fn(
      (viewerId: string, subjectId: string) => `${viewerId}:${subjectId}`,
    ),
    getCacheEntry: jest.fn(),
    setCacheEntry: jest.fn(),
    deleteCacheEntry: jest.fn(),
    clearCache: jest.fn(),
  };

  /** Chains a sequence of `managerId` lookups by employee id. */
  const mockChain = (chain: Record<string, string | null>) => {
    for (const [id, managerId] of Object.entries(chain)) {
      employees[id] = { ...employees[id], managerId };
    }
  };

  const mockSubjectPp = (subjectId: string, peoplePartnerId: string | null) => {
    employees[subjectId] = { ...employees[subjectId], peoplePartnerId };
  };

  const mockDepartment = (employeeId: string, value: string | null) => {
    departments[employeeId] = value;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    configService.get.mockImplementation((key: string) =>
      key === 'HR_DEPARTMENT_VALUE' ? 'HR' : undefined,
    );
    for (const key of Object.keys(employees)) {
      delete employees[key];
    }
    for (const key of Object.keys(departments)) {
      delete departments[key];
    }

    prisma.employee.findUnique.mockImplementation(
      ({
        where: { id },
        select,
      }: {
        where: { id: string };
        select?: { managerId?: boolean; peoplePartnerId?: boolean };
      }) => {
        const record = employees[id];
        if (!record) {
          return Promise.resolve(null);
        }
        if (select?.peoplePartnerId) {
          return Promise.resolve({
            peoplePartnerId: record.peoplePartnerId ?? null,
          });
        }
        if (select?.managerId) {
          return Promise.resolve({ managerId: record.managerId ?? null });
        }
        return Promise.resolve(null);
      },
    );

    prisma.departmentHistory.findFirst.mockImplementation(
      ({
        where: { employeeId, effectiveTo },
      }: {
        where: { employeeId: string; effectiveTo?: null };
      }) => {
        if (effectiveTo !== null) {
          return Promise.resolve(null);
        }
        const value = departments[employeeId];
        if (value === undefined) {
          return Promise.resolve(null);
        }
        return Promise.resolve(value === null ? null : { value });
      },
    );

    clock.now.mockReturnValue(NOW);
    clock.nowMs.mockReturnValue(NOW.getTime());
    cacheStore.clear();
    graphGeneration.getGeneration.mockReturnValue(0n);
    graphGeneration.getCacheEntry.mockImplementation((key: string) =>
      cacheStore.get(key),
    );
    graphGeneration.setCacheEntry.mockImplementation(
      (key: string, entry: unknown) => {
        cacheStore.set(key, entry);
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProjectAssignment, useValue: projectAssignment },
        { provide: Clock, useValue: clock },
        { provide: ConfigService, useValue: configService },
        {
          provide: RelationshipGraphGenerationService,
          useValue: graphGeneration,
        },
      ],
    }).compile();

    service = module.get(AccessResolverService);
  });
  /** A confirmed, fresh, active row unless overridden. */
  const row = (overrides: Partial<Record<string, unknown>> = {}) => ({
    employeeId: 'B',
    projectId: 'proj-1',
    pmId: 'P',
    dmId: 'D',
    startDate: '2026-01-01',
    endDate: null,
    confirmed: true,
    confirmedAt: NOW.toISOString(),
    ...overrides,
  });

  it('grants Self when viewer and subject are the same employee, without any managerId lookup', async () => {
    const result = await service.resolveAudience('emp-x', 'emp-x');

    expect(result.role).toBe('Self');
    expect(prisma.employee.findUnique).not.toHaveBeenCalled();
  });

  it('does not grant Self when both viewerId and subjectId are empty strings', async () => {
    mockChain({});
    projectAssignment.listByEmployee.mockResolvedValue([]);

    const result = await service.resolveAudience('', '');

    expect(result.role).toBe('Colleague');
  });

  it('grants ReportingLine for a direct report (B reports to M)', async () => {
    // B.managerId = M
    mockChain({ B: 'M', M: null });

    const result = await service.resolveAudience('M', 'B');

    expect(result.role).toBe('ReportingLine');
    expect(result.sections).toEqual({
      S1: 'RW',
      S2: 'R',
      S3: 'R',
      S4: 'RW',
      S5: 'R',
      S6: 'RW',
      S7: 'RW',
      S8: 'RW',
      S9: 'RW',
      S10: 'R',
      S11: 'R',
      S12: 'RW',
      S13: 'RW',
      S14: 'RW',
      S15: 'R',
      S16: 'RW',
    });
    // ReportingLine short-circuits before the ProjectAssignment fetch.
    expect(projectAssignment.listByEmployee).not.toHaveBeenCalled();
  });

  it('grants ReportingLine transitively (D over B via M, 2 levels)', async () => {
    // B.managerId = M, M.managerId = D
    mockChain({ B: 'M', M: 'D', D: null });

    const result = await service.resolveAudience('D', 'B');

    expect(result.role).toBe('ReportingLine');
  });

  it('resolves Colleague for two unrelated employees', async () => {
    // B.managerId = M, M has no manager; A shares no overlap
    mockChain({ B: 'M', M: null });
    projectAssignment.listByEmployee.mockResolvedValue([]);

    const result = await service.resolveAudience('A', 'B');

    expect(result.role).toBe('Colleague');
    expect(result.sections.S1).toBe('R');
    expect(result.sections.S10).toBe('R');
    expect(result.sections.S11).toBe('R');
    expect(result.sections.S2).toBe('none');
    expect(result.sections.S9).toBe('none');
    // Story 1.10 / CAP-2 exception: S16 is granted so per-field visibility
    // can filter it, unlike the flat 'none' on every other denied section.
    expect(result.sections.S16).toBe('R');
  });

  it('resolves Colleague and never loops on a cyclical manager chain', async () => {
    // B -> M -> B -> ... a corrupted cycle that never reaches viewer A
    mockChain({ B: 'M', M: 'B' });
    projectAssignment.listByEmployee.mockResolvedValue([]);

    const result = await service.resolveAudience('A', 'B');

    expect(result.role).toBe('Colleague');
    expect(prisma.employee.findUnique.mock.calls.length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('resolves Colleague when the chain hits a dangling/invalid id mid-walk, without throwing', async () => {
    // B.managerId = 'ghost', but no Employee row exists for 'ghost'
    mockChain({ B: 'ghost' });
    projectAssignment.listByEmployee.mockResolvedValue([]);

    await expect(
      service.resolveAudience('someone', 'B'),
    ).resolves.toMatchObject({ role: 'Colleague' });
  });

  it('resolves Colleague and never loops on a single-node self-referencing cycle', async () => {
    // X.managerId = X (corrupted self-reference)
    mockChain({ X: 'X' });
    projectAssignment.listByEmployee.mockResolvedValue([]);

    const result = await service.resolveAudience('A', 'X');

    expect(result.role).toBe('Colleague');
    expect(prisma.employee.findUnique.mock.calls.length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('resolves Colleague when only viewerId is empty and subjectId is a real chain', async () => {
    // B.managerId = M, M has no manager; viewerId is an empty string
    mockChain({ B: 'M', M: null });
    projectAssignment.listByEmployee.mockResolvedValue([]);

    const result = await service.resolveAudience('', 'B');

    expect(result.role).toBe('Colleague');
  });

  describe('ProjectLine (Story 1.2)', () => {
    it('grants ProjectLine with S7 RW for a direct DM', async () => {
      // viewer=D; confirmed, active row: employeeId=B, dmId=D
      mockChain({});
      projectAssignment.listByEmployee.mockResolvedValue([row({ dmId: 'D' })]);

      const result = await service.resolveAudience('D', 'B');

      expect(result.role).toBe('ProjectLine');
      expect(result.sections.S7).toBe('RW');
      expect(result.sections.S2).toBe('none');
      expect(result.sections.S3).toBe('none');
    });

    it('grants ProjectLine with S7 R for a direct PM only (viewer not above dmId)', async () => {
      // viewer=P, pmId=P; viewer not above dmId
      mockChain({});
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ pmId: 'P', dmId: 'D' }),
      ]);

      const result = await service.resolveAudience('P', 'B');

      expect(result.role).toBe('ProjectLine');
      expect(result.sections.S7).toBe('R');
    });

    it('grants ProjectLine via the reports-to walk rooted at the DM (above the DM)', async () => {
      // viewer=X, dmId=D, D.managerId = X
      mockChain({ D: 'X', X: null });
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ pmId: 'P', dmId: 'D' }),
      ]);

      const result = await service.resolveAudience('X', 'B');

      expect(result.role).toBe('ProjectLine');
      expect(result.sections.S7).toBe('RW');
    });

    it('grants ProjectLine with S7 R via the walk rooted at the PM only (above the PM, not the DM)', async () => {
      // viewer=X, pmId=P, P.managerId = X; X is not D and not above D
      mockChain({ P: 'X', X: null, D: null });
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ pmId: 'P', dmId: 'D' }),
      ]);

      const result = await service.resolveAudience('X', 'B');

      expect(result.role).toBe('ProjectLine');
      expect(result.sections.S7).toBe('R');
    });

    it('sets S7 RW when any surviving row (not just the first) has a DM match (PM on one project, DM on another)', async () => {
      mockChain({});
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ projectId: 'proj-1', pmId: 'X', dmId: 'other-dm' }),
        row({ projectId: 'proj-2', pmId: 'other-pm', dmId: 'X' }),
      ]);

      const result = await service.resolveAudience('X', 'B');

      expect(result.role).toBe('ProjectLine');
      expect(result.sections.S7).toBe('RW');
    });

    it('falls through to Colleague when the row is unconfirmed', async () => {
      mockChain({});
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ dmId: 'D', confirmed: false }),
      ]);

      const result = await service.resolveAudience('D', 'B');

      expect(result.role).toBe('Colleague');
    });

    it('falls through to Colleague when confirmedAt is older than the 4h freshness window', async () => {
      const stale = new Date(NOW.getTime() - 4 * 60 * 60 * 1000 - 1);
      mockChain({});
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ dmId: 'D', confirmedAt: stale.toISOString() }),
      ]);

      const result = await service.resolveAudience('D', 'B');

      expect(result.role).toBe('Colleague');
    });

    it('falls through to Colleague when confirmedAt is null, regardless of confirmed', async () => {
      mockChain({});
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ dmId: 'D', confirmed: true, confirmedAt: null }),
      ]);

      const result = await service.resolveAudience('D', 'B');

      expect(result.role).toBe('Colleague');
    });

    it('falls through to Colleague when startDate is in the future', async () => {
      const future = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
      mockChain({});
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ dmId: 'D', startDate: future.toISOString() }),
      ]);

      const result = await service.resolveAudience('D', 'B');

      expect(result.role).toBe('Colleague');
    });

    it('falls through to Colleague with no grace period when endDate is in the past', async () => {
      const past = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
      mockChain({});
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ dmId: 'D', endDate: past.toISOString() }),
      ]);

      const result = await service.resolveAudience('D', 'B');

      expect(result.role).toBe('Colleague');
    });

    it("is still active when endDate falls on today's calendar date (inclusive boundary, date-only column)", async () => {
      mockChain({});
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ dmId: 'D', endDate: TODAY.toISOString() }),
      ]);

      const result = await service.resolveAudience('D', 'B');

      expect(result.role).toBe('ProjectLine');
    });

    it("is still active when startDate falls on today's calendar date (inclusive boundary — > not >=)", async () => {
      mockChain({});
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ dmId: 'D', startDate: TODAY.toISOString() }),
      ]);

      const result = await service.resolveAudience('D', 'B');

      expect(result.role).toBe('ProjectLine');
    });

    it('is still fresh when confirmedAt is exactly 4h old (inclusive boundary — > not >=)', async () => {
      const exactlyFourHoursAgo = new Date(NOW.getTime() - 4 * 60 * 60 * 1000);
      mockChain({});
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ dmId: 'D', confirmedAt: exactlyFourHoursAgo.toISOString() }),
      ]);

      const result = await service.resolveAudience('D', 'B');

      expect(result.role).toBe('ProjectLine');
    });

    it('falls through to Colleague when confirmedAt is in the future (clock skew), never treated as fresh', async () => {
      const future = new Date(NOW.getTime() + 60 * 60 * 1000);
      mockChain({});
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ dmId: 'D', confirmedAt: future.toISOString() }),
      ]);

      const result = await service.resolveAudience('D', 'B');

      expect(result.role).toBe('Colleague');
    });

    it('falls through to Colleague when startDate is unparseable (malformed data), never granting access', async () => {
      mockChain({});
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ dmId: 'D', startDate: 'not-a-real-date' }),
      ]);

      const result = await service.resolveAudience('D', 'B');

      expect(result.role).toBe('Colleague');
    });

    it('falls through to Colleague when endDate is unparseable (malformed data), never granting access', async () => {
      mockChain({});
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ dmId: 'D', endDate: 'not-a-real-date' }),
      ]);

      const result = await service.resolveAudience('D', 'B');

      expect(result.role).toBe('Colleague');
    });

    it('falls through to Colleague when confirmedAt is unparseable (malformed data), never treated as fresh', async () => {
      mockChain({});
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ dmId: 'D', confirmedAt: 'not-a-real-date' }),
      ]);

      const result = await service.resolveAudience('D', 'B');

      expect(result.role).toBe('Colleague');
    });

    it('lets ReportingLine short-circuit ProjectLine but still evaluates PP', async () => {
      // viewer manages the subject and is also assigned PP — ProjectLine skipped, PP unioned
      mockChain({ B: 'D' });
      mockSubjectPp('B', 'D');
      projectAssignment.listByEmployee.mockResolvedValue([row({ dmId: 'D' })]);

      const result = await service.resolveAudience('D', 'B');

      expect(result.role).toBe('ReportingLine');
      expect(projectAssignment.listByEmployee).not.toHaveBeenCalled();
      expect(prisma.employee.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'B' },
          select: { peoplePartnerId: true },
        }),
      );
      expect(result.sections.S2).toBe('RW');
    });
  });

  describe('PP (Story 1.3)', () => {
    it('grants PP for the directly assigned people partner', async () => {
      mockSubjectPp('B', 'X');
      mockChain({ X: null });
      projectAssignment.listByEmployee.mockResolvedValue([]);

      const result = await service.resolveAudience('X', 'B');

      expect(result.role).toBe('PP');
      expect(result.sections).toEqual(PP_SECTIONS);
    });

    it('grants PP via the HR line above the assigned PP', async () => {
      mockSubjectPp('B', 'X');
      mockChain({ X: 'H', H: null });
      mockDepartment('H', 'HR');
      projectAssignment.listByEmployee.mockResolvedValue([]);

      const result = await service.resolveAudience('H', 'B');

      expect(result.role).toBe('PP');
      expect(result.sections).toEqual(PP_SECTIONS);
      expect(prisma.departmentHistory.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { employeeId: 'H', effectiveTo: null },
        }),
      );
    });

    it('grants PP via a multi-hop HR line', async () => {
      mockSubjectPp('B', 'X');
      mockChain({ X: 'H', H: 'G', G: null });
      mockDepartment('H', 'HR');
      mockDepartment('G', 'HR');
      projectAssignment.listByEmployee.mockResolvedValue([]);

      const result = await service.resolveAudience('G', 'B');

      expect(result.role).toBe('PP');
      expect(result.sections).toEqual(PP_SECTIONS);
    });

    it('grants PP via HR line when HR_DEPARTMENT_VALUE is a non-default config value', async () => {
      (configService.get as jest.Mock).mockImplementation((key: string) =>
        key === 'HR_DEPARTMENT_VALUE' ? 'PeopleOps' : undefined,
      );
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AccessResolverService,
          { provide: PrismaService, useValue: prisma },
          { provide: ProjectAssignment, useValue: projectAssignment },
          { provide: Clock, useValue: clock },
          { provide: ConfigService, useValue: configService },
          {
            provide: RelationshipGraphGenerationService,
            useValue: graphGeneration,
          },
        ],
      }).compile();
      const configuredService = module.get(AccessResolverService);

      mockSubjectPp('B', 'X');
      mockChain({ X: 'H', H: null });
      mockDepartment('H', 'PeopleOps');
      projectAssignment.listByEmployee.mockResolvedValue([]);

      const result = await configuredService.resolveAudience('H', 'B');

      expect(result.role).toBe('PP');
      expect(result.sections).toEqual(PP_SECTIONS);
    });

    it('does not grant PP via HR line when department value differs by case from HR_DEPARTMENT_VALUE', async () => {
      mockSubjectPp('B', 'X');
      mockChain({ X: 'H', H: null });
      mockDepartment('H', 'hr');
      projectAssignment.listByEmployee.mockResolvedValue([]);

      const result = await service.resolveAudience('H', 'B');

      expect(result.role).toBe('Colleague');
    });

    it('does not grant PP via HR line when the manager is outside HR', async () => {
      mockSubjectPp('B', 'X');
      mockChain({ X: 'H', H: null });
      mockDepartment('H', 'Engineering');
      projectAssignment.listByEmployee.mockResolvedValue([]);

      const result = await service.resolveAudience('H', 'B');

      expect(result.role).toBe('Colleague');
    });

    it('does not grant PP via HR line when the manager has no open department row', async () => {
      mockSubjectPp('B', 'X');
      mockChain({ X: 'H', H: null });
      projectAssignment.listByEmployee.mockResolvedValue([]);

      const result = await service.resolveAudience('H', 'B');

      expect(result.role).toBe('Colleague');
    });

    it('revokes PP access for the previous assignee after reassignment', async () => {
      mockSubjectPp('B', 'X');
      mockChain({ X: null, Y: null });
      projectAssignment.listByEmployee.mockResolvedValue([]);

      const beforeReassign = await service.resolveAudience('X', 'B');
      expect(beforeReassign.role).toBe('PP');

      mockSubjectPp('B', 'Y');

      const former = await service.resolveAudience('X', 'B');
      const current = await service.resolveAudience('Y', 'B');

      expect(former.role).toBe('Colleague');
      expect(current.role).toBe('PP');
    });

    it('resolves Colleague when peoplePartnerId is cleared', async () => {
      mockSubjectPp('B', null);
      mockChain({});
      projectAssignment.listByEmployee.mockResolvedValue([]);

      const result = await service.resolveAudience('X', 'B');

      expect(result.role).toBe('Colleague');
    });

    it('unions PP with ProjectLine so S2 becomes RW', async () => {
      mockSubjectPp('B', 'D');
      mockChain({ D: null });
      projectAssignment.listByEmployee.mockResolvedValue([row({ dmId: 'D' })]);

      const result = await service.resolveAudience('D', 'B');

      expect(result.role).toBe('PP');
      expect(result.sections.S2).toBe('RW');
      expect(result.sections.S7).toBe('RW');
    });

    it('unions PP with ReportingLine so S2 becomes RW while role stays ReportingLine', async () => {
      mockSubjectPp('B', 'M');
      mockChain({ B: 'M', M: null });
      projectAssignment.listByEmployee.mockResolvedValue([]);

      const result = await service.resolveAudience('M', 'B');

      expect(result.role).toBe('ReportingLine');
      expect(result.sections.S2).toBe('RW');
    });

    it('does not evaluate PP when viewer is Self', async () => {
      mockSubjectPp('emp-x', 'other-pp');

      const result = await service.resolveAudience('emp-x', 'emp-x');

      expect(result.role).toBe('Self');
      expect(prisma.employee.findUnique).not.toHaveBeenCalled();
    });

    it('does not loop on a cyclical HR-line walk', async () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      mockSubjectPp('B', 'X');
      mockChain({ X: 'H', H: 'X' });
      mockDepartment('H', 'HR');
      mockDepartment('X', 'HR');
      projectAssignment.listByEmployee.mockResolvedValue([]);

      const result = await service.resolveAudience('A', 'B');

      expect(result.role).toBe('Colleague');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cycle detected while walking HR line'),
      );

      warnSpy.mockRestore();
    });

    it('does not grant HR-line PP when the assigned PP employee row is missing', async () => {
      employees['B'] = { peoplePartnerId: 'X' };
      projectAssignment.listByEmployee.mockResolvedValue([]);

      const result = await service.resolveAudience('H', 'B');

      expect(result.role).toBe('Colleague');
    });

    it('resolves FullAccess when viewer holds an active full-access grant', async () => {
      projectAssignment.listByEmployee.mockResolvedValue([]);
      prisma.fullAccessGrant.findFirst.mockResolvedValue({ id: 'grant-1' });

      const result = await service.resolveAudience('fa-viewer', 'subject');

      expect(result.role).toBe('FullAccess');
      expect(result.sections.S3).toBe('RW');
      expect(result.sections.S7).toBe('RW');
    });
  });

  describe('generation-gated cache (Story 1.13)', () => {
    beforeEach(async () => {
      prisma.fullAccessGrant.findFirst.mockResolvedValue(null);
      configService.get.mockImplementation((key: string) => {
        if (key === 'HR_DEPARTMENT_VALUE') {
          return 'HR';
        }
        if (key === 'ACCESS_RESOLUTION_CACHE_ENABLED') {
          return true;
        }
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AccessResolverService,
          { provide: PrismaService, useValue: prisma },
          { provide: ProjectAssignment, useValue: projectAssignment },
          { provide: Clock, useValue: clock },
          { provide: ConfigService, useValue: configService },
          {
            provide: RelationshipGraphGenerationService,
            useValue: graphGeneration,
          },
        ],
      }).compile();

      service = module.get(AccessResolverService);
    });

    it('serves a cache hit without re-fetching project assignments when generation is unchanged', async () => {
      mockChain({ D: 'M', B: 'D' });

      await service.resolveAudience('M', 'B');
      await service.resolveAudience('M', 'B');

      expect(projectAssignment.listByEmployee).not.toHaveBeenCalled();
    });

    it('recomputes when generation bumps after a warm cache', async () => {
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ dmId: 'D', pmId: 'P' }),
      ]);

      await service.resolveAudience('D', 'B');
      graphGeneration.getGeneration.mockReturnValue(1n);
      projectAssignment.listByEmployee.mockResolvedValue([]);

      const result = await service.resolveAudience('D', 'B');

      expect(projectAssignment.listByEmployee).toHaveBeenCalledTimes(2);
      expect(result.role).toBe('Colleague');
    });

    it('discards a warm cache entry when confirmedAt freshness expires without a generation bump', async () => {
      const confirmedAt = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
      projectAssignment.listByEmployee.mockResolvedValue([
        row({
          dmId: 'D',
          pmId: 'P',
          confirmedAt: confirmedAt.toISOString(),
        }),
      ]);

      const first = await service.resolveAudience('D', 'B');
      expect(first.role).toBe('ProjectLine');

      clock.now.mockReturnValue(
        new Date(confirmedAt.getTime() + 4 * 60 * 60 * 1000 + 1),
      );
      clock.nowMs.mockReturnValue(
        confirmedAt.getTime() + 4 * 60 * 60 * 1000 + 1,
      );

      const second = await service.resolveAudience('D', 'B');

      expect(second.role).toBe('Colleague');
      expect(projectAssignment.listByEmployee).toHaveBeenCalledTimes(2);
    });

    it('grants ProjectLine after startDate arrives when cache is warm and generation unchanged', async () => {
      const futureStart = new Date(
        Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate() + 1),
      );
      const afterStart = new Date(futureStart.getTime() + 12 * 60 * 60 * 1000);
      projectAssignment.listByEmployee.mockResolvedValue([
        row({
          dmId: 'D',
          pmId: 'P',
          startDate: futureStart.toISOString().slice(0, 10),
          confirmedAt: afterStart.toISOString(),
        }),
      ]);

      const denied = await service.resolveAudience('D', 'B');
      expect(denied.role).toBe('Colleague');

      clock.now.mockReturnValue(afterStart);
      clock.nowMs.mockReturnValue(afterStart.getTime());

      const granted = await service.resolveAudience('D', 'B');
      expect(granted.role).toBe('ProjectLine');
    });

    it('discards a warm cache entry when endDate boundary passes without a generation bump', async () => {
      const endDate = TODAY.toISOString().slice(0, 10);
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ dmId: 'D', pmId: 'P', endDate }),
      ]);

      const active = await service.resolveAudience('D', 'B');
      expect(active.role).toBe('ProjectLine');

      const afterEnd = new Date(
        Date.UTC(
          TODAY.getUTCFullYear(),
          TODAY.getUTCMonth(),
          TODAY.getUTCDate() + 1,
        ),
      );
      clock.now.mockReturnValue(afterEnd);
      clock.nowMs.mockReturnValue(afterEnd.getTime());

      const denied = await service.resolveAudience('D', 'B');

      expect(denied.role).toBe('Colleague');
      expect(projectAssignment.listByEmployee).toHaveBeenCalledTimes(2);
    });

    it('recomputes ProjectLine when generation bumps after a confirmed flip on a warm cache', async () => {
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ dmId: 'D', pmId: 'P' }),
      ]);

      await service.resolveAudience('D', 'B');
      graphGeneration.getGeneration.mockReturnValue(1n);
      projectAssignment.listByEmployee.mockResolvedValue([
        row({ dmId: 'D', pmId: 'P', confirmed: false, confirmedAt: null }),
      ]);

      const denied = await service.resolveAudience('D', 'B');

      expect(denied.role).toBe('Colleague');
      expect(projectAssignment.listByEmployee).toHaveBeenCalledTimes(2);
    });

    it('recomputes reporting-line audience after generation bumps following a warm cache', async () => {
      mockChain({ B: 'M', M: null });
      projectAssignment.listByEmployee.mockResolvedValue([]);

      const before = await service.resolveAudience('M', 'B');
      expect(before.role).toBe('ReportingLine');

      graphGeneration.getGeneration.mockReturnValue(1n);
      mockChain({ B: 'N', N: null });

      const after = await service.resolveAudience('M', 'B');

      expect(after.role).toBe('Colleague');
      expect(prisma.employee.findUnique).toHaveBeenCalled();
    });

    it('recomputes PP audience after generation bumps following a warm cache', async () => {
      mockSubjectPp('B', 'X');
      mockChain({ X: null });
      projectAssignment.listByEmployee.mockResolvedValue([]);

      const before = await service.resolveAudience('X', 'B');
      expect(before.role).toBe('PP');

      graphGeneration.getGeneration.mockReturnValue(1n);
      mockSubjectPp('B', 'Y');

      const former = await service.resolveAudience('X', 'B');
      const current = await service.resolveAudience('Y', 'B');

      expect(former.role).toBe('Colleague');
      expect(current.role).toBe('PP');
    });

    it('re-runs PP HR-line predicates on cache hit when department membership changes without a generation bump', async () => {
      mockSubjectPp('B', 'X');
      mockChain({ X: 'H', H: null });
      mockDepartment('H', 'HR');
      projectAssignment.listByEmployee.mockResolvedValue([]);

      const granted = await service.resolveAudience('H', 'B');
      expect(granted.role).toBe('PP');

      mockDepartment('H', 'Engineering');

      const denied = await service.resolveAudience('H', 'B');

      expect(denied.role).toBe('Colleague');
      expect(prisma.departmentHistory.findFirst).toHaveBeenCalled();
    });

    it('re-queries FullAccessGrant on cache hit when grant is revoked without a generation bump', async () => {
      projectAssignment.listByEmployee.mockResolvedValue([]);
      prisma.fullAccessGrant.findFirst.mockResolvedValue({ id: 'grant-1' });

      const granted = await service.resolveAudience('fa-viewer', 'subject');
      expect(granted.role).toBe('FullAccess');
      const callsAfterGrant =
        prisma.fullAccessGrant.findFirst.mock.calls.length;

      prisma.fullAccessGrant.findFirst.mockResolvedValue(null);

      const denied = await service.resolveAudience('fa-viewer', 'subject');

      expect(denied.role).toBe('Colleague');
      expect(
        prisma.fullAccessGrant.findFirst.mock.calls.length,
      ).toBeGreaterThan(callsAfterGrant);
    });

    it('evicts a warm cache entry when TTL expires and recomputes the same audience', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'HR_DEPARTMENT_VALUE') {
          return 'HR';
        }
        if (key === 'ACCESS_RESOLUTION_CACHE_ENABLED') {
          return true;
        }
        if (key === 'ACCESS_RESOLUTION_CACHE_TTL_MS') {
          return 1_000;
        }
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AccessResolverService,
          { provide: PrismaService, useValue: prisma },
          { provide: ProjectAssignment, useValue: projectAssignment },
          { provide: Clock, useValue: clock },
          { provide: ConfigService, useValue: configService },
          {
            provide: RelationshipGraphGenerationService,
            useValue: graphGeneration,
          },
        ],
      }).compile();
      const ttlService = module.get(AccessResolverService);

      mockChain({ B: 'M', M: null });
      projectAssignment.listByEmployee.mockResolvedValue([]);

      const first = await ttlService.resolveAudience('M', 'B');
      expect(first.role).toBe('ReportingLine');
      const callsAfterFirst = prisma.employee.findUnique.mock.calls.length;

      clock.nowMs.mockReturnValue(NOW.getTime() + 2_000);

      const second = await ttlService.resolveAudience('M', 'B');

      expect(second.role).toBe('ReportingLine');
      expect(prisma.employee.findUnique.mock.calls.length).toBeGreaterThan(
        callsAfterFirst,
      );
    });
  });
});
