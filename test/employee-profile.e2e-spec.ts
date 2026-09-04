import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  BUILT_IN_ROLE_NAMES,
  PERMISSION_KEYS,
} from '../src/modules/contracts/permission-keys';
import { LeavesSyncService } from '../src/modules/integrations/leaves-sync.service';
import { ActiveMentorLookup } from '../src/modules/contracts/active-mentor-lookup.contract';
import { createTestApp, TestApp } from './support/app-harness';

const PASSWORD = 'test-only-employee-profile-password';
const MANAGER_EMAIL = 'profile-manager@example.com';
const REPORT_EMAIL = 'profile-report@example.com';
const COLLEAGUE_EMAIL = 'profile-colleague@example.com';
const HR_ADMIN_EMAIL = 'profile-hr-admin@example.com';
const NO_EMPLOYEE_EMAIL = 'profile-no-employee@example.com';
const MENTOR_EMAIL = 'profile-mentor@example.com';
const DM_EMAIL = 'profile-dm@example.com';
const PP_EMAIL = 'profile-pp@example.com';

describe('Employee profile assembly (e2e)', () => {
  let testApp: TestApp;
  let managerAgent: ReturnType<typeof request.agent>;
  let colleagueAgent: ReturnType<typeof request.agent>;
  let reportAgent: ReturnType<typeof request.agent>;
  let dmAgent: ReturnType<typeof request.agent>;
  let ppAgent: ReturnType<typeof request.agent>;
  let reportEmployeeId: string;
  let mentorEmployeeId: string;
  let managerEmployeeId: string;

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
    const seeded = await seedProfileGraph(testApp);
    reportEmployeeId = seeded.reportEmployeeId;
    mentorEmployeeId = seeded.mentorEmployeeId;
    managerEmployeeId = seeded.managerEmployeeId;
    managerAgent = await loginAgent(testApp, MANAGER_EMAIL);
    colleagueAgent = await loginAgent(testApp, COLLEAGUE_EMAIL);
    reportAgent = await loginAgent(testApp, REPORT_EMAIL);
    dmAgent = await loginAgent(testApp, DM_EMAIL);
    ppAgent = await loginAgent(testApp, PP_EMAIL);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('GET /employees/:id/profile without session returns 401', () => {
    return request(testApp.server)
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(401);
  });

  it('returns 403 when the authenticated user has no employee record', async () => {
    const agent = await loginAgent(testApp, NO_EMPLOYEE_EMAIL);
    await agent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(403);
  });

  it('returns 400 for malformed employee UUIDs', async () => {
    await colleagueAgent
      .get('/api/v1/employees/not-a-uuid/profile')
      .expect(400);
  });

  it('returns 404 for unknown employee UUIDs', async () => {
    await colleagueAgent
      .get(`/api/v1/employees/${randomUUID()}/profile`)
      .expect(404);
  });

  it('returns Colleague-trimmed section keys for unrelated viewers', async () => {
    const res = await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const body = res.body as {
      displayName: string;
      audience: { role: string; sections: Record<string, string> };
      sections: Record<string, unknown>;
    };

    expect(body.displayName).toBeTruthy();
    expect(body.audience.role).toBe('Colleague');
    // S16 is a documented CAP-2 exception (Story 1.10): the section renders
    // (empty here — no custom fields exist in this fixture), never
    // 'unavailable', per ProfileAssemblerService.isUnavailablePayload.
    expect(Object.keys(body.sections).sort()).toEqual([
      'S1',
      'S10',
      'S11',
      'S16',
    ]);
  });

  it('masks S10 leave type for Colleague viewers on the profile endpoint', async () => {
    const res = await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const s10 = (
      res.body as {
        sections: {
          S10?: {
            data?: {
              leaves?: Array<{
                type: string | null;
                approvalState: string | null;
              }>;
              availability?: string;
            };
          };
        };
      }
    ).sections.S10;

    expect(s10).toBeDefined();
    expect(s10).toHaveProperty('data');
    expect(s10?.data).not.toHaveProperty('availability');
    expect(s10?.data?.leaves?.[0]?.type).toBeNull();
    expect(s10?.data?.leaves?.[0]?.approvalState).toBeNull();
  });

  it('returns ReportingLine-granted sections for a direct manager', async () => {
    const res = await managerAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const body = res.body as {
      audience: { role: string };
      sections: Record<string, { accessLevel?: string; status?: string }>;
    };

    expect(body.audience.role).toBe('ReportingLine');
    expect(body.sections.S1).toBeDefined();
    const s6 = body.sections.S6 as
      | { accessLevel?: string; status?: string; data?: { records: unknown[] } }
      | undefined;
    expect(s6?.accessLevel).toBe('RW');
    expect(s6).toHaveProperty('data');
    expect(s6?.data?.records).toEqual([]);
  });

  it('includes mentor in S1 for ReportingLine viewers when an active pair exists', async () => {
    const res = await managerAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const s1 = (
      res.body as {
        sections: {
          S1?: {
            data?: {
              mentor?: { id: string; displayName: string };
            };
          };
        };
      }
    ).sections.S1;

    expect(s1?.data?.mentor).toEqual({
      id: mentorEmployeeId,
      displayName: MENTOR_EMAIL,
    });
  });

  it('omits mentor in S1 for Colleague viewers even when an active pair exists', async () => {
    const res = await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const s1 = (
      res.body as {
        sections: {
          S1?: { data?: Record<string, unknown> };
        };
      }
    ).sections.S1;

    expect(s1?.data).toBeDefined();
    expect(s1?.data).not.toHaveProperty('mentor');
  });

  it('omits mentor in S1 for Self viewers (D5 allow-list)', async () => {
    const res = await reportAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const s1 = (
      res.body as {
        sections: {
          S1?: { data?: Record<string, unknown> };
        };
      }
    ).sections.S1;

    expect(s1?.data).toBeDefined();
    expect(s1?.data).not.toHaveProperty('mentor');
  });

  it('omits S6 and S15 from Self own-profile (denied matrix cells)', async () => {
    const res = await reportAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const sections = (res.body as { sections?: Record<string, unknown> })
      .sections;
    expect(sections ?? {}).not.toHaveProperty('S6');
    expect(sections ?? {}).not.toHaveProperty('S15');
  });

  it('includes mentor in S1 for ProjectLine viewers', async () => {
    const res = await dmAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const body = res.body as {
      audience: { role: string };
      sections: {
        S1?: { data?: { mentor?: { id: string } } };
      };
    };

    expect(body.audience.role).toBe('ProjectLine');
    expect(body.sections.S1?.data?.mentor?.id).toBe(mentorEmployeeId);
  });

  it('reflects mentorship pair changes on the next profile response', async () => {
    const before = await managerAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    await testApp.prisma.mentorshipPair.updateMany({
      where: { menteeId: reportEmployeeId, endedAt: null },
      data: { endedAt: new Date() },
    });

    const afterEnd = await managerAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const beforeMentor = (
      before.body as {
        sections: { S1?: { data?: Record<string, unknown> } };
      }
    ).sections.S1?.data;
    const afterMentor = (
      afterEnd.body as {
        sections: { S1?: { data?: Record<string, unknown> } };
      }
    ).sections.S1?.data;

    expect(beforeMentor).toHaveProperty('mentor');
    expect(afterMentor).not.toHaveProperty('mentor');

    await testApp.prisma.mentorshipPair.create({
      data: {
        mentorId: mentorEmployeeId,
        menteeId: reportEmployeeId,
      },
    });

    const afterRecreate = await managerAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    expect(
      (
        afterRecreate.body as {
          sections: { S1?: { data?: { mentor?: { id: string } } } };
        }
      ).sections.S1?.data?.mentor?.id,
    ).toBe(mentorEmployeeId);
  });

  it('includes mentor in S1 for PP viewers when an active pair exists', async () => {
    const res = await ppAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const body = res.body as {
      audience: { role: string };
      sections: {
        S1?: { data?: { mentor?: { id: string } } };
      };
    };

    expect(body.audience.role).toBe('PP');
    expect(body.sections.S1?.data?.mentor?.id).toBe(mentorEmployeeId);
  });

  it('still returns S1 data when mentor lookup fails', async () => {
    const failingApp = await createTestApp({
      providerOverrides: [
        {
          provide: ActiveMentorLookup,
          useValue: {
            getActiveMentorForMentee: jest
              .fn()
              .mockRejectedValue(new Error('lookup unavailable')),
          },
        },
        {
          provide: LeavesSyncService,
          useValue: {
            getLeavesForEmployee: jest.fn().mockResolvedValue({
              availability: 'ok',
              leaves: [],
            }),
            getManageLeaveUrl: jest.fn().mockReturnValue(null),
          },
        },
      ],
    });

    try {
      const seeded = await seedProfileGraph(failingApp);
      const agent = await loginAgent(failingApp, MANAGER_EMAIL);

      const res = await agent
        .get(`/api/v1/employees/${seeded.reportEmployeeId}/profile`)
        .expect(200);

      const s1 = (
        res.body as {
          sections: {
            S1?: { data?: Record<string, unknown>; status?: string };
          };
        }
      ).sections.S1;

      expect(s1).toHaveProperty('data');
      expect(s1?.status).toBeUndefined();
      expect(s1?.data).not.toHaveProperty('mentor');
      expect(s1?.data).toHaveProperty('manager');
    } finally {
      await failingApp.close();
    }
  });

  it('reflects manager reassignment on the next profile response', async () => {
    const before = await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    expect(
      (
        before.body as {
          sections: { S1?: { data?: { manager?: { id: string } } } };
        }
      ).sections.S1?.data?.manager?.id,
    ).toBe(managerEmployeeId);

    await testApp.prisma.employee.update({
      where: { id: reportEmployeeId },
      data: { managerId: mentorEmployeeId },
    });

    const after = await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    expect(
      (
        after.body as {
          sections: { S1?: { data?: { manager?: { id: string } } } };
        }
      ).sections.S1?.data?.manager?.id,
    ).toBe(mentorEmployeeId);
  });

  it('reflects people partner reassignment on the next profile response', async () => {
    const ppUser = await testApp.prisma.user.findUniqueOrThrow({
      where: { email: PP_EMAIL },
    });
    const ppEmployee = await testApp.prisma.employee.findUniqueOrThrow({
      where: { userId: ppUser.id },
    });

    const before = await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    expect(
      (
        before.body as {
          sections: {
            S1?: { data?: { peoplePartner?: { id: string } | null } };
          };
        }
      ).sections.S1?.data?.peoplePartner?.id,
    ).toBe(ppEmployee.id);

    await testApp.prisma.employee.update({
      where: { id: reportEmployeeId },
      data: { peoplePartnerId: mentorEmployeeId },
    });

    const after = await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    expect(
      (
        after.body as {
          sections: {
            S1?: { data?: { peoplePartner?: { id: string } | null } };
          };
        }
      ).sections.S1?.data?.peoplePartner?.id,
    ).toBe(mentorEmployeeId);
  });

  it('keeps assembled profile sections unchanged after a C8 role assignment', async () => {
    const before = await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const campaignRole = await testApp.prisma.functionalRole.create({
      data: {
        name: 'Profile Campaign Sender',
        isBuiltIn: false,
        permissions: {
          create: [{ permissionKey: PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS }],
        },
      },
    });

    const hrRole = await testApp.prisma.functionalRole.create({
      data: {
        name: BUILT_IN_ROLE_NAMES.HR_ADMIN,
        isBuiltIn: true,
        permissions: {
          create: [{ permissionKey: PERMISSION_KEYS.MANAGE_FUNCTIONAL_ROLES }],
        },
      },
    });

    const hrUser = await testApp.prisma.user.findUniqueOrThrow({
      where: { email: HR_ADMIN_EMAIL },
    });
    const hrEmployee = await testApp.prisma.employee.findUniqueOrThrow({
      where: { userId: hrUser.id },
    });
    await testApp.prisma.functionalRoleAssignment.create({
      data: { employeeId: hrEmployee.id, roleId: hrRole.id },
    });

    const colleagueUser = await testApp.prisma.user.findUniqueOrThrow({
      where: { email: COLLEAGUE_EMAIL },
    });
    const colleagueEmployee = await testApp.prisma.employee.findUniqueOrThrow({
      where: { userId: colleagueUser.id },
    });

    const hrAgent = await loginAgent(testApp, HR_ADMIN_EMAIL);
    await hrAgent
      .put(`/api/v1/employees/${colleagueEmployee.id}/functional-roles`)
      .send({ roleIds: [campaignRole.id] })
      .expect(200);

    const permissions = await colleagueAgent
      .get('/api/v1/permissions/me')
      .expect(200);
    expect(
      (permissions.body as { permissions: string[] }).permissions,
    ).toContain(PERMISSION_KEYS.CREATE_FORM_CAMPAIGNS);

    const after = await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    expect(after.body).toEqual(before.body);
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

const seedProfileGraph = async (testApp: TestApp) => {
  const passwordHash = await hash(PASSWORD, 12);

  const managerUser = await testApp.prisma.user.create({
    data: { email: MANAGER_EMAIL, passwordHash },
  });
  const mentorUser = await testApp.prisma.user.create({
    data: { email: MENTOR_EMAIL, passwordHash },
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
  await testApp.prisma.user.create({
    data: { email: NO_EMPLOYEE_EMAIL, passwordHash },
  });
  await testApp.prisma.user.create({
    data: {
      email: HR_ADMIN_EMAIL,
      passwordHash,
      employee: { create: {} },
    },
  });

  const managerEmployee = await testApp.prisma.employee.create({
    data: { userId: managerUser.id },
  });
  const mentorEmployee = await testApp.prisma.employee.create({
    data: { userId: mentorUser.id },
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
  await testApp.prisma.mentorshipPair.create({
    data: {
      mentorId: mentorEmployee.id,
      menteeId: reportEmployee.id,
    },
  });
  await testApp.prisma.projectAssignment.create({
    data: {
      employeeId: reportEmployee.id,
      projectId: 'profile-project',
      pmId: managerEmployee.id,
      dmId: dmEmployee.id,
      startDate: new Date('2026-01-01'),
      confirmed: true,
      confirmedAt: new Date(),
    },
  });
  await testApp.prisma.employee.create({
    data: { userId: colleagueUser.id },
  });

  return {
    reportEmployeeId: reportEmployee.id,
    mentorEmployeeId: mentorEmployee.id,
    managerEmployeeId: managerEmployee.id,
  };
};
