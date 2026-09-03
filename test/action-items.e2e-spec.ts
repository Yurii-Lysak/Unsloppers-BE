import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { ActionItemsSectionProvider } from '../src/modules/action-items/action-items-section.provider';
import { PERMISSION_KEYS } from '../src/modules/contracts/permission-keys';
import { createTestApp, TestApp } from './support/app-harness';
import { DEFAULT_TEST_INSTANT, FixedClock } from './support/fixed-clock';

const PASSWORD = 'test-only-action-items-password';

interface EmployeeUser {
  readonly userId: string;
  readonly employeeId: string;
  readonly email: string;
}

interface ActionItemReadDto {
  id: string;
  title: string;
  status: string;
  source: string;
  author: { id: string; displayName: string };
  dueDate: string;
}

interface ActionItemsSectionResponse {
  items: ActionItemReadDto[];
}

interface AuthoredActionItemReadDto extends ActionItemReadDto {
  assignee: { id: string; displayName: string };
}

async function createEmployeeUser(
  testApp: TestApp,
  email: string,
  name?: string,
): Promise<EmployeeUser> {
  const user = await testApp.prisma.user.create({
    data: {
      email,
      name,
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

async function grantCreateActionItemsPermission(
  testApp: TestApp,
  employeeId: string,
): Promise<void> {
  const role = await testApp.prisma.functionalRole.create({
    data: {
      name: `Action Item Creator ${employeeId}`,
      permissions: {
        create: [{ permissionKey: PERMISSION_KEYS.CREATE_ACTION_ITEMS }],
      },
    },
  });
  await testApp.prisma.functionalRoleAssignment.create({
    data: { employeeId, roleId: role.id },
  });
}

describe('Action items (e2e)', () => {
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

  it('lets a UM create a manual item for a direct report and surfaces it on S14', async () => {
    const manager = await createEmployeeUser(testApp, 'ai-manager@example.com');
    const report = await createEmployeeUser(
      testApp,
      'ai-report@example.com',
      'Report Employee',
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    const createRes = await managerAgent
      .post(`/api/v1/employees/${report.employeeId}/action-items`)
      .send({ title: 'Submit Q3 self-review', dueDate: '2026-09-20' })
      .expect(201);

    const created = createRes.body as ActionItemReadDto;
    expect(created).toMatchObject({
      title: 'Submit Q3 self-review',
      status: 'open',
      source: 'manual',
      author: { id: manager.employeeId },
      dueDate: '2026-09-20',
    });
    expect(created.link).toBeUndefined();

    const listRes = await managerAgent
      .get(`/api/v1/employees/${report.employeeId}/action-items`)
      .expect(200);
    const listBody = listRes.body as ActionItemsSectionResponse;
    expect(listBody.items).toHaveLength(1);
    expect(listBody.items[0].id).toBe(created.id);

    const profileRes = await managerAgent
      .get(`/api/v1/employees/${report.employeeId}/profile`)
      .expect(200);
    const s14 = (
      profileRes.body as {
        sections: {
          S14?: { data?: ActionItemsSectionResponse; accessLevel?: string };
        };
      }
    ).sections.S14;
    expect(s14?.accessLevel).toBe('RW');
    expect(s14?.data?.items).toHaveLength(1);
    expect(s14?.data?.items[0].title).toBe('Submit Q3 self-review');

    const authoredRes = await managerAgent
      .get('/api/v1/me/authored-action-items')
      .expect(200);
    const authored = authoredRes.body as AuthoredActionItemReadDto[];
    expect(authored).toHaveLength(1);
    expect(authored[0]).toMatchObject({
      id: created.id,
      assignee: { id: report.employeeId, displayName: 'Report Employee' },
    });
  });

  it('sorts authored items by due date ascending', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'ai-sort-manager@example.com',
    );
    const reportA = await createEmployeeUser(testApp, 'ai-sort-a@example.com');
    const reportB = await createEmployeeUser(testApp, 'ai-sort-b@example.com');
    await testApp.prisma.employee.update({
      where: { id: reportA.employeeId },
      data: { managerId: manager.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: reportB.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    await managerAgent
      .post(`/api/v1/employees/${reportA.employeeId}/action-items`)
      .send({ title: 'Later task', dueDate: '2026-09-25' })
      .expect(201);
    await managerAgent
      .post(`/api/v1/employees/${reportB.employeeId}/action-items`)
      .send({ title: 'Earlier task', dueDate: '2026-09-10' })
      .expect(201);

    const authoredRes = await managerAgent
      .get('/api/v1/me/authored-action-items')
      .expect(200);
    const authored = authoredRes.body as AuthoredActionItemReadDto[];
    expect(authored).toHaveLength(2);
    expect(authored[0].dueDate).toBe('2026-09-10');
    expect(authored[1].dueDate).toBe('2026-09-25');
  });

  it('lets a PM with ProjectLine R and create_action_items create for project talent', async () => {
    const subject = await createEmployeeUser(testApp, 'ai-subject@example.com');
    const pm = await createEmployeeUser(testApp, 'ai-pm@example.com');
    const dm = await createEmployeeUser(testApp, 'ai-dm@example.com');
    await assignProjectLine(
      testApp,
      subject.employeeId,
      pm.employeeId,
      dm.employeeId,
    );
    await grantCreateActionItemsPermission(testApp, pm.employeeId);

    const pmAgent = await loginAs(testApp, pm.email);
    const createRes = await pmAgent
      .post(`/api/v1/employees/${subject.employeeId}/action-items`)
      .send({ title: 'Project follow-up', dueDate: '2026-09-18' })
      .expect(201);

    const created = createRes.body as ActionItemReadDto;
    expect(created).toMatchObject({
      title: 'Project follow-up',
      status: 'open',
      source: 'manual',
      author: { id: pm.employeeId },
    });

    const listRes = await pmAgent
      .get(`/api/v1/employees/${subject.employeeId}/action-items`)
      .expect(200);
    expect((listRes.body as ActionItemsSectionResponse).items).toHaveLength(1);

    const profileRes = await pmAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);
    const s14 = (
      profileRes.body as {
        sections: {
          S14?: { data?: ActionItemsSectionResponse; accessLevel?: string };
        };
      }
    ).sections.S14;
    expect(s14?.accessLevel).toBe('RW');
    expect(s14?.data?.items[0]?.title).toBe('Project follow-up');
  });

  it('rejects a PM with no relationship to the assignee', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'ai-outscope@example.com',
    );
    const pm = await createEmployeeUser(testApp, 'ai-outscope-pm@example.com');
    await grantCreateActionItemsPermission(testApp, pm.employeeId);

    const pmAgent = await loginAs(testApp, pm.email);
    await pmAgent
      .post(`/api/v1/employees/${subject.employeeId}/action-items`)
      .send({ title: 'Blocked', dueDate: '2026-09-18' })
      .expect(403);
  });

  it('lets a PP create for a partner without create_action_items permission', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'ai-pp-subject@example.com',
    );
    const pp = await createEmployeeUser(testApp, 'ai-pp@example.com');
    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    const ppAgent = await loginAs(testApp, pp.email);
    await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/action-items`)
      .send({ title: 'PP task', dueDate: '2026-09-22' })
      .expect(201);
  });

  it('rejects colleague viewers on parallel GET and POST', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'ai-colleague-subject@example.com',
    );
    const colleague = await createEmployeeUser(
      testApp,
      'ai-colleague@example.com',
    );

    const colleagueAgent = await loginAs(testApp, colleague.email);
    await colleagueAgent
      .get(`/api/v1/employees/${subject.employeeId}/action-items`)
      .expect(403);
    await colleagueAgent
      .post(`/api/v1/employees/${subject.employeeId}/action-items`)
      .send({ title: 'Nope', dueDate: '2026-09-18' })
      .expect(403);
  });

  it('rejects create_action_items when S14 is none', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'ai-perm-subject@example.com',
    );
    const outsider = await createEmployeeUser(
      testApp,
      'ai-perm-outsider@example.com',
    );
    await grantCreateActionItemsPermission(testApp, outsider.employeeId);

    const outsiderAgent = await loginAs(testApp, outsider.email);
    await outsiderAgent
      .post(`/api/v1/employees/${subject.employeeId}/action-items`)
      .send({ title: 'Still blocked', dueDate: '2026-09-18' })
      .expect(403);
  });

  it('allows self-assignment when viewer has create_action_items and Self S14 R', async () => {
    const selfUser = await createEmployeeUser(testApp, 'ai-self@example.com');
    await grantCreateActionItemsPermission(testApp, selfUser.employeeId);

    const selfAgent = await loginAs(testApp, selfUser.email);
    await selfAgent
      .post(`/api/v1/employees/${selfUser.employeeId}/action-items`)
      .send({ title: 'Self task', dueDate: '2026-09-10' })
      .expect(201);

    const profileRes = await selfAgent
      .get(`/api/v1/employees/${selfUser.employeeId}/profile`)
      .expect(200);
    const s14 = (
      profileRes.body as {
        sections: {
          S14?: { data?: ActionItemsSectionResponse; accessLevel?: string };
        };
      }
    ).sections.S14;
    expect(s14?.accessLevel).toBe('R');
    expect(s14?.data?.items).toHaveLength(1);
    expect(s14?.data?.items[0].title).toBe('Self task');
  });

  it('omits authored items after live S14 access is lost', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'ai-drift-manager@example.com',
    );
    const report = await createEmployeeUser(
      testApp,
      'ai-drift-report@example.com',
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    await managerAgent
      .post(`/api/v1/employees/${report.employeeId}/action-items`)
      .send({ title: 'Drift task', dueDate: '2026-09-25' })
      .expect(201);

    let authored = await managerAgent
      .get('/api/v1/me/authored-action-items')
      .expect(200);
    expect((authored.body as AuthoredActionItemReadDto[]).length).toBe(1);

    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: null },
    });

    authored = await managerAgent
      .get('/api/v1/me/authored-action-items')
      .expect(200);
    expect(authored.body as AuthoredActionItemReadDto[]).toEqual([]);
  });

  it('rejects validation failures with 400', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'ai-valid-manager@example.com',
    );
    const report = await createEmployeeUser(
      testApp,
      'ai-valid-report@example.com',
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });
    const managerAgent = await loginAs(testApp, manager.email);

    await managerAgent
      .post(`/api/v1/employees/${report.employeeId}/action-items`)
      .send({ title: '   ', dueDate: '2026-09-18' })
      .expect(400);

    await managerAgent
      .post(`/api/v1/employees/${report.employeeId}/action-items`)
      .send({ title: 'x'.repeat(201), dueDate: '2026-09-18' })
      .expect(400);

    await managerAgent
      .post(`/api/v1/employees/${report.employeeId}/action-items`)
      .send({ title: 'Bad link', dueDate: '2026-09-18', link: 'not-a-url' })
      .expect(400);

    await managerAgent
      .post(`/api/v1/employees/${report.employeeId}/action-items`)
      .send({ title: 'Bad date', dueDate: '2026-09-18T00:00:00.000Z' })
      .expect(400);

    await managerAgent
      .post(`/api/v1/employees/${report.employeeId}/action-items`)
      .send({ title: 'Invalid calendar', dueDate: '2026-02-30' })
      .expect(400);
  });

  it('stores past due dates and treats empty link as omitted', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'ai-past-manager@example.com',
    );
    const report = await createEmployeeUser(
      testApp,
      'ai-past-report@example.com',
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });
    const managerAgent = await loginAs(testApp, manager.email);

    const res = await managerAgent
      .post(`/api/v1/employees/${report.employeeId}/action-items`)
      .send({
        title: 'Past due ok',
        dueDate: '2026-08-01',
        link: '',
      })
      .expect(201);

    expect((res.body as ActionItemReadDto).dueDate).toBe('2026-08-01');
    expect((res.body as ActionItemReadDto).link).toBeUndefined();
  });

  it('returns 404 for unknown assignee and 400 for malformed UUID', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'ai-404-manager@example.com',
    );
    const managerAgent = await loginAs(testApp, manager.email);

    await managerAgent
      .post(`/api/v1/employees/${randomUUID()}/action-items`)
      .send({ title: 'Missing', dueDate: '2026-09-18' })
      .expect(404);

    await managerAgent
      .post('/api/v1/employees/not-a-uuid/action-items')
      .send({ title: 'Bad id', dueDate: '2026-09-18' })
      .expect(400);
  });

  it('returns 404 when assignee is dismissed', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'ai-dismissed-manager@example.com',
    );
    const dismissed = await createEmployeeUser(
      testApp,
      'ai-dismissed@example.com',
    );
    await testApp.prisma.employee.update({
      where: { id: dismissed.employeeId },
      data: { managerId: manager.employeeId, employmentStatus: 'dismissed' },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    await managerAgent
      .post(`/api/v1/employees/${dismissed.employeeId}/action-items`)
      .send({ title: 'Too late', dueDate: '2026-09-18' })
      .expect(404);
  });
});

describe('Action items provider failure (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      providerOverrides: [
        {
          provide: ActionItemsSectionProvider,
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

  it('returns 503 on parallel GET and unavailable S14 in profile', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'ai-provider-subject@example.com',
    );
    const pp = await createEmployeeUser(testApp, 'ai-provider-pp@example.com');
    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    const ppAgent = await loginAs(testApp, pp.email);
    await ppAgent
      .get(`/api/v1/employees/${subject.employeeId}/action-items`)
      .expect(503);

    const profileRes = await ppAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);
    const profileBody = profileRes.body as {
      sections: { S14?: { status?: string } };
    };
    expect(profileBody.sections.S14).toMatchObject({ status: 'unavailable' });
  });
});
