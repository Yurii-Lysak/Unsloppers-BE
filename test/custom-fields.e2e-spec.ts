import request from 'supertest';
import { createTestApp, TestApp } from './support/app-harness';
import { loginAsOperator } from './support/login';

describe('Custom fields (e2e)', () => {
  let testApp: TestApp;
  let agent: ReturnType<typeof request.agent>;
  const missingEmployeeId = '00000000-0000-0000-0000-000000000000';

  beforeAll(async () => {
    testApp = await createTestApp();
    agent = await loginAsOperator(testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('GET /api/v1/custom-fields returns an array for authenticated users', async () => {
    const res = await agent.get('/api/v1/custom-fields').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/v1/custom-fields without manage_custom_fields returns 403', async () => {
    await agent
      .post('/api/v1/custom-fields')
      .send({
        name: 'Preferred office',
        type: 'select',
        visibility: 'employee',
        options: ['Kyiv'],
      })
      .expect(403);
  });

  it('GET /api/v1/custom-fields/values/:employeeId returns 404 for unknown employee', async () => {
    await agent
      .get(`/api/v1/custom-fields/values/${missingEmployeeId}`)
      .expect(404);
  });
});
