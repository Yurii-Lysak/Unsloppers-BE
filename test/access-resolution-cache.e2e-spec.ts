import { hash } from 'bcryptjs';
import request from 'supertest';
import { createTestApp, TestApp } from './support/app-harness';

const PASSWORD = 'test-only-access-cache-password';
const DM_EMAIL = 'access-cache-dm@example.com';
const REPORT_EMAIL = 'access-cache-report@example.com';

describe('Access resolution cache (e2e)', () => {
  let testApp: TestApp;
  let dmAgent: ReturnType<typeof request.agent>;
  let reportEmployeeId: string;
  let dmEmployeeId: string;
  let assignmentId: string;

  const originalCacheEnabled = process.env.ACCESS_RESOLUTION_CACHE_ENABLED;

  beforeAll(async () => {
    process.env.ACCESS_RESOLUTION_CACHE_ENABLED = 'true';
    testApp = await createTestApp();
    const seeded = await seedGraph(testApp);
    reportEmployeeId = seeded.reportEmployeeId;
    dmEmployeeId = seeded.dmEmployeeId;
    dmAgent = await loginAgent(testApp, DM_EMAIL);

    const assignmentRow = await testApp.prisma.projectAssignment.create({
      data: {
        employeeId: reportEmployeeId,
        projectId: 'proj-cache-1',
        pmId: dmEmployeeId,
        dmId: dmEmployeeId,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        confirmed: true,
        confirmedAt: new Date(),
      },
    });
    assignmentId = assignmentRow.id;
  });

  afterAll(async () => {
    if (originalCacheEnabled === undefined) {
      delete process.env.ACCESS_RESOLUTION_CACHE_ENABLED;
    } else {
      process.env.ACCESS_RESOLUTION_CACHE_ENABLED = originalCacheEnabled;
    }
    await testApp.close();
  });

  it('denies ProjectLine on the next profile request after assignment end with a warm cache', async () => {
    const warm = await dmAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);
    expect((warm.body as { audience: { role: string } }).audience.role).toBe(
      'ProjectLine',
    );

    await dmAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    await testApp.prisma.projectAssignment.update({
      where: { id: assignmentId },
      data: { endDate: new Date('2020-01-01T00:00:00.000Z') },
    });

    const afterEnd = await dmAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    expect(
      (afterEnd.body as { audience: { role: string } }).audience.role,
    ).toBe('Colleague');
  });
});

async function loginAgent(testApp: TestApp, email: string) {
  const agent = request.agent(testApp.server);
  await agent
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return agent;
}

async function seedGraph(testApp: TestApp): Promise<{
  reportEmployeeId: string;
  dmEmployeeId: string;
}> {
  const passwordHash = await hash(PASSWORD, 12);

  const dmUser = await testApp.prisma.user.create({
    data: { email: DM_EMAIL, name: 'Cache DM', passwordHash },
  });
  const reportUser = await testApp.prisma.user.create({
    data: { email: REPORT_EMAIL, name: 'Cache Report', passwordHash },
  });

  const dmEmployee = await testApp.prisma.employee.create({
    data: { userId: dmUser.id },
  });
  const reportEmployee = await testApp.prisma.employee.create({
    data: { userId: reportUser.id },
  });

  return {
    reportEmployeeId: reportEmployee.id,
    dmEmployeeId: dmEmployee.id,
  };
}
