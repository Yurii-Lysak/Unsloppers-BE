import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { UserEntity } from './../src/modules/users/entities/user.entity';
import { PrismaService } from './../src/prisma/prisma.service';
import { configureApp } from './../src/bootstrap';

describe('Users CRUD (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let agent: ReturnType<typeof request.agent>;

  const emailPrefix = `e2e-${Date.now()}`;
  const email = `${emailPrefix}@example.com`;
  const operatorEmail = `${emailPrefix}-operator@example.com`;
  const operatorPassword = 'test-only-users-password';
  const missingId = '00000000-0000-0000-0000-000000000000';
  let createdId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.user.create({
      data: {
        email: operatorEmail,
        passwordHash: await hash(operatorPassword, 12),
      },
    });
    agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ email: operatorEmail, password: operatorPassword })
      .expect(200);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await app.close();
  });

  it('POST /users creates a user', async () => {
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

  it('POST /users with the same email returns 409', () => {
    return agent.post('/api/v1/users').send({ email }).expect(409);
  });

  it('POST /users with an invalid email returns 400', () => {
    return agent
      .post('/api/v1/users')
      .send({ email: 'not-an-email' })
      .expect(400);
  });

  it('GET /users returns the list including the created user', async () => {
    const res = await agent.get('/api/v1/users').expect(200);

    const body = res.body as UserEntity[];
    expect(body.some((u) => u.id === createdId)).toBe(true);
  });

  it('GET /users/:id returns the user', async () => {
    const res = await agent.get(`/api/v1/users/${createdId}`).expect(200);

    expect((res.body as UserEntity).email).toBe(email);
  });

  it('GET /users/:id with an unknown id returns 404', () => {
    return agent.get(`/api/v1/users/${missingId}`).expect(404);
  });

  it('PATCH /users/:id updates the name', async () => {
    const res = await agent
      .patch(`/api/v1/users/${createdId}`)
      .send({ name: 'Renamed User' })
      .expect(200);

    expect((res.body as UserEntity).name).toBe('Renamed User');
  });

  it('DELETE /users/:id returns 204', () => {
    return agent.delete(`/api/v1/users/${createdId}`).expect(204);
  });

  it('GET /users/:id after deletion returns 404', () => {
    return agent.get(`/api/v1/users/${createdId}`).expect(404);
  });
});
