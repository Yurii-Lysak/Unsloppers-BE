import { hash } from 'bcryptjs';
import request from 'supertest';
import {
  BUILT_IN_ROLE_NAMES,
  PERMISSION_KEYS,
} from '../src/modules/contracts/permission-keys';
import { FunctionalRoleAssignmentService } from '../src/modules/access/functional-role-assignment.service';
import { PermissionChecker } from '../src/modules/contracts/permission-checker.contract';
import { createTestApp, TestApp } from './support/app-harness';

const OPERATOR_PASSWORD = 'test-only-functional-roles-password';
const HR_ADMIN_EMAIL = 'hr-admin@example.com';
const OUTSIDER_EMAIL = 'outsider@example.com';

describe('Functional roles (e2e)', () => {
  let testApp: TestApp;
  let hrAdminAgent: ReturnType<typeof request.agent>;
  let outsiderAgent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    testApp = await createTestApp();
    await seedRolesForE2e(testApp);
    hrAdminAgent = await loginAgent(testApp, HR_ADMIN_EMAIL);
    outsiderAgent = await loginAgent(testApp, OUTSIDER_EMAIL);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('GET /api/v1/functional-roles without session returns 401', () => {
    return request(testApp.server).get('/api/v1/functional-roles').expect(401);
  });

  it('GET /api/v1/permissions/catalog without session returns 401', () => {
    return request(testApp.server)
      .get('/api/v1/permissions/catalog')
      .expect(401);
  });

  it('GET /api/v1/functional-roles without manage_functional_roles returns 403', () => {
    return outsiderAgent.get('/api/v1/functional-roles').expect(403);
  });

  it('GET /api/v1/permissions/catalog without manage_functional_roles returns 403', () => {
    return outsiderAgent.get('/api/v1/permissions/catalog').expect(403);
  });

  it('GET /api/v1/functional-roles lists built-in roles for HR Admin', async () => {
    const res = await hrAdminAgent.get('/api/v1/functional-roles').expect(200);
    const names = (res.body as Array<{ name: string }>).map(
      (role) => role.name,
    );
    expect(names).toContain(BUILT_IN_ROLE_NAMES.HR_ADMIN);
  });

  it('POST/PATCH functional role CRUD works for HR Admin', async () => {
    const created = await hrAdminAgent
      .post('/api/v1/functional-roles')
      .send({
        name: 'Security Champion',
        permissionKeys: [PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS],
      })
      .expect(201);

    const roleId = (created.body as { id: string }).id;

    await hrAdminAgent
      .patch(`/api/v1/functional-roles/${roleId}`)
      .send({ permissionKeys: [] })
      .expect(200);

    const listed = await hrAdminAgent
      .get('/api/v1/functional-roles')
      .expect(200);
    const match = (
      listed.body as Array<{ id: string; permissionKeys: string[] }>
    ).find((role) => role.id === roleId);
    expect(match?.permissionKeys).toEqual([]);
  });

  it('PATCH built-in HR Admin cannot drop manage_functional_roles', async () => {
    const listed = await hrAdminAgent
      .get('/api/v1/functional-roles')
      .expect(200);
    const hrRole = (listed.body as Array<{ id: string; name: string }>).find(
      (role) => role.name === BUILT_IN_ROLE_NAMES.HR_ADMIN,
    );
    expect(hrRole).toBeDefined();

    await hrAdminAgent
      .patch(`/api/v1/functional-roles/${hrRole!.id}`)
      .send({ permissionKeys: [PERMISSION_KEYS.MANAGE_CUSTOM_FIELDS] })
      .expect(400);
  });

  it('permission revocation is visible through C8 on next check', async () => {
    const created = await hrAdminAgent
      .post('/api/v1/functional-roles')
      .send({
        name: 'Campaign Sender',
        permissionKeys: [PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS],
      })
      .expect(201);
    const roleId = (created.body as { id: string }).id;

    const outsiderUser = await testApp.prisma.user.findUniqueOrThrow({
      where: { email: OUTSIDER_EMAIL },
    });
    const outsiderEmployee = await testApp.prisma.employee.findUniqueOrThrow({
      where: { userId: outsiderUser.id },
    });

    const assignmentService = new FunctionalRoleAssignmentService(
      testApp.prisma,
    );
    await assignmentService.assign(outsiderEmployee.id, roleId);

    const checker = testApp.app.get(PermissionChecker);

    await expect(
      checker.hasPermission(
        outsiderUser.id,
        PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS,
      ),
    ).resolves.toBe(true);

    await hrAdminAgent
      .patch(`/api/v1/functional-roles/${roleId}`)
      .send({ permissionKeys: [] })
      .expect(200);

    await expect(
      checker.hasPermission(
        outsiderUser.id,
        PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS,
      ),
    ).resolves.toBe(false);
  });
});

async function seedRolesForE2e(testApp: TestApp): Promise<void> {
  const passwordHash = await hash(OPERATOR_PASSWORD, 12);

  for (const email of [HR_ADMIN_EMAIL, OUTSIDER_EMAIL]) {
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

  const hrUser = await testApp.prisma.user.findUniqueOrThrow({
    where: { email: HR_ADMIN_EMAIL },
  });
  const hrEmployee = await testApp.prisma.employee.findUniqueOrThrow({
    where: { userId: hrUser.id },
  });

  const assignmentService = new FunctionalRoleAssignmentService(testApp.prisma);
  await assignmentService.assign(hrEmployee.id, hrRole.id);
}

async function loginAgent(testApp: TestApp, email: string) {
  const agent = request.agent(testApp.server);
  await agent
    .post('/api/v1/auth/login')
    .send({ email, password: OPERATOR_PASSWORD })
    .expect(200);
  return agent;
}
