import { randomUUID } from 'crypto';
import { PERMISSION_KEYS } from '../src/modules/contracts/permission-keys';
import { createTestApp, TestApp } from './support/app-harness';
import { createEmployeeUser, loginAsEmployee } from './support/employee-users';
import { DEFAULT_TEST_INSTANT, FixedClock } from './support/fixed-clock';

const PASSWORD = 'test-only-resourcing-password';

interface ResourcingRequestReadDto {
  id: string;
  vacancyDetails: string;
  expectedCompBand?: string;
  duration: string;
  workload: string;
  headcount: number;
  department: string;
  projectId?: string | null;
  status: 'open';
  author: { id: string; displayName: string };
  createdAt: string;
  updatedAt: string;
}

const validPayload = {
  vacancyDetails: 'Need a senior backend engineer for API work',
  expectedCompBand: '$80k-$100k',
  duration: '6 months',
  workload: 'Full-time',
  headcount: 1,
  department: 'Engineering',
};

async function grantCreateResourcingRequestsPermission(
  testApp: TestApp,
  employeeId: string,
): Promise<void> {
  const role = await testApp.prisma.functionalRole.create({
    data: {
      name: `Resourcing Creator ${employeeId}`,
      permissions: {
        create: [{ permissionKey: PERMISSION_KEYS.CREATE_RESOURCING_REQUESTS }],
      },
    },
  });
  await testApp.prisma.functionalRoleAssignment.create({
    data: { employeeId, roleId: role.id },
  });
}

describe('Resourcing (e2e)', () => {
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

  it('lets a DM create an unattached request and list it with status open', async () => {
    const dm = await createEmployeeUser(
      testApp,
      'resourcing-dm@example.com',
      PASSWORD,
    );
    await grantCreateResourcingRequestsPermission(testApp, dm.employeeId);

    const dmAgent = await loginAsEmployee(testApp, dm.email, PASSWORD);
    const createRes = await dmAgent
      .post('/api/v1/resourcing/requests')
      .send(validPayload)
      .expect(201);
    const created = createRes.body as ResourcingRequestReadDto;

    expect(created.status).toBe('open');
    expect(created.projectId).toBeNull();
    expect(created.expectedCompBand).toBe(validPayload.expectedCompBand);
    expect(created.author.id).toBe(dm.employeeId);

    const listRes = await dmAgent
      .get('/api/v1/resourcing/requests')
      .expect(200);
    const rows = listRes.body as ResourcingRequestReadDto[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(created.id);
  });

  it('lets a PM create a request with a projectId from their assignment', async () => {
    const pm = await createEmployeeUser(
      testApp,
      'resourcing-pm-attached@example.com',
      PASSWORD,
    );
    const dm = await createEmployeeUser(
      testApp,
      'resourcing-dm-attached@example.com',
      PASSWORD,
    );
    const assignee = await createEmployeeUser(
      testApp,
      'resourcing-assignee@example.com',
      PASSWORD,
    );
    await grantCreateResourcingRequestsPermission(testApp, pm.employeeId);

    const projectId = randomUUID();
    await testApp.prisma.projectAssignment.create({
      data: {
        employeeId: assignee.employeeId,
        projectId,
        pmId: pm.employeeId,
        dmId: dm.employeeId,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: null,
        confirmed: false,
      },
    });

    const pmAgent = await loginAsEmployee(testApp, pm.email, PASSWORD);
    const createRes = await pmAgent
      .post('/api/v1/resourcing/requests')
      .send({ ...validPayload, projectId })
      .expect(201);
    const created = createRes.body as ResourcingRequestReadDto;

    expect(created.projectId).toBe(projectId);
    expect(created.status).toBe('open');
  });

  it('returns 403 when the viewer lacks create_resourcing_requests', async () => {
    const employee = await createEmployeeUser(
      testApp,
      'resourcing-forbidden@example.com',
      PASSWORD,
    );
    const agent = await loginAsEmployee(testApp, employee.email, PASSWORD);

    await agent
      .post('/api/v1/resourcing/requests')
      .send(validPayload)
      .expect(403);
    await agent.get('/api/v1/resourcing/requests').expect(403);
  });

  it('returns 400 when department is missing', async () => {
    const dm = await createEmployeeUser(
      testApp,
      'resourcing-missing-dept@example.com',
      PASSWORD,
    );
    await grantCreateResourcingRequestsPermission(testApp, dm.employeeId);

    const dmAgent = await loginAsEmployee(testApp, dm.email, PASSWORD);
    await dmAgent
      .post('/api/v1/resourcing/requests')
      .send({ ...validPayload, department: '   ' })
      .expect(400);
  });

  it('scopes PM list results to the viewer own requests', async () => {
    const pmA = await createEmployeeUser(
      testApp,
      'resourcing-pm-a@example.com',
      PASSWORD,
    );
    const pmB = await createEmployeeUser(
      testApp,
      'resourcing-pm-b@example.com',
      PASSWORD,
    );
    await grantCreateResourcingRequestsPermission(testApp, pmA.employeeId);
    await grantCreateResourcingRequestsPermission(testApp, pmB.employeeId);

    const pmAAgent = await loginAsEmployee(testApp, pmA.email, PASSWORD);
    const pmBAgent = await loginAsEmployee(testApp, pmB.email, PASSWORD);

    const createdA = await pmAAgent
      .post('/api/v1/resourcing/requests')
      .send(validPayload)
      .expect(201);
    await pmBAgent
      .post('/api/v1/resourcing/requests')
      .send({ ...validPayload, vacancyDetails: 'PM B request' })
      .expect(201);

    const listA = await pmAAgent.get('/api/v1/resourcing/requests').expect(200);
    const rowsA = listA.body as ResourcingRequestReadDto[];
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]?.id).toBe((createdA.body as ResourcingRequestReadDto).id);
  });

  it('lets a DM see PM requests on projects they manage', async () => {
    const pm = await createEmployeeUser(
      testApp,
      'resourcing-pm-shared@example.com',
      PASSWORD,
    );
    const dm = await createEmployeeUser(
      testApp,
      'resourcing-dm-shared@example.com',
      PASSWORD,
    );
    const assignee = await createEmployeeUser(
      testApp,
      'resourcing-shared-assignee@example.com',
      PASSWORD,
    );
    await grantCreateResourcingRequestsPermission(testApp, pm.employeeId);
    await grantCreateResourcingRequestsPermission(testApp, dm.employeeId);

    const projectId = randomUUID();
    await testApp.prisma.projectAssignment.create({
      data: {
        employeeId: assignee.employeeId,
        projectId,
        pmId: pm.employeeId,
        dmId: dm.employeeId,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: null,
        confirmed: false,
      },
    });

    const pmAgent = await loginAsEmployee(testApp, pm.email, PASSWORD);
    const dmAgent = await loginAsEmployee(testApp, dm.email, PASSWORD);

    const pmRequest = await pmAgent
      .post('/api/v1/resourcing/requests')
      .send({ ...validPayload, projectId })
      .expect(201);
    await dmAgent
      .post('/api/v1/resourcing/requests')
      .send({ ...validPayload, vacancyDetails: 'DM own request' })
      .expect(201);

    const listRes = await dmAgent
      .get('/api/v1/resourcing/requests')
      .expect(200);
    const rows = listRes.body as ResourcingRequestReadDto[];
    const ids = rows.map((row) => row.id);
    expect(ids).toContain((pmRequest.body as ResourcingRequestReadDto).id);
    expect(rows).toHaveLength(2);

    const pmRow = rows.find(
      (row) => row.id === (pmRequest.body as ResourcingRequestReadDto).id,
    );
    expect(pmRow?.expectedCompBand).toBe(validPayload.expectedCompBand);
  });

  it('excludes PM requests from a DM who is not responsible for that PM project', async () => {
    const pm = await createEmployeeUser(
      testApp,
      'resourcing-pm-other@example.com',
      PASSWORD,
    );
    const otherDm = await createEmployeeUser(
      testApp,
      'resourcing-other-dm@example.com',
      PASSWORD,
    );
    const viewerDm = await createEmployeeUser(
      testApp,
      'resourcing-viewer-dm@example.com',
      PASSWORD,
    );
    const assignee = await createEmployeeUser(
      testApp,
      'resourcing-other-assignee@example.com',
      PASSWORD,
    );
    await grantCreateResourcingRequestsPermission(testApp, pm.employeeId);
    await grantCreateResourcingRequestsPermission(testApp, viewerDm.employeeId);

    const projectId = randomUUID();
    await testApp.prisma.projectAssignment.create({
      data: {
        employeeId: assignee.employeeId,
        projectId,
        pmId: pm.employeeId,
        dmId: otherDm.employeeId,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: null,
        confirmed: false,
      },
    });

    const pmAgent = await loginAsEmployee(testApp, pm.email, PASSWORD);
    const viewerDmAgent = await loginAsEmployee(
      testApp,
      viewerDm.email,
      PASSWORD,
    );

    await pmAgent
      .post('/api/v1/resourcing/requests')
      .send({ ...validPayload, projectId })
      .expect(201);

    const listRes = await viewerDmAgent
      .get('/api/v1/resourcing/requests')
      .expect(200);
    expect(listRes.body as ResourcingRequestReadDto[]).toHaveLength(0);
  });
});
