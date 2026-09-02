import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { createTestApp, TestApp } from './support/app-harness';

const PASSWORD = 'test-only-shared-links-password';
const MANAGER_EMAIL = 'shared-link-manager@example.com';
const REPORT_EMAIL = 'shared-link-report@example.com';
const DM_EMAIL = 'shared-link-dm@example.com';
const PP_EMAIL = 'shared-link-pp@example.com';
const COLLEAGUE_EMAIL = 'shared-link-colleague@example.com';

describe('Shared links (e2e)', () => {
  let testApp: TestApp;
  let managerAgent: ReturnType<typeof request.agent>;
  let dmAgent: ReturnType<typeof request.agent>;
  let ppAgent: ReturnType<typeof request.agent>;
  let colleagueAgent: ReturnType<typeof request.agent>;
  let reportEmployeeId: string;
  let dmEmployeeId: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    const seeded = await seedGraph(testApp);
    reportEmployeeId = seeded.reportEmployeeId;
    dmEmployeeId = seeded.dmEmployeeId;
    managerAgent = await loginAgent(testApp, MANAGER_EMAIL);
    dmAgent = await loginAgent(testApp, DM_EMAIL);
    ppAgent = await loginAgent(testApp, PP_EMAIL);
    colleagueAgent = await loginAgent(testApp, COLLEAGUE_EMAIL);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('POST create rejects never sections including S7 and S14', async () => {
    await managerAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({ recipientEmployeeId: dmEmployeeId, sections: ['S7'] })
      .expect(400);

    await managerAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({ recipientEmployeeId: dmEmployeeId, sections: ['S14'] })
      .expect(400);
  });

  it('manager creates S1+S9 link and recipient consumes only those sections', async () => {
    const createRes = await managerAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({ recipientEmployeeId: dmEmployeeId, sections: ['S9'] })
      .expect(201);

    const { token } = createRes.body as { token: string; url: string };
    expect(token).toHaveLength(43);

    const profileRes = await dmAgent
      .get(`/api/v1/shared-links/${token}/profile`)
      .expect(200);

    const body = profileRes.body as {
      audience: { role: string; sections: Record<string, string> };
      sections: Record<string, { accessLevel: string }>;
    };

    expect(body.audience.role).toBe('SharedLink');
    expect(Object.keys(body.sections).sort()).toEqual(['S1', 'S9']);
    for (const section of Object.values(body.sections)) {
      expect(section.accessLevel).toBe('R');
    }
    expect(body.audience.sections.S2).toBe('none');
  });

  it('PP creator can create and recipient can consume', async () => {
    const createRes = await ppAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({ recipientEmployeeId: dmEmployeeId })
      .expect(201);

    const { token } = createRes.body as { token: string };
    await dmAgent.get(`/api/v1/shared-links/${token}/profile`).expect(200);
  });

  it('wrong recipient receives 403', async () => {
    const createRes = await managerAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({ recipientEmployeeId: dmEmployeeId })
      .expect(201);

    const { token } = createRes.body as { token: string };
    await colleagueAgent
      .get(`/api/v1/shared-links/${token}/profile`)
      .expect(403);
  });

  it('GET consume without session returns 401', async () => {
    const createRes = await managerAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({ recipientEmployeeId: dmEmployeeId })
      .expect(201);

    const { token } = createRes.body as { token: string };
    await request(testApp.server)
      .get(`/api/v1/shared-links/${token}/profile`)
      .expect(401);
  });

  it('unknown token returns 404', async () => {
    const token = randomBytes(32).toString('base64url');
    await dmAgent.get(`/api/v1/shared-links/${token}/profile`).expect(404);
  });

  it('malformed token returns 400', async () => {
    await dmAgent.get('/api/v1/shared-links/not-valid/profile').expect(400);
  });

  it('colleague cannot create a link', async () => {
    await colleagueAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({ recipientEmployeeId: dmEmployeeId })
      .expect(403);
  });

  it('expired link returns uniform 404 and journals denied access', async () => {
    const createRes = await managerAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({ recipientEmployeeId: dmEmployeeId })
      .expect(201);

    const { token } = createRes.body as { token: string };
    const link = await testApp.prisma.sharedLink.findUnique({
      where: { token },
    });
    expect(link).not.toBeNull();

    await testApp.prisma.sharedLink.update({
      where: { id: link!.id },
      data: { expiresAt: new Date('2020-01-01T00:00:00.000Z') },
    });

    await dmAgent.get(`/api/v1/shared-links/${token}/profile`).expect(404);

    const journal = await testApp.prisma.relationshipJournalEntry.findMany({
      where: {
        subjectEmployeeId: reportEmployeeId,
        kind: 'shared_link_access',
      },
    });
    expect(journal.length).toBeGreaterThanOrEqual(1);
    expect(journal[0]?.after).toEqual(
      expect.objectContaining({
        outcome: 'denied',
        denialReason: 'expired',
      }),
    );
  });

  it('revoked link returns uniform 404', async () => {
    const createRes = await managerAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({ recipientEmployeeId: dmEmployeeId })
      .expect(201);

    const { token } = createRes.body as { token: string };
    const link = await testApp.prisma.sharedLink.findUnique({
      where: { token },
    });

    await managerAgent
      .post(
        `/api/v1/employees/${reportEmployeeId}/shared-links/${link!.id}/revoke`,
      )
      .expect(200);

    await dmAgent.get(`/api/v1/shared-links/${token}/profile`).expect(404);
  });

  it('manager can list active links and revoke', async () => {
    const createRes = await managerAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({ recipientEmployeeId: dmEmployeeId, sections: ['S9'] })
      .expect(201);

    const { token } = createRes.body as { token: string };

    const listRes = await managerAgent
      .get(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .expect(200);

    const listBody = listRes.body as {
      links: Array<{ id: string; sectionIds: string[] }>;
    };
    expect(listBody.links.length).toBeGreaterThanOrEqual(1);
    const linkId = listBody.links.find((row) =>
      row.sectionIds.includes('S9'),
    )!.id;

    await managerAgent
      .post(
        `/api/v1/employees/${reportEmployeeId}/shared-links/${linkId}/revoke`,
      )
      .expect(200)
      .expect({ revoked: true });

    const logRes = await managerAgent
      .get(
        `/api/v1/employees/${reportEmployeeId}/shared-links/${linkId}/access-log`,
      )
      .expect(200);

    const logBody = logRes.body as {
      entries: Array<{ outcome: string; denialReason?: string }>;
    };
    expect(logBody.entries.length).toBeGreaterThanOrEqual(1);
    expect(logBody.entries[0]?.outcome).toBeDefined();

    await dmAgent.get(`/api/v1/shared-links/${token}/profile`).expect(404);
  });

  it('wrong recipient on expired link returns 404 not 403', async () => {
    const createRes = await managerAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({ recipientEmployeeId: dmEmployeeId })
      .expect(201);

    const { token } = createRes.body as { token: string };
    const link = await testApp.prisma.sharedLink.findUnique({
      where: { token },
    });

    await testApp.prisma.sharedLink.update({
      where: { id: link!.id },
      data: { expiresAt: new Date('2020-01-01T00:00:00.000Z') },
    });

    await colleagueAgent
      .get(`/api/v1/shared-links/${token}/profile`)
      .expect(404);
  });

  it('colleague cannot list or revoke links', async () => {
    await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .expect(403);

    const createRes = await managerAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({ recipientEmployeeId: dmEmployeeId })
      .expect(201);
    const link = await testApp.prisma.sharedLink.findUnique({
      where: { token: (createRes.body as { token: string }).token },
    });

    await colleagueAgent
      .post(
        `/api/v1/employees/${reportEmployeeId}/shared-links/${link!.id}/revoke`,
      )
      .expect(403);
  });

  it('full-access holder can list and revoke without reporting-line access', async () => {
    const passwordHash = await hash(PASSWORD, 12);
    const faUser = await testApp.prisma.user.create({
      data: { email: 'shared-link-fa@example.com', passwordHash },
    });
    const faEmployee = await testApp.prisma.employee.create({
      data: { userId: faUser.id },
    });
    await testApp.prisma.fullAccessGrant.create({
      data: { employeeId: faEmployee.id },
    });
    const faAgent = await loginAgent(testApp, 'shared-link-fa@example.com');

    const createRes = await managerAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({ recipientEmployeeId: dmEmployeeId, sections: ['S9'] })
      .expect(201);
    const link = await testApp.prisma.sharedLink.findUnique({
      where: { token: (createRes.body as { token: string }).token },
    });

    await faAgent
      .get(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .expect(200);

    await faAgent
      .post(
        `/api/v1/employees/${reportEmployeeId}/shared-links/${link!.id}/revoke`,
      )
      .expect(200);
  });

  it('wrong recipient journals denied/wrong_recipient', async () => {
    const createRes = await managerAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({ recipientEmployeeId: dmEmployeeId })
      .expect(201);

    const { token } = createRes.body as { token: string };
    await colleagueAgent
      .get(`/api/v1/shared-links/${token}/profile`)
      .expect(403);

    const journal = await testApp.prisma.relationshipJournalEntry.findMany({
      where: {
        subjectEmployeeId: reportEmployeeId,
        kind: 'shared_link_access',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(journal[0]?.after).toEqual(
      expect.objectContaining({
        outcome: 'denied',
        denialReason: 'wrong_recipient',
      }),
    );
  });

  it('revoked link journals denied/revoked on consume', async () => {
    const createRes = await managerAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({ recipientEmployeeId: dmEmployeeId })
      .expect(201);

    const { token } = createRes.body as { token: string };
    const link = await testApp.prisma.sharedLink.findUnique({
      where: { token },
    });

    await managerAgent
      .post(
        `/api/v1/employees/${reportEmployeeId}/shared-links/${link!.id}/revoke`,
      )
      .expect(200);

    await dmAgent.get(`/api/v1/shared-links/${token}/profile`).expect(404);

    const journal = await testApp.prisma.relationshipJournalEntry.findMany({
      where: {
        subjectEmployeeId: reportEmployeeId,
        kind: 'shared_link_access',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(journal[0]?.after).toEqual(
      expect.objectContaining({
        outcome: 'denied',
        denialReason: 'revoked',
      }),
    );
  });

  it('rejects invalid expiresInHours at create', async () => {
    await managerAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({ recipientEmployeeId: dmEmployeeId, expiresInHours: 0 })
      .expect(400);

    await managerAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({ recipientEmployeeId: dmEmployeeId, expiresInHours: '48' })
      .expect(400);
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

const seedGraph = async (testApp: TestApp) => {
  const passwordHash = await hash(PASSWORD, 12);

  const managerUser = await testApp.prisma.user.create({
    data: { email: MANAGER_EMAIL, passwordHash },
  });
  const dmUser = await testApp.prisma.user.create({
    data: { email: DM_EMAIL, passwordHash },
  });
  const ppUser = await testApp.prisma.user.create({
    data: { email: PP_EMAIL, passwordHash },
  });
  const reportUser = await testApp.prisma.user.create({
    data: { email: REPORT_EMAIL, passwordHash },
  });
  const colleagueUser = await testApp.prisma.user.create({
    data: { email: COLLEAGUE_EMAIL, passwordHash },
  });

  const managerEmployee = await testApp.prisma.employee.create({
    data: { userId: managerUser.id },
  });
  const dmEmployee = await testApp.prisma.employee.create({
    data: { userId: dmUser.id },
  });
  const ppEmployee = await testApp.prisma.employee.create({
    data: { userId: ppUser.id },
  });
  const reportEmployee = await testApp.prisma.employee.create({
    data: {
      userId: reportUser.id,
      managerId: managerEmployee.id,
      peoplePartnerId: ppEmployee.id,
    },
  });
  await testApp.prisma.employee.create({
    data: { userId: colleagueUser.id },
  });

  return {
    reportEmployeeId: reportEmployee.id,
    dmEmployeeId: dmEmployee.id,
    managerEmployeeId: managerEmployee.id,
  };
};
