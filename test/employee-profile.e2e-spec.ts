import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  BUILT_IN_ROLE_NAMES,
  PERMISSION_KEYS,
} from '../src/modules/contracts/permission-keys';
import { LeavesSyncService } from '../src/modules/integrations/leaves-sync.service';
import { createTestApp, TestApp } from './support/app-harness';

const PASSWORD = 'test-only-employee-profile-password';
const MANAGER_EMAIL = 'profile-manager@example.com';
const REPORT_EMAIL = 'profile-report@example.com';
const COLLEAGUE_EMAIL = 'profile-colleague@example.com';
const HR_ADMIN_EMAIL = 'profile-hr-admin@example.com';
const NO_EMPLOYEE_EMAIL = 'profile-no-employee@example.com';

describe('Employee profile assembly (e2e)', () => {
  let testApp: TestApp;
  let managerAgent: ReturnType<typeof request.agent>;
  let colleagueAgent: ReturnType<typeof request.agent>;
  let reportEmployeeId: string;

  beforeAll(async () => {
    testApp = await createTestApp({
      providerOverrides: [
        {
          provide: LeavesSyncService,
          useValue: {
            getLeavesForEmployee: jest.fn().mockResolvedValue({
              availability: 'ok',
              leaves: [
                {
                  type: 'vacation',
                  startDate: '2026-08-25',
                  endDate: '2026-08-29',
                  approvalState: 'approved',
                },
              ],
            }),
            getManageLeaveUrl: jest.fn().mockReturnValue(null),
          },
        },
      ],
    });
    const seeded = await seedProfileGraph(testApp);
    reportEmployeeId = seeded.reportEmployeeId;
    managerAgent = await loginAgent(testApp, MANAGER_EMAIL);
    colleagueAgent = await loginAgent(testApp, COLLEAGUE_EMAIL);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('GET /employees/:id/profile without session returns 401', () => {
    return request(testApp.server)
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(401);
  });

  it('returns 403 when the authenticated user has no employee record', async () => {
    const agent = await loginAgent(testApp, NO_EMPLOYEE_EMAIL);
    await agent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(403);
  });

  it('returns 400 for malformed employee UUIDs', async () => {
    await colleagueAgent
      .get('/api/v1/employees/not-a-uuid/profile')
      .expect(400);
  });

  it('returns 404 for unknown employee UUIDs', async () => {
    await colleagueAgent
      .get(`/api/v1/employees/${randomUUID()}/profile`)
      .expect(404);
  });

  it('returns Colleague-trimmed section keys for unrelated viewers', async () => {
    const res = await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const body = res.body as {
      displayName: string;
      audience: { role: string; sections: Record<string, string> };
      sections: Record<string, unknown>;
    };

    expect(body.displayName).toBeTruthy();
    expect(body.audience.role).toBe('Colleague');
    expect(Object.keys(body.sections).sort()).toEqual(['S1', 'S10', 'S11']);
  });

  it('masks S10 leave type for Colleague viewers on the profile endpoint', async () => {
    const res = await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const s10 = (
      res.body as {
        sections: {
          S10?: {
            data?: {
              leaves?: Array<{
                type: string | null;
                approvalState: string | null;
              }>;
              availability?: string;
            };
          };
        };
      }
    ).sections.S10;

    expect(s10).toBeDefined();
    expect(s10).toHaveProperty('data');
    expect(s10?.data).not.toHaveProperty('availability');
    expect(s10?.data?.leaves?.[0]?.type).toBeNull();
    expect(s10?.data?.leaves?.[0]?.approvalState).toBeNull();
  });

  it('returns ReportingLine-granted sections for a direct manager', async () => {
    const res = await managerAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const body = res.body as {
      audience: { role: string };
      sections: Record<string, { accessLevel?: string; status?: string }>;
    };

    expect(body.audience.role).toBe('ReportingLine');
    expect(body.sections.S1).toBeDefined();
    expect(body.sections.S6?.status).toBe('unavailable');
  });

  it('keeps assembled profile sections unchanged after a C8 role assignment', async () => {
    const before = await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const campaignRole = await testApp.prisma.functionalRole.create({
      data: {
        name: 'Profile Campaign Sender',
        isBuiltIn: false,
        permissions: {
          create: [{ permissionKey: PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS }],
        },
      },
    });

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
    await testApp.prisma.functionalRoleAssignment.create({
      data: { employeeId: hrEmployee.id, roleId: hrRole.id },
    });

    const colleagueUser = await testApp.prisma.user.findUniqueOrThrow({
      where: { email: COLLEAGUE_EMAIL },
    });
    const colleagueEmployee = await testApp.prisma.employee.findUniqueOrThrow({
      where: { userId: colleagueUser.id },
    });

    const hrAgent = await loginAgent(testApp, HR_ADMIN_EMAIL);
    await hrAgent
      .put(`/api/v1/employees/${colleagueEmployee.id}/functional-roles`)
      .send({ roleIds: [campaignRole.id] })
      .expect(200);

    const permissions = await colleagueAgent
      .get('/api/v1/permissions/me')
      .expect(200);
    expect(
      (permissions.body as { permissions: string[] }).permissions,
    ).toContain(PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS);

    const after = await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    expect(after.body).toEqual(before.body);
  });
});

const loginAgent = async (testApp: TestApp, email: string) => {
  const agent = request.agent(testApp.server);
  await agent
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return agent;
};

const seedProfileGraph = async (testApp: TestApp) => {
  const passwordHash = await hash(PASSWORD, 12);

  const managerUser = await testApp.prisma.user.create({
    data: { email: MANAGER_EMAIL, passwordHash },
  });
  const reportUser = await testApp.prisma.user.create({
    data: { email: REPORT_EMAIL, passwordHash },
  });
  const colleagueUser = await testApp.prisma.user.create({
    data: { email: COLLEAGUE_EMAIL, passwordHash },
  });
  await testApp.prisma.user.create({
    data: { email: NO_EMPLOYEE_EMAIL, passwordHash },
  });
  await testApp.prisma.user.create({
    data: {
      email: HR_ADMIN_EMAIL,
      passwordHash,
      employee: { create: {} },
    },
  });

  const managerEmployee = await testApp.prisma.employee.create({
    data: { userId: managerUser.id },
  });
  const reportEmployee = await testApp.prisma.employee.create({
    data: { userId: reportUser.id, managerId: managerEmployee.id },
  });
  await testApp.prisma.employee.create({
    data: { userId: colleagueUser.id },
  });

  return { reportEmployeeId: reportEmployee.id };
};
