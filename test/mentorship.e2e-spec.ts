import { hash } from 'bcryptjs';
import request from 'supertest';
import { PERMISSION_KEYS } from '../src/modules/contracts/permission-keys';
import { createTestApp, TestApp } from './support/app-harness';

const PASSWORD = 'test-only-mentorship-password';

interface EmployeeUser {
  readonly userId: string;
  readonly employeeId: string;
  readonly email: string;
}

async function createEmployeeUser(
  testApp: TestApp,
  email: string,
): Promise<EmployeeUser> {
  const user = await testApp.prisma.user.create({
    data: {
      email,
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

async function grantPermission(
  testApp: TestApp,
  employeeId: string,
  permissionKey: string,
): Promise<void> {
  const role = await testApp.prisma.functionalRole.create({
    data: {
      name: `test-${permissionKey}-${employeeId.slice(0, 8)}`,
    },
  });
  await testApp.prisma.functionalRolePermission.create({
    data: { roleId: role.id, permissionKey },
  });
  await testApp.prisma.functionalRoleAssignment.create({
    data: { employeeId, roleId: role.id },
  });
}

describe('Mentorship (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
  });

  it('persists open-to-mentoring for Self and exposes S13 on profile', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'mentorship-self@example.com',
    );
    const agent = await loginAs(testApp, subject.email);

    const patchRes = await agent
      .patch(
        `/api/v1/employees/${subject.employeeId}/mentorship/open-to-mentoring`,
      )
      .send({ openToMentoring: true })
      .expect(200);

    expect(patchRes.body).toMatchObject({
      openToMentoring: true,
      mentorStatus: 'openToMentoring',
      mentees: [],
    });

    const profileRes = await agent
      .get(`/api/v1/employees/${subject.employeeId}/profile`)
      .expect(200);

    const s13 = (
      profileRes.body as {
        sections: {
          S13?: {
            data?: {
              openToMentoring: boolean;
              mentorStatus: string;
            };
          };
        };
      }
    ).sections.S13;

    expect(s13?.data).toMatchObject({
      openToMentoring: true,
      mentorStatus: 'openToMentoring',
    });
  });

  it('rejects direct mentorStatus writes with 400', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'mentorship-status@example.com',
    );
    const agent = await loginAs(testApp, subject.email);

    await agent
      .patch(
        `/api/v1/employees/${subject.employeeId}/mentorship/open-to-mentoring`,
      )
      .send({ openToMentoring: true, mentorStatus: 'mentor' })
      .expect(400);

    const employee = await testApp.prisma.employee.findUnique({
      where: { id: subject.employeeId },
      select: { openToMentoring: true },
    });
    expect(employee?.openToMentoring).toBe(false);
  });

  it('rejects status field writes with 400', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'mentorship-status2@example.com',
    );
    const agent = await loginAs(testApp, subject.email);

    await agent
      .patch(
        `/api/v1/employees/${subject.employeeId}/mentorship/open-to-mentoring`,
      )
      .send({ openToMentoring: true, status: 'mentor' })
      .expect(400);
  });

  it('forbids non-self viewers from patching the flag', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'mentorship-subject@example.com',
    );
    const manager = await createEmployeeUser(
      testApp,
      'mentorship-manager@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { managerId: manager.employeeId },
    });

    const managerAgent = await loginAs(testApp, manager.email);
    await managerAgent
      .patch(
        `/api/v1/employees/${subject.employeeId}/mentorship/open-to-mentoring`,
      )
      .send({ openToMentoring: true })
      .expect(403);
  });

  it('lists willing mentors for permission holders only', async () => {
    const mentor = await createEmployeeUser(
      testApp,
      'willing-mentor@example.com',
    );
    const viewer = await createEmployeeUser(
      testApp,
      'willing-viewer@example.com',
    );
    const denied = await createEmployeeUser(
      testApp,
      'willing-denied@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: mentor.employeeId },
      data: { openToMentoring: true },
    });

    await grantPermission(
      testApp,
      viewer.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const allowedAgent = await loginAs(testApp, viewer.email);
    const listRes = await allowedAgent
      .get('/api/v1/mentorship/willing-mentors')
      .expect(200);

    expect(
      (listRes.body as { mentors: Array<{ id: string }> }).mentors,
    ).toEqual([
      expect.objectContaining({
        id: mentor.employeeId,
        openToMentoring: true,
      }),
    ]);

    const deniedAgent = await loginAs(testApp, denied.email);
    await deniedAgent.get('/api/v1/mentorship/willing-mentors').expect(403);
  });

  it('removes mentor from willing list when flag is turned off but keeps mentor status', async () => {
    const mentor = await createEmployeeUser(
      testApp,
      'active-mentor@example.com',
    );
    const mentee = await createEmployeeUser(
      testApp,
      'active-mentee@example.com',
    );
    const assigner = await createEmployeeUser(
      testApp,
      'active-assigner@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: mentor.employeeId },
      data: { openToMentoring: true },
    });
    await testApp.prisma.mentorshipPair.create({
      data: { mentorId: mentor.employeeId, menteeId: mentee.employeeId },
    });
    await grantPermission(
      testApp,
      assigner.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const mentorAgent = await loginAs(testApp, mentor.email);
    const patchRes = await mentorAgent
      .patch(
        `/api/v1/employees/${mentor.employeeId}/mentorship/open-to-mentoring`,
      )
      .send({ openToMentoring: false })
      .expect(200);

    expect(patchRes.body).toMatchObject({
      openToMentoring: false,
      mentorStatus: 'mentor',
      mentees: [expect.objectContaining({ id: mentee.employeeId })],
    });

    const assignerAgent = await loginAs(testApp, assigner.email);
    const listRes = await assignerAgent
      .get('/api/v1/mentorship/willing-mentors')
      .expect(200);

    expect(
      (listRes.body as { mentors: Array<{ id: string }> }).mentors,
    ).toEqual([]);
  });

  it('shows read-only mentor and mentees on Self profile S13', async () => {
    const mentor = await createEmployeeUser(testApp, 's13-mentor@example.com');
    const mentee = await createEmployeeUser(testApp, 's13-mentee@example.com');

    await testApp.prisma.mentorshipPair.create({
      data: { mentorId: mentor.employeeId, menteeId: mentee.employeeId },
    });

    const mentorAgent = await loginAs(testApp, mentor.email);
    const profileRes = await mentorAgent
      .get(`/api/v1/employees/${mentor.employeeId}/profile`)
      .expect(200);

    const s13 = (
      profileRes.body as {
        sections: {
          S13?: {
            data?: {
              mentorStatus: string;
              mentees: Array<{ id: string }>;
            };
          };
        };
      }
    ).sections.S13;

    expect(s13?.data?.mentorStatus).toBe('mentor');
    expect(s13?.data?.mentees).toEqual([
      expect.objectContaining({ id: mentee.employeeId }),
    ]);

    const s1 = (
      profileRes.body as {
        sections: {
          S1?: { data?: { mentor?: { id: string } } };
        };
      }
    ).sections.S1;
    expect(s1?.data?.mentor).toBeUndefined();
  });
});
