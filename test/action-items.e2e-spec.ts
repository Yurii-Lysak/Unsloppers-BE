import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { ActionItemsSectionProvider } from '../src/modules/action-items/action-items-section.provider';
import { ActionItemsService } from '../src/modules/action-items/action-items.service';
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
  isOverdue: boolean;
  completedAt?: string;
  cancelledAt?: string;
  cancelledReason?: string;
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

async function createTestCampaign(
  testApp: TestApp,
  creatorId: string,
): Promise<string> {
  const campaign = await testApp.prisma.formCampaign.create({
    data: {
      creatorId,
      title: 'Test campaign',
      description: 'Test campaign description',
      purpose: 'Testing',
      link: 'https://forms.example.com/test',
      dueDate: new Date('2026-12-31'),
    },
  });
  return campaign.id;
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

async function createOpenItemForReport(
  testApp: TestApp,
  managerAgent: ReturnType<typeof request.agent>,
  reportEmployeeId: string,
  title = 'Lifecycle task',
): Promise<ActionItemReadDto> {
  const res = await managerAgent
    .post(`/api/v1/employees/${reportEmployeeId}/action-items`)
    .send({ title, dueDate: '2026-09-20' })
    .expect(201);
  return res.body as ActionItemReadDto;
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

  it('rejects colleague viewers on parallel GET, POST, and complete', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'ai-colleague-subject@example.com',
    );
    const colleague = await createEmployeeUser(
      testApp,
      'ai-colleague@example.com',
    );
    const manager = await createEmployeeUser(
      testApp,
      'ai-colleague-manager@example.com',
    );
    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    const item = await createOpenItemForReport(
      testApp,
      managerAgent,
      subject.employeeId,
      'Colleague cannot complete',
    );

    const colleagueAgent = await loginAs(testApp, colleague.email);
    await colleagueAgent
      .get(`/api/v1/employees/${subject.employeeId}/action-items`)
      .expect(403);
    await colleagueAgent
      .post(`/api/v1/employees/${subject.employeeId}/action-items`)
      .send({ title: 'Nope', dueDate: '2026-09-18' })
      .expect(403);
    await colleagueAgent
      .post(
        `/api/v1/employees/${subject.employeeId}/action-items/${item.id}/complete`,
      )
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
    expect((res.body as ActionItemReadDto).isOverdue).toBe(false);
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

  it('lets the assignee complete an open item and surfaces terminal fields on S14', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'ai-complete-manager@example.com',
    );
    const report = await createEmployeeUser(
      testApp,
      'ai-complete-report@example.com',
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    const item = await createOpenItemForReport(
      testApp,
      managerAgent,
      report.employeeId,
    );

    const reportAgent = await loginAs(testApp, report.email);
    const completeRes = await reportAgent
      .post(
        `/api/v1/employees/${report.employeeId}/action-items/${item.id}/complete`,
      )
      .expect(200);

    expect(completeRes.body).toMatchObject({
      id: item.id,
      status: 'completed',
      completedAt: DEFAULT_TEST_INSTANT,
    });

    const listRes = await reportAgent
      .get(`/api/v1/employees/${report.employeeId}/action-items`)
      .expect(200);
    expect((listRes.body as ActionItemsSectionResponse).items[0]).toMatchObject(
      {
        status: 'completed',
        completedAt: DEFAULT_TEST_INSTANT,
      },
    );

    const profileRes = await reportAgent
      .get(`/api/v1/employees/${report.employeeId}/profile`)
      .expect(200);
    const s14 = (
      profileRes.body as {
        sections: { S14?: { data?: ActionItemsSectionResponse } };
      }
    ).sections.S14;
    expect(s14?.data?.items[0]).toMatchObject({
      status: 'completed',
      completedAt: DEFAULT_TEST_INSTANT,
    });
  });

  it('denies complete for manager, PP, PM, and author-not-assignee', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'ai-deny-manager@example.com',
    );
    const report = await createEmployeeUser(
      testApp,
      'ai-deny-report@example.com',
    );
    const pp = await createEmployeeUser(testApp, 'ai-deny-pp@example.com');
    const pm = await createEmployeeUser(testApp, 'ai-deny-pm@example.com');
    const dm = await createEmployeeUser(testApp, 'ai-deny-dm@example.com');

    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: {
        managerId: manager.employeeId,
        peoplePartnerId: pp.employeeId,
      },
    });
    await assignProjectLine(
      testApp,
      report.employeeId,
      pm.employeeId,
      dm.employeeId,
    );
    await grantCreateActionItemsPermission(testApp, pm.employeeId);

    const managerAgent = await loginAs(testApp, manager.email);
    const item = await createOpenItemForReport(
      testApp,
      managerAgent,
      report.employeeId,
      'Deny complete task',
    );

    await managerAgent
      .post(
        `/api/v1/employees/${report.employeeId}/action-items/${item.id}/complete`,
      )
      .expect(403);

    const ppAgent = await loginAs(testApp, pp.email);
    await ppAgent
      .post(
        `/api/v1/employees/${report.employeeId}/action-items/${item.id}/complete`,
      )
      .expect(403);

    const pmAgent = await loginAs(testApp, pm.email);
    await pmAgent
      .post(
        `/api/v1/employees/${report.employeeId}/action-items/${item.id}/complete`,
      )
      .expect(403);
  });

  it('lets the author cancel with a reason after losing live S14 access', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'ai-cancel-manager@example.com',
    );
    const report = await createEmployeeUser(
      testApp,
      'ai-cancel-report@example.com',
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    const item = await createOpenItemForReport(
      testApp,
      managerAgent,
      report.employeeId,
      'Cancel after drift',
    );

    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: null },
    });

    const cancelRes = await managerAgent
      .post(`/api/v1/me/authored-action-items/${item.id}/cancel`)
      .send({ reason: 'No longer applicable' })
      .expect(200);

    expect(cancelRes.body).toMatchObject({
      status: 'cancelled',
      cancelledAt: DEFAULT_TEST_INSTANT,
      cancelledReason: 'No longer applicable',
    });

    const reportAgent = await loginAs(testApp, report.email);
    const listRes = await reportAgent
      .get(`/api/v1/employees/${report.employeeId}/action-items`)
      .expect(200);
    expect((listRes.body as ActionItemsSectionResponse).items[0]).toMatchObject(
      {
        status: 'cancelled',
        cancelledAt: DEFAULT_TEST_INSTANT,
        cancelledReason: 'No longer applicable',
      },
    );

    const profileRes = await reportAgent
      .get(`/api/v1/employees/${report.employeeId}/profile`)
      .expect(200);
    const s14 = (
      profileRes.body as {
        sections: { S14?: { data?: ActionItemsSectionResponse } };
      }
    ).sections.S14;
    expect(s14?.data?.items[0]).toMatchObject({
      status: 'cancelled',
      cancelledAt: DEFAULT_TEST_INSTANT,
      cancelledReason: 'No longer applicable',
    });
  });

  it('rejects cancel without a valid reason and preserves idempotent cancel', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'ai-cancel-valid-manager@example.com',
    );
    const report = await createEmployeeUser(
      testApp,
      'ai-cancel-valid-report@example.com',
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    const item = await createOpenItemForReport(
      testApp,
      managerAgent,
      report.employeeId,
      'Cancel validation task',
    );

    await managerAgent
      .post(`/api/v1/me/authored-action-items/${item.id}/cancel`)
      .send({})
      .expect(400);

    await managerAgent
      .post(`/api/v1/me/authored-action-items/${item.id}/cancel`)
      .send({ reason: 'x'.repeat(2001) })
      .expect(400);

    const firstCancel = await managerAgent
      .post(`/api/v1/me/authored-action-items/${item.id}/cancel`)
      .send({ reason: 'Original reason' })
      .expect(200);

    const secondCancel = await managerAgent
      .post(`/api/v1/me/authored-action-items/${item.id}/cancel`)
      .send({ reason: 'Different reason' })
      .expect(200);

    expect(secondCancel.body).toMatchObject({
      status: 'cancelled',
      cancelledReason: 'Original reason',
      cancelledAt: (firstCancel.body as ActionItemReadDto).cancelledAt,
    });
  });

  it('returns 404 when assignee who is not author attempts cancel', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'ai-cancel-404-manager@example.com',
    );
    const report = await createEmployeeUser(
      testApp,
      'ai-cancel-404-report@example.com',
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    const item = await createOpenItemForReport(
      testApp,
      managerAgent,
      report.employeeId,
    );

    const reportAgent = await loginAs(testApp, report.email);
    await reportAgent
      .post(`/api/v1/me/authored-action-items/${item.id}/cancel`)
      .send({ reason: 'Not my item to cancel' })
      .expect(404);
  });

  it('removes terminal items from authored list and rejects repeat mutations', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'ai-terminal-manager@example.com',
    );
    const report = await createEmployeeUser(
      testApp,
      'ai-terminal-report@example.com',
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    const item = await createOpenItemForReport(
      testApp,
      managerAgent,
      report.employeeId,
      'Terminal lifecycle task',
    );

    const reportAgent = await loginAs(testApp, report.email);
    await reportAgent
      .post(
        `/api/v1/employees/${report.employeeId}/action-items/${item.id}/complete`,
      )
      .expect(200);

    const authoredAfterComplete = await managerAgent
      .get('/api/v1/me/authored-action-items')
      .expect(200);
    expect(authoredAfterComplete.body as AuthoredActionItemReadDto[]).toEqual(
      [],
    );

    await reportAgent
      .post(
        `/api/v1/employees/${report.employeeId}/action-items/${item.id}/complete`,
      )
      .expect(409);

    await managerAgent
      .post(`/api/v1/me/authored-action-items/${item.id}/cancel`)
      .send({ reason: 'Too late' })
      .expect(409);

    const item2 = await createOpenItemForReport(
      testApp,
      managerAgent,
      report.employeeId,
      'Cancel terminal task',
    );
    await managerAgent
      .post(`/api/v1/me/authored-action-items/${item2.id}/cancel`)
      .send({ reason: 'Done elsewhere' })
      .expect(200);

    const authoredAfterCancel = await managerAgent
      .get('/api/v1/me/authored-action-items')
      .expect(200);
    expect(authoredAfterCancel.body as AuthoredActionItemReadDto[]).toEqual([]);

    await managerAgent
      .post(`/api/v1/me/authored-action-items/${item2.id}/cancel`)
      .send({ reason: 'Again' })
      .expect(200);
  });

  it('lets the assignee complete a campaign-sourced open item', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'ai-campaign-manager@example.com',
    );
    const report = await createEmployeeUser(
      testApp,
      'ai-campaign-report@example.com',
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });

    const campaignId = await createTestCampaign(testApp, manager.employeeId);
    const item = await testApp.prisma.actionItem.create({
      data: {
        assigneeId: report.employeeId,
        authorId: manager.employeeId,
        title: 'Campaign follow-up',
        dueDate: new Date('2026-09-20'),
        source: 'campaign',
        campaignId,
        status: 'open',
      },
    });

    const reportAgent = await loginAs(testApp, report.email);
    const completeRes = await reportAgent
      .post(
        `/api/v1/employees/${report.employeeId}/action-items/${item.id}/complete`,
      )
      .expect(200);

    expect(completeRes.body).toMatchObject({
      id: item.id,
      status: 'completed',
      source: 'campaign',
      completedAt: DEFAULT_TEST_INSTANT,
    });
  });

  it('returns 403 when canceling without an employee record', async () => {
    const user = await testApp.prisma.user.create({
      data: {
        email: 'ai-no-employee-cancel@example.com',
        passwordHash: await hash(PASSWORD, 12),
      },
    });

    const agent = await loginAs(testApp, user.email);
    await agent
      .post(`/api/v1/me/authored-action-items/${randomUUID()}/cancel`)
      .send({ reason: 'Should not reach item lookup' })
      .expect(403);
  });

  it('returns one terminal state when complete and cancel race', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'ai-race-manager@example.com',
    );
    const report = await createEmployeeUser(
      testApp,
      'ai-race-report@example.com',
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    const item = await createOpenItemForReport(
      testApp,
      managerAgent,
      report.employeeId,
      'Race task',
    );

    const reportAgent = await loginAs(testApp, report.email);
    const [completeRes, cancelRes] = await Promise.all([
      reportAgent.post(
        `/api/v1/employees/${report.employeeId}/action-items/${item.id}/complete`,
      ),
      managerAgent
        .post(`/api/v1/me/authored-action-items/${item.id}/cancel`)
        .send({ reason: 'Race cancel' }),
    ]);

    const statuses = [completeRes.status, cancelRes.status].sort(
      (a, b) => a - b,
    );
    expect(statuses).toEqual([200, 409]);

    const dbItem = await testApp.prisma.actionItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(['completed', 'cancelled']).toContain(dbItem.status);
    expect(
      dbItem.status === 'completed' ? dbItem.completedAt : dbItem.cancelledAt,
    ).not.toBeNull();
  });

  it('returns 404 when completing for a dismissed assignee', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'ai-complete-dismissed-manager@example.com',
    );
    const dismissed = await createEmployeeUser(
      testApp,
      'ai-complete-dismissed@example.com',
    );
    await testApp.prisma.employee.update({
      where: { id: dismissed.employeeId },
      data: { managerId: manager.employeeId, employmentStatus: 'dismissed' },
    });

    const item = await testApp.prisma.actionItem.create({
      data: {
        assigneeId: dismissed.employeeId,
        authorId: manager.employeeId,
        title: 'Legacy open item',
        dueDate: new Date('2026-09-20'),
        source: 'manual',
        status: 'open',
      },
    });

    const dismissedAgent = await loginAs(testApp, dismissed.email);
    await dismissedAgent
      .post(
        `/api/v1/employees/${dismissed.employeeId}/action-items/${item.id}/complete`,
      )
      .expect(404);
  });
});

describe('Action items overdue highlighting (e2e)', () => {
  let testApp: TestApp;
  let clock: FixedClock;

  beforeAll(async () => {
    clock = new FixedClock(DEFAULT_TEST_INSTANT);
    testApp = await createTestApp({ clock });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    clock.set(DEFAULT_TEST_INSTANT);
    await testApp.resetDatabase();
  });

  async function setupManagerReport(): Promise<{
    manager: EmployeeUser;
    report: EmployeeUser;
    managerAgent: ReturnType<typeof request.agent>;
  }> {
    const manager = await createEmployeeUser(
      testApp,
      `ai-overdue-mgr-${randomUUID()}@example.com`,
    );
    const report = await createEmployeeUser(
      testApp,
      `ai-overdue-rpt-${randomUUID()}@example.com`,
      'Overdue Report',
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });
    const managerAgent = await loginAs(testApp, manager.email);
    return { manager, report, managerAgent };
  }

  it('marks open past-due items overdue on all read surfaces', async () => {
    const { report, managerAgent } = await setupManagerReport();

    const createRes = await managerAgent
      .post(`/api/v1/employees/${report.employeeId}/action-items`)
      .send({ title: 'Past due task', dueDate: '2025-12-31' })
      .expect(201);

    const created = createRes.body as ActionItemReadDto;
    expect(created.isOverdue).toBe(true);

    const listRes = await managerAgent
      .get(`/api/v1/employees/${report.employeeId}/action-items`)
      .expect(200);
    expect(
      (listRes.body as ActionItemsSectionResponse).items[0].isOverdue,
    ).toBe(true);

    const profileRes = await managerAgent
      .get(`/api/v1/employees/${report.employeeId}/profile`)
      .expect(200);
    const s14 = (
      profileRes.body as {
        sections: { S14?: { data?: ActionItemsSectionResponse } };
      }
    ).sections.S14;
    expect(s14?.data?.items[0].isOverdue).toBe(true);

    const authoredRes = await managerAgent
      .get('/api/v1/me/authored-action-items')
      .expect(200);
    expect((authoredRes.body as AuthoredActionItemReadDto[])[0].isOverdue).toBe(
      true,
    );
  });

  it('does not mark open items due today or in the future as overdue', async () => {
    const { report, managerAgent } = await setupManagerReport();

    const todayRes = await managerAgent
      .post(`/api/v1/employees/${report.employeeId}/action-items`)
      .send({ title: 'Due today', dueDate: '2026-01-05' })
      .expect(201);
    expect((todayRes.body as ActionItemReadDto).isOverdue).toBe(false);

    clock.set('2026-01-05T23:59:59.000Z');
    const listRes = await managerAgent
      .get(`/api/v1/employees/${report.employeeId}/action-items`)
      .expect(200);
    expect(
      (listRes.body as ActionItemsSectionResponse).items[0].isOverdue,
    ).toBe(false);

    const futureRes = await managerAgent
      .post(`/api/v1/employees/${report.employeeId}/action-items`)
      .send({ title: 'Future task', dueDate: '2026-09-20' })
      .expect(201);
    expect((futureRes.body as ActionItemReadDto).isOverdue).toBe(false);
  });

  it('clears overdue on complete and cancel mutation responses', async () => {
    const { report, managerAgent } = await setupManagerReport();

    const item = (
      await managerAgent
        .post(`/api/v1/employees/${report.employeeId}/action-items`)
        .send({ title: 'Terminal overdue', dueDate: '2025-12-31' })
        .expect(201)
    ).body as ActionItemReadDto;
    expect(item.isOverdue).toBe(true);

    const reportAgent = await loginAs(testApp, report.email);
    const completeRes = await reportAgent
      .post(
        `/api/v1/employees/${report.employeeId}/action-items/${item.id}/complete`,
      )
      .expect(200);
    expect((completeRes.body as ActionItemReadDto).isOverdue).toBe(false);

    const listAfterComplete = await managerAgent
      .get(`/api/v1/employees/${report.employeeId}/action-items`)
      .expect(200);
    expect(
      (listAfterComplete.body as ActionItemsSectionResponse).items.find(
        (row) => row.id === item.id,
      )?.isOverdue,
    ).toBe(false);

    const profileAfterComplete = await managerAgent
      .get(`/api/v1/employees/${report.employeeId}/profile`)
      .expect(200);
    const s14AfterComplete = (
      profileAfterComplete.body as {
        sections: { S14?: { data?: ActionItemsSectionResponse } };
      }
    ).sections.S14;
    expect(
      s14AfterComplete?.data?.items.find((row) => row.id === item.id)
        ?.isOverdue,
    ).toBe(false);

    const item2 = (
      await managerAgent
        .post(`/api/v1/employees/${report.employeeId}/action-items`)
        .send({ title: 'Cancel overdue', dueDate: '2025-12-31' })
        .expect(201)
    ).body as ActionItemReadDto;

    const cancelRes = await managerAgent
      .post(`/api/v1/me/authored-action-items/${item2.id}/cancel`)
      .send({ reason: 'No longer needed' })
      .expect(200);
    expect((cancelRes.body as ActionItemReadDto).isOverdue).toBe(false);

    const listAfterCancel = await managerAgent
      .get(`/api/v1/employees/${report.employeeId}/action-items`)
      .expect(200);
    expect(
      (listAfterCancel.body as ActionItemsSectionResponse).items.find(
        (row) => row.id === item2.id,
      )?.isOverdue,
    ).toBe(false);

    const profileAfterCancel = await managerAgent
      .get(`/api/v1/employees/${report.employeeId}/profile`)
      .expect(200);
    const s14AfterCancel = (
      profileAfterCancel.body as {
        sections: { S14?: { data?: ActionItemsSectionResponse } };
      }
    ).sections.S14;
    expect(
      s14AfterCancel?.data?.items.find((row) => row.id === item2.id)?.isOverdue,
    ).toBe(false);
  });

  it('uses the same overdue derivation for campaign-sourced items', async () => {
    const { manager, report } = await setupManagerReport();

    const campaignId = await createTestCampaign(testApp, manager.employeeId);
    const item = await testApp.prisma.actionItem.create({
      data: {
        assigneeId: report.employeeId,
        authorId: manager.employeeId,
        title: 'Campaign overdue',
        dueDate: new Date('2025-12-31T00:00:00.000Z'),
        source: 'campaign',
        campaignId,
        status: 'open',
      },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    const listRes = await managerAgent
      .get(`/api/v1/employees/${report.employeeId}/action-items`)
      .expect(200);
    const listed = (listRes.body as ActionItemsSectionResponse).items.find(
      (row) => row.id === item.id,
    );
    expect(listed?.isOverdue).toBe(true);
    expect(listed?.source).toBe('campaign');
  });

  it('flips isOverdue when the clock advances or retreats without a DB write', async () => {
    const { report, managerAgent } = await setupManagerReport();

    const createRes = await managerAgent
      .post(`/api/v1/employees/${report.employeeId}/action-items`)
      .send({ title: 'Clock boundary', dueDate: '2026-01-06' })
      .expect(201);
    const item = createRes.body as ActionItemReadDto;
    expect(item.isOverdue).toBe(false);

    clock.set('2026-01-07T00:00:00.000Z');
    const afterAdvance = await managerAgent
      .get(`/api/v1/employees/${report.employeeId}/action-items`)
      .expect(200);
    expect(
      (afterAdvance.body as ActionItemsSectionResponse).items[0].isOverdue,
    ).toBe(true);

    clock.set('2026-01-05T09:00:00.000Z');
    const afterRetreat = await managerAgent
      .get(`/api/v1/employees/${report.employeeId}/action-items`)
      .expect(200);
    expect(
      (afterRetreat.body as ActionItemsSectionResponse).items[0].isOverdue,
    ).toBe(false);
  });

  describe('createCampaignActionItems (C6 bulk)', () => {
    it('creates one campaign item per frozen recipient and exposes them on S14', async () => {
      const sender = await createEmployeeUser(
        testApp,
        'ai-bulk-sender@example.com',
        'Campaign Sender',
      );
      const recipientA = await createEmployeeUser(
        testApp,
        'ai-bulk-recipient-a@example.com',
        'Recipient A',
      );
      const recipientB = await createEmployeeUser(
        testApp,
        'ai-bulk-recipient-b@example.com',
        'Recipient B',
      );
      const recipientC = await createEmployeeUser(
        testApp,
        'ai-bulk-recipient-c@example.com',
        'Recipient C',
      );
      await testApp.prisma.employee.update({
        where: { id: recipientA.employeeId },
        data: { managerId: sender.employeeId },
      });
      await testApp.prisma.employee.update({
        where: { id: recipientB.employeeId },
        data: { managerId: sender.employeeId },
      });
      await testApp.prisma.employee.update({
        where: { id: recipientC.employeeId },
        data: { managerId: sender.employeeId },
      });

      const campaignId = await createTestCampaign(testApp, sender.employeeId);
      const actionItems = testApp.app.get(ActionItemsService);
      const created = await actionItems.createCampaignActionItems({
        campaignId,
        authorId: sender.employeeId,
        title: 'Annual Engagement Survey',
        description: 'Please complete the survey',
        dueDate: '2025-12-31',
        link: 'https://forms.example.com/survey',
        assigneeIds: [
          recipientA.employeeId,
          recipientB.employeeId,
          recipientC.employeeId,
        ],
      });

      expect(created).toHaveLength(3);
      expect(created.every((item) => item.source === 'campaign')).toBe(true);
      expect(created.every((item) => item.campaignId === campaignId)).toBe(
        true,
      );
      expect(created.every((item) => item.isOverdue === true)).toBe(true);

      const senderAgent = await loginAs(testApp, sender.email);
      const listRes = await senderAgent
        .get(`/api/v1/employees/${recipientA.employeeId}/action-items`)
        .expect(200);
      const listed = (listRes.body as ActionItemsSectionResponse).items;
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        title: 'Annual Engagement Survey',
        source: 'campaign',
        author: { id: sender.employeeId, displayName: 'Campaign Sender' },
        isOverdue: true,
      });

      const profileRes = await senderAgent
        .get(`/api/v1/employees/${recipientB.employeeId}/profile`)
        .expect(200);
      const profileBody = profileRes.body as {
        sections: { S14?: { data?: ActionItemsSectionResponse } };
      };
      const profileItems = profileBody.sections.S14?.data?.items ?? [];
      expect(profileItems).toHaveLength(1);
      expect(profileItems[0].source).toBe('campaign');
    });

    it('rejects a second bulk create for the same campaign', async () => {
      const sender = await createEmployeeUser(
        testApp,
        'ai-bulk-conflict-sender@example.com',
      );
      const recipient = await createEmployeeUser(
        testApp,
        'ai-bulk-conflict-recipient@example.com',
      );
      const campaignId = await createTestCampaign(testApp, sender.employeeId);
      const actionItems = testApp.app.get(ActionItemsService);

      await actionItems.createCampaignActionItems({
        campaignId,
        authorId: sender.employeeId,
        title: 'One-shot campaign',
        dueDate: '2026-09-20',
        assigneeIds: [recipient.employeeId],
      });

      await expect(
        actionItems.createCampaignActionItems({
          campaignId,
          authorId: sender.employeeId,
          title: 'Retry campaign',
          dueDate: '2026-09-21',
          assigneeIds: [recipient.employeeId],
        }),
      ).rejects.toMatchObject({
        response: { message: 'campaign already has action items' },
      });
    });

    it('lets assignees complete campaign-sourced items from bulk activation', async () => {
      const sender = await createEmployeeUser(
        testApp,
        'ai-bulk-complete-sender@example.com',
      );
      const recipient = await createEmployeeUser(
        testApp,
        'ai-bulk-complete-recipient@example.com',
      );
      await testApp.prisma.employee.update({
        where: { id: recipient.employeeId },
        data: { managerId: sender.employeeId },
      });

      const campaignId = await createTestCampaign(testApp, sender.employeeId);
      const actionItems = testApp.app.get(ActionItemsService);
      const [item] = await actionItems.createCampaignActionItems({
        campaignId,
        authorId: sender.employeeId,
        title: 'Complete me',
        dueDate: '2026-09-20',
        assigneeIds: [recipient.employeeId],
      });

      const recipientAgent = await loginAs(testApp, recipient.email);
      const completeRes = await recipientAgent
        .post(
          `/api/v1/employees/${recipient.employeeId}/action-items/${item.id}/complete`,
        )
        .expect(200);

      expect(completeRes.body).toMatchObject({
        id: item.id,
        status: 'completed',
        source: 'campaign',
        completedAt: DEFAULT_TEST_INSTANT,
      });
    });

    it('rejects inactive author with 400', async () => {
      const sender = await createEmployeeUser(
        testApp,
        'ai-bulk-inactive-author@example.com',
      );
      const recipient = await createEmployeeUser(
        testApp,
        'ai-bulk-inactive-recipient@example.com',
      );
      await testApp.prisma.employee.update({
        where: { id: sender.employeeId },
        data: { employmentStatus: 'dismissed' },
      });

      const actionItems = testApp.app.get(ActionItemsService);
      await expect(
        actionItems.createCampaignActionItems({
          campaignId: randomUUID(),
          authorId: sender.employeeId,
          title: 'Should fail',
          dueDate: '2026-09-20',
          assigneeIds: [recipient.employeeId],
        }),
      ).rejects.toMatchObject({
        response: { message: 'authorId must be an active employee' },
      });
    });

    it('returns invalidAssigneeIds for inactive recipients', async () => {
      const sender = await createEmployeeUser(
        testApp,
        'ai-bulk-invalid-assignee-sender@example.com',
      );
      const activeRecipient = await createEmployeeUser(
        testApp,
        'ai-bulk-invalid-assignee-active@example.com',
      );
      const dismissedRecipient = await createEmployeeUser(
        testApp,
        'ai-bulk-invalid-assignee-dismissed@example.com',
      );
      await testApp.prisma.employee.update({
        where: { id: dismissedRecipient.employeeId },
        data: { employmentStatus: 'dismissed' },
      });

      const actionItems = testApp.app.get(ActionItemsService);
      await expect(
        actionItems.createCampaignActionItems({
          campaignId: randomUUID(),
          authorId: sender.employeeId,
          title: 'Should fail',
          dueDate: '2026-09-20',
          assigneeIds: [
            activeRecipient.employeeId,
            dismissedRecipient.employeeId,
          ],
        }),
      ).rejects.toMatchObject({
        response: {
          message: 'assigneeIds must reference active employees',
          invalidAssigneeIds: [dismissedRecipient.employeeId],
        },
      });

      const persisted = await testApp.prisma.actionItem.count({
        where: { authorId: sender.employeeId },
      });
      expect(persisted).toBe(0);
    });

    it('rejects empty audience when campaign rows already exist', async () => {
      const sender = await createEmployeeUser(
        testApp,
        'ai-bulk-empty-conflict-sender@example.com',
      );
      const recipient = await createEmployeeUser(
        testApp,
        'ai-bulk-empty-conflict-recipient@example.com',
      );
      const campaignId = await createTestCampaign(testApp, sender.employeeId);
      const actionItems = testApp.app.get(ActionItemsService);

      await actionItems.createCampaignActionItems({
        campaignId,
        authorId: sender.employeeId,
        title: 'First wave',
        dueDate: '2026-09-20',
        assigneeIds: [recipient.employeeId],
      });

      await expect(
        actionItems.createCampaignActionItems({
          campaignId,
          authorId: sender.employeeId,
          title: 'Empty retry',
          dueDate: '2026-09-21',
          assigneeIds: [],
        }),
      ).rejects.toMatchObject({
        response: { message: 'campaign already has action items' },
      });
    });

    it('rejects re-activation after all items are completed', async () => {
      const sender = await createEmployeeUser(
        testApp,
        'ai-bulk-completed-conflict-sender@example.com',
      );
      const recipient = await createEmployeeUser(
        testApp,
        'ai-bulk-completed-conflict-recipient@example.com',
      );
      await testApp.prisma.employee.update({
        where: { id: recipient.employeeId },
        data: { managerId: sender.employeeId },
      });

      const campaignId = await createTestCampaign(testApp, sender.employeeId);
      const actionItems = testApp.app.get(ActionItemsService);
      const [item] = await actionItems.createCampaignActionItems({
        campaignId,
        authorId: sender.employeeId,
        title: 'Finishable campaign',
        dueDate: '2026-09-20',
        assigneeIds: [recipient.employeeId],
      });

      const recipientAgent = await loginAs(testApp, recipient.email);
      await recipientAgent
        .post(
          `/api/v1/employees/${recipient.employeeId}/action-items/${item.id}/complete`,
        )
        .expect(200);

      await expect(
        actionItems.createCampaignActionItems({
          campaignId,
          authorId: sender.employeeId,
          title: 'Retry after completion',
          dueDate: '2026-09-21',
          assigneeIds: [recipient.employeeId],
        }),
      ).rejects.toMatchObject({
        response: { message: 'campaign already has action items' },
      });
    });

    it('rolls back campaign rows when the caller transaction aborts', async () => {
      const sender = await createEmployeeUser(
        testApp,
        'ai-bulk-tx-rollback-sender@example.com',
      );
      const recipient = await createEmployeeUser(
        testApp,
        'ai-bulk-tx-rollback-recipient@example.com',
      );
      const campaignId = await createTestCampaign(testApp, sender.employeeId);
      const actionItems = testApp.app.get(ActionItemsService);

      await expect(
        testApp.prisma.$transaction(async (tx) => {
          await actionItems.createCampaignActionItems(
            {
              campaignId,
              authorId: sender.employeeId,
              title: 'Transactional campaign',
              dueDate: '2026-09-20',
              assigneeIds: [recipient.employeeId],
            },
            tx,
          );
          throw new Error('abort activation');
        }),
      ).rejects.toThrow('abort activation');

      const persisted = await testApp.prisma.actionItem.count({
        where: { campaignId },
      });
      expect(persisted).toBe(0);
    });
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
