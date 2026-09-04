import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PERMISSION_KEYS } from '../src/modules/contracts/permission-keys';
import { createTestApp, TestApp } from './support/app-harness';
import { createEmployeeUser, loginAsEmployee } from './support/employee-users';
import { DEFAULT_TEST_INSTANT, FixedClock } from './support/fixed-clock';

const PASSWORD = 'test-only-campaigns-password';

interface CampaignReadDto {
  id: string;
  title: string;
  description: string;
  purpose: string;
  link: string;
  dueDate: string;
  status: 'draft' | 'active';
  creator: { id: string; displayName: string };
  createdAt: string;
  updatedAt: string;
}

const validPayload = {
  title: 'Annual Engagement Survey',
  description: 'A short pulse survey',
  purpose: 'Understand engagement trends across the org',
  link: 'https://forms.example.com/annual-survey',
  dueDate: '2026-09-30',
};

async function grantCreateFormCampaignsPermission(
  testApp: TestApp,
  employeeId: string,
): Promise<void> {
  const role = await testApp.prisma.functionalRole.create({
    data: {
      name: `Campaign Sender ${employeeId}`,
      permissions: {
        create: [{ permissionKey: PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS }],
      },
    },
  });
  await testApp.prisma.functionalRoleAssignment.create({
    data: { employeeId, roleId: role.id },
  });
}

describe('Campaigns (e2e)', () => {
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

  it('lets a PP create a draft campaign with no action items and no notifications', async () => {
    const pp = await createEmployeeUser(
      testApp,
      'campaign-pp@example.com',
      PASSWORD,
    );
    // Make `pp` a PP by assigning them as someone's peoplePartner.
    const subject = await createEmployeeUser(
      testApp,
      'campaign-pp-subject@example.com',
      PASSWORD,
    );
    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });

    const ppAgent = await loginAsEmployee(testApp, pp.email, PASSWORD);
    const createRes = await ppAgent
      .post('/api/v1/campaigns')
      .send(validPayload)
      .expect(201);
    const created = createRes.body as CampaignReadDto;

    expect(created.status).toBe('draft');
    expect(created.title).toBe(validPayload.title);
    expect(created.creator.id).toBe(pp.employeeId);

    const actionItemCount = await testApp.prisma.actionItem.count({
      where: { campaignId: created.id },
    });
    expect(actionItemCount).toBe(0);
  });

  it('lets a manager with >=1 direct report and no functional-role grant create a campaign', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'campaign-manager@example.com',
      PASSWORD,
    );
    const report = await createEmployeeUser(
      testApp,
      'campaign-report@example.com',
      PASSWORD,
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAsEmployee(
      testApp,
      manager.email,
      PASSWORD,
    );
    const createRes = await managerAgent
      .post('/api/v1/campaigns')
      .send(validPayload)
      .expect(201);
    expect((createRes.body as CampaignReadDto).status).toBe('draft');
  });

  it('lets a manager gain access via an active PM/DM ProjectAssignment', async () => {
    const pm = await createEmployeeUser(
      testApp,
      'campaign-pm@example.com',
      PASSWORD,
    );
    const assignee = await createEmployeeUser(
      testApp,
      'campaign-pm-assignee@example.com',
      PASSWORD,
    );
    await testApp.prisma.projectAssignment.create({
      data: {
        employeeId: assignee.employeeId,
        projectId: randomUUID(),
        pmId: pm.employeeId,
        dmId: pm.employeeId,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: null,
        confirmed: false,
      },
    });

    const pmAgent = await loginAsEmployee(testApp, pm.email, PASSWORD);
    await pmAgent.post('/api/v1/campaigns').send(validPayload).expect(201);
  });

  it('does not grant access via an ended ProjectAssignment', async () => {
    const pm = await createEmployeeUser(
      testApp,
      'campaign-pm-ended@example.com',
      PASSWORD,
    );
    const assignee = await createEmployeeUser(
      testApp,
      'campaign-pm-ended-assignee@example.com',
      PASSWORD,
    );
    await testApp.prisma.projectAssignment.create({
      data: {
        employeeId: assignee.employeeId,
        projectId: randomUUID(),
        pmId: pm.employeeId,
        dmId: pm.employeeId,
        startDate: new Date('2025-01-01T00:00:00.000Z'),
        endDate: new Date('2025-06-01T00:00:00.000Z'),
        confirmed: false,
      },
    });

    const pmAgent = await loginAsEmployee(testApp, pm.email, PASSWORD);
    await pmAgent.post('/api/v1/campaigns').send(validPayload).expect(403);
  });

  it('lets a functional-role holder with the permission but no reports create a campaign', async () => {
    const holder = await createEmployeeUser(
      testApp,
      'campaign-role-holder@example.com',
      PASSWORD,
    );
    await grantCreateFormCampaignsPermission(testApp, holder.employeeId);

    const holderAgent = await loginAsEmployee(testApp, holder.email, PASSWORD);
    const createRes = await holderAgent
      .post('/api/v1/campaigns')
      .send(validPayload)
      .expect(201);
    expect((createRes.body as CampaignReadDto).status).toBe('draft');
  });

  it('denies a plain colleague with no manager/PP/permission access', async () => {
    const colleague = await createEmployeeUser(
      testApp,
      'campaign-colleague@example.com',
      PASSWORD,
    );

    const colleagueAgent = await loginAsEmployee(
      testApp,
      colleague.email,
      PASSWORD,
    );
    await colleagueAgent
      .post('/api/v1/campaigns')
      .send(validPayload)
      .expect(403);
  });

  it('returns 403 on create and list when the authenticated user has no employee record', async () => {
    const user = await testApp.prisma.user.create({
      data: {
        email: 'campaign-no-employee@example.com',
        passwordHash: await hash(PASSWORD, 12),
      },
    });

    const agent = await loginAsEmployee(testApp, user.email, PASSWORD);
    await agent.post('/api/v1/campaigns').send(validPayload).expect(403);
    await agent.get('/api/v1/campaigns').expect(403);
  });

  it('rejects a create payload missing the link field with 400', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'campaign-missing-link-mgr@example.com',
      PASSWORD,
    );
    const report = await createEmployeeUser(
      testApp,
      'campaign-missing-link-report@example.com',
      PASSWORD,
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAsEmployee(
      testApp,
      manager.email,
      PASSWORD,
    );
    const payloadWithoutLink: Partial<typeof validPayload> = {
      ...validPayload,
    };
    delete payloadWithoutLink.link;
    await managerAgent
      .post('/api/v1/campaigns')
      .send(payloadWithoutLink)
      .expect(400);
  });

  it('lets the creator edit any of the five fields while the campaign is draft', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'campaign-edit-mgr@example.com',
      PASSWORD,
    );
    const report = await createEmployeeUser(
      testApp,
      'campaign-edit-report@example.com',
      PASSWORD,
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAsEmployee(
      testApp,
      manager.email,
      PASSWORD,
    );
    const createRes = await managerAgent
      .post('/api/v1/campaigns')
      .send(validPayload)
      .expect(201);
    const created = createRes.body as CampaignReadDto;

    const patchRes = await managerAgent
      .patch(`/api/v1/campaigns/${created.id}`)
      .send({ title: 'Updated Survey Title', dueDate: '2026-10-15' })
      .expect(200);
    const updated = patchRes.body as CampaignReadDto;

    expect(updated.title).toBe('Updated Survey Title');
    expect(updated.dueDate).toBe('2026-10-15');
    expect(updated.status).toBe('draft');
  });

  it('returns 404 when editing a campaign owned by someone else', async () => {
    const owner = await createEmployeeUser(
      testApp,
      'campaign-owner@example.com',
      PASSWORD,
    );
    const report = await createEmployeeUser(
      testApp,
      'campaign-owner-report@example.com',
      PASSWORD,
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: owner.employeeId },
    });
    const otherManager = await createEmployeeUser(
      testApp,
      'campaign-other-mgr@example.com',
      PASSWORD,
    );
    const otherReport = await createEmployeeUser(
      testApp,
      'campaign-other-report@example.com',
      PASSWORD,
    );
    await testApp.prisma.employee.update({
      where: { id: otherReport.employeeId },
      data: { managerId: otherManager.employeeId },
    });

    const ownerAgent = await loginAsEmployee(testApp, owner.email, PASSWORD);
    const createRes = await ownerAgent
      .post('/api/v1/campaigns')
      .send(validPayload)
      .expect(201);
    const created = createRes.body as CampaignReadDto;

    const otherAgent = await loginAsEmployee(
      testApp,
      otherManager.email,
      PASSWORD,
    );
    await otherAgent
      .patch(`/api/v1/campaigns/${created.id}`)
      .send({ title: 'Hijacked' })
      .expect(404);
    await otherAgent.get(`/api/v1/campaigns/${created.id}`).expect(404);
  });

  it('returns 409 when patching a campaign that is no longer draft', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'campaign-active-mgr@example.com',
      PASSWORD,
    );
    const report = await createEmployeeUser(
      testApp,
      'campaign-active-report@example.com',
      PASSWORD,
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAsEmployee(
      testApp,
      manager.email,
      PASSWORD,
    );
    const createRes = await managerAgent
      .post('/api/v1/campaigns')
      .send(validPayload)
      .expect(201);
    const created = createRes.body as CampaignReadDto;

    await testApp.prisma.formCampaign.update({
      where: { id: created.id },
      data: { status: 'active' },
    });

    await managerAgent
      .patch(`/api/v1/campaigns/${created.id}`)
      .send({ title: 'Should not save' })
      .expect(409);
  });

  it('lists only the viewer own campaigns, newest first', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'campaign-list-mgr@example.com',
      PASSWORD,
    );
    const report = await createEmployeeUser(
      testApp,
      'campaign-list-report@example.com',
      PASSWORD,
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });
    const otherManager = await createEmployeeUser(
      testApp,
      'campaign-list-other-mgr@example.com',
      PASSWORD,
    );
    const otherReport = await createEmployeeUser(
      testApp,
      'campaign-list-other-report@example.com',
      PASSWORD,
    );
    await testApp.prisma.employee.update({
      where: { id: otherReport.employeeId },
      data: { managerId: otherManager.employeeId },
    });

    const managerAgent = await loginAsEmployee(
      testApp,
      manager.email,
      PASSWORD,
    );
    const otherAgent = await loginAsEmployee(
      testApp,
      otherManager.email,
      PASSWORD,
    );

    await managerAgent
      .post('/api/v1/campaigns')
      .send({ ...validPayload, title: 'Older campaign' })
      .expect(201);
    await managerAgent
      .post('/api/v1/campaigns')
      .send({ ...validPayload, title: 'Newer campaign' })
      .expect(201);
    await otherAgent
      .post('/api/v1/campaigns')
      .send({ ...validPayload, title: 'Not mine' })
      .expect(201);

    const listRes = await managerAgent.get('/api/v1/campaigns').expect(200);
    const list = listRes.body as CampaignReadDto[];
    expect(list).toHaveLength(2);
    expect(list.map(campaign => campaign.title)).toEqual([
      'Newer campaign',
      'Older campaign',
    ]);
  });

  it('returns 400 for a malformed campaignId and 404 for a well-formed unknown one', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'campaign-gate-mgr@example.com',
      PASSWORD,
    );
    const report = await createEmployeeUser(
      testApp,
      'campaign-gate-report@example.com',
      PASSWORD,
    );
    await testApp.prisma.employee.update({
      where: { id: report.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAsEmployee(
      testApp,
      manager.email,
      PASSWORD,
    );
    await managerAgent.get('/api/v1/campaigns/not-a-uuid').expect(400);
    await managerAgent
      .patch('/api/v1/campaigns/not-a-uuid')
      .send({ title: 'x' })
      .expect(400);

    const missingId = randomUUID();
    await managerAgent.get(`/api/v1/campaigns/${missingId}`).expect(404);
    await managerAgent
      .patch(`/api/v1/campaigns/${missingId}`)
      .send({ title: 'x' })
      .expect(404);
  });
});
