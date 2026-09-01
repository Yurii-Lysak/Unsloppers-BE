import request from 'supertest';
import { UserEntity } from './../src/modules/users/entities/user.entity';
import { createTestApp, TestApp } from './support/app-harness';
import { E2E_OPERATOR_EMAIL, loginAsOperator } from './support/login';

describe('Users CRUD (e2e)', () => {
  let testApp: TestApp;
  let agent: ReturnType<typeof request.agent>;

  const email = 'e2e-user@example.com';
  const missingId = '00000000-0000-0000-0000-000000000000';
  let createdId: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    agent = await loginAsOperator(testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('POST /api/v1/users creates a user', async () => {
    const res = await agent
      .post('/api/v1/users')
      .send({ email, name: 'E2E User' })
      .expect(201);

    const body = res.body as UserEntity;
    expect(body.email).toBe(email);
    expect(body.name).toBe('E2E User');
    expect(body.id).toBeDefined();
    createdId = body.id;
  });

  it('POST /api/v1/users with the same email returns 409', () => {
    return agent.post('/api/v1/users').send({ email }).expect(409);
  });

  it('POST /api/v1/users with an invalid email returns 400', () => {
    return agent
      .post('/api/v1/users')
      .send({ email: 'not-an-email' })
      .expect(400);
  });

  it('GET /api/v1/users is forbidden in bootcamp scope', async () => {
    await agent.get('/api/v1/users').expect(403);
  });

  it('GET /api/v1/users/:id returns the user when requesting own record', async () => {
    const operator = await testApp.prisma.user.findUniqueOrThrow({
      where: { email: E2E_OPERATOR_EMAIL },
      select: { id: true },
    });
    const res = await agent.get(`/api/v1/users/${operator.id}`).expect(200);

    expect((res.body as UserEntity).email).toBe(E2E_OPERATOR_EMAIL);
  });

  it('GET /api/v1/users/:id with an unknown id returns 403', () => {
    return agent.get(`/api/v1/users/${missingId}`).expect(403);
  });

  it('PATCH /api/v1/users/:id updates the name', async () => {
    const res = await agent
      .patch(`/api/v1/users/${createdId}`)
      .send({ name: 'Renamed User' })
      .expect(200);

    expect((res.body as UserEntity).name).toBe('Renamed User');
  });

  it('DELETE /api/v1/users/:id returns 204', () => {
    return agent.delete(`/api/v1/users/${createdId}`).expect(204);
  });

  it('GET /api/v1/users/:id after deletion returns 403 for another user id', () => {
    return agent.get(`/api/v1/users/${createdId}`).expect(403);
  });
});
