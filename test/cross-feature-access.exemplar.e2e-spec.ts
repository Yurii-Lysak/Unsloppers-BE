import request from 'supertest';
import { hash } from 'bcryptjs';
import { createTestApp, TestApp } from './support/app-harness';
import { FixedClock, DEFAULT_TEST_INSTANT } from './support/fixed-clock';
import {
  loginMatrixAgent,
  MATRIX_E2E_PASSWORD,
  matrixLeavesProviderOverride,
} from './support/matrix-actors';

const PASSWORD = MATRIX_E2E_PASSWORD;
const UNRELATED_PM_EMAIL = 'unrelated-pm@example.com';
const SUBJECT_EMAIL = 'exemplar-subject@example.com';

describe('Cross-feature access exemplar (e2e)', () => {
  let testApp: TestApp;
  let unrelatedPmAgent: ReturnType<typeof request.agent>;
  let subjectEmployeeId: string;

  beforeAll(async () => {
    testApp = await createTestApp({
      clock: new FixedClock(DEFAULT_TEST_INSTANT),
      providerOverrides: [matrixLeavesProviderOverride],
    });

    const passwordHash = await hash(PASSWORD, 12);
    const pmUser = await testApp.prisma.user.create({
      data: { email: UNRELATED_PM_EMAIL, passwordHash },
    });
    const subjectUser = await testApp.prisma.user.create({
      data: { email: SUBJECT_EMAIL, passwordHash },
    });

    const pmEmployee = await testApp.prisma.employee.create({
      data: { userId: pmUser.id },
    });
    const subjectEmployee = await testApp.prisma.employee.create({
      data: { userId: subjectUser.id },
    });
    subjectEmployeeId = subjectEmployee.id;

    unrelatedPmAgent = await loginMatrixAgent(testApp, UNRELATED_PM_EMAIL);

    const strangerUser = await testApp.prisma.user.create({
      data: { email: 'exemplar-stranger@example.com', passwordHash },
    });
    const stranger = await testApp.prisma.employee.create({
      data: { userId: strangerUser.id },
    });
    await testApp.prisma.projectAssignment.create({
      data: {
        employeeId: stranger.id,
        projectId: 'pm-only-project',
        pmId: pmEmployee.id,
        dmId: pmEmployee.id,
        startDate: new Date('2026-01-01'),
        confirmed: true,
        confirmedAt: new Date(DEFAULT_TEST_INSTANT),
      },
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('rejects profile read when PM has no relationship to the subject', async () => {
    const res = await unrelatedPmAgent
      .get(`/api/v1/employees/${subjectEmployeeId}/profile`)
      .expect(200);

    const body = res.body as {
      audience: { role: string; sections: Record<string, string> };
    };
    expect(body.audience.role).toBe('Colleague');
    expect(body.audience.sections.S4).not.toBe('RW');
  });
});
