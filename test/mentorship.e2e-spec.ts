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

  it('creates an active pair with timeline events for both employees', async () => {
    const mentor = await createEmployeeUser(
      testApp,
      'assign-mentor@example.com',
    );
    const mentee = await createEmployeeUser(
      testApp,
      'assign-mentee@example.com',
    );
    const assigner = await createEmployeeUser(
      testApp,
      'assign-assigner@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: mentor.employeeId },
      data: { openToMentoring: true },
    });
    await testApp.prisma.employee.update({
      where: { id: mentee.employeeId },
      data: { managerId: assigner.employeeId },
    });
    await grantPermission(
      testApp,
      assigner.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const assignerAgent = await loginAs(testApp, assigner.email);
    const createRes = await assignerAgent
      .post('/api/v1/mentorship/pairs')
      .send({ mentorId: mentor.employeeId, menteeId: mentee.employeeId })
      .expect(201);

    const body = createRes.body as {
      mentorId: string;
      menteeId: string;
      mentorStatus: string;
      startedAt: string;
    };

    expect(body).toMatchObject({
      mentorId: mentor.employeeId,
      menteeId: mentee.employeeId,
      mentorStatus: 'mentor',
    });
    const pair = await testApp.prisma.mentorshipPair.findFirst({
      where: { mentorId: mentor.employeeId, menteeId: mentee.employeeId },
    });
    expect(pair?.endedAt).toBeNull();
    expect(body.startedAt).toBe(pair?.startedAt?.toISOString());

    const mentorTimeline = await testApp.prisma.timelineEvent.findMany({
      where: { employeeId: mentor.employeeId, type: 'mentorshipStart' },
    });
    const menteeTimeline = await testApp.prisma.timelineEvent.findMany({
      where: { employeeId: mentee.employeeId, type: 'mentorshipStart' },
    });

    expect(mentorTimeline).toHaveLength(1);
    expect(menteeTimeline).toHaveLength(1);
    expect(mentorTimeline[0]?.newValue).toBe(mentee.employeeId);
    expect(menteeTimeline[0]?.newValue).toBe(mentor.employeeId);
    expect(mentorTimeline[0]?.authorId).toBe(assigner.employeeId);
    expect(menteeTimeline[0]?.authorId).toBe(assigner.employeeId);
  });

  it('rejects pair creation when mentee is outside assigner scope', async () => {
    const mentor = await createEmployeeUser(
      testApp,
      'scope-mentor@example.com',
    );
    const mentee = await createEmployeeUser(
      testApp,
      'scope-mentee@example.com',
    );
    const assigner = await createEmployeeUser(
      testApp,
      'scope-assigner@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: mentor.employeeId },
      data: { openToMentoring: true },
    });
    await grantPermission(
      testApp,
      assigner.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const assignerAgent = await loginAs(testApp, assigner.email);
    await assignerAgent
      .post('/api/v1/mentorship/pairs')
      .send({ mentorId: mentor.employeeId, menteeId: mentee.employeeId })
      .expect(403);
  });

  it('rejects pair creation when mentor is not open to mentoring', async () => {
    const mentor = await createEmployeeUser(
      testApp,
      'consent-mentor@example.com',
    );
    const mentee = await createEmployeeUser(
      testApp,
      'consent-mentee@example.com',
    );
    const assigner = await createEmployeeUser(
      testApp,
      'consent-assigner@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: mentee.employeeId },
      data: { managerId: assigner.employeeId },
    });
    await grantPermission(
      testApp,
      assigner.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const assignerAgent = await loginAs(testApp, assigner.email);
    await assignerAgent
      .post('/api/v1/mentorship/pairs')
      .send({ mentorId: mentor.employeeId, menteeId: mentee.employeeId })
      .expect(400);
  });

  it('rejects self-pair creation', async () => {
    const employee = await createEmployeeUser(
      testApp,
      'selfpair-employee@example.com',
    );
    const assigner = await createEmployeeUser(
      testApp,
      'selfpair-assigner@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: employee.employeeId },
      data: { managerId: assigner.employeeId, openToMentoring: true },
    });
    await grantPermission(
      testApp,
      assigner.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const assignerAgent = await loginAs(testApp, assigner.email);
    await assignerAgent
      .post('/api/v1/mentorship/pairs')
      .send({
        mentorId: employee.employeeId,
        menteeId: employee.employeeId,
      })
      .expect(400);
  });

  it('rejects duplicate active mentee pair creation', async () => {
    const mentor = await createEmployeeUser(testApp, 'dup-mentor@example.com');
    const mentorTwo = await createEmployeeUser(
      testApp,
      'dup-mentor2@example.com',
    );
    const mentee = await createEmployeeUser(testApp, 'dup-mentee@example.com');
    const assigner = await createEmployeeUser(
      testApp,
      'dup-assigner@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: mentor.employeeId },
      data: { openToMentoring: true },
    });
    await testApp.prisma.employee.update({
      where: { id: mentorTwo.employeeId },
      data: { openToMentoring: true },
    });
    await testApp.prisma.employee.update({
      where: { id: mentee.employeeId },
      data: { managerId: assigner.employeeId },
    });
    await testApp.prisma.mentorshipPair.create({
      data: { mentorId: mentor.employeeId, menteeId: mentee.employeeId },
    });
    await grantPermission(
      testApp,
      assigner.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const assignerAgent = await loginAs(testApp, assigner.email);
    await assignerAgent
      .post('/api/v1/mentorship/pairs')
      .send({ mentorId: mentorTwo.employeeId, menteeId: mentee.employeeId })
      .expect(400);
  });

  it('lists only in-scope assignable mentees for a manager', async () => {
    const inScope = await createEmployeeUser(
      testApp,
      'picker-inscope@example.com',
    );
    const outOfScope = await createEmployeeUser(
      testApp,
      'picker-outscope@example.com',
    );
    const manager = await createEmployeeUser(
      testApp,
      'picker-manager@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: inScope.employeeId },
      data: { managerId: manager.employeeId },
    });
    await grantPermission(
      testApp,
      manager.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const managerAgent = await loginAs(testApp, manager.email);
    const listRes = await managerAgent
      .get('/api/v1/mentorship/assignable-mentees')
      .expect(200);

    const menteeIds = (
      listRes.body as { mentees: Array<{ id: string }> }
    ).mentees.map((row) => row.id);

    expect(menteeIds).toContain(inScope.employeeId);
    expect(menteeIds).not.toContain(outOfScope.employeeId);
  });

  it('forbids assignable mentee listing without assign_end_mentorships permission', async () => {
    const viewer = await createEmployeeUser(
      testApp,
      'picker-perm-viewer@example.com',
    );
    const viewerAgent = await loginAs(testApp, viewer.email);
    await viewerAgent.get('/api/v1/mentorship/assignable-mentees').expect(403);
  });

  it('forbids pair creation without assign_end_mentorships permission', async () => {
    const mentor = await createEmployeeUser(testApp, 'perm-mentor@example.com');
    const mentee = await createEmployeeUser(testApp, 'perm-mentee@example.com');
    const viewer = await createEmployeeUser(testApp, 'perm-viewer@example.com');

    await testApp.prisma.employee.update({
      where: { id: mentor.employeeId },
      data: { openToMentoring: true },
    });
    await testApp.prisma.employee.update({
      where: { id: mentee.employeeId },
      data: { managerId: viewer.employeeId },
    });

    const viewerAgent = await loginAs(testApp, viewer.email);
    await viewerAgent
      .post('/api/v1/mentorship/pairs')
      .send({ mentorId: mentor.employeeId, menteeId: mentee.employeeId })
      .expect(403);
  });

  it('rejects ending a pair without closing feedback', async () => {
    const mentor = await createEmployeeUser(testApp, 'end-mentor@example.com');
    const mentee = await createEmployeeUser(testApp, 'end-mentee@example.com');
    const manager = await createEmployeeUser(
      testApp,
      'end-manager@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: mentor.employeeId },
      data: { openToMentoring: true },
    });
    await testApp.prisma.employee.update({
      where: { id: mentee.employeeId },
      data: { managerId: manager.employeeId },
    });
    const pair = await testApp.prisma.mentorshipPair.create({
      data: { mentorId: mentor.employeeId, menteeId: mentee.employeeId },
    });
    await grantPermission(
      testApp,
      manager.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const managerAgent = await loginAs(testApp, manager.email);
    await managerAgent
      .patch(`/api/v1/mentorship/pairs/${pair.id}/end`)
      .send({ closureFeedback: '   ' })
      .expect(400);

    const stillActive = await testApp.prisma.mentorshipPair.findUnique({
      where: { id: pair.id },
    });
    expect(stillActive?.endedAt).toBeNull();
  });

  it('ends an active pair with feedback, timeline events, and mentor status revert', async () => {
    const mentor = await createEmployeeUser(
      testApp,
      'endok-mentor@example.com',
    );
    const mentee = await createEmployeeUser(
      testApp,
      'endok-mentee@example.com',
    );
    const manager = await createEmployeeUser(
      testApp,
      'endok-manager@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: mentor.employeeId },
      data: { openToMentoring: true },
    });
    await testApp.prisma.employee.update({
      where: { id: mentee.employeeId },
      data: { managerId: manager.employeeId },
    });
    const pair = await testApp.prisma.mentorshipPair.create({
      data: { mentorId: mentor.employeeId, menteeId: mentee.employeeId },
    });
    await grantPermission(
      testApp,
      manager.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const managerAgent = await loginAs(testApp, manager.email);
    const endRes = await managerAgent
      .patch(`/api/v1/mentorship/pairs/${pair.id}/end`)
      .send({ closureFeedback: 'Pair concluded after a successful run.' })
      .expect(200);

    const body = endRes.body as {
      mentorStatus: string;
      closureFeedback: string;
      endedAt: string;
    };
    expect(body.mentorStatus).toBe('openToMentoring');
    expect(body.closureFeedback).toBe('Pair concluded after a successful run.');

    const endedPair = await testApp.prisma.mentorshipPair.findUnique({
      where: { id: pair.id },
    });
    expect(endedPair?.endedAt).not.toBeNull();
    expect(endedPair?.closureFeedback).toBe(
      'Pair concluded after a successful run.',
    );

    const mentorTimeline = await testApp.prisma.timelineEvent.findMany({
      where: { employeeId: mentor.employeeId, type: 'mentorshipEnd' },
    });
    const menteeTimeline = await testApp.prisma.timelineEvent.findMany({
      where: { employeeId: mentee.employeeId, type: 'mentorshipEnd' },
    });
    expect(mentorTimeline).toHaveLength(1);
    expect(menteeTimeline).toHaveLength(1);
  });

  it('returns conflict when ending an already-ended pair', async () => {
    const mentor = await createEmployeeUser(
      testApp,
      'conflict-mentor@example.com',
    );
    const mentee = await createEmployeeUser(
      testApp,
      'conflict-mentee@example.com',
    );
    const manager = await createEmployeeUser(
      testApp,
      'conflict-manager@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: mentee.employeeId },
      data: { managerId: manager.employeeId },
    });
    const pair = await testApp.prisma.mentorshipPair.create({
      data: {
        mentorId: mentor.employeeId,
        menteeId: mentee.employeeId,
        endedAt: new Date('2026-08-01T12:00:00.000Z'),
        closureFeedback: 'Original note.',
      },
    });
    await grantPermission(
      testApp,
      manager.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const managerAgent = await loginAs(testApp, manager.email);
    await managerAgent
      .patch(`/api/v1/mentorship/pairs/${pair.id}/end`)
      .send({ closureFeedback: 'Overwrite attempt.' })
      .expect(409);

    const unchanged = await testApp.prisma.mentorshipPair.findUnique({
      where: { id: pair.id },
    });
    expect(unchanged?.closureFeedback).toBe('Original note.');
  });

  it('lists scoped active pairs for managers', async () => {
    const mentor = await createEmployeeUser(
      testApp,
      'active-mentor@example.com',
    );
    const mentee = await createEmployeeUser(
      testApp,
      'active-mentee@example.com',
    );
    const manager = await createEmployeeUser(
      testApp,
      'active-manager@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: mentee.employeeId },
      data: { managerId: manager.employeeId },
    });
    const pair = await testApp.prisma.mentorshipPair.create({
      data: { mentorId: mentor.employeeId, menteeId: mentee.employeeId },
    });
    await grantPermission(
      testApp,
      manager.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const managerAgent = await loginAs(testApp, manager.email);
    const listRes = await managerAgent
      .get('/api/v1/mentorship/pairs?status=active')
      .expect(200);

    const pairIds = (
      listRes.body as { pairs: Array<{ id: string }> }
    ).pairs.map((row) => row.id);
    expect(pairIds).toContain(pair.id);
  });

  it('forbids ending a pair without assign_end_mentorships permission', async () => {
    const mentor = await createEmployeeUser(
      testApp,
      'endperm-mentor@example.com',
    );
    const mentee = await createEmployeeUser(
      testApp,
      'endperm-mentee@example.com',
    );
    const viewer = await createEmployeeUser(
      testApp,
      'endperm-viewer@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: mentee.employeeId },
      data: { managerId: viewer.employeeId },
    });
    const pair = await testApp.prisma.mentorshipPair.create({
      data: { mentorId: mentor.employeeId, menteeId: mentee.employeeId },
    });

    const viewerAgent = await loginAs(testApp, viewer.email);
    await viewerAgent
      .patch(`/api/v1/mentorship/pairs/${pair.id}/end`)
      .send({ closureFeedback: 'Should be denied.' })
      .expect(403);
  });

  it('rejects ending a pair outside viewer scope', async () => {
    const mentor = await createEmployeeUser(
      testApp,
      'endscope-mentor@example.com',
    );
    const mentee = await createEmployeeUser(
      testApp,
      'endscope-mentee@example.com',
    );
    const manager = await createEmployeeUser(
      testApp,
      'endscope-manager@example.com',
    );

    const pair = await testApp.prisma.mentorshipPair.create({
      data: { mentorId: mentor.employeeId, menteeId: mentee.employeeId },
    });
    await grantPermission(
      testApp,
      manager.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const managerAgent = await loginAs(testApp, manager.email);
    await managerAgent
      .patch(`/api/v1/mentorship/pairs/${pair.id}/end`)
      .send({ closureFeedback: 'Out of scope.' })
      .expect(403);
  });

  it('reverts mentor status to none when self-flag is off after last pair ends', async () => {
    const mentor = await createEmployeeUser(
      testApp,
      'endflag-mentor@example.com',
    );
    const mentee = await createEmployeeUser(
      testApp,
      'endflag-mentee@example.com',
    );
    const manager = await createEmployeeUser(
      testApp,
      'endflag-manager@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: mentor.employeeId },
      data: { openToMentoring: false },
    });
    await testApp.prisma.employee.update({
      where: { id: mentee.employeeId },
      data: { managerId: manager.employeeId },
    });
    const pair = await testApp.prisma.mentorshipPair.create({
      data: { mentorId: mentor.employeeId, menteeId: mentee.employeeId },
    });
    await grantPermission(
      testApp,
      manager.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const managerAgent = await loginAs(testApp, manager.email);
    const endRes = await managerAgent
      .patch(`/api/v1/mentorship/pairs/${pair.id}/end`)
      .send({ closureFeedback: 'Final note with flag off.' })
      .expect(200);

    expect((endRes.body as { mentorStatus: string }).mentorStatus).toBe('none');
  });

  it('redacts closure feedback in S13 for Self but exposes it for manager', async () => {
    const mentor = await createEmployeeUser(testApp, 'vis-mentor@example.com');
    const mentee = await createEmployeeUser(testApp, 'vis-mentee@example.com');
    const manager = await createEmployeeUser(
      testApp,
      'vis-manager@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: mentee.employeeId },
      data: { managerId: manager.employeeId },
    });
    await testApp.prisma.mentorshipPair.create({
      data: {
        mentorId: mentor.employeeId,
        menteeId: mentee.employeeId,
        endedAt: new Date('2026-08-01T12:00:00.000Z'),
        closureFeedback: 'Manager-only closure note.',
      },
    });

    const menteeAgent = await loginAs(testApp, mentee.email);
    const selfProfile = await menteeAgent
      .get(`/api/v1/employees/${mentee.employeeId}/profile`)
      .expect(200);
    const selfS13 = (
      selfProfile.body as {
        sections: {
          S13?: {
            data?: {
              pairHistory?: Array<{ closureFeedback?: string }>;
            };
          };
        };
      }
    ).sections.S13;
    expect(selfS13?.data?.pairHistory?.[0]?.closureFeedback).toBeUndefined();

    const managerAgent = await loginAs(testApp, manager.email);
    const managerProfile = await managerAgent
      .get(`/api/v1/employees/${mentee.employeeId}/profile`)
      .expect(200);
    const managerS13 = (
      managerProfile.body as {
        sections: {
          S13?: {
            data?: {
              pairHistory?: Array<{ closureFeedback?: string }>;
            };
          };
        };
      }
    ).sections.S13;
    expect(managerS13?.data?.pairHistory?.[0]?.closureFeedback).toBe(
      'Manager-only closure note.',
    );
  });

  it('rejects pair creation when body includes mentorStatus', async () => {
    const mentor = await createEmployeeUser(
      testApp,
      'status-body-mentor@example.com',
    );
    const mentee = await createEmployeeUser(
      testApp,
      'status-body-mentee@example.com',
    );
    const assigner = await createEmployeeUser(
      testApp,
      'status-body-assigner@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: mentor.employeeId },
      data: { openToMentoring: true },
    });
    await testApp.prisma.employee.update({
      where: { id: mentee.employeeId },
      data: { managerId: assigner.employeeId },
    });
    await grantPermission(
      testApp,
      assigner.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const assignerAgent = await loginAs(testApp, assigner.email);
    await assignerAgent
      .post('/api/v1/mentorship/pairs')
      .send({
        mentorId: mentor.employeeId,
        menteeId: mentee.employeeId,
        mentorStatus: 'mentor',
      })
      .expect(400);
  });

  it('rejects pair end when body includes mentorStatus', async () => {
    const mentor = await createEmployeeUser(
      testApp,
      'status-end-mentor@example.com',
    );
    const mentee = await createEmployeeUser(
      testApp,
      'status-end-mentee@example.com',
    );
    const manager = await createEmployeeUser(
      testApp,
      'status-end-manager@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: mentee.employeeId },
      data: { managerId: manager.employeeId },
    });
    const pair = await testApp.prisma.mentorshipPair.create({
      data: { mentorId: mentor.employeeId, menteeId: mentee.employeeId },
    });
    await grantPermission(
      testApp,
      manager.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const managerAgent = await loginAs(testApp, manager.email);
    await managerAgent
      .patch(`/api/v1/mentorship/pairs/${pair.id}/end`)
      .send({
        closureFeedback: 'Attempted status write.',
        mentorStatus: 'none',
      })
      .expect(400);
  });

  it('shows mentor status in S13 immediately after pair creation', async () => {
    const mentor = await createEmployeeUser(
      testApp,
      's13-after-create-mentor@example.com',
    );
    const mentee = await createEmployeeUser(
      testApp,
      's13-after-create-mentee@example.com',
    );
    const assigner = await createEmployeeUser(
      testApp,
      's13-after-create-assigner@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: mentor.employeeId },
      data: { openToMentoring: true },
    });
    await testApp.prisma.employee.update({
      where: { id: mentee.employeeId },
      data: { managerId: assigner.employeeId },
    });
    await grantPermission(
      testApp,
      assigner.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const assignerAgent = await loginAs(testApp, assigner.email);
    await assignerAgent
      .post('/api/v1/mentorship/pairs')
      .send({ mentorId: mentor.employeeId, menteeId: mentee.employeeId })
      .expect(201);

    const mentorAgent = await loginAs(testApp, mentor.email);
    const profileRes = await mentorAgent
      .get(`/api/v1/employees/${mentor.employeeId}/profile`)
      .expect(200);

    const s13 = (
      profileRes.body as {
        sections: {
          S13?: { data?: { mentorStatus: string } };
        };
      }
    ).sections.S13;

    expect(s13?.data?.mentorStatus).toBe('mentor');
  });

  it('keeps mentor status when one of multiple active pairs ends', async () => {
    const mentor = await createEmployeeUser(
      testApp,
      'multi-mentor@example.com',
    );
    const menteeOne = await createEmployeeUser(
      testApp,
      'multi-mentee-one@example.com',
    );
    const menteeTwo = await createEmployeeUser(
      testApp,
      'multi-mentee-two@example.com',
    );
    const manager = await createEmployeeUser(
      testApp,
      'multi-manager@example.com',
    );

    await testApp.prisma.employee.update({
      where: { id: mentor.employeeId },
      data: { openToMentoring: true },
    });
    await testApp.prisma.employee.update({
      where: { id: menteeOne.employeeId },
      data: { managerId: manager.employeeId },
    });
    await testApp.prisma.employee.update({
      where: { id: menteeTwo.employeeId },
      data: { managerId: manager.employeeId },
    });

    const pairOne = await testApp.prisma.mentorshipPair.create({
      data: { mentorId: mentor.employeeId, menteeId: menteeOne.employeeId },
    });
    await testApp.prisma.mentorshipPair.create({
      data: { mentorId: mentor.employeeId, menteeId: menteeTwo.employeeId },
    });
    await grantPermission(
      testApp,
      manager.employeeId,
      PERMISSION_KEYS.ASSIGN_END_MENTORSHIPS,
    );

    const managerAgent = await loginAs(testApp, manager.email);
    const endRes = await managerAgent
      .patch(`/api/v1/mentorship/pairs/${pairOne.id}/end`)
      .send({ closureFeedback: 'First mentee pairing concluded.' })
      .expect(200);

    expect((endRes.body as { mentorStatus: string }).mentorStatus).toBe(
      'mentor',
    );
  });
});
