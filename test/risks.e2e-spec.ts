import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { RisksSectionProvider } from '../src/modules/risks/risks-section.provider';
import { PERMISSION_KEYS } from '../src/modules/contracts/permission-keys';
import { createTestApp, TestApp } from './support/app-harness';
import { DEFAULT_TEST_INSTANT, FixedClock } from './support/fixed-clock';

const PASSWORD = 'test-only-risks-password';

interface EmployeeUser {
  readonly userId: string;
  readonly employeeId: string;
  readonly email: string;
}

interface RiskRecordReadDto {
  id: string;
  level: string;
  description: string;
  details: string;
  recordedAt: string;
  author: { id: string; displayName: string };
  createdAt: string;
}

interface RisksSectionResponse {
  records: RiskRecordReadDto[];
  currentLevel?: string;
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

async function grantCreateEditRisksPermission(
  testApp: TestApp,
  employeeId: string,
): Promise<void> {
  const role = await testApp.prisma.functionalRole.create({
    data: {
      name: `Risk Editor ${employeeId}`,
      permissions: {
        create: [{ permissionKey: PERMISSION_KEYS.CREATE_EDIT_RISKS }],
      },
    },
  });
  await testApp.prisma.functionalRoleAssignment.create({
    data: { employeeId, roleId: role.id },
  });
}

describe('Risks (e2e)', () => {
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

  it('lets a manager append risk history for a direct report', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'risk-manager@example.com',
      'Unit Manager',
    );
    const report = await createEmployeeUser(
      testApp,
      'risk-report@example.com',
      'Direct Report',
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    const createRes = await managerAgent
      .post(`/api/v1/employees/${report.employeeId}/risks`)
      .send({
        level: 'high',
        description: 'Retention risk',
        details: 'Discussed compensation concerns',
        recordedAt: '2026-01-04',
      })
      .expect(201);
    const created = createRes.body as RiskRecordReadDto;
    expect(created.level).toBe('high');
    expect(created.description).toBe('Retention risk');

    const listRes = await managerAgent
      .get(`/api/v1/employees/${report.employeeId}/risks`)
      .expect(200);
    const listBody = listRes.body as RisksSectionResponse;
    expect(listBody.currentLevel).toBe('high');
    expect(listBody.records).toHaveLength(1);
    expect(listBody.records[0].id).toBe(created.id);

    const profileRes = await managerAgent
      .get(`/api/v1/employees/${report.employeeId}/profile`)
      .expect(200);
    const s6 = (
      profileRes.body as {
        sections: {
          S6?: {
            status?: string;
            accessLevel?: string;
            data?: RisksSectionResponse;
          };
        };
      }
    ).sections.S6;
    expect(s6?.accessLevel).toBe('RW');
    expect(s6?.data?.currentLevel).toBe('high');
    expect(s6?.data?.records).toHaveLength(1);
  });

  it('lets a PP create a risk for a partner employee', async () => {
    const subject = await createEmployeeUser(testApp, 'risk-pp-subject@example.com');
    const pp = await createEmployeeUser(testApp, 'risk-pp@example.com', 'PP');
    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    const ppAgent = await loginAs(testApp, pp.email);
    await ppAgent
      .post(`/api/v1/employees/${subject.employeeId}/risks`)
      .send({
        level: 'medium',
        description: 'Engagement dip',
        details: 'Missed two 1:1s',
        recordedAt: '2025-12-20',
      })
      .expect(201);

    const listRes = await ppAgent
      .get(`/api/v1/employees/${subject.employeeId}/risks`)
      .expect(200);
    const listBody = listRes.body as RisksSectionResponse;
    expect(listBody.currentLevel).toBe('medium');
    expect(listBody.records).toHaveLength(1);

    const profileRes = await ppAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);
    const s6 = (
      profileRes.body as {
        sections: {
          S6?: { data?: RisksSectionResponse };
        };
      }
    ).sections.S6;
    expect(s6?.data?.currentLevel).toBe('medium');
  });

  it('denies colleague access even with create_edit_risks permission', async () => {
    const subject = await createEmployeeUser(testApp, 'risk-colleague-subject@example.com');
    const colleague = await createEmployeeUser(testApp, 'risk-colleague@example.com');
    await grantCreateEditRisksPermission(testApp, colleague.employeeId);

    const colleagueAgent = await loginAs(testApp, colleague.email);
    await colleagueAgent
      .get(`/api/v1/employees/${subject.employeeId}/risks`)
      .expect(403);
    await colleagueAgent
      .post(`/api/v1/employees/${subject.employeeId}/risks`)
      .send({
        level: 'low',
        description: 'Blocked',
        details: 'Should not persist',
        recordedAt: '2026-01-04',
      })
      .expect(403);

    const profileRes = await colleagueAgent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);
    expect(
      (profileRes.body as { sections: Record<string, unknown> }).sections.S6,
    ).toBeUndefined();
  });

  it('omits S6 from self profile and denies self POST', async () => {
    const selfUser = await createEmployeeUser(testApp, 'risk-self@example.com');
    const selfAgent = await loginAs(testApp, selfUser.email);

    await selfAgent
      .post(`/api/v1/employees/${selfUser.employeeId}/risks`)
      .send({
        level: 'high',
        description: 'Self attempt',
        details: 'Must be blocked',
        recordedAt: '2026-01-04',
      })
      .expect(403);

    const profileRes = await selfAgent
      .get(`/api/v1/employees/${selfUser.employeeId}/profile`)
      .expect(200);
    expect(
      (profileRes.body as { sections: Record<string, unknown> }).sections.S6,
    ).toBeUndefined();
  });

  it('rejects whitespace description and future recordedAt with 400', async () => {
    const manager = await createEmployeeUser(testApp, 'risk-validate-mgr@example.com');
    const report = await createEmployeeUser(testApp, 'risk-validate-report@example.com');
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    await managerAgent
      .post(`/api/v1/employees/${report.employeeId}/risks`)
      .send({
        level: 'low',
        description: '   ',
        details: 'Valid details',
        recordedAt: '2026-01-04',
      })
      .expect(400);
    await managerAgent
      .post(`/api/v1/employees/${report.employeeId}/risks`)
      .send({
        level: 'low',
        description: 'Valid description',
        details: 'Valid details',
        recordedAt: '2026-09-10',
      })
      .expect(400);
  });

  it('returns 400 for malformed employeeId and 404 for unknown subject', async () => {
    const manager = await createEmployeeUser(testApp, 'risk-gate-mgr@example.com');
    const managerAgent = await loginAs(testApp, manager.email);

    await managerAgent.get('/api/v1/employees/not-a-uuid/risks').expect(400);
    await managerAgent
      .post('/api/v1/employees/not-a-uuid/risks')
      .send({
        level: 'low',
        description: 'Test',
        details: 'Test',
        recordedAt: '2026-01-04',
      })
      .expect(400);

    const missingId = randomUUID();
    await managerAgent
      .get(`/api/v1/employees/${missingId}/risks`)
      .expect(404);
    await managerAgent
      .post(`/api/v1/employees/${missingId}/risks`)
      .send({
        level: 'low',
        description: 'Test',
        details: 'Test',
        recordedAt: '2026-01-04',
      })
      .expect(404);
  });

  it('maps provider failure to 503 on parallel GET', async () => {
    const manager = await createEmployeeUser(testApp, 'risk-503-mgr@example.com');
    const report = await createEmployeeUser(testApp, 'risk-503-report@example.com');
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });

    const provider = testApp.app.get(RisksSectionProvider);
    jest.spyOn(provider, 'getSection').mockRejectedValue(new Error('db down'));

    const managerAgent = await loginAs(testApp, manager.email);
    await managerAgent
      .get(`/api/v1/employees/${report.employeeId}/risks`)
      .expect(503);

    const profileRes = await managerAgent
      .get(`/api/v1/employees/${report.employeeId}/profile`)
      .expect(200);
    expect(
      (
        profileRes.body as {
          sections: { S6?: { accessLevel?: string; status?: string } };
        }
      ).sections.S6,
    ).toEqual({ accessLevel: 'RW', status: 'unavailable' });
  });
});
