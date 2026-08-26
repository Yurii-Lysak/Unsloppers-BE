import request from 'supertest';
import { App } from 'supertest/types';
import { UserEntity } from './../src/modules/users/entities/user.entity';
import { createTestApp, TestApp } from './support/app-harness';

describe('Users CRUD (e2e)', () => {
  let testApp: TestApp;
  let server: App;

  const email = 'e2e-user@example.com';
  const missingId = '00000000-0000-0000-0000-000000000000';
  let createdId: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    server = testApp.server;
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('POST /users creates a user', async () => {
    const res = await request(server)
      .post('/users')
      .send({ email, name: 'E2E User' })
      .expect(201);

    const body = res.body as UserEntity;
    expect(body.email).toBe(email);
    expect(body.name).toBe('E2E User');
    expect(body.id).toBeDefined();
    createdId = body.id;
  });

  it('POST /users with the same email returns 409', () => {
    return request(server).post('/users').send({ email }).expect(409);
  });

  it('POST /users with an invalid email returns 400', () => {
    return request(server)
      .post('/users')
      .send({ email: 'not-an-email' })
      .expect(400);
  });

  it('GET /users returns the list including the created user', async () => {
    const res = await request(server).get('/users').expect(200);

    const body = res.body as UserEntity[];
    expect(body.some((u) => u.id === createdId)).toBe(true);
  });

  it('GET /users/:id returns the user', async () => {
    const res = await request(server).get(`/users/${createdId}`).expect(200);

    expect((res.body as UserEntity).email).toBe(email);
  });

  it('GET /users/:id with an unknown id returns 404', () => {
    return request(server).get(`/users/${missingId}`).expect(404);
  });

  it('PATCH /users/:id updates the name', async () => {
    const res = await request(server)
      .patch(`/users/${createdId}`)
      .send({ name: 'Renamed User' })
      .expect(200);

    expect((res.body as UserEntity).name).toBe('Renamed User');
  });

  it('DELETE /users/:id returns 204', () => {
    return request(server).delete(`/users/${createdId}`).expect(204);
  });

  it('GET /users/:id after deletion returns 404', () => {
    return request(server).get(`/users/${createdId}`).expect(404);
  });
});
