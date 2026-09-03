import { hash } from 'bcryptjs';
import request from 'supertest';
import { LeavesSyncService } from '../../src/modules/integrations/leaves-sync.service';
import { TestApp } from './app-harness';
import { DEFAULT_TEST_INSTANT } from './fixed-clock';

export const MATRIX_E2E_PASSWORD = 'matrix-leak-e2e-password';

export const MATRIX_MANAGER_EMAIL = 'matrix-manager@example.com';
export const MATRIX_REPORT_EMAIL = 'matrix-report@example.com';
export const MATRIX_COLLEAGUE_EMAIL = 'matrix-colleague@example.com';
export const MATRIX_DM_EMAIL = 'matrix-dm@example.com';
export const MATRIX_PM_EMAIL = 'matrix-pm@example.com';
export const MATRIX_PP_EMAIL = 'matrix-pp@example.com';
export const MATRIX_NO_EMPLOYEE_EMAIL = 'matrix-no-employee@example.com';

export interface MatrixActors {
  readonly subjectEmployeeId: string;
  readonly managerEmployeeId: string;
  readonly dmEmployeeId: string;
  readonly pmEmployeeId: string;
  readonly ppEmployeeId: string;
  readonly colleagueEmployeeId: string;
  readonly selfAgent: ReturnType<typeof request.agent>;
  readonly reportingLineAgent: ReturnType<typeof request.agent>;
  readonly projectLineDmAgent: ReturnType<typeof request.agent>;
  readonly projectLinePmAgent: ReturnType<typeof request.agent>;
  readonly ppAgent: ReturnType<typeof request.agent>;
  readonly colleagueAgent: ReturnType<typeof request.agent>;
}

export const matrixLeavesProviderOverride = {
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
};

export async function seedMatrixActors(
  testApp: TestApp,
): Promise<MatrixActors> {
  const passwordHash = await hash(MATRIX_E2E_PASSWORD, 12);

  const managerUser = await testApp.prisma.user.create({
    data: { email: MATRIX_MANAGER_EMAIL, passwordHash },
  });
  const reportUser = await testApp.prisma.user.create({
    data: { email: MATRIX_REPORT_EMAIL, passwordHash },
  });
  const colleagueUser = await testApp.prisma.user.create({
    data: { email: MATRIX_COLLEAGUE_EMAIL, passwordHash },
  });
  const dmUser = await testApp.prisma.user.create({
    data: { email: MATRIX_DM_EMAIL, passwordHash },
  });
  const pmUser = await testApp.prisma.user.create({
    data: { email: MATRIX_PM_EMAIL, passwordHash },
  });
  const ppUser = await testApp.prisma.user.create({
    data: { email: MATRIX_PP_EMAIL, passwordHash },
  });
  await testApp.prisma.user.create({
    data: { email: MATRIX_NO_EMPLOYEE_EMAIL, passwordHash },
  });

  const managerEmployee = await testApp.prisma.employee.create({
    data: { userId: managerUser.id },
  });
  const dmEmployee = await testApp.prisma.employee.create({
    data: { userId: dmUser.id },
  });
  const pmEmployee = await testApp.prisma.employee.create({
    data: { userId: pmUser.id },
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
  const colleagueEmployee = await testApp.prisma.employee.create({
    data: { userId: colleagueUser.id },
  });

  await testApp.prisma.projectAssignment.create({
    data: {
      employeeId: reportEmployee.id,
      projectId: 'matrix-project',
      pmId: pmEmployee.id,
      dmId: dmEmployee.id,
      startDate: new Date('2026-01-01'),
      confirmed: true,
      confirmedAt: new Date(DEFAULT_TEST_INSTANT),
    },
  });

  const selfAgent = await loginMatrixAgent(testApp, MATRIX_REPORT_EMAIL);
  const reportingLineAgent = await loginMatrixAgent(
    testApp,
    MATRIX_MANAGER_EMAIL,
  );
  const projectLineDmAgent = await loginMatrixAgent(testApp, MATRIX_DM_EMAIL);
  const projectLinePmAgent = await loginMatrixAgent(testApp, MATRIX_PM_EMAIL);
  const ppAgent = await loginMatrixAgent(testApp, MATRIX_PP_EMAIL);
  const colleagueAgent = await loginMatrixAgent(
    testApp,
    MATRIX_COLLEAGUE_EMAIL,
  );

  return {
    subjectEmployeeId: reportEmployee.id,
    managerEmployeeId: managerEmployee.id,
    dmEmployeeId: dmEmployee.id,
    pmEmployeeId: pmEmployee.id,
    ppEmployeeId: ppEmployee.id,
    colleagueEmployeeId: colleagueEmployee.id,
    selfAgent,
    reportingLineAgent,
    projectLineDmAgent,
    projectLinePmAgent,
    ppAgent,
    colleagueAgent,
  };
}

export async function loginMatrixAgent(
  testApp: TestApp,
  email: string,
): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(testApp.server);
  await agent
    .post('/api/v1/auth/login')
    .send({ email, password: MATRIX_E2E_PASSWORD })
    .expect(200);
  return agent;
}
