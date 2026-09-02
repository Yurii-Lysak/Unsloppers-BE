import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { LeavesSyncService } from '../src/modules/integrations/leaves-sync.service';
import { createTestApp, TestApp } from './support/app-harness';
import {
  BOOTCAMP_COLLEAGUE_EMAIL,
  BOOTCAMP_E2E_PASSWORD,
  seedBootcampWhitelistGraph,
} from './support/bootcamp-seed';

const NO_EMPLOYEE_EMAIL = 'whitelist-no-employee@altexsoft.com';
const UNKNOWN_EMPLOYEE_ID = '00000000-0000-0000-0000-000000000001';

const REPORTING_LINE_SECTION_KEYS = [
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  'S6',
  'S7',
  'S8',
  'S9',
  'S10',
  'S11',
  'S12',
  'S13',
  'S14',
  'S15',
  'S16',
];

describe('Colleague whitelist enforcement (e2e)', () => {
  let testApp: TestApp;
  let managerAgent: ReturnType<typeof request.agent>;
  let colleagueAgent: ReturnType<typeof request.agent>;
  let reportEmployeeId: string;
  let colleagueUserId: string;
  let colleagueEmployeeId: string;
  let managementFieldId: string;

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

    const seeded = await seedBootcampWhitelistGraph(testApp.prisma);
    reportEmployeeId = seeded.reportEmployeeId;
    colleagueUserId = seeded.colleagueUserId;
    colleagueEmployeeId = seeded.colleagueEmployeeId;

    await testApp.prisma.user.create({
      data: {
        email: NO_EMPLOYEE_EMAIL,
        passwordHash: await hash(BOOTCAMP_E2E_PASSWORD, 12),
      },
    });

    managerAgent = await loginAgent(testApp, seeded.managerEmail);
    colleagueAgent = await loginAgent(testApp, BOOTCAMP_COLLEAGUE_EMAIL);

    const managementField = await testApp.prisma.customFieldDefinition.create({
      data: {
        name: 'Management only field',
        type: 'text',
        visibility: 'management',
      },
    });
    managementFieldId = managementField.id;
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('returns 401 for unauthenticated profile reads', async () => {
    await request(testApp.server)
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(401);
  });

  it('returns 401 for unauthenticated leaves reads', async () => {
    await request(testApp.server)
      .get(`/api/v1/employees/${reportEmployeeId}/leaves`)
      .expect(401);
  });

  it('returns 401 for unauthenticated timeline reads', async () => {
    await request(testApp.server)
      .get(`/api/v1/employees/${reportEmployeeId}/timeline`)
      .expect(401);
  });

  it('returns 401 for unauthenticated custom-field value reads', async () => {
    await request(testApp.server)
      .get(`/api/v1/custom-fields/values/${reportEmployeeId}`)
      .expect(401);
  });

  it('returns Colleague-trimmed profile section keys', async () => {
    const res = await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const body = res.body as {
      audience: { role: string };
      sections: Record<string, unknown>;
    };
    expect(body.audience.role).toBe('Colleague');
    // S16 is now a documented CAP-2 exception (Story 1.10): the section is
    // present, but per-field visibility still hides the management-tier
    // field defined in this suite (see the empty-fields assertion below).
    expect(Object.keys(body.sections).sort()).toEqual([
      'S1',
      'S10',
      'S11',
      'S16',
    ]);
  });

  it('masks leave type on the parallel leaves route for colleagues', async () => {
    const res = await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/leaves`)
      .expect(200);

    const body = res.body as {
      leaves: Array<{ type: string | null; approvalState: string | null }>;
    };
    expect(body.leaves[0]?.type).toBeNull();
    expect(body.leaves[0]?.approvalState).toBeNull();
  });

  it('returns full leave payloads for managers on the leaves route', async () => {
    const res = await managerAgent
      .get(`/api/v1/employees/${reportEmployeeId}/leaves`)
      .expect(200);

    const body = res.body as {
      leaves: Array<{ type: string | null }>;
    };
    expect(body.leaves[0]?.type).toBe('vacation');
  });

  it('allows self leaves with dates on the parallel route', async () => {
    const res = await colleagueAgent
      .get(`/api/v1/employees/${colleagueEmployeeId}/leaves`)
      .expect(200);

    expect(res.body).toHaveProperty('leaves');
  });

  it('returns 404 for unknown employees on the leaves route', async () => {
    await colleagueAgent
      .get(`/api/v1/employees/${UNKNOWN_EMPLOYEE_ID}/leaves`)
      .expect(404);
  });

  it('denies colleague timeline reads with 403', async () => {
    await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/timeline`)
      .expect(403);
  });

  it('allows self timeline reads', async () => {
    await colleagueAgent
      .get(`/api/v1/employees/${colleagueEmployeeId}/timeline`)
      .expect(200);
  });

  it('returns 404 for unknown employees on the timeline route', async () => {
    await colleagueAgent
      .get(`/api/v1/employees/${UNKNOWN_EMPLOYEE_ID}/timeline`)
      .expect(404);
  });

  it('passes the S16 gate for colleague custom field value reads but returns no management-tier values (Story 1.10)', async () => {
    const res = await colleagueAgent
      .get(`/api/v1/custom-fields/values/${reportEmployeeId}`)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('returns 404 for unknown employees on custom field values', async () => {
    await colleagueAgent
      .get(`/api/v1/custom-fields/values/${UNKNOWN_EMPLOYEE_ID}`)
      .expect(404);
  });

  it('denies colleague custom field writes with 403', async () => {
    await colleagueAgent
      .put(
        `/api/v1/custom-fields/${managementFieldId}/values/${reportEmployeeId}`,
      )
      .send({ value: 'blocked' })
      .expect(403);
  });

  it('returns no custom field definitions for colleagues', async () => {
    const res = await colleagueAgent.get('/api/v1/custom-fields').expect(200);
    expect(res.body).toEqual([]);
  });

  it('returns management custom field definitions for managers', async () => {
    const res = await managerAgent.get('/api/v1/custom-fields').expect(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Management only field' }),
      ]),
    );
  });

  it('denies user directory listing with 403', async () => {
    await colleagueAgent.get('/api/v1/users').expect(403);
  });

  it('allows self user reads only', async () => {
    await colleagueAgent.get(`/api/v1/users/${colleagueUserId}`).expect(200);
    await colleagueAgent.get(`/api/v1/users/${randomUUID()}`).expect(403);
  });

  it('returns S1-safe directory list entries', async () => {
    const res = await colleagueAgent.get('/api/v1/employees').expect(200);
    const rows = res.body as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['displayName', 'id']);
    }
  });

  it('returns S1-safe directory detail entries', async () => {
    const res = await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}`)
      .expect(200);

    expect(Object.keys(res.body as Record<string, unknown>).sort()).toEqual([
      'displayName',
      'id',
    ]);
  });

  it('returns 404 for unknown employees on directory detail', async () => {
    await colleagueAgent
      .get(`/api/v1/employees/${UNKNOWN_EMPLOYEE_ID}`)
      .expect(404);
  });

  it('returns 400 for malformed UUIDs on gated routes', async () => {
    await colleagueAgent.get('/api/v1/employees/not-a-uuid/leaves').expect(400);
    await colleagueAgent
      .get('/api/v1/employees/not-a-uuid/timeline')
      .expect(400);
    await colleagueAgent
      .get('/api/v1/custom-fields/values/not-a-uuid')
      .expect(400);
    await colleagueAgent.get('/api/v1/employees/not-a-uuid').expect(400);
  });

  it('returns 403 when the authenticated user has no employee record on leaves', async () => {
    const agent = await loginAgent(testApp, NO_EMPLOYEE_EMAIL);
    await agent.get(`/api/v1/employees/${reportEmployeeId}/leaves`).expect(403);
  });

  it('returns 403 when the authenticated user has no employee record on profile', async () => {
    const agent = await loginAgent(testApp, NO_EMPLOYEE_EMAIL);
    await agent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(403);
  });

  it('returns 403 when the authenticated user has no employee record on timeline', async () => {
    const agent = await loginAgent(testApp, NO_EMPLOYEE_EMAIL);
    await agent
      .get(`/api/v1/employees/${reportEmployeeId}/timeline`)
      .expect(403);
  });

  it('returns 403 when the authenticated user has no employee record on custom fields', async () => {
    const agent = await loginAgent(testApp, NO_EMPLOYEE_EMAIL);
    await agent.get('/api/v1/custom-fields').expect(403);
    await agent
      .get(`/api/v1/custom-fields/values/${reportEmployeeId}`)
      .expect(403);
  });

  it('keeps manager profile section keys unchanged', async () => {
    const res = await managerAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const body = res.body as {
      audience: { role: string };
      sections: Record<string, unknown>;
    };
    expect(body.audience.role).toBe('ReportingLine');
    expect(new Set(Object.keys(body.sections))).toEqual(
      new Set(REPORTING_LINE_SECTION_KEYS),
    );
  });

  it('allows manager timeline reads', async () => {
    await managerAgent
      .get(`/api/v1/employees/${reportEmployeeId}/timeline`)
      .expect(200);
  });
});

const loginAgent = async (testApp: TestApp, email: string) => {
  const agent = request.agent(testApp.server);
  await agent
    .post('/api/v1/auth/login')
    .send({ email, password: BOOTCAMP_E2E_PASSWORD })
    .expect(200);
  return agent;
};
