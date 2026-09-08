import { hash } from 'bcryptjs';
import request from 'supertest';
import { createTestApp, TestApp } from './support/app-harness';
import { DEFAULT_TEST_INSTANT, FixedClock } from './support/fixed-clock';

const PASSWORD = 'test-only-risk-dashboard-password';

interface EmployeeUser {
  readonly userId: string;
  readonly employeeId: string;
  readonly email: string;
}

interface RiskDashboardResponse {
  counts: {
    need_attention: number;
    medium: number;
    high: number;
    leaver: number;
    totalActive: number;
  };
  rows: Array<{
    employeeId: string;
    displayName: string;
    currentLevel: string;
    trend?: string;
    recordedAt: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
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

describe('Risk dashboard (e2e)', () => {
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

  it('returns scoped counts and rows for a PP', async () => {
    const pp = await createEmployeeUser(testApp, 'dash-pp@example.com', 'PP');
    const highSubject = await createEmployeeUser(
      testApp,
      'dash-high@example.com',
      'High Subject',
    );
    const lowSubject = await createEmployeeUser(
      testApp,
      'dash-low@example.com',
      'Low Subject',
    );
    const noHistorySubject = await createEmployeeUser(
      testApp,
      'dash-none@example.com',
      'No History',
    );

    await testApp.prisma.employee.update({
      where: { id: highSubject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: lowSubject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: noHistorySubject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    await testApp.prisma.riskRecord.createMany({
      data: [
        {
          subjectEmployeeId: highSubject.employeeId,
          authorEmployeeId: pp.employeeId,
          level: 'high',
          description: 'Retention risk',
          details: 'Workload spike',
          recordedAt: new Date('2026-01-04T00:00:00.000Z'),
        },
        {
          subjectEmployeeId: lowSubject.employeeId,
          authorEmployeeId: pp.employeeId,
          level: 'low',
          description: 'Stable',
          details: 'No concerns',
          recordedAt: new Date('2026-01-03T00:00:00.000Z'),
        },
      ],
    });

    const ppAgent = await loginAs(testApp, pp.email);

    const accessRes = await ppAgent
      .get('/api/v1/risks/dashboard/access')
      .expect(200);
    expect(accessRes.body).toEqual({ canAccess: true });

    const dashboardRes = await ppAgent
      .get('/api/v1/risks/dashboard')
      .expect(200);
    const body = dashboardRes.body as RiskDashboardResponse;
    expect(body.counts.high).toBe(1);
    expect(body.counts.totalActive).toBe(1);
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0]?.currentLevel).toBe('high');

    const filteredRes = await ppAgent
      .get('/api/v1/risks/dashboard?level=high')
      .expect(200);
    const filtered = filteredRes.body as RiskDashboardResponse;
    expect(filtered.counts.high).toBe(1);
    expect(filtered.rows).toHaveLength(1);
    expect(filtered.rows[0]?.employeeId).toBe(highSubject.employeeId);
  });

  it('denies colleague-only viewers', async () => {
    const colleague = await createEmployeeUser(
      testApp,
      'dash-colleague@example.com',
    );

    const colleagueAgent = await loginAs(testApp, colleague.email);

    const accessRes = await colleagueAgent
      .get('/api/v1/risks/dashboard/access')
      .expect(200);
    expect(accessRes.body).toEqual({ canAccess: false });

    await colleagueAgent.get('/api/v1/risks/dashboard').expect(403);
  });

  it('never includes the viewer own risk row', async () => {
    const pp = await createEmployeeUser(
      testApp,
      'dash-self-pp@example.com',
      'PP',
    );
    const subject = await createEmployeeUser(
      testApp,
      'dash-self-subject@example.com',
      'Subject',
    );

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: pp.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    await testApp.prisma.riskRecord.createMany({
      data: [
        {
          subjectEmployeeId: pp.employeeId,
          authorEmployeeId: pp.employeeId,
          level: 'high',
          description: 'Self risk',
          details: 'Should not appear',
          recordedAt: new Date('2026-01-04T00:00:00.000Z'),
        },
        {
          subjectEmployeeId: subject.employeeId,
          authorEmployeeId: pp.employeeId,
          level: 'medium',
          description: 'Subject risk',
          details: 'Visible',
          recordedAt: new Date('2026-01-03T00:00:00.000Z'),
        },
      ],
    });

    const ppAgent = await loginAs(testApp, pp.email);
    const dashboardRes = await ppAgent
      .get('/api/v1/risks/dashboard')
      .expect(200);
    const body = dashboardRes.body as RiskDashboardResponse;

    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]?.employeeId).toBe(subject.employeeId);
  });
});
