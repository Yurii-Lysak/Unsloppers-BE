import { hash } from 'bcryptjs';
import request from 'supertest';
import { createTestApp, TestApp } from './support/app-harness';
import { FixedClock, DEFAULT_TEST_INSTANT } from './support/fixed-clock';
import {
  loginMatrixAgent,
  MATRIX_E2E_PASSWORD,
  matrixLeavesProviderOverride,
} from './support/matrix-actors';

const PASSWORD = MATRIX_E2E_PASSWORD;
const DUAL_ROLE_EMAIL = 'overlap-pp-pm@example.com';
const SUBJECT_EMAIL = 'overlap-subject@example.com';
const RECIPIENT_EMAIL = 'overlap-recipient@example.com';

describe('Access matrix overlap — AD-15 union (e2e)', () => {
  let testApp: TestApp;
  let subjectEmployeeId: string;
  let dualRoleAgent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    testApp = await createTestApp({
      clock: new FixedClock(DEFAULT_TEST_INSTANT),
      providerOverrides: [matrixLeavesProviderOverride],
    });

    const passwordHash = await hash(PASSWORD, 12);
    const dualUser = await testApp.prisma.user.create({
      data: { email: DUAL_ROLE_EMAIL, passwordHash },
    });
    const subjectUser = await testApp.prisma.user.create({
      data: { email: SUBJECT_EMAIL, passwordHash },
    });
    await testApp.prisma.user.create({
      data: { email: RECIPIENT_EMAIL, passwordHash },
    });

    const dualEmployee = await testApp.prisma.employee.create({
      data: { userId: dualUser.id },
    });
    const subjectEmployee = await testApp.prisma.employee.create({
      data: {
        userId: subjectUser.id,
        peoplePartnerId: dualEmployee.id,
      },
    });
    subjectEmployeeId = subjectEmployee.id;

    await testApp.prisma.projectAssignment.create({
      data: {
        employeeId: subjectEmployee.id,
        projectId: 'overlap-project',
        pmId: dualEmployee.id,
        dmId: dualEmployee.id,
        startDate: new Date('2026-01-01'),
        confirmed: true,
        confirmedAt: new Date(DEFAULT_TEST_INSTANT),
      },
    });

    dualRoleAgent = await loginMatrixAgent(testApp, DUAL_ROLE_EMAIL);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('unions PP and ProjectLine grants — S4 is RW and S2 is present', async () => {
    const res = await dualRoleAgent
      .get(`/api/v1/employees/${subjectEmployeeId}/profile`)
      .expect(200);

    const body = res.body as {
      audience: { sections: Record<string, string> };
      sections: Record<string, { accessLevel?: string }>;
    };

    expect(body.audience.sections.S4).toBe('RW');
    expect(body.sections.S4?.accessLevel).toBe('RW');
    expect(body.audience.sections.S2).not.toBe('none');
    expect(body.sections.S2).toBeDefined();
  });
});
