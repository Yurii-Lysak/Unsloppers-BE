import { hash } from 'bcryptjs';
import request from 'supertest';
import { TimelineEventEntity } from '../src/modules/timeline/entities/timeline-event.entity';
import { createTestApp, TestApp } from './support/app-harness';
import { DEFAULT_TEST_INSTANT, FixedClock } from './support/fixed-clock';

const PASSWORD = 'test-only-timeline-password';

interface EmployeeUser {
  readonly userId: string;
  readonly employeeId: string;
  readonly email: string;
}

async function createEmployeeUser(
  testApp: TestApp,
  email: string,
): Promise<EmployeeUser> {
  const user = await testApp.prisma.user.create({
    data: {
      email,
      passwordHash: await hash(PASSWORD, 12),
    },
  });
  const employee = await testApp.prisma.employee.create({
    data: { id: user.id, userId: user.id },
  });
  return { userId: user.id, employeeId: employee.id, email };
}

async function loginAs(
  testApp: TestApp,
  email: string,
): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(testApp.server);
  await agent
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return agent;
}

describe('Timeline manual edits (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      clock: new FixedClock(DEFAULT_TEST_INSTANT),
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
  });

  it('lets a PP create a manual event sorted by effectiveDate', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'timeline-subject@example.com',
    );
    const pp = await createEmployeeUser(testApp, 'timeline-pp@example.com');

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    await testApp.prisma.timelineEvent.create({
      data: {
        employeeId: subject.employeeId,
        type: 'joining',
        effectiveDate: new Date('2020-01-01'),
        source: 'manual',
        authorId: pp.employeeId,
        newValue: 'Joined',
      },
    });

    const agent = await loginAs(testApp, pp.email);

    const createRes = await agent
      .post(`/api/v1/employees/${subject.employeeId}/timeline`)
      .send({
        type: 'grade',
        effectiveDate: '2019-03-15',
        oldValue: 'Middle',
        newValue: 'Senior',
      })
      .expect(201);

    const created = createRes.body as TimelineEventEntity;
    expect(created.source).toBe('manual');
    expect(created.authorId).toBe(pp.employeeId);
    expect(created.effectiveDate).toContain('2019-03-15');

    const listRes = await agent
      .get(`/api/v1/employees/${subject.employeeId}/timeline`)
      .expect(200);

    const events = listRes.body as TimelineEventEntity[];
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('grade');
    expect(events[1].type).toBe('joining');
  });

  it('returns 403 when a DM with ProjectLine access attempts a write', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'timeline-dm-subject@example.com',
    );
    const dm = await createEmployeeUser(testApp, 'timeline-dm@example.com');
    const pm = await createEmployeeUser(testApp, 'timeline-pm@example.com');

    const confirmedAt = new Date(DEFAULT_TEST_INSTANT);
    await testApp.prisma.projectAssignment.create({
      data: {
        employeeId: subject.employeeId,
        projectId: 'proj-timeline-1',
        pmId: pm.employeeId,
        dmId: dm.employeeId,
        startDate: new Date('2026-01-01'),
        confirmed: true,
        confirmedAt,
      },
    });

    const agent = await loginAs(testApp, dm.email);

    await agent
      .post(`/api/v1/employees/${subject.employeeId}/timeline`)
      .send({
        type: 'grade',
        effectiveDate: '2019-03-15',
        oldValue: 'Middle',
        newValue: 'Senior',
      })
      .expect(403);

    await agent
      .patch(
        `/api/v1/employees/${subject.employeeId}/timeline/00000000-0000-0000-0000-000000000001`,
      )
      .send({ newValue: 'Blocked' })
      .expect(403);

    await agent
      .delete(
        `/api/v1/employees/${subject.employeeId}/timeline/00000000-0000-0000-0000-000000000001`,
      )
      .expect(403);
  });

  it('hides soft-deleted manual events from GET', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'timeline-delete-subject@example.com',
    );
    const pp = await createEmployeeUser(
      testApp,
      'timeline-delete-pp@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    const agent = await loginAs(testApp, pp.email);

    const createRes = await agent
      .post(`/api/v1/employees/${subject.employeeId}/timeline`)
      .send({
        type: 'department',
        effectiveDate: '2021-06-01',
        oldValue: 'Engineering',
        newValue: 'Platform',
      })
      .expect(201);

    const created = createRes.body as TimelineEventEntity;

    await agent
      .delete(`/api/v1/employees/${subject.employeeId}/timeline/${created.id}`)
      .expect(204);

    const listRes = await agent
      .get(`/api/v1/employees/${subject.employeeId}/timeline`)
      .expect(200);

    expect(listRes.body as TimelineEventEntity[]).toHaveLength(0);

    const row = await testApp.prisma.timelineEvent.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedById).toBe(pp.employeeId);
  });

  it('allows re-creating a manual event at the same key after soft-delete', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'timeline-recreate-subject@example.com',
    );
    const pp = await createEmployeeUser(
      testApp,
      'timeline-recreate-pp@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    const agent = await loginAs(testApp, pp.email);

    const first = await agent
      .post(`/api/v1/employees/${subject.employeeId}/timeline`)
      .send({
        type: 'grade',
        effectiveDate: '2019-03-15',
        oldValue: 'Middle',
        newValue: 'Senior',
      })
      .expect(201);

    await agent
      .delete(
        `/api/v1/employees/${subject.employeeId}/timeline/${(first.body as TimelineEventEntity).id}`,
      )
      .expect(204);

    const second = await agent
      .post(`/api/v1/employees/${subject.employeeId}/timeline`)
      .send({
        type: 'grade',
        effectiveDate: '2019-03-15',
        oldValue: 'Junior',
        newValue: 'Middle',
      })
      .expect(201);

    expect((second.body as TimelineEventEntity).source).toBe('manual');
    expect((second.body as TimelineEventEntity).newValue).toBe('Middle');

    const listRes = await agent
      .get(`/api/v1/employees/${subject.employeeId}/timeline`)
      .expect(200);

    expect(listRes.body as TimelineEventEntity[]).toHaveLength(1);
  });

  it('preserves a date-corrected manual entry when sync retries the inferred date', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'timeline-conflict-subject@example.com',
    );
    const pp = await createEmployeeUser(
      testApp,
      'timeline-conflict-pp@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    await testApp.prisma.gradeHistory.create({
      data: {
        employeeId: subject.employeeId,
        value: 'Middle',
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      },
    });

    const inferredDate = new Date('2026-01-10T00:00:00.000Z');
    await testApp.prisma.timelineEvent.create({
      data: {
        employeeId: subject.employeeId,
        type: 'grade',
        effectiveDate: inferredDate,
        source: 'system',
        oldValue: 'Middle',
        newValue: 'Senior',
      },
    });

    const agent = await loginAs(testApp, pp.email);

    const createRes = await agent
      .post(`/api/v1/employees/${subject.employeeId}/timeline`)
      .send({
        type: 'grade',
        effectiveDate: '2026-01-10',
        oldValue: 'Middle',
        newValue: 'Senior',
      })
      .expect(201);

    const manualEvent = createRes.body as TimelineEventEntity;

    await agent
      .patch(
        `/api/v1/employees/${subject.employeeId}/timeline/${manualEvent.id}`,
      )
      .send({ effectiveDate: '2026-01-15' })
      .expect(200);

    await expect(
      testApp.prisma.gradeHistory.create({
        data: {
          employeeId: subject.employeeId,
          value: 'Senior',
          effectiveFrom: inferredDate,
        },
      }),
    ).rejects.toThrow();

    const listRes = await agent
      .get(`/api/v1/employees/${subject.employeeId}/timeline`)
      .expect(200);

    const gradeEvents = (listRes.body as TimelineEventEntity[]).filter(
      (event) => event.type === 'grade' && event.source === 'manual',
    );
    expect(gradeEvents).toHaveLength(1);
    expect(gradeEvents[0].effectiveDate).toContain('2026-01-15');
    expect(gradeEvents[0].systemWriteSkippedAt).not.toBeNull();
  });

  it('does not suppress unrelated manual backfills on future system writes', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'timeline-unrelated-subject@example.com',
    );
    const pp = await createEmployeeUser(
      testApp,
      'timeline-unrelated-pp@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    const agent = await loginAs(testApp, pp.email);

    await agent
      .post(`/api/v1/employees/${subject.employeeId}/timeline`)
      .send({
        type: 'department',
        effectiveDate: '2018-06-01',
        oldValue: 'Engineering',
        newValue: 'Platform',
      })
      .expect(201);

    await testApp.prisma.gradeHistory.create({
      data: {
        employeeId: subject.employeeId,
        value: 'Middle',
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
      },
    });

    const listRes = await agent
      .get(`/api/v1/employees/${subject.employeeId}/timeline`)
      .expect(200);

    const events = listRes.body as TimelineEventEntity[];
    expect(
      events.some(
        (event) => event.type === 'grade' && event.source === 'system',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === 'department' &&
          event.source === 'manual' &&
          String(event.effectiveDate).includes('2018-06-01'),
      ),
    ).toBe(true);
  });
});
