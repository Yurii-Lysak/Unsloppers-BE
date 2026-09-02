import { hash } from 'bcryptjs';
import request from 'supertest';
import { TestApp } from './app-harness';

export interface EmployeeUser {
  readonly userId: string;
  readonly employeeId: string;
  readonly email: string;
}

/** Creates a bare employee+user pair in this worker's schema for e2e login. */
export const createEmployeeUser = async (
  testApp: TestApp,
  email: string,
  password: string,
): Promise<EmployeeUser> => {
  const user = await testApp.prisma.user.create({
    data: { email, passwordHash: await hash(password, 12) },
  });
  const employee = await testApp.prisma.employee.create({
    data: { id: user.id, userId: user.id },
  });
  return { userId: user.id, employeeId: employee.id, email };
};

/** Logs in as an employee created via `createEmployeeUser` and returns a cookie-aware agent. */
export const loginAsEmployee = async (
  testApp: TestApp,
  email: string,
  password: string,
): Promise<ReturnType<typeof request.agent>> => {
  const agent = request.agent(testApp.server);
  await agent.post('/api/v1/auth/login').send({ email, password }).expect(200);
  return agent;
};
