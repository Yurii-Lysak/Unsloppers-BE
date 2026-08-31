import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../../app.module';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * End-to-end proof that Story 7.1's real C4 implementation persists
 * timeline rows when the temporal-history extension writes history.
 */
describe('TimelineEventWriter integration (real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emailPrefix = `timeline-writer-int-${Date.now()}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('gradeHistory.create persists a matching system timeline event', async () => {
    const user = await prisma.user.create({
      data: { email: `${emailPrefix}@example.com` },
    });
    const employee = await prisma.employee.create({
      data: { userId: user.id },
    });

    await prisma.gradeHistory.create({
      data: {
        employeeId: employee.id,
        value: 'Middle',
        effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
      },
    });

    await prisma.gradeHistory.create({
      data: {
        employeeId: employee.id,
        value: 'Senior',
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
      },
    });

    const events = await prisma.timelineEvent.findMany({
      where: { employeeId: employee.id, type: 'grade' },
      orderBy: { effectiveDate: 'asc' },
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      source: 'system',
      oldValue: null,
      newValue: 'Middle',
    });
    expect(events[0].effectiveDate).toEqual(
      new Date('2026-06-01T00:00:00.000Z'),
    );
    expect(events[1]).toMatchObject({
      source: 'system',
      oldValue: 'Middle',
      newValue: 'Senior',
    });
    expect(events[1].effectiveDate).toEqual(
      new Date('2026-09-01T00:00:00.000Z'),
    );
  });

  it('manual conflict persists systemWriteSkippedAt via real C4', async () => {
    const user = await prisma.user.create({
      data: { email: `${emailPrefix}-conflict@example.com` },
    });
    const employee = await prisma.employee.create({
      data: { userId: user.id },
    });

    const manualEvent = await prisma.timelineEvent.create({
      data: {
        employeeId: employee.id,
        type: 'grade',
        effectiveDate: new Date('2026-09-01T00:00:00.000Z'),
        source: 'manual',
      },
    });

    await expect(
      prisma.gradeHistory.create({
        data: {
          employeeId: employee.id,
          value: 'Senior',
          effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        },
      }),
    ).rejects.toThrow();

    const updated = await prisma.timelineEvent.findUniqueOrThrow({
      where: { id: manualEvent.id },
    });
    expect(updated.systemWriteSkippedAt).toBeInstanceOf(Date);
  });

  it('duplicate system timeline event rolls back the history write', async () => {
    const user = await prisma.user.create({
      data: { email: `${emailPrefix}-dup@example.com` },
    });
    const employee = await prisma.employee.create({
      data: { userId: user.id },
    });

    await prisma.timelineEvent.create({
      data: {
        employeeId: employee.id,
        type: 'grade',
        effectiveDate: new Date('2026-09-01T00:00:00.000Z'),
        source: 'system',
        newValue: 'Existing',
      },
    });

    await expect(
      prisma.gradeHistory.create({
        data: {
          employeeId: employee.id,
          value: 'Senior',
          effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        },
      }),
    ).rejects.toThrow();

    const historyRows = await prisma.gradeHistory.findMany({
      where: { employeeId: employee.id },
    });
    expect(historyRows).toHaveLength(0);

    const timelineRows = await prisma.timelineEvent.findMany({
      where: { employeeId: employee.id, type: 'grade' },
    });
    expect(timelineRows).toHaveLength(1);
  });
});
