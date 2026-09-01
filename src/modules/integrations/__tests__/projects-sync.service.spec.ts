import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Clock } from '../../../clock/clock.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TimetrackerClient } from '../../contracts/timetracker-client.contract';
import { TimetrackerApiError } from '../../contracts/timetracker.errors';
import { ProjectStatus } from '../../contracts/timetracker.types';
import {
  NormalizedProjectAssignment,
  ProjectAssignmentMapper,
} from '../project-assignment.mapper';
import { ProjectsSyncService } from '../projects-sync.service';

interface StoredAssignment extends Omit<
  NormalizedProjectAssignment,
  'sourceKey'
> {
  sourceKey: string | null;
  source: string;
  confirmed: boolean;
  confirmedAt: Date | null;
}

interface UpsertArgs {
  where: { sourceKey: string };
  create: StoredAssignment;
  update: Partial<StoredAssignment>;
}

interface UpdateManyArgs {
  where: {
    source: string;
    sourceKey?: { notIn: string[] };
    confirmed: boolean;
  };
  data: { confirmed: boolean };
}

interface TransactionClient {
  projectAssignment: {
    upsert(args: UpsertArgs): Promise<void>;
    updateMany(args: UpdateManyArgs): Promise<{ count: number }>;
  };
}

describe('ProjectsSyncService', () => {
  const NOW = new Date('2026-09-01T10:15:30.000Z');
  const timetracker = {
    fetchAccountingReport: jest.fn(),
    fetchTalentsProjects: jest.fn(),
  };
  const mapper = { map: jest.fn() };
  const clock = { now: jest.fn() };
  let rows: StoredAssignment[];
  let failAfterFirstUpsert: boolean;
  let upsertCount: number;
  let prisma: {
    $transaction: jest.Mock;
  };
  let service: ProjectsSyncService;
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    rows = [];
    failAfterFirstUpsert = false;
    upsertCount = 0;
    clock.now.mockReturnValue(NOW);
    timetracker.fetchAccountingReport.mockResolvedValue({
      employees: [],
    });
    timetracker.fetchTalentsProjects.mockResolvedValue({
      projects: [],
      statuses: [],
      types: [],
    });
    mapper.map.mockResolvedValue(mapping([]));

    prisma = {
      $transaction: jest.fn(
        async (
          callback: (tx: TransactionClient) => Promise<unknown>,
        ): Promise<unknown> => {
          const pendingRows = rows.map(cloneRow);
          const tx = createTransactionClient(pendingRows, () => {
            upsertCount += 1;
            if (failAfterFirstUpsert && upsertCount === 1) {
              throw new Error('synthetic transaction failure');
            }
          });
          const result = await callback(tx);
          rows = pendingRows;
          return result;
        },
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        ProjectsSyncService,
        { provide: TimetrackerClient, useValue: timetracker },
        { provide: ProjectAssignmentMapper, useValue: mapper },
        { provide: PrismaService, useValue: prisma },
        { provide: Clock, useValue: clock },
      ],
    }).compile();
    service = module.get(ProjectsSyncService);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('confirms mapped assignments atomically with one fixed-clock timestamp', async () => {
    const directoryEmployees = [{ id: 10 }];
    const projectRows = [{ id: 100 }];
    timetracker.fetchAccountingReport.mockResolvedValue({
      employees: directoryEmployees,
    });
    timetracker.fetchTalentsProjects.mockResolvedValue({
      projects: projectRows,
      statuses: [],
      types: [],
    });
    mapper.map.mockResolvedValue(mapping([assignment()]));

    await expect(service.sync()).resolves.toEqual({
      status: 'succeeded',
      confirmed: 1,
      deconfirmed: 0,
    });

    expect(clock.now).toHaveBeenCalledTimes(1);
    expect(timetracker.fetchAccountingReport).toHaveBeenCalledWith({
      month: 9,
      year: 2026,
    });
    expect(timetracker.fetchTalentsProjects).toHaveBeenCalledWith([
      ProjectStatus.Active,
      ProjectStatus.Support,
    ]);
    expect(mapper.map).toHaveBeenCalledWith(projectRows, directoryEmployees);
    expect(rows).toEqual([
      {
        ...assignment(),
        source: 'timetracker',
        confirmed: true,
        confirmedAt: NOW,
      },
    ]);
  });

  it('deconfirms only missing TimeTracker-owned rows and preserves manual duplicates', async () => {
    const manualOne = stored({
      sourceKey: null,
      source: 'manual',
    });
    const manualTwo = stored({
      sourceKey: null,
      source: 'manual',
    });
    const missingTimetracker = stored({
      sourceKey: 'timetracker:999:10',
      source: 'timetracker',
      confirmedAt: new Date('2026-09-01T08:00:00.000Z'),
    });
    rows = [manualOne, manualTwo, missingTimetracker];
    mapper.map.mockResolvedValue(mapping([assignment()]));

    await expect(service.sync()).resolves.toMatchObject({
      status: 'succeeded',
      deconfirmed: 1,
    });

    expect(rows[0]).toEqual(manualOne);
    expect(rows[1]).toEqual(manualTwo);
    expect(rows[2]).toEqual({
      ...missingTimetracker,
      confirmed: false,
    });
    expect(rows).toHaveLength(4);
  });

  it('deconfirms all TimeTracker rows after a successful empty authoritative feed', async () => {
    const manual = stored({ sourceKey: null, source: 'manual' });
    rows = [
      manual,
      stored({ sourceKey: 'timetracker:100:10' }),
      stored({ sourceKey: 'timetracker:200:11' }),
    ];

    await expect(service.sync()).resolves.toMatchObject({
      status: 'succeeded',
      deconfirmed: 2,
    });

    expect(rows[0]).toEqual(manual);
    expect(rows.slice(1).every((row) => !row.confirmed)).toBe(true);
  });

  it('commits valid rows and deconfirms a previously confirmed genuine omission', async () => {
    const omitted = stored({ sourceKey: 'timetracker:100:10' });
    rows = [omitted];
    mapper.map.mockResolvedValue({
      ...mapping([
        assignment({
          sourceKey: 'timetracker:100:11',
          employeeId: 'employee-11',
        }),
      ]),
      omissions: {
        directoryMisses: 1,
        identityMisses: 1,
        duplicateAssignments: 0,
        omittedAssignments: 1,
      },
    });

    await expect(service.sync()).resolves.toMatchObject({
      status: 'succeeded',
      confirmed: 1,
      deconfirmed: 1,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ ...omitted, confirmed: false });
    expect(rows[1]).toMatchObject({
      sourceKey: 'timetracker:100:11',
      confirmed: true,
    });
  });

  it('upserts by source key without duplicating rows and refreshes confirmation', async () => {
    mapper.map.mockResolvedValue(mapping([assignment()]));
    await service.sync();
    const later = new Date('2026-09-01T10:30:30.000Z');
    clock.now.mockReturnValue(later);

    await service.sync();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sourceKey: 'timetracker:100:10',
      confirmed: true,
      confirmedAt: later,
    });
  });

  it('leaves all rows and timestamps unchanged when a feed request fails', async () => {
    rows = [stored()];
    const before = rows.map(cloneRow);
    timetracker.fetchTalentsProjects.mockRejectedValue(
      new TimetrackerApiError('GET /api/projects/talents', 503),
    );

    await expect(service.sync()).resolves.toEqual({ status: 'failed' });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(rows).toEqual(before);
  });

  it('logs only sanitized endpoint and status details for API failures', async () => {
    timetracker.fetchTalentsProjects.mockRejectedValue(
      new TimetrackerApiError(
        'GET /api/projects/talents',
        502,
        new Error('sentinel-exception-message'),
        'sentinel-response-body user@example.test payload-value',
      ),
    );

    await service.sync();

    const warning = String((warnSpy.mock.calls as unknown[][])[0]?.[0]);
    expect(warning).toContain('endpoint=GET /api/projects/talents');
    expect(warning).toContain('status=502');
    expect(warning).not.toContain('sentinel');
    expect(warning).not.toContain('user@example.test');
    expect(warning).not.toContain('payload-value');
  });

  it('logs only the error type for non-API failures', async () => {
    mapper.map.mockRejectedValue(
      new TypeError(
        'sentinel-mapper-message user@example.test sentinel-payload',
      ),
    );

    await service.sync();

    const warning = String((warnSpy.mock.calls as unknown[][])[0]?.[0]);
    expect(warning).toContain('type=TypeError');
    expect(warning).not.toContain('sentinel');
    expect(warning).not.toContain('user@example.test');
  });

  it('recovers on the next run after a failed request', async () => {
    timetracker.fetchTalentsProjects.mockRejectedValueOnce(
      new TimetrackerApiError('GET /api/projects/talents', 503),
    );

    await expect(service.sync()).resolves.toEqual({ status: 'failed' });
    await expect(service.sync()).resolves.toMatchObject({
      status: 'succeeded',
    });

    expect(timetracker.fetchTalentsProjects).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed successful payloads without opening a transaction', async () => {
    timetracker.fetchAccountingReport.mockResolvedValue({
      employees: 'not-an-array',
    });

    await expect(service.sync()).resolves.toEqual({ status: 'failed' });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rolls back every assignment change when the transaction fails', async () => {
    rows = [
      stored({
        confirmedAt: new Date('2026-09-01T08:00:00.000Z'),
      }),
    ];
    const before = rows.map(cloneRow);
    mapper.map.mockResolvedValue(
      mapping([
        assignment(),
        assignment({
          sourceKey: 'timetracker:100:11',
          employeeId: 'employee-11',
        }),
      ]),
    );
    failAfterFirstUpsert = true;

    await expect(service.sync()).resolves.toEqual({ status: 'failed' });

    expect(rows).toEqual(before);
  });

  it('skips an overlapping run without making duplicate requests', async () => {
    const pendingDirectory = deferred<{ employees: [] }>();
    timetracker.fetchAccountingReport.mockReturnValue(pendingDirectory.promise);

    const first = service.sync();
    await expect(service.sync()).resolves.toEqual({ status: 'skipped' });
    pendingDirectory.resolve({ employees: [] });
    await expect(first).resolves.toMatchObject({ status: 'succeeded' });

    expect(timetracker.fetchAccountingReport).toHaveBeenCalledTimes(1);
    expect(timetracker.fetchTalentsProjects).toHaveBeenCalledTimes(1);
  });

  it('keeps the overlap guard until both parallel requests have settled', async () => {
    const pendingDirectory = deferred<{ employees: [] }>();
    timetracker.fetchAccountingReport.mockReturnValue(pendingDirectory.promise);
    timetracker.fetchTalentsProjects.mockRejectedValue(
      new TimetrackerApiError('GET /api/projects/talents', 503),
    );

    const first = service.sync();
    await expect(service.sync()).resolves.toEqual({ status: 'skipped' });
    pendingDirectory.resolve({ employees: [] });
    await expect(first).resolves.toEqual({ status: 'failed' });

    expect(timetracker.fetchAccountingReport).toHaveBeenCalledTimes(1);
  });
});

function assignment(
  overrides: Partial<NormalizedProjectAssignment> = {},
): NormalizedProjectAssignment {
  return {
    sourceKey: 'timetracker:100:10',
    employeeId: 'employee-10',
    projectId: '100',
    pmId: 'employee-20',
    dmId: 'employee-30',
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: null,
    ...overrides,
  };
}

function stored(overrides: Partial<StoredAssignment> = {}): StoredAssignment {
  return {
    ...assignment(),
    source: 'timetracker',
    confirmed: true,
    confirmedAt: new Date('2026-09-01T09:00:00.000Z'),
    ...overrides,
  };
}

function mapping(assignments: NormalizedProjectAssignment[]) {
  return {
    assignments,
    omissions: {
      directoryMisses: 0,
      identityMisses: 0,
      duplicateAssignments: 0,
      omittedAssignments: 0,
    },
  };
}

function cloneRow(row: StoredAssignment): StoredAssignment {
  return {
    ...row,
    startDate: new Date(row.startDate),
    endDate: row.endDate ? new Date(row.endDate) : null,
    confirmedAt: row.confirmedAt ? new Date(row.confirmedAt) : null,
  };
}

function createTransactionClient(
  pendingRows: StoredAssignment[],
  afterUpsert: () => void,
): TransactionClient {
  return {
    projectAssignment: {
      upsert(args: UpsertArgs): Promise<void> {
        const existing = pendingRows.find(
          (row) => row.sourceKey === args.where.sourceKey,
        );
        if (existing) {
          Object.assign(existing, args.update);
        } else {
          pendingRows.push(cloneRow(args.create));
        }
        afterUpsert();
        return Promise.resolve();
      },
      updateMany(args: UpdateManyArgs): Promise<{ count: number }> {
        let count = 0;
        for (const row of pendingRows) {
          const excluded = args.where.sourceKey?.notIn ?? [];
          if (
            row.source === args.where.source &&
            row.confirmed === args.where.confirmed &&
            (row.sourceKey === null || !excluded.includes(row.sourceKey))
          ) {
            row.confirmed = args.data.confirmed;
            count += 1;
          }
        }
        return Promise.resolve({ count });
      },
    },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
