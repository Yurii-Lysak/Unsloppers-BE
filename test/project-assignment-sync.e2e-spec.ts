import { ProjectAssignmentSource } from '../src/generated/prisma/client';
import { AccessResolver } from '../src/modules/contracts/access-resolver.contract';
import { TimetrackerClient } from '../src/modules/contracts/timetracker-client.contract';
import {
  ProjectStatus,
  ProjectType,
} from '../src/modules/contracts/timetracker.types';
import { ProjectsSyncService } from '../src/modules/integrations/projects-sync.service';
import { createTestApp, TestApp } from './support/app-harness';
import { DEFAULT_TEST_INSTANT, FixedClock, HOUR } from './support/fixed-clock';

describe('TimeTracker project assignment sync persistence (e2e)', () => {
  const clock = new FixedClock(DEFAULT_TEST_INSTANT);
  const timetracker = {
    fetchAccountingReport: jest.fn(),
    fetchTalentsProjects: jest.fn(),
  };
  let testApp: TestApp;

  beforeAll(async () => {
    setEmptyFeeds();
    testApp = await createTestApp({
      clock,
      providerOverrides: [
        { provide: TimetrackerClient, useValue: timetracker },
      ],
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    clock.set(DEFAULT_TEST_INSTANT);
    setEmptyFeeds();
    await testApp.resetDatabase();
  });

  it('grants ProjectLine from a synchronized fresh row, then denies stale and unconfirmed rows', async () => {
    const subject = await createEmployee('sync-subject@example.test');
    const pm = await createEmployee('sync-pm@example.test');
    const dm = await createEmployee('sync-dm@example.test');
    await Promise.all([
      mapExternalIdentity(subject, 10),
      mapExternalIdentity(pm, 20),
      mapExternalIdentity(dm, 30),
    ]);
    timetracker.fetchAccountingReport.mockResolvedValue({
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
      employees: [
        directoryEmployee(10, 'sync-subject@example.test'),
        directoryEmployee(20, 'sync-pm@example.test'),
        directoryEmployee(30, 'sync-dm@example.test'),
      ],
      dayStatuses: {},
      reportStates: {},
      dayApprovalStates: {},
    });
    timetracker.fetchTalentsProjects.mockResolvedValue({
      projects: [
        {
          id: 100,
          name: 'Synthetic Project',
          description: 'Synthetic project for persistence verification',
          startDate: '2026-01-01T00:00:00.000Z',
          endDate: null,
          status: ProjectStatus.Active,
          type: ProjectType.Billable,
          projectManager: 'sync-pm@example.test',
          deliveryManager: 'sync-dm@example.test',
          members: [
            {
              email: 'sync-subject@example.test',
              dateStart: '2026-01-01T00:00:00.000Z',
              dateEnd: null,
            },
          ],
          isBillable: true,
        },
      ],
      statuses: [],
      types: [],
    });

    await expect(
      testApp.app.get(ProjectsSyncService).sync(),
    ).resolves.toMatchObject({ status: 'succeeded', confirmed: 1 });
    const row = await testApp.prisma.projectAssignment.findUniqueOrThrow({
      where: { sourceKey: 'timetracker:100:10' },
    });
    expect(row).toMatchObject({
      employeeId: subject,
      pmId: pm,
      dmId: dm,
      source: ProjectAssignmentSource.timetracker,
      confirmed: true,
      confirmedAt: new Date(DEFAULT_TEST_INSTANT),
    });

    const access = testApp.app.get(AccessResolver);
    await expect(access.resolveAudience(dm, subject)).resolves.toMatchObject({
      role: 'ProjectLine',
    });

    clock.advance(4 * HOUR + 1);
    await expect(access.resolveAudience(dm, subject)).resolves.toMatchObject({
      role: 'Colleague',
    });

    clock.set(DEFAULT_TEST_INSTANT);
    await testApp.prisma.externalIdentity.delete({
      where: {
        system_externalId: {
          system: 'timetracker',
          externalId: '10',
        },
      },
    });
    await expect(
      testApp.app.get(ProjectsSyncService).sync(),
    ).resolves.toMatchObject({
      status: 'succeeded',
      confirmed: 0,
      deconfirmed: 1,
    });
    await expect(
      testApp.prisma.projectAssignment.findUniqueOrThrow({
        where: { id: row.id },
      }),
    ).resolves.toMatchObject({ confirmed: false });
    await expect(access.resolveAudience(dm, subject)).resolves.toMatchObject({
      role: 'Colleague',
    });
  });

  it('enforces enum ownership, nullable unique source keys, and duplicate manual periods', async () => {
    const subject = await createEmployee('ownership-subject@example.test');
    const pm = await createEmployee('ownership-pm@example.test');
    const dm = await createEmployee('ownership-dm@example.test');
    const manualData = {
      employeeId: subject,
      projectId: 'manual-project',
      pmId: pm,
      dmId: dm,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
    };

    await testApp.prisma.projectAssignment.create({ data: manualData });
    await testApp.prisma.projectAssignment.create({ data: manualData });
    const manualRows = await testApp.prisma.projectAssignment.findMany({
      where: { projectId: 'manual-project' },
    });
    expect(manualRows).toHaveLength(2);
    expect(
      manualRows.every(
        (row) =>
          row.source === ProjectAssignmentSource.manual &&
          row.sourceKey === null,
      ),
    ).toBe(true);

    const timetrackerData = {
      ...manualData,
      projectId: '100',
      source: ProjectAssignmentSource.timetracker,
      sourceKey: 'timetracker:100:10',
    };
    await testApp.prisma.projectAssignment.create({ data: timetrackerData });
    await expect(
      testApp.prisma.projectAssignment.create({ data: timetrackerData }),
    ).rejects.toBeDefined();
    await expect(
      testApp.prisma.projectAssignment.create({
        data: {
          ...manualData,
          source: ProjectAssignmentSource.manual,
          sourceKey: 'manual-must-not-own-a-key',
        },
      }),
    ).rejects.toBeDefined();
    await expect(
      testApp.prisma.projectAssignment.create({
        data: {
          ...manualData,
          source: ProjectAssignmentSource.timetracker,
        },
      }),
    ).rejects.toBeDefined();

    const enumLabels = await testApp.prisma.$queryRaw<
      { enumlabel: string }[]
    >`SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
      WHERE pg_type.typname = 'ProjectAssignmentSource'
        AND pg_namespace.nspname = ${testApp.schema}
      ORDER BY enumsortorder`;
    expect(enumLabels.map((row) => row.enumlabel)).toEqual([
      'manual',
      'timetracker',
    ]);
  });

  function setEmptyFeeds(): void {
    timetracker.fetchAccountingReport.mockResolvedValue({
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
      employees: [],
      dayStatuses: {},
      reportStates: {},
      dayApprovalStates: {},
    });
    timetracker.fetchTalentsProjects.mockResolvedValue({
      projects: [],
      statuses: [],
      types: [],
    });
  }

  async function createEmployee(email: string): Promise<string> {
    const user = await testApp.prisma.user.create({ data: { email } });
    const employee = await testApp.prisma.employee.create({
      data: { id: user.id, userId: user.id },
    });
    return employee.id;
  }

  async function mapExternalIdentity(
    employeeId: string,
    externalId: number,
  ): Promise<void> {
    await testApp.prisma.externalIdentity.create({
      data: {
        system: 'timetracker',
        externalId: String(externalId),
        employeeId,
      },
    });
  }
});

function directoryEmployee(id: number, email: string) {
  return {
    id,
    email,
    name: `Synthetic ${id}`,
    hash: `hash-${id}`,
    countryCode: 'ZZ',
    days: [],
  };
}
