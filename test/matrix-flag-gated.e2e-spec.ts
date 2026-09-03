import { hash } from 'bcryptjs';
import request from 'supertest';
import { assertFlagGatedCoverage } from './support/access-matrix';
import { createTestApp, TestApp } from './support/app-harness';
import { DEFAULT_TEST_INSTANT, FixedClock } from './support/fixed-clock';
import {
  getRecordedFlagGatedKeys,
  recordFlagGatedCoverage,
  resetFlagGatedCoverage,
} from './support/matrix-coverage-collector';
import {
  expectProjectLineS5NarrowedOrUnavailable,
  expectSectionAbsentFromProfile,
} from './support/matrix-leak-assertions';
import {
  matrixLeavesProviderOverride,
  MatrixActors,
  seedMatrixActors,
} from './support/matrix-actors';

const PASSWORD = 'matrix-flag-gated-password';

async function createEmployeeUser(
  testApp: TestApp,
  email: string,
): Promise<{ employeeId: string; email: string }> {
  const user = await testApp.prisma.user.create({
    data: {
      email,
      passwordHash: await hash(PASSWORD, 12),
    },
  });
  const employee = await testApp.prisma.employee.create({
    data: { id: user.id, userId: user.id },
  });
  return { employeeId: employee.id, email };
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

describe('Matrix flag-gated leak cases (e2e)', () => {
  let testApp: TestApp;
  let actors: MatrixActors;

  beforeAll(async () => {
    resetFlagGatedCoverage();
    testApp = await createTestApp({
      clock: new FixedClock(DEFAULT_TEST_INSTANT),
      providerOverrides: [matrixLeavesProviderOverride],
    });
    actors = await seedMatrixActors(testApp);
  });

  afterAll(async () => {
    assertFlagGatedCoverage(getRecordedFlagGatedKeys());
    await testApp.close();
  });

  it('hides unflagged S7 notes from Self on profile and parallel route', async () => {
    await testApp.prisma.managementNote.create({
      data: {
        subjectEmployeeId: actors.subjectEmployeeId,
        authorEmployeeId: actors.ppEmployeeId,
        content: 'Hidden from self',
        visibleForEmployee: false,
        visibleForPm: false,
      },
    });

    const profileRes = await actors.selfAgent
      .get(`/api/v1/employees/${actors.subjectEmployeeId}/profile`)
      .expect(200);

    const s7 = (
      profileRes.body as {
        sections?: { S7?: { data?: { notes?: unknown[] } } };
      }
    ).sections?.S7;
    if (s7 && 'data' in s7) {
      expect(s7.data?.notes ?? []).toHaveLength(0);
    }

    const routeRes = await actors.selfAgent
      .get(`/api/v1/employees/${actors.subjectEmployeeId}/management-notes`)
      .expect(200);
    expect((routeRes.body as { notes: unknown[] }).notes).toHaveLength(0);

    recordFlagGatedCoverage({
      section: 'S7',
      audience: 'Self',
      rule: 'record-absent',
    });
  });

  it('shows only PM-flagged S7 notes to ProjectLine PM and denies writes', async () => {
    await testApp.prisma.managementNote.createMany({
      data: [
        {
          subjectEmployeeId: actors.subjectEmployeeId,
          authorEmployeeId: actors.ppEmployeeId,
          content: 'Hidden',
          visibleForEmployee: false,
          visibleForPm: false,
        },
        {
          subjectEmployeeId: actors.subjectEmployeeId,
          authorEmployeeId: actors.ppEmployeeId,
          content: 'Visible to PM',
          visibleForEmployee: false,
          visibleForPm: true,
        },
      ],
    });

    const res = await actors.projectLinePmAgent
      .get(`/api/v1/employees/${actors.subjectEmployeeId}/management-notes`)
      .expect(200);

    const body = res.body as { notes: Array<{ id: string; content: string }> };
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0]?.content).toBe('Visible to PM');

    recordFlagGatedCoverage({
      section: 'S7',
      audience: 'ProjectLine',
      rule: 'record-absent',
    });

    await actors.projectLinePmAgent
      .post(`/api/v1/employees/${actors.subjectEmployeeId}/management-notes`)
      .send({ content: 'PM cannot write' })
      .expect(403);

    await actors.projectLinePmAgent
      .patch(
        `/api/v1/employees/${actors.subjectEmployeeId}/management-notes/${body.notes[0].id}`,
      )
      .send({ content: 'PM cannot patch' })
      .expect(403);

    recordFlagGatedCoverage({
      section: 'S7',
      audience: 'ProjectLine',
      rule: 'write-denied',
    });
  });

  it('omits mentor for Colleague and Self viewers (S1 field-absent)', async () => {
    for (const agent of [actors.colleagueAgent, actors.selfAgent]) {
      const res = await agent
        .get(`/api/v1/employees/${actors.subjectEmployeeId}/profile`)
        .expect(200);
      const s1 = (
        res.body as { sections?: { S1?: { data?: Record<string, unknown> } } }
      ).sections?.S1;
      expect(s1?.data).toBeDefined();
      expect(s1?.data).not.toHaveProperty('mentor');
    }

    recordFlagGatedCoverage({
      section: 'S1',
      audience: 'Colleague',
      rule: 'field-absent',
    });
    recordFlagGatedCoverage({
      section: 'S1',
      audience: 'Self',
      rule: 'field-absent',
    });
  });

  it('narrows S10 leave type fields for Colleague viewers', async () => {
    const res = await actors.colleagueAgent
      .get(`/api/v1/employees/${actors.subjectEmployeeId}/profile`)
      .expect(200);

    const s10 = (
      res.body as {
        sections?: {
          S10?: {
            data?: {
              leaves?: Array<{
                type: string | null;
                approvalState: string | null;
              }>;
            };
          };
        };
      }
    ).sections?.S10;

    expect(s10?.data?.leaves?.[0]?.type).toBeNull();
    expect(s10?.data?.leaves?.[0]?.approvalState).toBeNull();

    recordFlagGatedCoverage({
      section: 'S10',
      audience: 'Colleague',
      rule: 'field-absent',
    });
  });

  it('returns project names only in S11 for Colleague viewers', async () => {
    const res = await actors.colleagueAgent
      .get(`/api/v1/employees/${actors.subjectEmployeeId}/profile`)
      .expect(200);

    const s11 = (
      res.body as {
        sections?: {
          S11?: { data?: { projects?: Array<Record<string, unknown>> } };
        };
      }
    ).sections?.S11;

    expect(s11?.data?.projects?.[0]).toEqual({ name: 'matrix-project' });
    expect(s11?.data?.projects?.[0]).not.toHaveProperty('pm');
    expect(s11?.data?.projects?.[0]).not.toHaveProperty('dm');
    expect(s11?.data?.projects?.[0]).not.toHaveProperty('period');

    recordFlagGatedCoverage({
      section: 'S11',
      audience: 'Colleague',
      rule: 'payload-narrowed',
    });
  });

  it('hides management-only S16 fields from Colleague viewers', async () => {
    const managementField = await testApp.prisma.customFieldDefinition.create({
      data: {
        name: 'Management only',
        type: 'text',
        visibility: 'management',
      },
    });
    const colleagueField = await testApp.prisma.customFieldDefinition.create({
      data: {
        name: 'Colleague visible',
        type: 'text',
        visibility: 'colleague',
      },
    });

    await testApp.prisma.customFieldValue.createMany({
      data: [
        {
          employeeId: actors.subjectEmployeeId,
          fieldDefinitionId: managementField.id,
          valueText: 'secret',
        },
        {
          employeeId: actors.subjectEmployeeId,
          fieldDefinitionId: colleagueField.id,
          valueText: 'public',
        },
      ],
    });

    const res = await actors.colleagueAgent
      .get(`/api/v1/employees/${actors.subjectEmployeeId}/profile`)
      .expect(200);

    const s16 = (
      res.body as {
        sections?: {
          S16?: {
            data?: { values?: Record<string, string>; fields?: unknown[] };
          };
        };
      }
    ).sections?.S16;

    if (s16 && 'data' in s16) {
      expect(s16.data?.values ?? {}).not.toHaveProperty(managementField.id);
      expect(s16.data?.values?.[colleagueField.id]).toBe('public');
    }

    recordFlagGatedCoverage({
      section: 'S16',
      audience: 'Colleague',
      rule: 'field-absent',
    });
  });

  it('narrows ProjectLine S5 documents on profile (or marks unavailable)', async () => {
    const res = await actors.projectLineDmAgent
      .get(`/api/v1/employees/${actors.subjectEmployeeId}/profile`)
      .expect(200);

    expectProjectLineS5NarrowedOrUnavailable(res.body as never);

    recordFlagGatedCoverage({
      section: 'S5',
      audience: 'ProjectLine',
      rule: 'payload-narrowed',
    });
  });

  it('denies non-assignee viewers from completing S14 action items', async () => {
    const createRes = await actors.reportingLineAgent
      .post(`/api/v1/employees/${actors.subjectEmployeeId}/action-items`)
      .send({ title: 'Complete deny matrix task', dueDate: '2026-09-20' })
      .expect(201);
    const itemId = (createRes.body as { id: string }).id;

    await actors.reportingLineAgent
      .post(
        `/api/v1/employees/${actors.subjectEmployeeId}/action-items/${itemId}/complete`,
      )
      .expect(403);
    recordFlagGatedCoverage({
      section: 'S14',
      audience: 'ReportingLine',
      rule: 'write-denied',
    });

    await actors.ppAgent
      .post(
        `/api/v1/employees/${actors.subjectEmployeeId}/action-items/${itemId}/complete`,
      )
      .expect(403);
    recordFlagGatedCoverage({
      section: 'S14',
      audience: 'PP',
      rule: 'write-denied',
    });

    await actors.projectLinePmAgent
      .post(
        `/api/v1/employees/${actors.subjectEmployeeId}/action-items/${itemId}/complete`,
      )
      .expect(403);
    recordFlagGatedCoverage({
      section: 'S14',
      audience: 'ProjectLine',
      rule: 'write-denied',
    });
  });

  it('denies ProjectLine timeline writes while ReportingLine may write', async () => {
    await actors.projectLineDmAgent
      .post(`/api/v1/employees/${actors.subjectEmployeeId}/timeline`)
      .send({
        type: 'grade',
        effectiveDate: '2019-03-15',
        oldValue: 'Middle',
        newValue: 'Senior',
      })
      .expect(403);

    recordFlagGatedCoverage({
      section: 'S9',
      audience: 'ProjectLine',
      rule: 'write-denied',
    });

    await actors.reportingLineAgent
      .post(`/api/v1/employees/${actors.subjectEmployeeId}/timeline`)
      .send({
        type: 'grade',
        effectiveDate: '2019-03-15',
        oldValue: 'Middle',
        newValue: 'Senior',
      })
      .expect(201);
  });

  it('keeps Self S6 and S15 absent from own profile', async () => {
    const res = await actors.selfAgent
      .get(`/api/v1/employees/${actors.subjectEmployeeId}/profile`)
      .expect(200);

    expectSectionAbsentFromProfile(res.body as never, 'S6');
    expectSectionAbsentFromProfile(res.body as never, 'S15');
  });

  it('isolates flag-gated management-notes scenarios in a fresh graph', async () => {
    const subject = await createEmployeeUser(testApp, 'fg-subject@example.com');
    const pp = await createEmployeeUser(testApp, 'fg-pp@example.com');
    const pm = await createEmployeeUser(testApp, 'fg-pm@example.com');
    const dm = await createEmployeeUser(testApp, 'fg-dm@example.com');

    await testApp.prisma.employee.update({
      where: { id: subject.employeeId },
      data: { peoplePartnerId: pp.employeeId },
    });
    await testApp.prisma.projectAssignment.create({
      data: {
        employeeId: subject.employeeId,
        projectId: 'fg-proj',
        pmId: pm.employeeId,
        dmId: dm.employeeId,
        startDate: new Date('2026-01-01'),
        confirmed: true,
        confirmedAt: new Date(DEFAULT_TEST_INSTANT),
      },
    });

    const pmAgent = await loginAs(testApp, pm.email);
    const subjectAgent = await loginAs(testApp, subject.email);

    await testApp.prisma.managementNote.create({
      data: {
        subjectEmployeeId: subject.employeeId,
        authorEmployeeId: pp.employeeId,
        content: 'Employee only',
        visibleForEmployee: true,
        visibleForPm: false,
      },
    });

    const selfNotes = await subjectAgent
      .get(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .expect(200);
    expect((selfNotes.body as { notes: unknown[] }).notes).toHaveLength(1);

    await pmAgent
      .get(`/api/v1/employees/${subject.employeeId}/management-notes`)
      .expect(200)
      .expect((res) => {
        expect((res.body as { notes: unknown[] }).notes).toHaveLength(0);
      });
  });
});
