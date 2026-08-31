import { hash } from 'bcryptjs';
import request from 'supertest';
import { TestApp } from './app-harness';

export const E2E_OPERATOR_EMAIL = 'e2e-operator@example.com';
export const E2E_OPERATOR_PASSWORD = 'test-only-users-password';

/** Creates an operator in this worker's schema and returns a cookie-aware agent. */
export const loginAsOperator = async (testApp: TestApp) => {
  await testApp.prisma.user.create({
    data: {
      email: E2E_OPERATOR_EMAIL,
      passwordHash: await hash(E2E_OPERATOR_PASSWORD, 12),
    },
  });
  const agent = request.agent(testApp.server);
  await agent
    .post('/api/v1/auth/login')
    .send({ email: E2E_OPERATOR_EMAIL, password: E2E_OPERATOR_PASSWORD })
    .expect(200);
  return agent;
};
