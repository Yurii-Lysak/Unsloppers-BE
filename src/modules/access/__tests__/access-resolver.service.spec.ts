import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { Clock } from '../../../clock/clock.service';
import { ProjectAssignment } from '../../contracts/project-assignment.contract';
import { AccessResolverService } from '../access-resolver.service';

describe('AccessResolverService', () => {
  let service: AccessResolverService;

  const prisma = {
    employee: {
      findUnique: jest.fn(),
    },
  };

  const projectAssignment = {
    listByEmployee: jest.fn(),
    listByProject: jest.fn(),
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

  /** Chains a sequence of `managerId` lookups by employee id. */
  const mockChain = (chain: Record<string, string | null>) => {
    prisma.employee.findUnique.mockImplementation(
      ({ where: { id } }: { where: { id: string } }) => {
        if (!(id in chain)) {
          return Promise.resolve(null);
        }
        return Promise.resolve({ managerId: chain[id] });
      },
    );
  };

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

  beforeEach(async () => {
    jest.clearAllMocks();
    clock.now.mockReturnValue(NOW);
    clock.nowMs.mockReturnValue(NOW.getTime());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProjectAssignment, useValue: projectAssignment },
        { provide: Clock, useValue: clock },
      ],
    }).compile();

    service = module.get(AccessResolverService);
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
    expect(Object.values(result.sections).every((v) => v === 'none')).toBe(
      true,
    );
  });

  it('resolves Colleague and never loops on a cyclical manager chain', async () => {
    // B -> M -> B -> ... a corrupted cycle that never reaches viewer A
    mockChain({ B: 'M', M: 'B' });
    projectAssignment.listByEmployee.mockResolvedValue([]);

    const result = await service.resolveAudience('A', 'B');

    expect(result.role).toBe('Colleague');
    expect(prisma.employee.findUnique).toHaveBeenCalledTimes(2);
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
    expect(prisma.employee.findUnique).toHaveBeenCalledTimes(1);
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

    it('lets ReportingLine short-circuit first when the viewer is both PM/DM and above the subject in the reports-to chain', async () => {
      // viewer also PM/DM of a shared project, and directly manages the subject
      mockChain({ B: 'D' });
      projectAssignment.listByEmployee.mockResolvedValue([row({ dmId: 'D' })]);

      const result = await service.resolveAudience('D', 'B');

      expect(result.role).toBe('ReportingLine');
      expect(projectAssignment.listByEmployee).not.toHaveBeenCalled();
    });
  });
});
