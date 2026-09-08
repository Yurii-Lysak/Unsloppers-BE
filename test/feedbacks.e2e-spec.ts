import { hash } from 'bcryptjs';
import request from 'supertest';
import { FeedbacksSectionProvider } from '../src/modules/feedbacks/feedbacks-section.provider';
import { createTestApp, TestApp } from './support/app-harness';
import { DEFAULT_TEST_INSTANT, FixedClock } from './support/fixed-clock';

const PASSWORD = 'test-only-feedbacks-password';

interface EmployeeUser {
  readonly userId: string;
  readonly employeeId: string;
  readonly email: string;
}

interface FeedbackSectionResponse {
  records: Array<{
    id: string;
    recordedAt: string;
    context: string;
    body: string;
    sharedWithEmployee?: boolean;
  }>;
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

async function assignProjectLine(
  testApp: TestApp,
  subjectId: string,
  pmId: string,
  dmId: string,
): Promise<void> {
  await testApp.prisma.projectAssignment.create({
    data: {
      employeeId: subjectId,
      projectId: `proj-${subjectId}`,
      pmId,
      dmId,
      startDate: new Date('2026-01-01'),
      confirmed: true,
      confirmedAt: new Date(DEFAULT_TEST_INSTANT),
    },
  });
}

async function grantPermission(
  testApp: TestApp,
  employeeId: string,
  permissionKey: string,
): Promise<void> {
  const role = await testApp.prisma.functionalRole.create({
    data: {
      name: `test-${permissionKey}-${employeeId.slice(0, 8)}`,
    },
  });
  await testApp.prisma.functionalRolePermission.create({
    data: { roleId: role.id, permissionKey },
  });
  await testApp.prisma.functionalRoleAssignment.create({
    data: { employeeId, roleId: role.id },
  });
}

describe('Feedback visibility (e2e)', () => {
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

  it('saves management-only feedback by default and hides it from Self', async () => {
    const subject = await createEmployeeUser(testApp, 'fb-subject@example.com');
    const manager = await createEmployeeUser(testApp, 'fb-manager@example.com');

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    const createRes = await managerAgent
      .post(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .send({
        recordedAt: '2025-12-01',
        context: 'Q3 project retrospective',
        body: 'Sensitive feedback',
      })
      .expect(201);
    const created = createRes.body as { sharedWithEmployee: boolean };
    expect(created.sharedWithEmployee).toBe(false);

    const subjectAgent = await loginAs(testApp, subject.email);
    const selfRes = await subjectAgent
      .get(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .expect(200);
    const selfBody = selfRes.body as FeedbackSectionResponse;
    expect(selfBody.records).toHaveLength(0);

    const profileRes = await subjectAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);
    const profileBody = profileRes.body as {
      sections: { S8?: { accessLevel: string; data: FeedbackSectionResponse } };
    };
    expect(profileBody.sections.S8?.accessLevel).toBe('R');
    expect(profileBody.sections.S8?.data.records).toEqual([]);
  });

  it('lets PP share a record so Self can see it immediately', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'fb-share-subject@example.com',
    );
    const manager = await createEmployeeUser(
      testApp,
      'fb-share-manager@example.com',
    );
    const pp = await createEmployeeUser(testApp, 'fb-share-pp@example.com');

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: {
        managerId: manager.employeeId,
        peoplePartnerId: pp.employeeId,
      },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    const createRes = await managerAgent
      .post(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .send({
        recordedAt: '2025-12-01',
        context: 'Q3 project retrospective',
        body: 'Will be shared',
      })
      .expect(201);
    const feedbackId = (createRes.body as { id: string }).id;

    const ppAgent = await loginAs(testApp, pp.email);
    await ppAgent
      .patch(`/api/v1/employees/${subject.employeeId}/feedbacks/${feedbackId}`)
      .send({ sharedWithEmployee: true })
      .expect(200);

    const subjectAgent = await loginAs(testApp, subject.email);
    const selfRes = await subjectAgent
      .get(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .expect(200);
    const selfBody = selfRes.body as FeedbackSectionResponse;
    expect(selfBody.records).toHaveLength(1);
    expect(selfBody.records[0].body).toBe('Will be shared');
    expect(selfBody.records[0]).not.toHaveProperty('sharedWithEmployee');

    const profileRes = await subjectAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);
    const profileBody = profileRes.body as {
      sections: { S8?: { data: FeedbackSectionResponse } };
    };
    expect(profileBody.sections.S8?.data.records).toHaveLength(1);
    expect(profileBody.sections.S8?.data.records[0].body).toBe(
      'Will be shared',
    );
  });

  it('grants PM full S8 RW including CRUD', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'fb-pm-subject@example.com',
    );
    const pm = await createEmployeeUser(testApp, 'fb-pm@example.com');
    const dm = await createEmployeeUser(testApp, 'fb-dm@example.com');

    await assignProjectLine(
      testApp,
      subject.employeeId,
      pm.employeeId,
      dm.employeeId,
    );

    const pmAgent = await loginAs(testApp, pm.email);
    const createRes = await pmAgent
      .post(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .send({
        recordedAt: '2025-12-01',
        context: 'PM feedback',
        body: 'PM authored',
      })
      .expect(201);
    const feedbackId = (createRes.body as { id: string }).id;

    const listRes = await pmAgent
      .get(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .expect(200);
    const listBody = listRes.body as FeedbackSectionResponse;
    expect(listBody.records).toHaveLength(1);
    expect(listBody.records[0].sharedWithEmployee).toBe(false);

    await pmAgent
      .patch(`/api/v1/employees/${subject.employeeId}/feedbacks/${feedbackId}`)
      .send({ body: 'PM edited' })
      .expect(200);

    await pmAgent
      .delete(`/api/v1/employees/${subject.employeeId}/feedbacks/${feedbackId}`)
      .expect(204);
  });

  it('returns identical S8 payloads from profile and parallel GET', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'fb-parity-subject@example.com',
    );
    const pp = await createEmployeeUser(testApp, 'fb-parity-pp@example.com');
    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    const ppAgent = await loginAs(testApp, pp.email);
    await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .send({
        recordedAt: '2025-12-01',
        context: 'Parity',
        body: 'Parity feedback',
        sharedWithEmployee: true,
      })
      .expect(201);

    const directRes = await ppAgent
      .get(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .expect(200);
    const profileRes = await ppAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);

    const profileBody = profileRes.body as {
      sections: { S8?: { data: FeedbackSectionResponse } };
    };
    expect(profileBody.sections.S8?.data).toEqual(directRes.body);
  });

  it('denies colleague access to feedback routes and profile S8', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'fb-colleague-subject@example.com',
    );
    const colleague = await createEmployeeUser(
      testApp,
      'fb-colleague@example.com',
    );

    const colleagueAgent = await loginAs(testApp, colleague.email);
    await colleagueAgent
      .get(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .expect(403);

    const profileRes = await colleagueAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);
    const profileBody = profileRes.body as {
      sections: Record<string, unknown>;
    };
    expect(profileBody.sections.S8).toBeUndefined();
  });

  it('denies Self write operations', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'fb-self-write@example.com',
    );
    const manager = await createEmployeeUser(
      testApp,
      'fb-self-write-manager@example.com',
    );
    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    const createRes = await managerAgent
      .post(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .send({
        recordedAt: '2025-12-01',
        context: 'Manager note',
        body: 'Private',
      })
      .expect(201);
    const feedbackId = (createRes.body as { id: string }).id;

    const agent = await loginAs(testApp, subject.email);

    await agent
      .post(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .send({
        recordedAt: '2025-12-01',
        context: 'Self',
        body: 'Self cannot create',
      })
      .expect(403);

    await agent
      .patch(`/api/v1/employees/${subject.employeeId}/feedbacks/${feedbackId}`)
      .send({ body: 'Self cannot edit' })
      .expect(403);

    await agent
      .delete(`/api/v1/employees/${subject.employeeId}/feedbacks/${feedbackId}`)
      .expect(403);
  });

  it('denies colleague POST even with CREATE_FEEDBACK permission', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'fb-perm-subject@example.com',
    );
    const colleague = await createEmployeeUser(
      testApp,
      'fb-perm-colleague@example.com',
    );
    await grantPermission(testApp, colleague.employeeId, 'create_feedback');

    const colleagueAgent = await loginAs(testApp, colleague.email);
    await colleagueAgent
      .post(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .send({
        recordedAt: '2025-12-01',
        context: 'Colleague',
        body: 'Should fail',
      })
      .expect(403);
  });

  it('denies Self POST even with CREATE_FEEDBACK permission', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'fb-self-perm@example.com',
    );
    await grantPermission(testApp, subject.employeeId, 'create_feedback');

    const agent = await loginAs(testApp, subject.email);
    await agent
      .post(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .send({
        recordedAt: '2025-12-01',
        context: 'Self',
        body: 'Should fail',
      })
      .expect(403);
  });

  it('rejects whitespace context, empty PATCH, future PATCH date, and malformed feedbackId', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'fb-more-val-subject@example.com',
    );
    const pp = await createEmployeeUser(testApp, 'fb-more-val-pp@example.com');
    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    const ppAgent = await loginAs(testApp, pp.email);
    await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .send({
        recordedAt: '2025-12-01',
        context: '   ',
        body: 'Valid body',
      })
      .expect(400);

    const createRes = await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .send({
        recordedAt: '2025-12-01',
        context: 'Valid',
        body: 'Body',
      })
      .expect(201);
    const feedbackId = (createRes.body as { id: string }).id;

    await ppAgent
      .patch(`/api/v1/employees/${subject.employeeId}/feedbacks/${feedbackId}`)
      .send({})
      .expect(400);

    await ppAgent
      .patch(`/api/v1/employees/${subject.employeeId}/feedbacks/${feedbackId}`)
      .send({ recordedAt: '2026-12-31' })
      .expect(400);

    await ppAgent
      .patch(`/api/v1/employees/${subject.employeeId}/feedbacks/not-a-uuid`)
      .send({ body: 'Bad id' })
      .expect(400);
  });

  it('returns 403 for authenticated user without an employee record', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'fb-no-emp-subject@example.com',
    );
    const orphanUser = await testApp.prisma.user.create({
      data: {
        email: 'fb-no-emp-viewer@example.com',
        passwordHash: await hash(PASSWORD, 12),
      },
    });

    const agent = request.agent(testApp.server);
    await agent
      .post('/api/v1/auth/login')
      .send({ email: orphanUser.email, password: PASSWORD })
      .expect(200);

    await agent
      .get(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .expect(403);
  });

  it('returns union RW access for PM and ReportingLine on the same subject', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'fb-union-subject@example.com',
    );
    const manager = await createEmployeeUser(
      testApp,
      'fb-union-manager@example.com',
    );
    const pm = await createEmployeeUser(testApp, 'fb-union-pm@example.com');
    const dm = await createEmployeeUser(testApp, 'fb-union-dm@example.com');

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { managerId: manager.employeeId },
    });
    await assignProjectLine(
      testApp,
      subject.employeeId,
      pm.employeeId,
      dm.employeeId,
    );

    const pp = await createEmployeeUser(testApp, 'fb-union-pp@example.com');
    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    const ppAgent = await loginAs(testApp, pp.email);
    await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .send({
        recordedAt: '2025-12-01',
        context: 'Private',
        body: 'Management only',
      })
      .expect(201);
    await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .send({
        recordedAt: '2025-11-01',
        context: 'Shared',
        body: 'Shared note',
        sharedWithEmployee: true,
      })
      .expect(201);

    const pmAgent = await loginAs(testApp, pm.email);
    const listRes = await pmAgent
      .get(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .expect(200);
    const listBody = listRes.body as FeedbackSectionResponse;
    expect(listBody.records).toHaveLength(2);
    expect(
      listBody.records.every(
        (record) => record.sharedWithEmployee !== undefined,
      ),
    ).toBe(true);
  });

  it('returns 404 for unknown employee and 400 for malformed ids', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'fb-404-viewer@example.com',
    );
    const agent = await loginAs(testApp, viewer.email);

    await agent
      .get(`/api/v1/employees/00000000-0000-0000-0000-000000000099/feedbacks`)
      .expect(404);

    await agent.get('/api/v1/employees/not-a-uuid/feedbacks').expect(400);
  });

  it('rejects whitespace body and future recordedAt', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'fb-val-subject@example.com',
    );
    const pp = await createEmployeeUser(testApp, 'fb-val-pp@example.com');
    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    const ppAgent = await loginAs(testApp, pp.email);
    await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .send({
        recordedAt: '2025-12-01',
        context: 'Valid',
        body: '   ',
      })
      .expect(400);

    await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .send({
        recordedAt: '2026-12-31',
        context: 'Future',
        body: 'Body',
      })
      .expect(400);
  });

  it('allows RW viewer to edit a record they did not author', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'fb-edit-subject@example.com',
    );
    const manager = await createEmployeeUser(
      testApp,
      'fb-edit-manager@example.com',
    );
    const pp = await createEmployeeUser(testApp, 'fb-edit-pp@example.com');

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: {
        managerId: manager.employeeId,
        peoplePartnerId: pp.employeeId,
      },
    });

    const ppAgent = await loginAs(testApp, pp.email);
    const createRes = await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .send({
        recordedAt: '2025-12-01',
        context: 'PP note',
        body: 'PP authored',
      })
      .expect(201);
    const feedbackId = (createRes.body as { id: string }).id;

    const managerAgent = await loginAs(testApp, manager.email);
    await managerAgent
      .patch(`/api/v1/employees/${subject.employeeId}/feedbacks/${feedbackId}`)
      .send({ body: 'Manager edit' })
      .expect(200);
  });

  it('returns 404 when feedback belongs to another subject', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'fb-wrong-subject@example.com',
    );
    const other = await createEmployeeUser(testApp, 'fb-other@example.com');
    const pp = await createEmployeeUser(testApp, 'fb-wrong-pp@example.com');

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: other.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    const ppAgent = await loginAs(testApp, pp.email);
    const createRes = await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .send({
        recordedAt: '2025-12-01',
        context: 'Subject A',
        body: 'Note',
      })
      .expect(201);
    const feedbackId = (createRes.body as { id: string }).id;

    await ppAgent
      .patch(`/api/v1/employees/${other.employeeId}/feedbacks/${feedbackId}`)
      .send({ body: 'Wrong subject' })
      .expect(404);
  });
});

describe('Feedbacks provider failure (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      providerOverrides: [
        {
          provide: FeedbacksSectionProvider,
          useValue: {
            getSection: jest.fn().mockRejectedValue(new Error('db down')),
          },
        },
      ],
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
  });

  it('returns 503 on parallel GET and unavailable S8 in profile', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'fb-provider-subject@example.com',
    );
    const pp = await createEmployeeUser(testApp, 'fb-provider-pp@example.com');
    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    const ppAgent = await loginAs(testApp, pp.email);
    await ppAgent
      .get(`/api/v1/employees/${subject.employeeId}/feedbacks`)
      .expect(503);

    const profileRes = await ppAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);
    const profileBody = profileRes.body as {
      sections: { S8?: { status: string } };
    };
    expect(profileBody.sections.S8?.status).toBe('unavailable');
  });
});
