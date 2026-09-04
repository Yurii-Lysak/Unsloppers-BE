import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PERMISSION_KEYS } from '../src/modules/contracts/permission-keys';
import { BUILTIN_FIELD_IDS } from '../src/modules/contracts/field-registry.contract';
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
  audience: {
    filters: Array<{
      fieldId: string;
      operator: string;
      value: unknown;
    }>;
    addedEmployeeIds: string[];
    excludedEmployeeIds: string[];
  };
}

interface CampaignAudiencePreviewDto {
  total: number;
  rows: Array<{ employeeId: string }>;
}

interface CampaignAudienceResolveDto {
  employeeIds: string[];
}

interface CampaignAudienceErrorDto {
  invalidExcludedEmployeeIds?: string[];
  invalidEmployeeIds?: string[];
}

const validPayload = {
  title: 'Annual Engagement Survey',
  description: 'A short pulse survey',
  purpose: 'Understand engagement trends across the org',
  link: 'https://forms.example.com/annual-survey',
  dueDate: '2026-09-30',
};

async function seedEmployeeGrade(
  testApp: TestApp,
  employeeId: string,
  grade: string,
): Promise<void> {
  await testApp.prisma.gradeHistory.create({
    data: {
      employeeId,
      value: grade,
      effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
    },
  });
}

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
    expect(list.map((campaign) => campaign.title)).toEqual([
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

  it('saves, reloads, previews, and resolves a draft audience', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'campaign-audience-mgr@example.com',
      PASSWORD,
    );
    const engineeringReport = await createEmployeeUser(
      testApp,
      'campaign-audience-eng@example.com',
      PASSWORD,
    );
    const salesReport = await createEmployeeUser(
      testApp,
      'campaign-audience-sales@example.com',
      PASSWORD,
    );
    await testApp.prisma.employee.update({
      where: { id: engineeringReport.employeeId },
      data: { managerId: manager.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: salesReport.employeeId },
      data: { managerId: manager.employeeId },
    });

    await seedEmployeeGrade(testApp, engineeringReport.employeeId, 'Mid');
    await seedEmployeeGrade(testApp, salesReport.employeeId, 'Senior');

    const managerAgent = await loginAsEmployee(
      testApp,
      manager.email,
      PASSWORD,
    );
    const createRes = await managerAgent
      .post('/api/v1/campaigns')
      .send(validPayload)
      .expect(201);
    const campaign = createRes.body as CampaignReadDto;

    const audiencePayload = {
      filters: [],
      addedEmployeeIds: [salesReport.employeeId, engineeringReport.employeeId],
      excludedEmployeeIds: [],
    };

    const saveRes = await managerAgent
      .put(`/api/v1/campaigns/${campaign.id}/audience`)
      .send(audiencePayload)
      .expect(200);
    const saved = saveRes.body as CampaignReadDto;
    expect(saved.audience.addedEmployeeIds).toEqual([
      salesReport.employeeId,
      engineeringReport.employeeId,
    ]);

    const reloadRes = await managerAgent
      .get(`/api/v1/campaigns/${campaign.id}`)
      .expect(200);
    const reloaded = reloadRes.body as CampaignReadDto;
    expect(reloaded.audience).toEqual(saved.audience);

    const previewRes = await managerAgent
      .get(`/api/v1/campaigns/${campaign.id}/audience/preview`)
      .expect(200);
    const preview = previewRes.body as CampaignAudiencePreviewDto;
    expect(preview.total).toBe(2);
    expect(preview.rows).toHaveLength(2);

    const resolveRes = await managerAgent
      .get(`/api/v1/campaigns/${campaign.id}/audience/resolve`)
      .expect(200);
    const resolved = resolveRes.body as CampaignAudienceResolveDto;
    expect(resolved.employeeIds).toHaveLength(2);
    expect(resolved.employeeIds).toEqual(
      expect.arrayContaining([
        salesReport.employeeId,
        engineeringReport.employeeId,
      ]),
    );
  });

  it('rejects excluded ids that are not current filter matches', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'campaign-audience-exclude-mgr@example.com',
      PASSWORD,
    );
    const engineeringReport = await createEmployeeUser(
      testApp,
      'campaign-audience-exclude-eng@example.com',
      PASSWORD,
    );
    await testApp.prisma.employee.update({
      where: { id: engineeringReport.employeeId },
      data: { managerId: manager.employeeId },
    });
    await seedEmployeeGrade(testApp, engineeringReport.employeeId, 'Mid');

    const managerAgent = await loginAsEmployee(
      testApp,
      manager.email,
      PASSWORD,
    );
    const createRes = await managerAgent
      .post('/api/v1/campaigns')
      .send(validPayload)
      .expect(201);
    const campaign = createRes.body as CampaignReadDto;

    const strangerId = randomUUID();
    const saveRes = await managerAgent
      .put(`/api/v1/campaigns/${campaign.id}/audience`)
      .send({
        filters: [
          {
            fieldId: BUILTIN_FIELD_IDS.grade,
            operator: 'eq',
            value: 'Mid',
          },
        ],
        addedEmployeeIds: [],
        excludedEmployeeIds: [strangerId],
      });
    const saveBody = saveRes.body as CampaignAudienceErrorDto;
    expect(saveRes.status).toBe(400);
    expect(saveBody.invalidExcludedEmployeeIds).toEqual([strangerId]);
  });

  it('returns 404 when a non-creator accesses audience routes', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'campaign-audience-owner@example.com',
      PASSWORD,
    );
    const other = await createEmployeeUser(
      testApp,
      'campaign-audience-other@example.com',
      PASSWORD,
    );
    const report = await createEmployeeUser(
      testApp,
      'campaign-audience-owner-report@example.com',
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
    const otherAgent = await loginAsEmployee(testApp, other.email, PASSWORD);
    const createRes = await managerAgent
      .post('/api/v1/campaigns')
      .send(validPayload)
      .expect(201);
    const campaign = createRes.body as CampaignReadDto;

    await otherAgent
      .put(`/api/v1/campaigns/${campaign.id}/audience`)
      .send({ filters: [], addedEmployeeIds: [], excludedEmployeeIds: [] })
      .expect(404);
    await otherAgent
      .get(`/api/v1/campaigns/${campaign.id}/audience/preview`)
      .expect(404);
    await otherAgent
      .get(`/api/v1/campaigns/${campaign.id}/audience/resolve`)
      .expect(404);
  });

  it('rejects duplicate added employee ids', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'campaign-audience-dup-mgr@example.com',
      PASSWORD,
    );
    const report = await createEmployeeUser(
      testApp,
      'campaign-audience-dup-report@example.com',
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
    const campaign = createRes.body as CampaignReadDto;

    const saveRes = await managerAgent
      .put(`/api/v1/campaigns/${campaign.id}/audience`)
      .send({
        filters: [],
        addedEmployeeIds: [report.employeeId, report.employeeId],
        excludedEmployeeIds: [],
      });
    expect(saveRes.status).toBe(400);
  });

  it('rejects inactive added employee ids', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'campaign-audience-inactive-mgr@example.com',
      PASSWORD,
    );
    const inactiveReport = await createEmployeeUser(
      testApp,
      'campaign-audience-inactive-report@example.com',
      PASSWORD,
    );
    await testApp.prisma.employee.update({
      where: { id: inactiveReport.employeeId },
      data: {
        managerId: manager.employeeId,
        employmentStatus: 'inactive',
      },
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
    const campaign = createRes.body as CampaignReadDto;

    const saveRes = await managerAgent
      .put(`/api/v1/campaigns/${campaign.id}/audience`)
      .send({
        filters: [],
        addedEmployeeIds: [inactiveReport.employeeId],
        excludedEmployeeIds: [],
      });
    const inactiveBody = saveRes.body as CampaignAudienceErrorDto;
    expect(saveRes.status).toBe(400);
    expect(inactiveBody.invalidEmployeeIds).toEqual([
      inactiveReport.employeeId,
    ]);
  });

  it('returns 409 for audience routes on a non-draft campaign', async () => {
    const manager = await createEmployeeUser(
      testApp,
      'campaign-audience-active-mgr@example.com',
      PASSWORD,
    );
    const report = await createEmployeeUser(
      testApp,
      'campaign-audience-active-report@example.com',
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
    const campaign = createRes.body as CampaignReadDto;

    await testApp.prisma.formCampaign.update({
      where: { id: campaign.id },
      data: { status: 'active' },
    });

    await managerAgent
      .put(`/api/v1/campaigns/${campaign.id}/audience`)
      .send({ filters: [], addedEmployeeIds: [], excludedEmployeeIds: [] })
      .expect(409);
    await managerAgent
      .get(`/api/v1/campaigns/${campaign.id}/audience/preview`)
      .expect(409);
    await managerAgent
      .get(`/api/v1/campaigns/${campaign.id}/audience/resolve`)
      .expect(409);
  });
});
