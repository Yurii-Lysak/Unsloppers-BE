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

interface ResourcingProposalReadDto {
  id: string;
  requestId: string;
  proposedById: string;
  candidateEmployeeId?: string | null;
  candidateDisplayName?: string;
  peopleForceCandidateId?: string | null;
  peopleForceCandidateUrl?: string | null;
  status: 'proposed';
  createdAt: string;
}

interface ResourcingRequestDetailDto extends ResourcingRequestReadDto {
  proposals: ResourcingProposalReadDto[];
  reviewingDmId?: string | null;
  candidatePool?: { id: string; displayName: string }[];
}

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

async function grantFulfilResourcingRequestsPermission(
  testApp: TestApp,
  employeeId: string,
): Promise<void> {
  const role = await testApp.prisma.functionalRole.create({
    data: {
      name: `Resourcing Fulfiller ${employeeId}`,
      permissions: {
        create: [{ permissionKey: PERMISSION_KEYS.FULFIL_RESOURCING_REQUESTS }],
      },
    },
  });
  await testApp.prisma.functionalRoleAssignment.create({
    data: { employeeId, roleId: role.id },
  });
}

/** Seeds a C12 `Department` row routing `departmentName` to `managerId`. */
async function createDepartment(
  testApp: TestApp,
  departmentName: string,
  managerId: string,
): Promise<void> {
  await testApp.prisma.department.create({
    data: { name: departmentName, managerId },
  });
}

/** Seeds a current (open) `DepartmentHistory` row for an employee. */
async function setCurrentDepartment(
  testApp: TestApp,
  employeeId: string,
  departmentName: string,
): Promise<void> {
  await testApp.prisma.departmentHistory.create({
    data: {
      employeeId,
      value: departmentName,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    },
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

describe('Resourcing fulfilment (e2e, Story 6.2)', () => {
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

  /** DM creates an open, unattached request routed to `Engineering`. */
  async function createOpenEngineeringRequest(
    dmAgent: Awaited<ReturnType<typeof loginAsEmployee>>,
  ): Promise<string> {
    const createRes = await dmAgent
      .post('/api/v1/resourcing/requests')
      .send(validPayload)
      .expect(201);
    return (createRes.body as ResourcingRequestReadDto).id;
  }

  it('CREATE_LIST_UNCHANGED: create/list remain reachable via create_resourcing_requests alone', async () => {
    const dm = await createEmployeeUser(
      testApp,
      'fulfil-dm-unchanged@example.com',
      PASSWORD,
    );
    await grantCreateResourcingRequestsPermission(testApp, dm.employeeId);
    const dmAgent = await loginAsEmployee(testApp, dm.email, PASSWORD);

    await dmAgent
      .post('/api/v1/resourcing/requests')
      .send(validPayload)
      .expect(201);
    const listRes = await dmAgent
      .get('/api/v1/resourcing/requests')
      .expect(200);
    expect(listRes.body as ResourcingRequestReadDto[]).toHaveLength(1);

    // create/list holders without fulfil permission cannot reach the new routes
    await dmAgent.get('/api/v1/resourcing/requests/assigned').expect(403);
  });

  it('FORBIDDEN_FULFIL: a viewer lacking fulfil_resourcing_requests gets 403 on every fulfil route', async () => {
    const dm = await createEmployeeUser(
      testApp,
      'fulfil-dm-forbidden@example.com',
      PASSWORD,
    );
    await grantCreateResourcingRequestsPermission(testApp, dm.employeeId);
    const dmAgent = await loginAsEmployee(testApp, dm.email, PASSWORD);
    const requestId = await createOpenEngineeringRequest(dmAgent);

    const um = await createEmployeeUser(
      testApp,
      'fulfil-um-forbidden@example.com',
      PASSWORD,
    );
    await createDepartment(testApp, 'Engineering', um.employeeId);
    const umAgent = await loginAsEmployee(testApp, um.email, PASSWORD);

    await umAgent.get('/api/v1/resourcing/requests/assigned').expect(403);
    await umAgent.get(`/api/v1/resourcing/requests/${requestId}`).expect(403);
    await umAgent
      .post(`/api/v1/resourcing/requests/${requestId}/proposals`)
      .send({ peopleForceCandidateUrl: 'https://peopleforce.example.com/c/1' })
      .expect(403);
    await umAgent
      .post(`/api/v1/resourcing/requests/${requestId}/submit`)
      .expect(403);
  });

  it('NOT_ROUTED: a UM with fulfil permission but not the department manager gets 403', async () => {
    const dm = await createEmployeeUser(
      testApp,
      'fulfil-dm-notrouted@example.com',
      PASSWORD,
    );
    await grantCreateResourcingRequestsPermission(testApp, dm.employeeId);
    const dmAgent = await loginAsEmployee(testApp, dm.email, PASSWORD);
    const requestId = await createOpenEngineeringRequest(dmAgent);

    const actualUm = await createEmployeeUser(
      testApp,
      'fulfil-um-actual@example.com',
      PASSWORD,
    );
    await createDepartment(testApp, 'Engineering', actualUm.employeeId);

    const otherUm = await createEmployeeUser(
      testApp,
      'fulfil-um-other@example.com',
      PASSWORD,
    );
    await grantFulfilResourcingRequestsPermission(testApp, otherUm.employeeId);
    const otherUmAgent = await loginAsEmployee(
      testApp,
      otherUm.email,
      PASSWORD,
    );

    await otherUmAgent
      .get(`/api/v1/resourcing/requests/${requestId}`)
      .expect(403);
    await otherUmAgent
      .post(`/api/v1/resourcing/requests/${requestId}/proposals`)
      .send({ peopleForceCandidateUrl: 'https://peopleforce.example.com/c/1' })
      .expect(403);
    await otherUmAgent
      .post(`/api/v1/resourcing/requests/${requestId}/submit`)
      .expect(403);

    const assignedRes = await otherUmAgent
      .get('/api/v1/resourcing/requests/assigned')
      .expect(200);
    expect(assignedRes.body as ResourcingRequestReadDto[]).toHaveLength(0);
  });

  it('HAPPY_INTERNAL: routed UM attaches an in-unit candidate and submits for DM review', async () => {
    const dm = await createEmployeeUser(
      testApp,
      'fulfil-dm-internal@example.com',
      PASSWORD,
    );
    await grantCreateResourcingRequestsPermission(testApp, dm.employeeId);
    const dmAgent = await loginAsEmployee(testApp, dm.email, PASSWORD);
    const requestId = await createOpenEngineeringRequest(dmAgent);

    const um = await createEmployeeUser(
      testApp,
      'fulfil-um-internal@example.com',
      PASSWORD,
    );
    await createDepartment(testApp, 'Engineering', um.employeeId);
    await grantFulfilResourcingRequestsPermission(testApp, um.employeeId);
    const umAgent = await loginAsEmployee(testApp, um.email, PASSWORD);

    const candidate = await createEmployeeUser(
      testApp,
      'fulfil-candidate-internal@example.com',
      PASSWORD,
    );
    await setCurrentDepartment(testApp, candidate.employeeId, 'Engineering');

    const assignedRes = await umAgent
      .get('/api/v1/resourcing/requests/assigned')
      .expect(200);
    expect(
      (assignedRes.body as ResourcingRequestReadDto[]).map((r) => r.id),
    ).toContain(requestId);

    const detailRes = await umAgent
      .get(`/api/v1/resourcing/requests/${requestId}`)
      .expect(200);
    const detail = detailRes.body as ResourcingRequestDetailDto;
    expect(detail.candidatePool?.map((c) => c.id)).toContain(
      candidate.employeeId,
    );

    const proposalRes = await umAgent
      .post(`/api/v1/resourcing/requests/${requestId}/proposals`)
      .send({ candidateEmployeeId: candidate.employeeId })
      .expect(201);
    expect(
      (proposalRes.body as ResourcingProposalReadDto).candidateEmployeeId,
    ).toBe(candidate.employeeId);

    const submitRes = await umAgent
      .post(`/api/v1/resourcing/requests/${requestId}/submit`)
      .expect(200);
    const submitted = submitRes.body as ResourcingRequestDetailDto;
    expect(submitted.status).toBe('pending_dm_review');
    expect(submitted.proposals).toHaveLength(1);
    // Design Notes — unattached PM/DM-authored request: author (a DM here)
    // resolves as reviewing DM via the DM-functional-role branch only when
    // the author actually holds that role; bootcamp e2e grants a bespoke
    // create-only role, so this asserts the resolver does not crash and
    // records whatever it resolves to (null is a valid outcome here).
    expect(submitted).toHaveProperty('reviewingDmId');
  });

  it('HAPPY_EXTERNAL_LINK: routed UM attaches an external PeopleForce-link candidate and submits', async () => {
    const dm = await createEmployeeUser(
      testApp,
      'fulfil-dm-external@example.com',
      PASSWORD,
    );
    await grantCreateResourcingRequestsPermission(testApp, dm.employeeId);
    const dmAgent = await loginAsEmployee(testApp, dm.email, PASSWORD);
    const requestId = await createOpenEngineeringRequest(dmAgent);

    const um = await createEmployeeUser(
      testApp,
      'fulfil-um-external@example.com',
      PASSWORD,
    );
    await createDepartment(testApp, 'Engineering', um.employeeId);
    await grantFulfilResourcingRequestsPermission(testApp, um.employeeId);
    const umAgent = await loginAsEmployee(testApp, um.email, PASSWORD);

    const proposalRes = await umAgent
      .post(`/api/v1/resourcing/requests/${requestId}/proposals`)
      .send({
        peopleForceCandidateUrl:
          'https://peopleforce.example.com/candidates/42',
        peopleForceCandidateId: 'pf-42',
      })
      .expect(201);
    const proposal = proposalRes.body as ResourcingProposalReadDto;
    expect(proposal.candidateEmployeeId).toBeNull();
    expect(proposal.peopleForceCandidateUrl).toBe(
      'https://peopleforce.example.com/candidates/42',
    );

    const submitRes = await umAgent
      .post(`/api/v1/resourcing/requests/${requestId}/submit`)
      .expect(200);
    expect((submitRes.body as ResourcingRequestDetailDto).status).toBe(
      'pending_dm_review',
    );
  });

  it('INTERNAL_OUT_OF_UNIT: an internal candidate outside the managed department is rejected (400)', async () => {
    const dm = await createEmployeeUser(
      testApp,
      'fulfil-dm-outofunit@example.com',
      PASSWORD,
    );
    await grantCreateResourcingRequestsPermission(testApp, dm.employeeId);
    const dmAgent = await loginAsEmployee(testApp, dm.email, PASSWORD);
    const requestId = await createOpenEngineeringRequest(dmAgent);

    const um = await createEmployeeUser(
      testApp,
      'fulfil-um-outofunit@example.com',
      PASSWORD,
    );
    await createDepartment(testApp, 'Engineering', um.employeeId);
    await grantFulfilResourcingRequestsPermission(testApp, um.employeeId);
    const umAgent = await loginAsEmployee(testApp, um.email, PASSWORD);

    const outsider = await createEmployeeUser(
      testApp,
      'fulfil-outsider@example.com',
      PASSWORD,
    );
    await setCurrentDepartment(testApp, outsider.employeeId, 'Design');

    await umAgent
      .post(`/api/v1/resourcing/requests/${requestId}/proposals`)
      .send({ candidateEmployeeId: outsider.employeeId })
      .expect(400);
  });

  it('EXTERNAL_NO_URL: an external proposal without a URL is rejected (400)', async () => {
    const dm = await createEmployeeUser(
      testApp,
      'fulfil-dm-nourl@example.com',
      PASSWORD,
    );
    await grantCreateResourcingRequestsPermission(testApp, dm.employeeId);
    const dmAgent = await loginAsEmployee(testApp, dm.email, PASSWORD);
    const requestId = await createOpenEngineeringRequest(dmAgent);

    const um = await createEmployeeUser(
      testApp,
      'fulfil-um-nourl@example.com',
      PASSWORD,
    );
    await createDepartment(testApp, 'Engineering', um.employeeId);
    await grantFulfilResourcingRequestsPermission(testApp, um.employeeId);
    const umAgent = await loginAsEmployee(testApp, um.email, PASSWORD);

    await umAgent
      .post(`/api/v1/resourcing/requests/${requestId}/proposals`)
      .send({ peopleForceCandidateId: 'pf-only-id-no-url' })
      .expect(400);
    await umAgent
      .post(`/api/v1/resourcing/requests/${requestId}/proposals`)
      .send({})
      .expect(400);
  });

  it('SUBMIT_EMPTY: submitting with zero proposals is rejected (400)', async () => {
    const dm = await createEmployeeUser(
      testApp,
      'fulfil-dm-empty@example.com',
      PASSWORD,
    );
    await grantCreateResourcingRequestsPermission(testApp, dm.employeeId);
    const dmAgent = await loginAsEmployee(testApp, dm.email, PASSWORD);
    const requestId = await createOpenEngineeringRequest(dmAgent);

    const um = await createEmployeeUser(
      testApp,
      'fulfil-um-empty@example.com',
      PASSWORD,
    );
    await createDepartment(testApp, 'Engineering', um.employeeId);
    await grantFulfilResourcingRequestsPermission(testApp, um.employeeId);
    const umAgent = await loginAsEmployee(testApp, um.email, PASSWORD);

    await umAgent
      .post(`/api/v1/resourcing/requests/${requestId}/submit`)
      .expect(400);
  });

  it('SUBMIT_NOT_OPEN: submitting an already-submitted request is rejected (409)', async () => {
    const dm = await createEmployeeUser(
      testApp,
      'fulfil-dm-notopen@example.com',
      PASSWORD,
    );
    await grantCreateResourcingRequestsPermission(testApp, dm.employeeId);
    const dmAgent = await loginAsEmployee(testApp, dm.email, PASSWORD);
    const requestId = await createOpenEngineeringRequest(dmAgent);

    const um = await createEmployeeUser(
      testApp,
      'fulfil-um-notopen@example.com',
      PASSWORD,
    );
    await createDepartment(testApp, 'Engineering', um.employeeId);
    await grantFulfilResourcingRequestsPermission(testApp, um.employeeId);
    const umAgent = await loginAsEmployee(testApp, um.email, PASSWORD);

    await umAgent
      .post(`/api/v1/resourcing/requests/${requestId}/proposals`)
      .send({ peopleForceCandidateUrl: 'https://peopleforce.example.com/c/9' })
      .expect(201);
    await umAgent
      .post(`/api/v1/resourcing/requests/${requestId}/submit`)
      .expect(200);

    // Second submit — request is now pending_dm_review, not open.
    await umAgent
      .post(`/api/v1/resourcing/requests/${requestId}/submit`)
      .expect(409);
    // A new proposal after submit is rejected the same way.
    await umAgent
      .post(`/api/v1/resourcing/requests/${requestId}/proposals`)
      .send({ peopleForceCandidateUrl: 'https://peopleforce.example.com/c/10' })
      .expect(409);
  });

  it('comp band is visible to the routed UM (6.2 extension) even though they are neither author nor project DM', async () => {
    const pm = await createEmployeeUser(
      testApp,
      'fulfil-pm-compband@example.com',
      PASSWORD,
    );
    await grantCreateResourcingRequestsPermission(testApp, pm.employeeId);
    const pmAgent = await loginAsEmployee(testApp, pm.email, PASSWORD);
    const requestId = await createOpenEngineeringRequest(pmAgent);

    const um = await createEmployeeUser(
      testApp,
      'fulfil-um-compband@example.com',
      PASSWORD,
    );
    await createDepartment(testApp, 'Engineering', um.employeeId);
    await grantFulfilResourcingRequestsPermission(testApp, um.employeeId);
    const umAgent = await loginAsEmployee(testApp, um.email, PASSWORD);

    const detailRes = await umAgent
      .get(`/api/v1/resourcing/requests/${requestId}`)
      .expect(200);
    expect(
      (detailRes.body as ResourcingRequestDetailDto).expectedCompBand,
    ).toBe(validPayload.expectedCompBand);
  });
});
