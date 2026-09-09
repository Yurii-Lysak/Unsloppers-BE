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

  it('returns S12 with matrix link and assessments for ReportingLine viewers', async () => {
    const res = await managerAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const s12 = (
      res.body as {
        sections: {
          S12?: {
            accessLevel: string;
            data: {
              matrixLink: string | null;
              assessments: Array<{
                date: string;
                assessor: string;
                resultLink: string;
                conclusion: string;
              }>;
            };
          };
        };
      }
    ).sections.S12;

    expect(s12?.accessLevel).toBe('RW');
    expect(s12?.data.matrixLink).toBe(
      'https://skills-matrix.bootcamp.example/files/engineering/software-engineer',
    );
    expect(s12?.data.assessments).toHaveLength(1);
    expect(s12?.data.assessments[0]).toMatchObject({
      date: '2026-06-15',
      assessor: 'Profile Assessment Manager',
      resultLink:
        'https://skills-matrix.bootcamp.example/assessments/profile-demo',
      conclusion: 'Completed skills assessment with agreed development goals.',
    });
  });

  it('omits S12 from Colleague viewers', async () => {
    const res = await colleagueAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    expect(
      (res.body as { sections?: Record<string, unknown> }).sections ?? {},
    ).not.toHaveProperty('S12');
  });

  it('returns read-only S12 for Self viewers', async () => {
    const res = await reportAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const s12 = (
      res.body as {
        sections: {
          S12?: { accessLevel: string; data: { assessments: unknown[] } };
        };
      }
    ).sections.S12;

    expect(s12?.accessLevel).toBe('R');
    expect(s12?.data.assessments).toHaveLength(1);
  });

  it('returns S12 for ProjectLine and PP viewers', async () => {
    const managerRes = await managerAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);
    const dmRes = await dmAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);
    const ppRes = await ppAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const expectedS12 = (
      managerRes.body as { sections: Record<string, unknown> }
    ).sections.S12;

    expect(
      (dmRes.body as { sections: Record<string, unknown> }).sections.S12,
    ).toEqual(expectedS12);
    expect(
      (ppRes.body as { sections: Record<string, unknown> }).sections.S12,
    ).toEqual(expectedS12);
  });

  it('returns S12 data with null matrixLink when no dictionary entry exists', async () => {
    const report = await testApp.prisma.employee.findUniqueOrThrow({
      where: { id: reportEmployeeId },
      select: { managerId: true },
    });
    const peerUser = await testApp.prisma.user.create({
      data: {
        email: `profile-s12-no-dictionary-${randomUUID()}@example.com`,
        passwordHash: await hash(PASSWORD, 12),
      },
    });
    const peerEmployee = await testApp.prisma.employee.create({
      data: {
        userId: peerUser.id,
        managerId: report.managerId,
      },
    });

    await seedCdsHistory(
      testApp,
      peerEmployee.id,
      'Engineering',
      'Unmapped Position',
    );
    await testApp.prisma.cDSAssessment.create({
      data: {
        employeeId: peerEmployee.id,
        date: new Date('2026-05-01'),
        assessor: 'Profile Assessment Manager',
        resultLink:
          'https://skills-matrix.bootcamp.example/assessments/unmapped-demo',
        conclusion: 'Assessment without a dictionary mapping.',
      },
    });

    const res = await managerAgent
      .get(`/api/v1/employees/${peerEmployee.id}/profile`)
      .expect(200);

    const s12 = (
      res.body as {
        sections: {
          S12?: {
            status?: string;
            data: {
              matrixLink: string | null;
              assessments: unknown[];
            };
          };
        };
      }
    ).sections.S12;

    expect(s12).toBeDefined();
    expect(s12).not.toHaveProperty('status', 'unavailable');
    expect(s12?.data.matrixLink).toBeNull();
    expect(s12?.data.assessments).toHaveLength(1);
  });

  it('returns S12 data with empty assessments when the matrix is mapped', async () => {
    const report = await testApp.prisma.employee.findUniqueOrThrow({
      where: { id: reportEmployeeId },
      select: { managerId: true },
    });
    const peerUser = await testApp.prisma.user.create({
      data: {
        email: `profile-s12-empty-log-${randomUUID()}@example.com`,
        passwordHash: await hash(PASSWORD, 12),
      },
    });
    const peerEmployee = await testApp.prisma.employee.create({
      data: {
        userId: peerUser.id,
        managerId: report.managerId,
      },
    });

    await seedCdsFixture(testApp, peerEmployee.id, {
      includeAssessment: false,
    });

    const res = await managerAgent
      .get(`/api/v1/employees/${peerEmployee.id}/profile`)
      .expect(200);

    const s12 = (
      res.body as {
        sections: {
          S12?: {
            status?: string;
            data: {
              matrixLink: string | null;
              assessments: unknown[];
            };
          };
        };
      }
    ).sections.S12;

    expect(s12).toBeDefined();
    expect(s12).not.toHaveProperty('status', 'unavailable');
    expect(s12?.data.matrixLink).toBe(
      'https://skills-matrix.bootcamp.example/files/engineering/software-engineer',
    );
    expect(s12?.data.assessments).toEqual([]);
  });

  it('reflects skills-matrix dictionary updates on the next profile response', async () => {
    const report = await testApp.prisma.employee.findUniqueOrThrow({
      where: { id: reportEmployeeId },
      select: { managerId: true },
    });
    const peerUser = await testApp.prisma.user.create({
      data: {
        email: `profile-s12-dictionary-peer-${randomUUID()}@example.com`,
        passwordHash: await hash(PASSWORD, 12),
      },
    });
    const peerEmployee = await testApp.prisma.employee.create({
      data: {
        userId: peerUser.id,
        managerId: report.managerId,
      },
    });
    await seedCdsFixture(testApp, peerEmployee.id, {
      includeAssessment: false,
    });

    const department = await testApp.prisma.department.findUniqueOrThrow({
      where: { name: 'Engineering' },
    });
    const entry = await testApp.prisma.skillsMatrixEntry.findUniqueOrThrow({
      where: {
        departmentId_position: {
          departmentId: department.id,
          position: 'Software Engineer',
        },
      },
    });

    const updatedUrl =
      'https://skills-matrix.bootcamp.example/files/engineering/software-engineer-v2';
    await testApp.prisma.skillsMatrixEntry.update({
      where: { id: entry.id },
      data: { fileUrl: updatedUrl },
    });

    const [reportRes, peerRes] = await Promise.all([
      managerAgent
        .get(`/api/v1/employees/${reportEmployeeId}/profile`)
        .expect(200),
      managerAgent
        .get(`/api/v1/employees/${peerEmployee.id}/profile`)
        .expect(200),
    ]);

    expect(
      (
        reportRes.body as {
          sections: { S12?: { data?: { matrixLink?: string | null } } };
        }
      ).sections.S12?.data?.matrixLink,
    ).toBe(updatedUrl);
    expect(
      (
        peerRes.body as {
          sections: { S12?: { data?: { matrixLink?: string | null } } };
        }
      ).sections.S12?.data?.matrixLink,
    ).toBe(updatedUrl);
  });

  it('S12_SHARED_LINK_CFG: shared-link consume returns S12 when enabled', async () => {
    const recipientUser = await testApp.prisma.user.create({
      data: {
        email: `profile-s12-recipient-${randomUUID()}@example.com`,
        passwordHash: await hash(PASSWORD, 12),
      },
    });
    const recipientEmployee = await testApp.prisma.employee.create({
      data: { userId: recipientUser.id },
    });

    const createLinkRes = await managerAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({
        recipientEmployeeId: recipientEmployee.id,
        sections: ['S12'],
      })
      .expect(201);
    const token = (createLinkRes.body as { token: string }).token;

    const recipientAgent = request.agent(testApp.server);
    await recipientAgent
      .post('/api/v1/auth/login')
      .send({ email: recipientUser.email, password: PASSWORD })
      .expect(200);

    const consumeRes = await recipientAgent
      .get(`/api/v1/shared-links/${token}/profile`)
      .expect(200);

    const s12 = (consumeRes.body as { sections: Record<string, unknown> })
      .sections.S12 as {
      data: { matrixLink: string | null; assessments: unknown[] };
    };

    expect(s12.data.matrixLink).toBeTruthy();
    expect(s12.data.assessments).toHaveLength(1);
  });

  it('S12_SHARED_LINK_CFG: a Colleague creator cannot create a shared link with S12 (403)', async () => {
    const recipientUser = await testApp.prisma.user.create({
      data: {
        email: `profile-s12-recipient-denied-${randomUUID()}@example.com`,
        passwordHash: await hash(PASSWORD, 12),
      },
    });
    const recipientEmployee = await testApp.prisma.employee.create({
      data: { userId: recipientUser.id },
    });

    await colleagueAgent
      .post(`/api/v1/employees/${reportEmployeeId}/shared-links`)
      .send({
        recipientEmployeeId: recipientEmployee.id,
        sections: ['S12'],
      })
      .expect(403);
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

  it('includes mentor in S1 for Self viewers when an active pair exists', async () => {
    const res = await reportAgent
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

  it('omits S6 and S15 from Self own-profile (denied matrix cells)', async () => {
    const res = await reportAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const sections = (res.body as { sections?: Record<string, unknown> })
      .sections;
    expect(sections ?? {}).not.toHaveProperty('S6');
    expect(sections ?? {}).not.toHaveProperty('S15');
  });

  it('includes empty S15 for ReportingLine viewers when no proposals exist', async () => {
    const res = await managerAgent
      .get(`/api/v1/employees/${reportEmployeeId}/profile`)
      .expect(200);

    const s15 = (
      res.body as {
        sections: {
          S15?: { accessLevel: string; data: { entries: unknown[] } };
        };
      }
    ).sections.S15;

    expect(s15?.accessLevel).toBe('R');
    expect(s15?.data.entries).toEqual([]);
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
      truncate: false,
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
      const seeded = await seedProfileGraph(failingApp, {
        emailSuffix: '-mentor-fail',
      });
      const agent = await loginAgent(
        failingApp,
        profileEmail('manager', '-mentor-fail'),
      );

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

const profileEmail = (role: string, suffix = '') =>
  `profile-${role}${suffix}@example.com`;

const seedProfileGraph = async (
  testApp: TestApp,
  options?: { emailSuffix?: string },
) => {
  const suffix = options?.emailSuffix ?? '';
  const managerEmail = profileEmail('manager', suffix);
  const mentorEmail = profileEmail('mentor', suffix);
  const dmEmail = profileEmail('dm', suffix);
  const ppEmail = profileEmail('pp', suffix);
  const reportEmail = profileEmail('report', suffix);
  const colleagueEmail = profileEmail('colleague', suffix);
  const noEmployeeEmail = profileEmail('no-employee', suffix);
  const hrAdminEmail = profileEmail('hr-admin', suffix);

  const passwordHash = await hash(PASSWORD, 12);

  const managerUser = await testApp.prisma.user.create({
    data: { email: managerEmail, passwordHash },
  });
  const mentorUser = await testApp.prisma.user.create({
    data: { email: mentorEmail, passwordHash },
  });
  const dmUser = await testApp.prisma.user.create({
    data: { email: dmEmail, passwordHash },
  });
  const ppUser = await testApp.prisma.user.create({
    data: { email: ppEmail, passwordHash },
  });
  const reportUser = await testApp.prisma.user.create({
    data: { email: reportEmail, passwordHash },
  });
  const colleagueUser = await testApp.prisma.user.create({
    data: { email: colleagueEmail, passwordHash },
  });
  await testApp.prisma.user.create({
    data: { email: noEmployeeEmail, passwordHash },
  });
  await testApp.prisma.user.create({
    data: {
      email: hrAdminEmail,
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

  await seedCdsFixture(testApp, reportEmployee.id);

  return {
    reportEmployeeId: reportEmployee.id,
    mentorEmployeeId: mentorEmployee.id,
    managerEmployeeId: managerEmployee.id,
  };
};

const seedCdsHistory = async (
  testApp: TestApp,
  employeeId: string,
  departmentName: string,
  position: string,
) => {
  const effectiveFrom = new Date('2024-01-01');

  await testApp.prisma.departmentHistory.create({
    data: {
      employeeId,
      value: departmentName,
      effectiveFrom,
    },
  });
  await testApp.prisma.positionHistory.create({
    data: {
      employeeId,
      value: position,
      effectiveFrom,
    },
  });
};

const seedCdsFixture = async (
  testApp: TestApp,
  reportEmployeeId: string,
  options?: { includeAssessment?: boolean },
) => {
  const includeAssessment = options?.includeAssessment ?? true;

  await seedCdsHistory(
    testApp,
    reportEmployeeId,
    'Engineering',
    'Software Engineer',
  );

  const department = await testApp.prisma.department.upsert({
    where: { name: 'Engineering' },
    update: { managerId: null },
    create: { name: 'Engineering' },
  });

  await testApp.prisma.skillsMatrixEntry.upsert({
    where: {
      departmentId_position: {
        departmentId: department.id,
        position: 'Software Engineer',
      },
    },
    update: {
      fileUrl:
        'https://skills-matrix.bootcamp.example/files/engineering/software-engineer',
    },
    create: {
      departmentId: department.id,
      position: 'Software Engineer',
      fileUrl:
        'https://skills-matrix.bootcamp.example/files/engineering/software-engineer',
    },
  });

  if (includeAssessment) {
    await testApp.prisma.cDSAssessment.create({
      data: {
        employeeId: reportEmployeeId,
        date: new Date('2026-06-15'),
        assessor: 'Profile Assessment Manager',
        resultLink:
          'https://skills-matrix.bootcamp.example/assessments/profile-demo',
        conclusion: 'Completed skills assessment with agreed development goals.',
      },
    });
  }
};
