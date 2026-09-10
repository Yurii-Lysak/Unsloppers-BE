import { hash } from 'bcryptjs';
import request from 'supertest';
import { createTestApp, TestApp } from './support/app-harness';
import { DEFAULT_TEST_INSTANT, FixedClock } from './support/fixed-clock';
import {
  BUILT_IN_ROLE_NAMES,
  PERMISSION_KEYS,
} from '../src/modules/contracts/permission-keys';

const PASSWORD = 'test-only-dashboard-password';

interface EmployeeUser {
  readonly userId: string;
  readonly employeeId: string;
  readonly email: string;
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

async function assignBuiltInRole(
  testApp: TestApp,
  employeeId: string,
  roleName: string,
): Promise<void> {
  const role = await testApp.prisma.functionalRole.findFirstOrThrow({
    where: { name: roleName },
    select: { id: true },
  });
  await testApp.prisma.functionalRoleAssignment.upsert({
    where: {
      employeeId_roleId: { employeeId, roleId: role.id },
    },
    create: { employeeId, roleId: role.id },
    update: {},
  });
}

async function seedBuiltInRoles(testApp: TestApp): Promise<void> {
  for (const roleName of Object.values(BUILT_IN_ROLE_NAMES)) {
    const existing = await testApp.prisma.functionalRole.findFirst({
      where: { name: roleName },
    });
    if (existing) {
      continue;
    }
    await testApp.prisma.functionalRole.create({
      data: {
        name: roleName,
        isBuiltIn: true,
        permissions: {
          create: [{ permissionKey: PERMISSION_KEYS.VIEW_DASHBOARD }],
        },
      },
    });
  }
}

interface DashboardConfigResponse {
  variant: string;
  counters: Array<{ id: string }>;
  quickNav: Array<{ labelKey: string; path: string }>;
  blocks?: string[];
  selectorProjects?: Array<{ projectId: string; projectName: string }>;
}

interface DashboardSummaryResponse {
  grouping: string;
  counters: Record<string, { value?: number; status: string }>;
  rows: Array<{
    employeeId: string;
    departmentLabel?: string;
    projectLabel?: string;
  }>;
  pagination?: {
    page: number;
    pageSize: number;
    totalRows: number;
  };
  groups?: Array<{
    projectId: string;
    rows: Array<{ employeeId: string }>;
  }>;
  selectorProjects?: Array<{ projectId: string; projectName: string }>;
  resourcingRequests?: Array<{ id: string; projectId?: string | null }>;
  idpDeadlines?: Array<{ id: string; employeeId: string; deadline: string }>;
}

async function setOpenDepartment(
  testApp: TestApp,
  employeeId: string,
  value: string,
): Promise<void> {
  await testApp.prisma.departmentHistory.create({
    data: {
      employeeId,
      value,
      effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
    },
  });
}

describe('Dashboards (e2e)', () => {
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
    await seedBuiltInRoles(testApp);
  });

  it('scopes UM dashboard to reporting-line subordinates only', async () => {
    const um = await createEmployeeUser(testApp, 'dash-um@example.com', 'UM');
    const subordinate = await createEmployeeUser(
      testApp,
      'dash-sub@example.com',
      'Subordinate',
    );
    const ppOnly = await createEmployeeUser(
      testApp,
      'dash-pp-only@example.com',
      'PP Only',
    );

    await testApp.prisma.employee.update({
      where: { id: subordinate.employeeId },
      data: { managerId: um.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: ppOnly.employeeId },
      data: { peoplePartnerId: um.employeeId },
    });

    await assignBuiltInRole(
      testApp,
      um.employeeId,
      BUILT_IN_ROLE_NAMES.UNIT_MANAGER,
    );

    const agent = await loginAs(testApp, um.email);
    const configRes = await agent.get('/api/v1/dashboards/config').expect(200);
    const config = configRes.body as DashboardConfigResponse;
    expect(config.variant).toBe('um');

    const summaryRes = await agent
      .get('/api/v1/dashboards/summary')
      .expect(200);
    const summary = summaryRes.body as DashboardSummaryResponse;
    expect(summary.counters.headcount.value).toBe(1);
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].employeeId).toBe(subordinate.employeeId);
    expect(config.counters).toHaveLength(9);
    expect(config.quickNav).toHaveLength(6);
    expect(summary.pagination).toEqual({
      page: 1,
      pageSize: 50,
      totalRows: 1,
    });
  });

  it('returns empty rows when UM pagination page is beyond the last page', async () => {
    const um = await createEmployeeUser(
      testApp,
      'dash-um-page@example.com',
      'UM',
    );
    const subordinates = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        createEmployeeUser(
          testApp,
          `dash-sub-page-${index}@example.com`,
          `Sub ${index}`,
        ),
      ),
    );

    for (const subordinate of subordinates) {
      await testApp.prisma.employee.update({
        where: { id: subordinate.employeeId },
        data: { managerId: um.employeeId },
      });
    }

    await assignBuiltInRole(
      testApp,
      um.employeeId,
      BUILT_IN_ROLE_NAMES.UNIT_MANAGER,
    );

    const agent = await loginAs(testApp, um.email);
    const summaryRes = await agent
      .get('/api/v1/dashboards/summary?page=2&pageSize=2')
      .expect(200);
    const summary = summaryRes.body as DashboardSummaryResponse;

    expect(summary.counters.headcount.value).toBe(3);
    expect(summary.rows).toHaveLength(1);
    expect(summary.pagination).toEqual({
      page: 2,
      pageSize: 2,
      totalRows: 3,
    });
  });

  it('returns DM config with six counters, selector projects, and resourcing block', async () => {
    const dm = await createEmployeeUser(
      testApp,
      'dash-dm-config@example.com',
      'DM',
    );
    const member = await createEmployeeUser(
      testApp,
      'dash-dm-config-member@example.com',
      'Member',
    );

    await testApp.prisma.projectAssignment.create({
      data: {
        employeeId: member.employeeId,
        projectId: 'proj-atlas',
        pmId: member.employeeId,
        dmId: dm.employeeId,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        confirmed: true,
        confirmedAt: new Date('2026-01-05T08:00:00.000Z'),
      },
    });

    await assignBuiltInRole(
      testApp,
      dm.employeeId,
      BUILT_IN_ROLE_NAMES.DELIVERY_MANAGER,
    );

    const agent = await loginAs(testApp, dm.email);
    const configRes = await agent.get('/api/v1/dashboards/config').expect(200);
    const config = configRes.body as DashboardConfigResponse;

    expect(config.variant).toBe('dm');
    expect(config.counters.map((counter) => counter.id)).toEqual([
      'headcount',
      'need_attention',
      'medium',
      'high',
      'leaver',
      'openResourcingRequests',
    ]);
    expect(config.blocks).toContain('resourcingRequests');
    expect(config.selectorProjects).toEqual([
      { projectId: 'proj-atlas', projectName: 'proj-atlas' },
    ]);
  });

  it('returns project grouping metadata for DM viewers', async () => {
    const dm = await createEmployeeUser(testApp, 'dash-dm@example.com', 'DM');
    const member = await createEmployeeUser(
      testApp,
      'dash-member@example.com',
      'Member',
    );

    await testApp.prisma.projectAssignment.create({
      data: {
        employeeId: member.employeeId,
        projectId: 'proj-atlas',
        pmId: member.employeeId,
        dmId: dm.employeeId,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        confirmed: true,
        confirmedAt: new Date('2026-01-05T08:00:00.000Z'),
      },
    });

    await assignBuiltInRole(
      testApp,
      dm.employeeId,
      BUILT_IN_ROLE_NAMES.DELIVERY_MANAGER,
    );

    const agent = await loginAs(testApp, dm.email);
    const summaryRes = await agent
      .get('/api/v1/dashboards/summary')
      .expect(200);
    const summary = summaryRes.body as DashboardSummaryResponse;

    expect(summary.grouping).toBe('project');
    const atlasGroup = summary.groups?.find(
      (group) => group.projectId === 'proj-atlas',
    );
    expect(atlasGroup?.rows.map((row) => row.employeeId)).toContain(
      member.employeeId,
    );
    expect(summary.counters.headcount.value).toBe(1);
  });

  it('filters DM dashboard summary to a single project', async () => {
    const dm = await createEmployeeUser(
      testApp,
      'dash-dm-filter@example.com',
      'DM',
    );
    const memberA = await createEmployeeUser(
      testApp,
      'dash-member-a@example.com',
      'Member A',
    );
    const memberB = await createEmployeeUser(
      testApp,
      'dash-member-b@example.com',
      'Member B',
    );

    for (const [projectId, member] of [
      ['proj-atlas', memberA],
      ['proj-beta', memberB],
    ] as const) {
      await testApp.prisma.projectAssignment.create({
        data: {
          employeeId: member.employeeId,
          projectId,
          pmId: member.employeeId,
          dmId: dm.employeeId,
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          confirmed: true,
          confirmedAt: new Date('2026-01-05T08:00:00.000Z'),
        },
      });
    }

    await assignBuiltInRole(
      testApp,
      dm.employeeId,
      BUILT_IN_ROLE_NAMES.DELIVERY_MANAGER,
    );

    const agent = await loginAs(testApp, dm.email);
    const filteredRes = await agent
      .get('/api/v1/dashboards/summary?projectId=proj-atlas')
      .expect(200);
    const filtered = filteredRes.body as DashboardSummaryResponse;

    expect(filtered.groups).toHaveLength(1);
    expect(filtered.groups?.[0].projectId).toBe('proj-atlas');
    expect(filtered.counters.headcount.value).toBe(1);
  });

  it('deduplicates DM headcount when one person is on multiple projects', async () => {
    const dm = await createEmployeeUser(
      testApp,
      'dash-dm-dedup@example.com',
      'DM',
    );
    const member = await createEmployeeUser(
      testApp,
      'dash-dedup-member@example.com',
      'Member',
    );

    for (const projectId of ['proj-a', 'proj-b']) {
      await testApp.prisma.projectAssignment.create({
        data: {
          employeeId: member.employeeId,
          projectId,
          pmId: member.employeeId,
          dmId: dm.employeeId,
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          confirmed: true,
          confirmedAt: new Date('2026-01-05T08:00:00.000Z'),
        },
      });
    }

    await assignBuiltInRole(
      testApp,
      dm.employeeId,
      BUILT_IN_ROLE_NAMES.DELIVERY_MANAGER,
    );

    const agent = await loginAs(testApp, dm.email);
    const summaryRes = await agent
      .get('/api/v1/dashboards/summary')
      .expect(200);
    const summary = summaryRes.body as DashboardSummaryResponse;

    expect(summary.counters.headcount.value).toBe(1);
    expect(summary.groups).toHaveLength(2);
    expect(
      summary.groups?.flatMap((group) =>
        group.rows.map((row) => row.employeeId),
      ),
    ).toEqual([member.employeeId, member.employeeId]);
  });

  it('returns zero people counters for DM unassigned project filter', async () => {
    const dm = await createEmployeeUser(
      testApp,
      'dash-dm-unassigned@example.com',
      'DM',
    );
    const member = await createEmployeeUser(
      testApp,
      'dash-unassigned-member@example.com',
      'Member',
    );

    await testApp.prisma.projectAssignment.create({
      data: {
        employeeId: member.employeeId,
        projectId: 'proj-atlas',
        pmId: member.employeeId,
        dmId: dm.employeeId,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        confirmed: true,
        confirmedAt: new Date('2026-01-05T08:00:00.000Z'),
      },
    });

    await assignBuiltInRole(
      testApp,
      dm.employeeId,
      BUILT_IN_ROLE_NAMES.DELIVERY_MANAGER,
    );

    const agent = await loginAs(testApp, dm.email);
    const summaryRes = await agent
      .get('/api/v1/dashboards/summary?projectId=unassigned')
      .expect(200);
    const summary = summaryRes.body as DashboardSummaryResponse;

    expect(summary.groups).toEqual([]);
    expect(summary.counters.headcount.value).toBe(0);
    expect(summary.counters.need_attention.value).toBe(0);
  });

  it('rejects invalid DM projectId filters', async () => {
    const dm = await createEmployeeUser(
      testApp,
      'dash-dm-invalid@example.com',
      'DM',
    );
    await assignBuiltInRole(
      testApp,
      dm.employeeId,
      BUILT_IN_ROLE_NAMES.DELIVERY_MANAGER,
    );

    const agent = await loginAs(testApp, dm.email);
    await agent
      .get('/api/v1/dashboards/summary?projectId=unknown-project')
      .expect(400);
    await agent.get('/api/v1/dashboards/summary?projectId=%20%20').expect(400);
  });

  it('returns PM config with the DM six-counter catalog and resourcing block', async () => {
    const pm = await createEmployeeUser(
      testApp,
      'dash-pm-config@example.com',
      'PM',
    );

    await assignBuiltInRole(
      testApp,
      pm.employeeId,
      BUILT_IN_ROLE_NAMES.PROJECT_MANAGER,
    );

    const agent = await loginAs(testApp, pm.email);
    const configRes = await agent.get('/api/v1/dashboards/config').expect(200);
    const config = configRes.body as DashboardConfigResponse;

    expect(config.variant).toBe('pm');
    expect(config.counters.map((counter) => counter.id)).toEqual([
      'headcount',
      'need_attention',
      'medium',
      'high',
      'leaver',
      'openResourcingRequests',
    ]);
    expect(config.blocks).toContain('resourcingRequests');
    expect(config.selectorProjects).toBeUndefined();
  });

  it('scopes PM dashboard to PM-managed projects only, excluding mere team membership', async () => {
    const pm = await createEmployeeUser(testApp, 'dash-pm@example.com', 'PM');
    const memberA = await createEmployeeUser(
      testApp,
      'dash-pm-member-a@example.com',
      'Member A',
    );
    const memberB = await createEmployeeUser(
      testApp,
      'dash-pm-member-b@example.com',
      'Member B',
    );
    const teamMemberOnly = await createEmployeeUser(
      testApp,
      'dash-pm-team-only@example.com',
      'Team Member Only',
    );

    for (const [projectId, member] of [
      ['proj-pm-a', memberA],
      ['proj-pm-b', memberB],
    ] as const) {
      await testApp.prisma.projectAssignment.create({
        data: {
          employeeId: member.employeeId,
          projectId,
          pmId: pm.employeeId,
          dmId: pm.employeeId,
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          confirmed: true,
          confirmedAt: new Date('2026-01-05T08:00:00.000Z'),
        },
      });
    }
    // Team member on a third project where the viewer is NOT the pmId —
    // must never appear on the PM's dashboard, even though the viewer is
    // dmId there (mere employeeId/dmId membership is not PM scope).
    await testApp.prisma.projectAssignment.create({
      data: {
        employeeId: teamMemberOnly.employeeId,
        projectId: 'proj-pm-c',
        pmId: memberA.employeeId,
        dmId: pm.employeeId,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        confirmed: true,
        confirmedAt: new Date('2026-01-05T08:00:00.000Z'),
      },
    });

    await assignBuiltInRole(
      testApp,
      pm.employeeId,
      BUILT_IN_ROLE_NAMES.PROJECT_MANAGER,
    );

    const agent = await loginAs(testApp, pm.email);
    const summaryRes = await agent
      .get('/api/v1/dashboards/summary')
      .expect(200);
    const summary = summaryRes.body as DashboardSummaryResponse;

    expect(summary.grouping).toBe('project');
    const projectIds = summary.groups?.map((group) => group.projectId).sort();
    expect(projectIds).toEqual(['proj-pm-a', 'proj-pm-b']);
    expect(summary.counters.headcount.value).toBe(2);
  });

  it('shows only PM-authored resourcing requests, excluding a DM request on a shared project', async () => {
    const pm = await createEmployeeUser(
      testApp,
      'dash-pm-resourcing@example.com',
      'PM',
    );
    const dm = await createEmployeeUser(
      testApp,
      'dash-pm-resourcing-dm@example.com',
      'DM',
    );
    const member = await createEmployeeUser(
      testApp,
      'dash-pm-resourcing-member@example.com',
      'Member',
    );

    await testApp.prisma.projectAssignment.create({
      data: {
        employeeId: member.employeeId,
        projectId: 'proj-pm-resourcing',
        pmId: pm.employeeId,
        dmId: dm.employeeId,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        confirmed: true,
        confirmedAt: new Date('2026-01-05T08:00:00.000Z'),
      },
    });

    await assignBuiltInRole(
      testApp,
      pm.employeeId,
      BUILT_IN_ROLE_NAMES.PROJECT_MANAGER,
    );
    await assignBuiltInRole(
      testApp,
      dm.employeeId,
      BUILT_IN_ROLE_NAMES.DELIVERY_MANAGER,
    );

    const pmOpenRequest = await testApp.prisma.resourcingRequest.create({
      data: {
        authorId: pm.employeeId,
        vacancyDetails: 'PM open request',
        expectedCompBand: '$80k-$100k',
        duration: '6 months',
        workload: 'Full-time',
        headcount: 1,
        department: 'Engineering',
        projectId: 'proj-pm-resourcing',
        status: 'open',
      },
    });
    await testApp.prisma.resourcingRequest.create({
      data: {
        authorId: pm.employeeId,
        vacancyDetails: 'PM pending review request',
        expectedCompBand: '$80k-$100k',
        duration: '6 months',
        workload: 'Full-time',
        headcount: 1,
        department: 'Engineering',
        projectId: 'proj-pm-resourcing',
        status: 'pending_dm_review',
        reviewingDmId: dm.employeeId,
      },
    });
    await testApp.prisma.resourcingRequest.create({
      data: {
        authorId: dm.employeeId,
        vacancyDetails: 'DM own request',
        expectedCompBand: '$80k-$100k',
        duration: '6 months',
        workload: 'Full-time',
        headcount: 1,
        department: 'Engineering',
        projectId: 'proj-pm-resourcing',
        status: 'open',
      },
    });

    const agent = await loginAs(testApp, pm.email);
    const summaryRes = await agent
      .get('/api/v1/dashboards/summary')
      .expect(200);
    const summary = summaryRes.body as DashboardSummaryResponse;

    const requestIds = summary.resourcingRequests?.map((request) => request.id);
    expect(requestIds).toHaveLength(2);
    expect(requestIds).toContain(pmOpenRequest.id);
    expect(summary.counters.openResourcingRequests.value).toBe(1);
  });

  it('deduplicates PM headcount when one person is on multiple PM projects', async () => {
    const pm = await createEmployeeUser(
      testApp,
      'dash-pm-dedup@example.com',
      'PM',
    );
    const member = await createEmployeeUser(
      testApp,
      'dash-pm-dedup-member@example.com',
      'Member',
    );

    for (const projectId of ['proj-pm-dedup-a', 'proj-pm-dedup-b']) {
      await testApp.prisma.projectAssignment.create({
        data: {
          employeeId: member.employeeId,
          projectId,
          pmId: pm.employeeId,
          dmId: pm.employeeId,
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          confirmed: true,
          confirmedAt: new Date('2026-01-05T08:00:00.000Z'),
        },
      });
    }

    await assignBuiltInRole(
      testApp,
      pm.employeeId,
      BUILT_IN_ROLE_NAMES.PROJECT_MANAGER,
    );

    const agent = await loginAs(testApp, pm.email);
    const summaryRes = await agent
      .get('/api/v1/dashboards/summary')
      .expect(200);
    const summary = summaryRes.body as DashboardSummaryResponse;

    expect(summary.counters.headcount.value).toBe(1);
    expect(summary.groups).toHaveLength(2);
  });

  it('returns empty tables and zero counters for a PM with no managed projects', async () => {
    const pm = await createEmployeeUser(
      testApp,
      'dash-pm-empty@example.com',
      'PM',
    );

    await assignBuiltInRole(
      testApp,
      pm.employeeId,
      BUILT_IN_ROLE_NAMES.PROJECT_MANAGER,
    );

    const agent = await loginAs(testApp, pm.email);
    const summaryRes = await agent
      .get('/api/v1/dashboards/summary')
      .expect(200);
    const summary = summaryRes.body as DashboardSummaryResponse;

    expect(summary.groups).toEqual([]);
    expect(summary.counters.headcount.value).toBe(0);
    expect(summary.resourcingRequests).toEqual([]);
  });

  it('filters PM dashboard summary to a single project and rejects an outsider projectId', async () => {
    const pm = await createEmployeeUser(
      testApp,
      'dash-pm-filter@example.com',
      'PM',
    );
    const member = await createEmployeeUser(
      testApp,
      'dash-pm-filter-member@example.com',
      'Member',
    );

    await testApp.prisma.projectAssignment.create({
      data: {
        employeeId: member.employeeId,
        projectId: 'proj-pm-filter',
        pmId: pm.employeeId,
        dmId: pm.employeeId,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        confirmed: true,
        confirmedAt: new Date('2026-01-05T08:00:00.000Z'),
      },
    });

    await assignBuiltInRole(
      testApp,
      pm.employeeId,
      BUILT_IN_ROLE_NAMES.PROJECT_MANAGER,
    );

    const agent = await loginAs(testApp, pm.email);
    const filteredRes = await agent
      .get('/api/v1/dashboards/summary?projectId=proj-pm-filter')
      .expect(200);
    const filtered = filteredRes.body as DashboardSummaryResponse;
    expect(filtered.groups).toHaveLength(1);
    expect(filtered.groups?.[0].projectId).toBe('proj-pm-filter');

    await agent
      .get('/api/v1/dashboards/summary?projectId=some-other-project')
      .expect(400);
  });

  it('prefers UM variant when viewer holds both UM and DM roles', async () => {
    const dualRole = await createEmployeeUser(
      testApp,
      'dash-dual@example.com',
      'Dual Role',
    );

    await assignBuiltInRole(
      testApp,
      dualRole.employeeId,
      BUILT_IN_ROLE_NAMES.UNIT_MANAGER,
    );
    await assignBuiltInRole(
      testApp,
      dualRole.employeeId,
      BUILT_IN_ROLE_NAMES.DELIVERY_MANAGER,
    );

    const agent = await loginAs(testApp, dualRole.email);
    const configRes = await agent.get('/api/v1/dashboards/config').expect(200);
    const config = configRes.body as DashboardConfigResponse;
    expect(config.variant).toBe('um');
  });

  it('prefers DM variant when viewer holds both DM and PM roles', async () => {
    const dualRole = await createEmployeeUser(
      testApp,
      'dash-dual-dm-pm@example.com',
      'Dual DM/PM',
    );

    await assignBuiltInRole(
      testApp,
      dualRole.employeeId,
      BUILT_IN_ROLE_NAMES.DELIVERY_MANAGER,
    );
    await assignBuiltInRole(
      testApp,
      dualRole.employeeId,
      BUILT_IN_ROLE_NAMES.PROJECT_MANAGER,
    );

    const agent = await loginAs(testApp, dualRole.email);
    const configRes = await agent.get('/api/v1/dashboards/config').expect(200);
    const config = configRes.body as DashboardConfigResponse;
    expect(config.variant).toBe('dm');
  });

  it('returns 403 for viewers without a dashboard variant', async () => {
    const colleague = await createEmployeeUser(
      testApp,
      'dash-colleague@example.com',
      'Colleague',
    );
    const agent = await loginAs(testApp, colleague.email);

    await agent.get('/api/v1/dashboards/config').expect(403);
    await agent.get('/api/v1/dashboards/summary').expect(403);
  });

  it('returns PP config with eight counters, idpDeadlines block, and no resourcing block', async () => {
    const pp = await createEmployeeUser(testApp, 'dash-pp@example.com', 'PP');
    await assignBuiltInRole(
      testApp,
      pp.employeeId,
      BUILT_IN_ROLE_NAMES.PEOPLE_PARTNER,
    );

    const agent = await loginAs(testApp, pp.email);
    const configRes = await agent.get('/api/v1/dashboards/config').expect(200);
    const config = configRes.body as DashboardConfigResponse;

    expect(config.variant).toBe('pp');
    expect(config.counters.map((counter) => counter.id)).toEqual([
      'headcount',
      'need_attention',
      'medium',
      'high',
      'leaver',
      'openActionItems',
      'overdueActionItems',
      'openCampaigns',
    ]);
    expect(config.blocks).toContain('idpDeadlines');
    expect(config.blocks).not.toContain('resourcingRequests');
    expect(config.quickNav.some((link) => link.path === '/resourcing')).toBe(
      false,
    );
    expect(config.quickNav.some((link) => link.path === '/mentorship')).toBe(
      true,
    );
  });

  it('scopes PP dashboard to direct and HR-line assignees with IDPs in the 30-day window', async () => {
    const pp = await createEmployeeUser(testApp, 'dash-pp-scope@example.com', 'PP');
    const hrManager = await createEmployeeUser(
      testApp,
      'dash-pp-hr-mgr@example.com',
      'HR Manager',
    );
    const ppAnchor = await createEmployeeUser(
      testApp,
      'dash-pp-anchor@example.com',
      'PP Anchor',
    );
    const directAssignee = await createEmployeeUser(
      testApp,
      'dash-pp-direct@example.com',
      'Direct Assignee',
    );
    const indirectAssignee = await createEmployeeUser(
      testApp,
      'dash-pp-indirect@example.com',
      'Indirect Assignee',
    );
    const excludedAssignee = await createEmployeeUser(
      testApp,
      'dash-pp-excluded@example.com',
      'Excluded Assignee',
    );
    const nonHrManager = await createEmployeeUser(
      testApp,
      'dash-pp-non-hr@example.com',
      'Non HR Manager',
    );
    const blockedAnchor = await createEmployeeUser(
      testApp,
      'dash-pp-blocked@example.com',
      'Blocked Anchor',
    );

    await setOpenDepartment(testApp, pp.employeeId, 'HR');
    await setOpenDepartment(testApp, hrManager.employeeId, 'HR');
    await setOpenDepartment(testApp, nonHrManager.employeeId, 'Engineering');

    await testApp.prisma.employee.update({
      where: { id: hrManager.employeeId },
      data: { managerId: pp.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: ppAnchor.employeeId },
      data: { managerId: hrManager.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: nonHrManager.employeeId },
      data: { managerId: pp.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: blockedAnchor.employeeId },
      data: { managerId: nonHrManager.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: directAssignee.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: indirectAssignee.employeeId },
      data: { peoplePartnerId: ppAnchor.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: excludedAssignee.employeeId },
      data: { peoplePartnerId: blockedAnchor.employeeId },
    });

    await testApp.prisma.departmentHistory.create({
      data: {
        employeeId: directAssignee.employeeId,
        value: 'HR',
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      },
    });
    await testApp.prisma.departmentHistory.create({
      data: {
        employeeId: indirectAssignee.employeeId,
        value: 'Sales',
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      },
    });

    const inWindowIdp = await testApp.prisma.iDPRecord.create({
      data: {
        employeeId: directAssignee.employeeId,
        description: 'Due soon',
        deadline: new Date('2026-01-20T00:00:00.000Z'),
        fileUrl: 'https://example.com/idp-soon.pdf',
      },
    });
    await testApp.prisma.iDPRecord.create({
      data: {
        employeeId: indirectAssignee.employeeId,
        description: 'Too far out',
        deadline: new Date('2026-02-15T00:00:00.000Z'),
        fileUrl: 'https://example.com/idp-later.pdf',
      },
    });

    await assignBuiltInRole(
      testApp,
      pp.employeeId,
      BUILT_IN_ROLE_NAMES.PEOPLE_PARTNER,
    );

    const agent = await loginAs(testApp, pp.email);
    const summaryRes = await agent
      .get('/api/v1/dashboards/summary')
      .expect(200);
    const summary = summaryRes.body as DashboardSummaryResponse;

    expect(summary.counters.headcount.value).toBe(2);
    expect(summary.rows?.map((row) => row.employeeId).sort()).toEqual(
      [directAssignee.employeeId, indirectAssignee.employeeId].sort(),
    );
    expect(summary.rows?.find((row) => row.employeeId === directAssignee.employeeId)?.departmentLabel).toBe(
      'HR',
    );
    expect(summary.idpDeadlines?.map((row) => row.id)).toEqual([inWindowIdp.id]);
    expect(summary.resourcingRequests).toBeUndefined();
  });

  it('returns zero counters and empty PP table when the PP has no assignees', async () => {
    const pp = await createEmployeeUser(
      testApp,
      'dash-pp-empty@example.com',
      'Empty PP',
    );
    await assignBuiltInRole(
      testApp,
      pp.employeeId,
      BUILT_IN_ROLE_NAMES.PEOPLE_PARTNER,
    );

    const agent = await loginAs(testApp, pp.email);
    const summaryRes = await agent
      .get('/api/v1/dashboards/summary')
      .expect(200);
    const summary = summaryRes.body as DashboardSummaryResponse;

    expect(summary.counters.headcount.value).toBe(0);
    expect(summary.rows).toEqual([]);
    expect(summary.idpDeadlines).toEqual([]);
  });

  it('scopes non-HR PP viewers to direct peoplePartnerId assignees only', async () => {
    const pp = await createEmployeeUser(
      testApp,
      'dash-pp-non-hr@example.com',
      'Non HR PP',
    );
    const hrManager = await createEmployeeUser(
      testApp,
      'dash-pp-non-hr-mgr@example.com',
      'HR Manager',
    );
    const directAssignee = await createEmployeeUser(
      testApp,
      'dash-pp-non-hr-direct@example.com',
      'Direct Assignee',
    );
    const indirectAssignee = await createEmployeeUser(
      testApp,
      'dash-pp-non-hr-indirect@example.com',
      'Indirect Assignee',
    );
    const ppAnchor = await createEmployeeUser(
      testApp,
      'dash-pp-non-hr-anchor@example.com',
      'PP Anchor',
    );

    await setOpenDepartment(testApp, hrManager.employeeId, 'HR');
    await testApp.prisma.employee.update({
      where: { id: hrManager.employeeId },
      data: { managerId: pp.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: ppAnchor.employeeId },
      data: { managerId: hrManager.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: directAssignee.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: indirectAssignee.employeeId },
      data: { peoplePartnerId: ppAnchor.employeeId },
    });

    await assignBuiltInRole(
      testApp,
      pp.employeeId,
      BUILT_IN_ROLE_NAMES.PEOPLE_PARTNER,
    );

    const agent = await loginAs(testApp, pp.email);
    const summaryRes = await agent
      .get('/api/v1/dashboards/summary')
      .expect(200);
    const summary = summaryRes.body as DashboardSummaryResponse;

    expect(summary.counters.headcount.value).toBe(1);
    expect(summary.rows?.map((row) => row.employeeId)).toEqual([
      directAssignee.employeeId,
    ]);
  });

  it('prefers DM variant when viewer holds both DM and PP roles', async () => {
    const dualRole = await createEmployeeUser(
      testApp,
      'dash-dual-dm-pp@example.com',
      'Dual DM/PP',
    );

    await assignBuiltInRole(
      testApp,
      dualRole.employeeId,
      BUILT_IN_ROLE_NAMES.DELIVERY_MANAGER,
    );
    await assignBuiltInRole(
      testApp,
      dualRole.employeeId,
      BUILT_IN_ROLE_NAMES.PEOPLE_PARTNER,
    );

    const agent = await loginAs(testApp, dualRole.email);
    const configRes = await agent.get('/api/v1/dashboards/config').expect(200);
    const config = configRes.body as DashboardConfigResponse;
    expect(config.variant).toBe('dm');
  });
});
