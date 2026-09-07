import { Global, INestApplication, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { envValidationSchema } from '../../config/env.validation';
import { Prisma } from '../../generated/prisma/client';
import { TimelineEventWriter } from '../../modules/contracts/timeline-event-writer.contract';
import {
  ConcurrentHistoryWriteError,
  HistoryTableWriteRejectedError,
  ManualConflictSuppressedError,
  OutOfOrderEffectiveDateError,
} from '../extensions/temporal-history.extension';
import { PrismaModule } from '../prisma.module';
import { PrismaService } from '../prisma.service';

/**
 * Exercises the temporal-history Prisma Client Extension against a REAL
 * Postgres DB (docker-compose, `npm run db:up`) — every I/O & Edge-Case
 * Matrix row from spec-1-20, parameterized across the 4 dimension models.
 *
 * `TimelineEventWriter` (C4) is overridden with a jest mock (instead of the
 * real Wave-0 stub) so tests can assert call args and simulate a C4 failure
 * for the rollback row — the extension itself is the real, DI-wired one
 * from `PrismaModule`.
 */

const timelineEventWriterMock = {
  recordTimelineEvent: jest.fn().mockResolvedValue(undefined),
  markSystemWriteSkipped: jest.fn().mockResolvedValue(undefined),
};

@Global()
@Module({
  providers: [
    { provide: TimelineEventWriter, useValue: timelineEventWriterMock },
  ],
  exports: [TimelineEventWriter],
})
class MockContractsModule {}

interface HistoryRow {
  id: string;
  employeeId: string;
  value: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

interface HistoryDelegate {
  create(args: { data: unknown }): Promise<HistoryRow>;
  findMany(args: { where: { employeeId: string } }): Promise<HistoryRow[]>;
  findUnique(args: unknown): Promise<HistoryRow | null>;
  findUniqueOrThrow(args: unknown): Promise<HistoryRow>;
  update(args: { where: { id: string }; data: unknown }): Promise<HistoryRow>;
  updateMany(args: unknown): Promise<{ count: number }>;
  updateManyAndReturn(args: unknown): Promise<HistoryRow[]>;
  delete(args: { where: { id: string } }): Promise<HistoryRow>;
  deleteMany(args: unknown): Promise<{ count: number }>;
  upsert(args: unknown): Promise<HistoryRow>;
  createMany(args: unknown): Promise<{ count: number }>;
  createManyAndReturn(args: unknown): Promise<HistoryRow[]>;
}

const DIMENSIONS = [
  { model: 'GradeHistory', property: 'gradeHistory', type: 'grade' },
  { model: 'PositionHistory', property: 'positionHistory', type: 'position' },
  {
    model: 'DepartmentHistory',
    property: 'departmentHistory',
    type: 'department',
  },
  {
    model: 'EmploymentTypeHistory',
    property: 'employmentTypeHistory',
    type: 'employmentType',
  },
] as const;

/** History-table index name for each dimension (matches the hand-edited partial-unique migration). */
const PARTIAL_INDEX_NAMES: Readonly<Record<string, string>> = {
  gradeHistory: 'grade_history_employeeId_key',
  positionHistory: 'position_history_employeeId_key',
  departmentHistory: 'department_history_employeeId_key',
  employmentTypeHistory: 'employment_type_history_employeeId_key',
};

describe('temporal-history.extension (I/O matrix, real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emailPrefix = `temporal-history-ext-${Date.now()}`;
  let counter = 0;

  const delegate = (property: string): HistoryDelegate =>
    (prisma as unknown as Record<string, HistoryDelegate>)[property];

  const createEmployee = async () => {
    counter += 1;
    const user = await prisma.user.create({
      data: { email: `${emailPrefix}-${counter}@example.com` },
    });
    const employee = await prisma.employee.create({
      data: { userId: user.id },
    });
    return employee.id;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validationSchema: envValidationSchema,
        }),
        MockContractsModule,
        PrismaModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Raw SQL cleanup: `delete`/`update`/`createMany` on the 4 history
    // models are rejected by the extension itself, and Employee's FK to
    // these tables is onDelete: Restrict — so the extended model API
    // cannot tear this data down. `$executeRaw` bypasses model-level
    // interception (the story's own documented, accepted gap), which is
    // exactly what test cleanup needs here.
    const pattern = `${emailPrefix}%`;
    await prisma.$executeRaw`DELETE FROM grade_history WHERE "employeeId" IN (SELECT e.id FROM employees e JOIN users u ON u.id = e."userId" WHERE u.email LIKE ${pattern})`;
    await prisma.$executeRaw`DELETE FROM position_history WHERE "employeeId" IN (SELECT e.id FROM employees e JOIN users u ON u.id = e."userId" WHERE u.email LIKE ${pattern})`;
    await prisma.$executeRaw`DELETE FROM department_history WHERE "employeeId" IN (SELECT e.id FROM employees e JOIN users u ON u.id = e."userId" WHERE u.email LIKE ${pattern})`;
    await prisma.$executeRaw`DELETE FROM employment_type_history WHERE "employeeId" IN (SELECT e.id FROM employees e JOIN users u ON u.id = e."userId" WHERE u.email LIKE ${pattern})`;
    await prisma.$executeRaw`DELETE FROM timeline_events WHERE "employeeId" IN (SELECT e.id FROM employees e JOIN users u ON u.id = e."userId" WHERE u.email LIKE ${pattern})`;
    await prisma.$executeRaw`DELETE FROM employees WHERE "userId" IN (SELECT id FROM users WHERE email LIKE ${pattern})`;
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe.each(DIMENSIONS)('$model', ({ property, type }) => {
    it('first-ever write: creates an open row and calls C4 with oldValue null', async () => {
      const employeeId = await createEmployee();
      const effectiveFrom = new Date('2026-01-01T00:00:00.000Z');

      const created = await delegate(property).create({
        data: { employeeId, value: 'L1', effectiveFrom },
      });

      expect(created.value).toBe('L1');
      expect(created.effectiveTo).toBeNull();
      expect(timelineEventWriterMock.recordTimelineEvent).toHaveBeenCalledWith(
        employeeId,
        type,
        '2026-01-01',
        null,
        'L1',
        'system',
        undefined,
        expect.anything(),
      );
    });

    it('value change: closes prior row, creates new row, calls C4 with old+new values', async () => {
      const employeeId = await createEmployee();
      const first = await delegate(property).create({
        data: {
          employeeId,
          value: 'L1',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
      jest.clearAllMocks();

      const second = await delegate(property).create({
        data: {
          employeeId,
          value: 'L2',
          effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
        },
      });

      const closedFirst = (
        await delegate(property).findMany({
          where: { employeeId },
        })
      ).find((r) => r.id === first.id)!;
      expect(closedFirst.effectiveTo).toEqual(
        new Date('2026-02-01T00:00:00.000Z'),
      );
      expect(second.effectiveTo).toBeNull();
      expect(second.value).toBe('L2');
      expect(timelineEventWriterMock.recordTimelineEvent).toHaveBeenCalledWith(
        employeeId,
        type,
        '2026-02-01',
        'L1',
        'L2',
        'system',
        undefined,
        expect.anything(),
      );
    });

    it('no-op value write: still closes prior row, creates new row, calls C4 (no dedup)', async () => {
      const employeeId = await createEmployee();
      const first = await delegate(property).create({
        data: {
          employeeId,
          value: 'SAME',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
      jest.clearAllMocks();

      const second = await delegate(property).create({
        data: {
          employeeId,
          value: 'SAME',
          effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
        },
      });

      const rows = await delegate(property).findMany({ where: { employeeId } });
      expect(rows).toHaveLength(2);
      const closedFirst = rows.find((r) => r.id === first.id)!;
      expect(closedFirst.effectiveTo).not.toBeNull();
      expect(second.effectiveTo).toBeNull();
      expect(timelineEventWriterMock.recordTimelineEvent).toHaveBeenCalledWith(
        employeeId,
        type,
        '2026-02-01',
        'SAME',
        'SAME',
        'system',
        undefined,
        expect.anything(),
      );
    });

    it('out-of-order write: rejected before any DB mutation', async () => {
      const employeeId = await createEmployee();
      const first = await delegate(property).create({
        data: {
          employeeId,
          value: 'L1',
          effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
        },
      });
      jest.clearAllMocks();

      await expect(
        delegate(property).create({
          data: {
            employeeId,
            value: 'L2',
            effectiveFrom: new Date('2026-05-01T00:00:00.000Z'), // < first's effectiveFrom
          },
        }),
      ).rejects.toThrow(OutOfOrderEffectiveDateError);

      const rows = await delegate(property).findMany({ where: { employeeId } });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(first.id);
      expect(rows[0].effectiveTo).toBeNull();
      expect(
        timelineEventWriterMock.recordTimelineEvent,
      ).not.toHaveBeenCalled();
    });

    it('same effectiveFrom as the open row: amends value in place without a new history row', async () => {
      const employeeId = await createEmployee();
      const effectiveFrom = new Date('2026-06-01T00:00:00.000Z');
      const first = await delegate(property).create({
        data: {
          employeeId,
          value: 'L1',
          effectiveFrom,
        },
      });
      await prisma.timelineEvent.create({
        data: {
          employeeId,
          type,
          effectiveDate: effectiveFrom,
          source: 'system',
          oldValue: null,
          newValue: 'L1',
        },
      });
      jest.clearAllMocks();

      const amended = await delegate(property).create({
        data: {
          employeeId,
          value: 'L2',
          effectiveFrom,
        },
      });

      const rows = await delegate(property).findMany({ where: { employeeId } });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(first.id);
      expect(amended.id).toBe(first.id);
      expect(rows[0].value).toBe('L2');
      expect(rows[0].effectiveTo).toBeNull();
      expect(
        timelineEventWriterMock.recordTimelineEvent,
      ).not.toHaveBeenCalled();

      const timelineRows = await prisma.timelineEvent.findMany({
        where: { employeeId, type, effectiveDate: effectiveFrom },
      });
      expect(timelineRows).toHaveLength(1);
      expect(timelineRows[0]?.newValue).toBe('L2');
    });

    it('same effectiveFrom with unchanged value: no-op, no timeline write', async () => {
      const employeeId = await createEmployee();
      const first = await delegate(property).create({
        data: {
          employeeId,
          value: 'L1',
          effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
        },
      });
      jest.clearAllMocks();

      const result = await delegate(property).create({
        data: {
          employeeId,
          value: 'L1',
          effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
        },
      });

      expect(result.id).toBe(first.id);
      const rows = await delegate(property).findMany({ where: { employeeId } });
      expect(rows).toHaveLength(1);
      expect(
        timelineEventWriterMock.recordTimelineEvent,
      ).not.toHaveBeenCalled();
    });

    it('manual-entry conflict (prior open row exists): throws ManualConflictSuppressedError, leaves prior row open, calls markSystemWriteSkipped, creates nothing', async () => {
      const employeeId = await createEmployee();
      const openRow = await delegate(property).create({
        data: {
          employeeId,
          value: 'L1',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      });

      const conflictDate = new Date('2026-03-01T00:00:00.000Z');
      const manualEvent = await prisma.timelineEvent.create({
        data: {
          employeeId,
          type,
          effectiveDate: conflictDate,
          source: 'manual',
        },
      });
      jest.clearAllMocks();

      const attempt = delegate(property).create({
        data: { employeeId, value: 'L2', effectiveFrom: conflictDate },
      });

      await expect(attempt).rejects.toThrow(ManualConflictSuppressedError);
      await expect(attempt).rejects.toMatchObject({
        manualEventId: manualEvent.id,
      });
      expect(
        timelineEventWriterMock.markSystemWriteSkipped,
      ).toHaveBeenCalledWith(manualEvent.id, expect.any(String));
      expect(
        timelineEventWriterMock.recordTimelineEvent,
      ).not.toHaveBeenCalled();

      const rows = await delegate(property).findMany({ where: { employeeId } });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(openRow.id);
      expect(rows[0].effectiveTo).toBeNull(); // prior row left open
    });

    it('manual-entry conflict (no prior history row at all): throws ManualConflictSuppressedError, creates nothing', async () => {
      const employeeId = await createEmployee();
      const conflictDate = new Date('2026-04-01T00:00:00.000Z');
      const manualEvent = await prisma.timelineEvent.create({
        data: {
          employeeId,
          type,
          effectiveDate: conflictDate,
          source: 'manual',
        },
      });

      const attempt = delegate(property).create({
        data: { employeeId, value: 'L1', effectiveFrom: conflictDate },
      });

      await expect(attempt).rejects.toThrow(ManualConflictSuppressedError);
      await expect(attempt).rejects.toMatchObject({
        manualEventId: manualEvent.id,
      });
      expect(
        timelineEventWriterMock.markSystemWriteSkipped,
      ).toHaveBeenCalledWith(manualEvent.id, expect.any(String));
      expect(
        timelineEventWriterMock.recordTimelineEvent,
      ).not.toHaveBeenCalled();

      const rows = await delegate(property).findMany({ where: { employeeId } });
      expect(rows).toHaveLength(0); // no history row created at all
    });

    it('out-of-order write that also date-matches a manual entry: throws OutOfOrderEffectiveDateError, not suppressed as a conflict', async () => {
      const employeeId = await createEmployee();
      const openRowEffectiveFrom = new Date('2026-06-01T00:00:00.000Z');
      await delegate(property).create({
        data: { employeeId, value: 'L1', effectiveFrom: openRowEffectiveFrom },
      });

      // Backdated relative to the open row, but coincides with a manual entry.
      const backdated = new Date('2026-05-01T00:00:00.000Z');
      const manualEvent = await prisma.timelineEvent.create({
        data: {
          employeeId,
          type,
          effectiveDate: backdated,
          source: 'manual',
        },
      });
      jest.clearAllMocks();

      await expect(
        delegate(property).create({
          data: { employeeId, value: 'L2', effectiveFrom: backdated },
        }),
      ).rejects.toThrow(OutOfOrderEffectiveDateError);

      // The manual-conflict path must never have been reached.
      expect(
        timelineEventWriterMock.markSystemWriteSkipped,
      ).not.toHaveBeenCalled();
      expect(
        timelineEventWriterMock.recordTimelineEvent,
      ).not.toHaveBeenCalled();

      // Manual entry and prior open row are both untouched.
      const manualStillThere = await prisma.timelineEvent.findUnique({
        where: { id: manualEvent.id },
      });
      expect(manualStillThere).not.toBeNull();
      const rows = await delegate(property).findMany({ where: { employeeId } });
      expect(rows).toHaveLength(1);
      expect(rows[0].effectiveTo).toBeNull();
    });

    it('date-corrected manual with system anchor: transition fallback suppresses the write', async () => {
      const employeeId = await createEmployee();
      const inferredDate = new Date('2026-01-10T00:00:00.000Z');
      const correctedDate = new Date('2026-01-15T00:00:00.000Z');

      await delegate(property).create({
        data: {
          employeeId,
          value: 'Middle',
          effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
        },
      });

      await prisma.timelineEvent.create({
        data: {
          employeeId,
          type,
          effectiveDate: inferredDate,
          source: 'system',
          oldValue: 'Middle',
          newValue: 'Senior',
        },
      });

      const manualEvent = await prisma.timelineEvent.create({
        data: {
          employeeId,
          type,
          effectiveDate: correctedDate,
          source: 'manual',
          oldValue: 'Middle',
          newValue: 'Senior',
        },
      });
      jest.clearAllMocks();

      await expect(
        delegate(property).create({
          data: { employeeId, value: 'Senior', effectiveFrom: inferredDate },
        }),
      ).rejects.toThrow(ManualConflictSuppressedError);

      expect(
        timelineEventWriterMock.markSystemWriteSkipped,
      ).toHaveBeenCalledWith(manualEvent.id, expect.any(String));
      expect(
        timelineEventWriterMock.recordTimelineEvent,
      ).not.toHaveBeenCalled();

      const rows = await delegate(property).findMany({ where: { employeeId } });
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe('Middle');
    });

    it('unrelated manual backfill does not suppress a new write', async () => {
      const employeeId = await createEmployee();

      await prisma.timelineEvent.create({
        data: {
          employeeId,
          type: 'department',
          effectiveDate: new Date('2018-06-01T00:00:00.000Z'),
          source: 'manual',
          oldValue: 'Engineering',
          newValue: 'Platform',
        },
      });

      await delegate(property).create({
        data: {
          employeeId,
          value: 'Middle',
          effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        },
      });

      expect(timelineEventWriterMock.recordTimelineEvent).toHaveBeenCalled();
    });

    it('historical manual transition without system anchor does not suppress', async () => {
      const employeeId = await createEmployee();

      await delegate(property).create({
        data: {
          employeeId,
          value: 'Middle',
          effectiveFrom: new Date('2015-01-01T00:00:00.000Z'),
        },
      });

      await prisma.timelineEvent.create({
        data: {
          employeeId,
          type,
          effectiveDate: new Date('2015-01-01T00:00:00.000Z'),
          source: 'manual',
          oldValue: 'Middle',
          newValue: 'Senior',
        },
      });
      jest.clearAllMocks();

      await delegate(property).create({
        data: {
          employeeId,
          value: 'Senior',
          effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        },
      });

      expect(timelineEventWriterMock.recordTimelineEvent).toHaveBeenCalled();
      const rows = await delegate(property).findMany({ where: { employeeId } });
      expect(rows).toHaveLength(2);
    });

    it('soft-deleted manual entry does not suppress a write', async () => {
      const employeeId = await createEmployee();
      const conflictDate = new Date('2026-07-01T00:00:00.000Z');

      await prisma.timelineEvent.create({
        data: {
          employeeId,
          type,
          effectiveDate: conflictDate,
          source: 'manual',
          deletedAt: new Date(),
        },
      });
      jest.clearAllMocks();

      await delegate(property).create({
        data: {
          employeeId,
          value: 'Middle',
          effectiveFrom: conflictDate,
        },
      });

      expect(timelineEventWriterMock.recordTimelineEvent).toHaveBeenCalled();
      expect(
        timelineEventWriterMock.markSystemWriteSkipped,
      ).not.toHaveBeenCalled();
    });

    it('rejects every non-create operation outright', async () => {
      const employeeId = await createEmployee();
      const row = await delegate(property).create({
        data: {
          employeeId,
          value: 'L1',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      });

      await expect(
        delegate(property).update({
          where: { id: row.id },
          data: { value: 'HACKED' },
        }),
      ).rejects.toThrow(HistoryTableWriteRejectedError);

      await expect(
        delegate(property).updateMany({
          where: { id: row.id },
          data: { value: 'HACKED' },
        }),
      ).rejects.toThrow(HistoryTableWriteRejectedError);

      await expect(
        delegate(property).updateManyAndReturn({
          where: { id: row.id },
          data: { value: 'HACKED' },
        }),
      ).rejects.toThrow(HistoryTableWriteRejectedError);

      await expect(
        delegate(property).delete({ where: { id: row.id } }),
      ).rejects.toThrow(HistoryTableWriteRejectedError);

      await expect(
        delegate(property).deleteMany({ where: { id: row.id } }),
      ).rejects.toThrow(HistoryTableWriteRejectedError);

      await expect(
        delegate(property).upsert({
          where: { id: row.id },
          create: { employeeId, value: 'X', effectiveFrom: new Date() },
          update: { value: 'X' },
        }),
      ).rejects.toThrow(HistoryTableWriteRejectedError);

      await expect(
        delegate(property).createMany({
          data: [
            {
              employeeId,
              value: 'X',
              effectiveFrom: new Date('2027-01-01T00:00:00.000Z'),
            },
          ],
        }),
      ).rejects.toThrow(HistoryTableWriteRejectedError);

      await expect(
        delegate(property).createManyAndReturn({
          data: [
            {
              employeeId,
              value: 'X',
              effectiveFrom: new Date('2027-02-01T00:00:00.000Z'),
            },
          ],
        }),
      ).rejects.toThrow(HistoryTableWriteRejectedError);

      await expect(
        delegate(property).findUnique({ where: { id: row.id } }),
      ).rejects.toThrow(HistoryTableWriteRejectedError);

      await expect(
        delegate(property).findUniqueOrThrow({ where: { id: row.id } }),
      ).rejects.toThrow(HistoryTableWriteRejectedError);
    });
  });

  it('unknown employee: surfaces a standard Prisma FK-violation error', async () => {
    const attempt = delegate('gradeHistory').create({
      data: {
        employeeId: '00000000-0000-0000-0000-000000000000',
        value: 'L1',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    await expect(attempt).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
    await expect(attempt).rejects.toMatchObject({ code: 'P2003' });
  });

  it('missing/empty value: rejected with a clear validation error', async () => {
    const employeeId = await createEmployee();

    await expect(
      delegate('gradeHistory').create({
        data: {
          employeeId,
          value: '',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      }),
    ).rejects.toThrow(/non-empty 'value'/);

    await expect(
      delegate('gradeHistory').create({
        data: {
          employeeId,
          value: undefined as unknown as string,
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      }),
    ).rejects.toThrow(/non-empty 'value'/);

    const rows = await delegate('gradeHistory').findMany({
      where: { employeeId },
    });
    expect(rows).toHaveLength(0);
  });

  it('unparseable effectiveFrom: rejected with a clear validation error instead of silently producing NaN', async () => {
    const employeeId = await createEmployee();

    await expect(
      delegate('gradeHistory').create({
        data: {
          employeeId,
          value: 'L1',
          effectiveFrom: 'not-a-real-date',
        },
      }),
    ).rejects.toThrow(/unparseable 'effectiveFrom'/);

    const rows = await delegate('gradeHistory').findMany({
      where: { employeeId },
    });
    expect(rows).toHaveLength(0);
  });

  it('C4 failure: whole transaction (close + insert) rolls back', async () => {
    const employeeId = await createEmployee();
    await delegate('gradeHistory').create({
      data: {
        employeeId,
        value: 'L1',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    jest.clearAllMocks();
    timelineEventWriterMock.recordTimelineEvent.mockRejectedValueOnce(
      new Error('C4 unavailable'),
    );

    await expect(
      delegate('gradeHistory').create({
        data: {
          employeeId,
          value: 'L2',
          effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
        },
      }),
    ).rejects.toThrow('C4 unavailable');

    const rows = await delegate('gradeHistory').findMany({
      where: { employeeId },
    });
    expect(rows).toHaveLength(1); // no L2 row persisted
    expect(rows[0].value).toBe('L1');
    expect(rows[0].effectiveTo).toBeNull(); // prior row was NOT closed either — same rolled-back tx
  });

  it('concurrent writes for the same employee/dimension: the loser fails with ConcurrentHistoryWriteError (or the write is naturally serialized), and exactly one open row survives', async () => {
    const employeeId = await createEmployee();
    await delegate('gradeHistory').create({
      data: {
        employeeId,
        value: 'L1',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    const results = await Promise.allSettled([
      delegate('gradeHistory').create({
        data: {
          employeeId,
          value: 'L2',
          effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
        },
      }),
      delegate('gradeHistory').create({
        data: {
          employeeId,
          value: 'L3',
          effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        },
      }),
    ]);

    // Transaction/row-lock (Serializable) plus the partial unique index
    // backstop admit a consistent outcome either way: the loser observes
    // the now-updated row (both succeed, naturally serialized) or fails
    // with ConcurrentHistoryWriteError — never two open rows, and never a
    // raw/untyped error escaping instead.
    for (const r of results) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(ConcurrentHistoryWriteError);
      }
    }

    const rows = await delegate('gradeHistory').findMany({
      where: { employeeId },
    });
    const openRows = rows.filter((r) => r.effectiveTo === null);
    expect(openRows).toHaveLength(1);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
  });

  describe.each(DIMENSIONS)(
    '$model partial index (live DB check)',
    ({ property }) => {
      it('the hand-edited partial-unique WHERE clause is present in the live DB', async () => {
        const indexName = PARTIAL_INDEX_NAMES[property];
        const result = await prisma.$queryRaw<{ indexdef: string }[]>`
          SELECT indexdef FROM pg_indexes
          WHERE indexname = ${indexName}
            AND schemaname = current_schema()
        `;

        expect(result).toHaveLength(1);
        expect(result[0].indexdef).toContain('WHERE');
        expect(result[0].indexdef).toContain('effectiveTo');
      });
    },
  );
});
