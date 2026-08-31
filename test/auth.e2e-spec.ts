import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { OpenAPIObject } from '@nestjs/swagger';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/bootstrap';
import { PrismaService } from './../src/prisma/prisma.service';

interface SessionBody {
  userId: string;
  token?: unknown;
}

interface ErrorBody {
  message: string;
}

const getSessionCookie = (response: { headers: unknown }): string => {
  const headers = response.headers as Record<string, string[] | undefined>;
  const cookie = headers['set-cookie']?.[0];
  expect(cookie).toBeDefined();
  return cookie!;
};

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let openApiDocument: OpenAPIObject;

  const emailPrefix = `auth-e2e-${Date.now()}`;
  const email = `${emailPrefix}@example.com`;
  const password = 'test-only-auth-password';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    openApiDocument = configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);

    await prisma.user.create({
      data: {
        email,
        name: 'Authentication E2E',
        passwordHash: await hash(password, 12),
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } },
    });
    await app.close();
  });

  it('keeps login and health public while default-denying protected APIs', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    const response = await request(app.getHttpServer())
      .get('/api/v1/users')
      .expect(401);
    expect(getSessionCookie(response)).toContain('session=;');
    await request(app.getHttpServer()).post('/auth/login').expect(404);
  });

  it('sets only a secure browser cookie and restores the C7 session', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const loginBody = login.body as unknown as SessionBody;
    expect(typeof loginBody.userId).toBe('string');
    expect(Object.keys(loginBody)).toEqual(['userId']);
    expect(loginBody).not.toHaveProperty('token');
    const cookie = getSessionCookie(login);
    expect(cookie).toContain('session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Max-Age=');
    expect(cookie).not.toContain('Secure');
    const token = cookie.match(/session=([^;]+)/)?.[1];
    const maxAge = Number(cookie.match(/Max-Age=(\d+)/)?.[1]);
    if (!token) {
      throw new Error('Session token cookie was not set');
    }
    const payload = jwt.decode<{ iat: number; exp: number }>(token);
    expect(payload.exp - payload.iat).toBe(maxAge);

    const session = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', cookie)
      .expect(200);
    expect(session.body).toEqual({ userId: loginBody.userId });

    const users = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Cookie', cookie)
      .expect(200);
    expect(JSON.stringify(users.body)).not.toContain('passwordHash');
    expect(JSON.stringify(users.body)).not.toContain('"hash"');
  });

  it('uses the same generic 401 for unknown email and wrong password', async () => {
    const unknown = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `${emailPrefix}-missing@example.com`, password })
      .expect(401);
    const wrong = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-test-password' })
      .expect(401);
    const overlong = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: '€'.repeat(25) })
      .expect(401);

    const unknownBody = unknown.body as unknown as ErrorBody;
    const wrongBody = wrong.body as unknown as ErrorBody;
    const overlongBody = overlong.body as unknown as ErrorBody;
    expect(unknownBody.message).toBe('Invalid email or password');
    expect(wrongBody.message).toBe(unknownBody.message);
    expect(overlongBody.message).toBe(unknownBody.message);
    expect(getSessionCookie(unknown)).toContain('session=;');
    expect(getSessionCookie(wrong)).toContain('session=;');
  });

  it('rejects malformed cookies and clears stale browser state', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', 'session=not-a-jwt')
      .expect(401);

    expect(getSessionCookie(response)).toContain('session=;');
  });

  it('rejects expired cookies and clears stale browser state', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const expiredToken = await jwt.signAsync(
      { sub: user.id },
      { expiresIn: -1 },
    );
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', `session=${expiredToken}`)
      .expect(401);

    expect(getSessionCookie(response)).toContain('session=;');
  });

  it('rejects a valid token after its user is deleted', async () => {
    const deletedEmail = `${emailPrefix}-deleted@example.com`;
    const deleted = await prisma.user.create({
      data: {
        email: deletedEmail,
        passwordHash: await hash(password, 12),
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: deletedEmail, password })
      .expect(200);
    const cookie = getSessionCookie(login);

    await prisma.user.delete({ where: { id: deleted.id } });

    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', cookie)
      .expect(401);
    expect(getSessionCookie(response)).toContain('session=;');
  });

  it('protects Swagger UI and JSON with the same session cookie scheme', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(401);
    await request(app.getHttpServer()).get('/api/docs-json').expect(401);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const cookie = getSessionCookie(login);

    await request(app.getHttpServer())
      .get('/api/docs')
      .set('Cookie', cookie)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/docs-json')
      .set('Cookie', cookie)
      .expect(200);
    expect(openApiDocument.components?.securitySchemes?.session).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: 'session',
    });
  });

  it('enables credentialed CORS for the configured frontend origin', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/v1/auth/login')
      .set('Origin', 'http://localhost:4200')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:4200',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('logs out by expiring the session cookie', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const cookie = getSessionCookie(login);

    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .expect(204);
    expect(getSessionCookie(logout)).toContain('session=;');
  });
});
