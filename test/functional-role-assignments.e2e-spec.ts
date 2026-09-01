import { hash } from 'bcryptjs';
import request from 'supertest';
import {
  BUILT_IN_ROLE_NAMES,
  PERMISSION_KEYS,
} from '../src/modules/contracts/permission-keys';
import { createTestApp, TestApp } from './support/app-harness';

const OPERATOR_PASSWORD = 'test-only-functional-role-assignments-password';
const HR_ADMIN_EMAIL = 'hr-admin-assign@example.com';
const OUTSIDER_EMAIL = 'outsider-assign@example.com';
const ASSIGNEE_EMAIL = 'assignee@example.com';

describe('Functional role assignments (e2e)', () => {
  let testApp: TestApp;
  let hrAdminAgent: ReturnType<typeof request.agent>;
  let outsiderAgent: ReturnType<typeof request.agent>;
  let assigneeEmployeeId: string;
  let campaignRoleId: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    const seeded = await seedAssignmentE2e(testApp);
    assigneeEmployeeId = seeded.assigneeEmployeeId;
    campaignRoleId = seeded.campaignRoleId;
    hrAdminAgent = await loginAgent(testApp, HR_ADMIN_EMAIL);
    outsiderAgent = await loginAgent(testApp, OUTSIDER_EMAIL);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('GET /permissions/me without session returns 401', () => {
    return request(testApp.server).get('/api/v1/permissions/me').expect(401);
  });

  it('GET /employees without session returns 401', () => {
    return request(testApp.server).get('/api/v1/employees').expect(401);
  });

  it('GET assignment APIs without manage_functional_roles returns 403', async () => {
    await outsiderAgent
      .get(`/api/v1/employees/${assigneeEmployeeId}/functional-roles`)
      .expect(403);
  });

  it('PUT assignment APIs without manage_functional_roles returns 403', async () => {
    await outsiderAgent
      .put(`/api/v1/employees/${assigneeEmployeeId}/functional-roles`)
      .send({ roleIds: [campaignRoleId] })
      .expect(403);
  });

  it('rejects malformed employee UUIDs with 400', async () => {
    await hrAdminAgent
      .get('/api/v1/employees/not-a-uuid/functional-roles')
      .expect(400);

    await hrAdminAgent.get('/api/v1/employees/not-a-uuid').expect(400);
  });

  it('PUT accepts duplicate roleIds and dedupes them server-side', async () => {
    await hrAdminAgent
      .put(`/api/v1/employees/${assigneeEmployeeId}/functional-roles`)
      .send({ roleIds: [campaignRoleId, campaignRoleId] })
      .expect(200);

    const listed = await hrAdminAgent
      .get(`/api/v1/employees/${assigneeEmployeeId}/functional-roles`)
      .expect(200);

    expect((listed.body as Array<{ id: string }>).map((role) => role.id)).toEqual(
      [campaignRoleId],
    );
  });

  it('GET /employees lists seeded employees for authenticated users', async () => {
    const res = await outsiderAgent.get('/api/v1/employees').expect(200);
    const body = res.body as {
      rows: Array<{ employeeId: string }>;
      total: number;
    };
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.total).toBeGreaterThan(0);
  });

  it('HR Admin assigns a campaign role and assignee permissions update immediately', async () => {
    await hrAdminAgent
      .put(`/api/v1/employees/${assigneeEmployeeId}/functional-roles`)
      .send({ roleIds: [campaignRoleId] })
      .expect(200);

    const assigneeAgent = await loginAgent(testApp, ASSIGNEE_EMAIL);
    const permissions = await assigneeAgent
      .get('/api/v1/permissions/me')
      .expect(200);

    expect(
      (permissions.body as { permissions: string[] }).permissions,
    ).toContain(PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS);

    await hrAdminAgent
      .put(`/api/v1/employees/${assigneeEmployeeId}/functional-roles`)
      .send({ roleIds: [] })
      .expect(200);

    const afterRevoke = await assigneeAgent
      .get('/api/v1/permissions/me')
      .expect(200);

    expect(
      (afterRevoke.body as { permissions: string[] }).permissions,
    ).not.toContain(PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS);
  });

  it('PUT rejects removing the last manage_functional_roles holder', async () => {
    const listed = await hrAdminAgent
      .get('/api/v1/functional-roles')
      .expect(200);
    const hrRole = (listed.body as Array<{ id: string; name: string }>).find(
      (role) => role.name === BUILT_IN_ROLE_NAMES.HR_ADMIN,
    );
    expect(hrRole).toBeDefined();

    const hrUser = await testApp.prisma.user.findUniqueOrThrow({
      where: { email: HR_ADMIN_EMAIL },
    });
    const hrEmployee = await testApp.prisma.employee.findUniqueOrThrow({
      where: { userId: hrUser.id },
    });

    await hrAdminAgent
      .put(`/api/v1/employees/${hrEmployee.id}/functional-roles`)
      .send({ roleIds: [] })
      .expect(403);
  });
});

async function seedAssignmentE2e(testApp: TestApp): Promise<{
  assigneeEmployeeId: string;
  campaignRoleId: string;
}> {
  const passwordHash = await hash(OPERATOR_PASSWORD, 12);

  for (const email of [HR_ADMIN_EMAIL, OUTSIDER_EMAIL, ASSIGNEE_EMAIL]) {
    await testApp.prisma.user.create({
      data: {
        email,
        passwordHash,
        employee: { create: {} },
      },
    });
  }

  const hrRole = await testApp.prisma.functionalRole.create({
    data: {
      name: BUILT_IN_ROLE_NAMES.HR_ADMIN,
      isBuiltIn: true,
      permissions: {
        create: [{ permissionKey: PERMISSION_KEYS.MANAGE_FUNCTIONAL_ROLES }],
      },
    },
  });

  const campaignRole = await testApp.prisma.functionalRole.create({
    data: {
      name: 'IT Campaign Sender',
      isBuiltIn: false,
      permissions: {
        create: [{ permissionKey: PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS }],
      },
    },
  });

  const hrUser = await testApp.prisma.user.findUniqueOrThrow({
    where: { email: HR_ADMIN_EMAIL },
  });
  const hrEmployee = await testApp.prisma.employee.findUniqueOrThrow({
    where: { userId: hrUser.id },
  });

  await testApp.prisma.functionalRoleAssignment.create({
    data: { employeeId: hrEmployee.id, roleId: hrRole.id },
  });

  const assigneeUser = await testApp.prisma.user.findUniqueOrThrow({
    where: { email: ASSIGNEE_EMAIL },
  });
  const assigneeEmployee = await testApp.prisma.employee.findUniqueOrThrow({
    where: { userId: assigneeUser.id },
  });

  return {
    assigneeEmployeeId: assigneeEmployee.id,
    campaignRoleId: campaignRole.id,
  };
}

async function loginAgent(testApp: TestApp, email: string) {
  const agent = request.agent(testApp.server);
  await agent
    .post('/api/v1/auth/login')
    .send({ email, password: OPERATOR_PASSWORD })
    .expect(200);
  return agent;
}
