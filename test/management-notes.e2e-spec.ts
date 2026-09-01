import { hash } from 'bcryptjs';
import request from 'supertest';
import { ManagementNotesSectionProvider } from '../src/modules/management-notes/management-notes-section.provider';
import { createTestApp, TestApp } from './support/app-harness';
import { DEFAULT_TEST_INSTANT, FixedClock } from './support/fixed-clock';

const PASSWORD = 'test-only-management-notes-password';

interface EmployeeUser {
  readonly userId: string;
  readonly employeeId: string;
  readonly email: string;
}

interface ManagementNotesSectionResponse {
  notes: Array<{
    id: string;
    content: string;
    visibleForEmployee?: boolean;
    visibleForPm?: boolean;
  }>;
  hasHiddenNotes?: boolean;
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

describe('Management notes visibility (e2e)', () => {
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

  it('hides unflagged PP notes from Self and PM while PM sees flagged note read-only', async () => {
    const subject = await createEmployeeUser(testApp, 'mn-subject@example.com');
    const pp = await createEmployeeUser(testApp, 'mn-pp@example.com');
    const pm = await createEmployeeUser(testApp, 'mn-pm@example.com');
    const dm = await createEmployeeUser(testApp, 'mn-dm@example.com');

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });
    await assignProjectLine(
      testApp,
      subject.employeeId,
      pm.employeeId,
      dm.employeeId,
    );

    const ppAgent = await loginAs(testApp, pp.email);
    const createHidden = await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .send({ content: 'Hidden from employee and PM' })
      .expect(201);
    const hiddenNoteId = (createHidden.body as { id: string }).id;
    await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .send({ content: 'Visible to PM', visibleForPm: true })
      .expect(201);

    const subjectAgent = await loginAs(testApp, subject.email);
    const selfRes = await subjectAgent
      .get(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .expect(200);
    const selfBody = selfRes.body as ManagementNotesSectionResponse;
    expect(selfBody.notes).toHaveLength(0);

    const pmAgent = await loginAs(testApp, pm.email);
    const pmRes = await pmAgent
      .get(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .expect(200);
    const pmBody = pmRes.body as ManagementNotesSectionResponse;
    expect(pmBody.notes).toHaveLength(1);
    expect(pmBody.notes[0].content).toBe('Visible to PM');
    expect(pmBody.notes[0]).not.toHaveProperty('visibleForPm');
    expect(pmBody.hasHiddenNotes).toBe(true);

    await pmAgent
      .post(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .send({ content: 'PM cannot write' })
      .expect(403);
    await pmAgent
      .patch(
        `/api/v1/employees/${subject.employeeId}/management-notes/${hiddenNoteId}`,
      )
      .send({ content: 'Blocked' })
      .expect(403);
  });

  it('shows PM gate with empty list when only hidden notes exist', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'mn-gate-subject@example.com',
    );
    const pp = await createEmployeeUser(testApp, 'mn-gate-pp@example.com');
    const pm = await createEmployeeUser(testApp, 'mn-gate-pm@example.com');
    const dm = await createEmployeeUser(testApp, 'mn-gate-dm@example.com');

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });
    await assignProjectLine(
      testApp,
      subject.employeeId,
      pm.employeeId,
      dm.employeeId,
    );

    const ppAgent = await loginAs(testApp, pp.email);
    await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .send({ content: 'Only managers see this' })
      .expect(201);

    const pmAgent = await loginAs(testApp, pm.email);
    const pmRes = await pmAgent
      .get(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .expect(200);
    const pmBody = pmRes.body as ManagementNotesSectionResponse;
    expect(pmBody.notes).toEqual([]);
    expect(pmBody.hasHiddenNotes).toBe(true);
  });

  it('grants ReportingLine union over PM with full RW and no gate', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'mn-union-subject@example.com',
    );
    const pm = await createEmployeeUser(testApp, 'mn-union-pm@example.com');
    const dm = await createEmployeeUser(testApp, 'mn-union-dm@example.com');

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { managerId: pm.employeeId },
    });
    await assignProjectLine(
      testApp,
      subject.employeeId,
      pm.employeeId,
      dm.employeeId,
    );

    const pp = await createEmployeeUser(testApp, 'mn-union-pp@example.com');
    const ppAgent = await loginAs(testApp, pp.email);
    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });
    await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .send({ content: 'Hidden from PM only path' })
      .expect(201);

    const pmAgent = await loginAs(testApp, pm.email);
    const pmRes = await pmAgent
      .get(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .expect(200);
    const pmBody = pmRes.body as ManagementNotesSectionResponse;
    expect(pmBody.notes).toHaveLength(1);
    expect(pmBody.notes[0].visibleForEmployee).toBe(false);
    expect(pmBody.hasHiddenNotes).toBeUndefined();

    await pmAgent
      .post(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .send({ content: 'PM can write via ReportingLine union' })
      .expect(201);
  });

  it('returns identical S7 payloads from profile and parallel GET', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'mn-parity-subject@example.com',
    );
    const pp = await createEmployeeUser(testApp, 'mn-parity-pp@example.com');
    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    const ppAgent = await loginAs(testApp, pp.email);
    await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .send({ content: 'Parity note', visibleForEmployee: true })
      .expect(201);

    const directRes = await ppAgent
      .get(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .expect(200);
    const profileRes = await ppAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);

    const profileBody = profileRes.body as {
      sections: { S7?: { data: ManagementNotesSectionResponse } };
    };
    expect(profileBody.sections.S7?.data).toEqual(directRes.body);
  });

  it('denies colleague access to management notes routes and profile S7', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'mn-colleague-subject@example.com',
    );
    const colleague = await createEmployeeUser(
      testApp,
      'mn-colleague@example.com',
    );

    const colleagueAgent = await loginAs(testApp, colleague.email);
    await colleagueAgent
      .get(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .expect(403);

    const profileRes = await colleagueAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);
    const profileBody = profileRes.body as {
      sections: Record<string, unknown>;
    };
    expect(profileBody.sections.S7).toBeUndefined();
  });

  it('denies Self write operations', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'mn-self-write@example.com',
    );
    const agent = await loginAs(testApp, subject.email);

    await agent
      .post(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .send({ content: 'Self cannot create' })
      .expect(403);
  });

  it('returns 404 for unknown employee before gate and 400 for malformed ids', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'mn-404-viewer@example.com',
    );
    const agent = await loginAs(testApp, viewer.email);

    await agent
      .get(
        `/api/v1/employees/00000000-0000-0000-0000-000000000099/management-notes`,
      )
      .expect(404);

    await agent
      .get('/api/v1/employees/not-a-uuid/management-notes')
      .expect(400);
  });

  it('grants PM and PP union with full RW and no gate', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'mn-pp-union-subject@example.com',
    );
    const pm = await createEmployeeUser(testApp, 'mn-pp-union-pm@example.com');
    const dm = await createEmployeeUser(testApp, 'mn-pp-union-dm@example.com');

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pm.employeeId },
    });
    await assignProjectLine(
      testApp,
      subject.employeeId,
      pm.employeeId,
      dm.employeeId,
    );

    const pmAgent = await loginAs(testApp, pm.email);
    await pmAgent
      .post(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .send({ content: 'Hidden from PM-only path' })
      .expect(201);

    const pmRes = await pmAgent
      .get(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .expect(200);
    const pmBody = pmRes.body as ManagementNotesSectionResponse;
    expect(pmBody.notes).toHaveLength(1);
    expect(pmBody.hasHiddenNotes).toBeUndefined();
  });

  it('allows ProjectLine DM full RW CRUD on any note', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'mn-dm-subject@example.com',
    );
    const pm = await createEmployeeUser(testApp, 'mn-dm-pm@example.com');
    const dm = await createEmployeeUser(testApp, 'mn-dm-dm@example.com');
    const pp = await createEmployeeUser(testApp, 'mn-dm-pp@example.com');

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });
    await assignProjectLine(
      testApp,
      subject.employeeId,
      pm.employeeId,
      dm.employeeId,
    );

    const ppAgent = await loginAs(testApp, pp.email);
    const created = await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .send({ content: 'Created by PP' })
      .expect(201);
    const noteId = (created.body as { id: string }).id;

    const dmAgent = await loginAs(testApp, dm.email);
    await dmAgent
      .patch(
        `/api/v1/employees/${subject.employeeId}/management-notes/${noteId}`,
      )
      .send({ content: 'Edited by DM' })
      .expect(200);
    await dmAgent
      .delete(
        `/api/v1/employees/${subject.employeeId}/management-notes/${noteId}`,
      )
      .expect(204);
  });

  it('allows ReportingLine manager RW CRUD without PP or PM union', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'mn-manager-subject@example.com',
    );
    const manager = await createEmployeeUser(testApp, 'mn-manager@example.com');

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    const created = await managerAgent
      .post(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .send({ content: 'Manager note', visibleForEmployee: true })
      .expect(201);
    const noteId = (created.body as { id: string }).id;

    const subjectAgent = await loginAs(testApp, subject.email);
    const selfRes = await subjectAgent
      .get(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .expect(200);
    const selfBody = selfRes.body as ManagementNotesSectionResponse;
    expect(selfBody.notes).toHaveLength(1);
    expect(selfBody.notes[0]).not.toHaveProperty('visibleForEmployee');

    await managerAgent
      .patch(
        `/api/v1/employees/${subject.employeeId}/management-notes/${noteId}`,
      )
      .send({ visibleForPm: true })
      .expect(200);
    await managerAgent
      .delete(
        `/api/v1/employees/${subject.employeeId}/management-notes/${noteId}`,
      )
      .expect(204);
  });

  it('denies Self PATCH and DELETE and PM DELETE', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'mn-self-patch@example.com',
    );
    const pp = await createEmployeeUser(
      testApp,
      'mn-self-patch-pp@example.com',
    );
    const pm = await createEmployeeUser(
      testApp,
      'mn-self-patch-pm@example.com',
    );
    const dm = await createEmployeeUser(
      testApp,
      'mn-self-patch-dm@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });
    await assignProjectLine(
      testApp,
      subject.employeeId,
      pm.employeeId,
      dm.employeeId,
    );

    const ppAgent = await loginAs(testApp, pp.email);
    const created = await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .send({ content: 'Managed note' })
      .expect(201);
    const noteId = (created.body as { id: string }).id;

    const subjectAgent = await loginAs(testApp, subject.email);
    await subjectAgent
      .patch(
        `/api/v1/employees/${subject.employeeId}/management-notes/${noteId}`,
      )
      .send({ content: 'Self edit' })
      .expect(403);
    await subjectAgent
      .delete(
        `/api/v1/employees/${subject.employeeId}/management-notes/${noteId}`,
      )
      .expect(403);

    const pmAgent = await loginAs(testApp, pm.email);
    await pmAgent
      .delete(
        `/api/v1/employees/${subject.employeeId}/management-notes/${noteId}`,
      )
      .expect(403);
  });

  it('returns 403 for authenticated users without an employee record', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'mn-no-employee-subject@example.com',
    );
    const user = await testApp.prisma.user.create({
      data: {
        email: 'mn-no-employee@example.com',
        passwordHash: await hash(PASSWORD, 12),
      },
    });
    const agent = await loginAs(testApp, user.email);

    await agent
      .get(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .expect(403);
  });

  it('rejects whitespace content, empty PATCH bodies, malformed note ids, and wrong-subject notes', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'mn-validation-subject@example.com',
    );
    const pp = await createEmployeeUser(
      testApp,
      'mn-validation-pp@example.com',
    );
    const other = await createEmployeeUser(
      testApp,
      'mn-validation-other@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: other.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    const ppAgent = await loginAs(testApp, pp.email);
    await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .send({ content: '   ' })
      .expect(400);

    const created = await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .send({ content: 'Valid note' })
      .expect(201);
    const noteId = (created.body as { id: string }).id;

    await ppAgent
      .patch(
        `/api/v1/employees/${subject.employeeId}/management-notes/${noteId}`,
      )
      .send({})
      .expect(400);
    await ppAgent
      .patch(
        `/api/v1/employees/${subject.employeeId}/management-notes/not-a-uuid`,
      )
      .send({ content: 'Updated' })
      .expect(400);
    await ppAgent
      .delete(
        `/api/v1/employees/${subject.employeeId}/management-notes/not-a-uuid`,
      )
      .expect(400);
    await ppAgent
      .patch(`/api/v1/employees/${other.employeeId}/management-notes/${noteId}`)
      .send({ content: 'Wrong subject' })
      .expect(404);
  });

  it('allows RW viewers to edit notes they did not author', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'mn-non-author-subject@example.com',
    );
    const pp = await createEmployeeUser(
      testApp,
      'mn-non-author-pp@example.com',
    );
    const manager = await createEmployeeUser(
      testApp,
      'mn-non-author-manager@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId, managerId: manager.employeeId },
    });

    const ppAgent = await loginAs(testApp, pp.email);
    const created = await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .send({ content: 'PP note' })
      .expect(201);
    const noteId = (created.body as { id: string }).id;

    const managerAgent = await loginAs(testApp, manager.email);
    await managerAgent
      .patch(
        `/api/v1/employees/${subject.employeeId}/management-notes/${noteId}`,
      )
      .send({ content: 'Manager edit' })
      .expect(200);
  });
});

describe('Management notes provider failure (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      providerOverrides: [
        {
          provide: ManagementNotesSectionProvider,
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

  it('returns 503 on parallel GET and unavailable S7 in profile', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'mn-provider-subject@example.com',
    );
    const pp = await createEmployeeUser(testApp, 'mn-provider-pp@example.com');
    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    const ppAgent = await loginAs(testApp, pp.email);
    await ppAgent
      .get(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .expect(503);

    const profileRes = await ppAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);
    const profileBody = profileRes.body as {
      sections: { S7?: { status?: string } };
    };
    expect(profileBody.sections.S7).toMatchObject({ status: 'unavailable' });
  });
});
