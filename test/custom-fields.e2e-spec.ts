import request from 'supertest';
import { createTestApp, TestApp } from './support/app-harness';
import { createEmployeeUser, loginAsEmployee } from './support/employee-users';
import { loginAsOperator } from './support/login';

const PASSWORD = 'test-only-custom-fields-colleague-password';

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

describe('Custom fields — Colleague under S16=R (e2e, Story 1.10 regression)', () => {
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

  it('GET /custom-fields no longer 403s for a Colleague and returns only colleague-visible definitions', async () => {
    await testApp.prisma.customFieldDefinition.create({
      data: {
        name: 'Regression management field',
        type: 'text',
        visibility: 'management',
      },
    });
    const colleagueVisible = await testApp.prisma.customFieldDefinition.create({
      data: {
        name: 'Regression colleague field',
        type: 'text',
        visibility: 'colleague',
      },
    });

    const colleague = await createEmployeeUser(
      testApp,
      'cf-regression-colleague@example.com',
      PASSWORD,
    );
    const colleagueAgent = await loginAsEmployee(
      testApp,
      colleague.email,
      PASSWORD,
    );

    const res = await colleagueAgent.get('/api/v1/custom-fields').expect(200);
    const body = res.body as Array<{ id: string; name: string }>;
    expect(body.map((definition) => definition.id)).toEqual([
      colleagueVisible.id,
    ]);
  });

  it('GET /custom-fields/values/:employeeId no longer 403s for a Colleague and returns only colleague-visible values', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'cf-regression-subject@example.com',
      PASSWORD,
    );
    const colleague = await createEmployeeUser(
      testApp,
      'cf-regression-viewer@example.com',
      PASSWORD,
    );

    const managementField = await testApp.prisma.customFieldDefinition.create({
      data: {
        name: 'Regression hidden field',
        type: 'text',
        visibility: 'management',
      },
    });
    await testApp.prisma.customFieldValue.create({
      data: {
        employeeId: subject.employeeId,
        fieldDefinitionId: managementField.id,
        valueText: 'secret',
      },
    });

    const colleagueField = await testApp.prisma.customFieldDefinition.create({
      data: {
        name: 'Regression visible field',
        type: 'text',
        visibility: 'colleague',
      },
    });
    await testApp.prisma.customFieldValue.create({
      data: {
        employeeId: subject.employeeId,
        fieldDefinitionId: colleagueField.id,
        valueText: 'shown',
      },
    });

    const colleagueAgent = await loginAsEmployee(
      testApp,
      colleague.email,
      PASSWORD,
    );
    const res = await colleagueAgent
      .get(`/api/v1/custom-fields/values/${subject.employeeId}`)
      .expect(200);
    const body = res.body as Array<{ fieldId: string; value: unknown }>;
    expect(body).toEqual([
      {
        employeeId: subject.employeeId,
        fieldId: colleagueField.id,
        value: 'shown',
      },
    ]);
  });

  it('PUT .../values/:employeeId still 403s for a Colleague — S16=R never grants write', async () => {
    const subject = await createEmployeeUser(
      testApp,
      'cf-regression-write-subject@example.com',
      PASSWORD,
    );
    const colleague = await createEmployeeUser(
      testApp,
      'cf-regression-write-viewer@example.com',
      PASSWORD,
    );
    const field = await testApp.prisma.customFieldDefinition.create({
      data: {
        name: 'Regression write field',
        type: 'text',
        visibility: 'colleague',
      },
    });

    const colleagueAgent = await loginAsEmployee(
      testApp,
      colleague.email,
      PASSWORD,
    );
    await colleagueAgent
      .put(`/api/v1/custom-fields/${field.id}/values/${subject.employeeId}`)
      .send({ value: 'blocked' })
      .expect(403);
  });
});
