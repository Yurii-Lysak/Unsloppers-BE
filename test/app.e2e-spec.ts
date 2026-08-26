import { HealthCheckResult } from '@nestjs/terminus';
import request from 'supertest';
import { createTestApp, TestApp } from './support/app-harness';

describe('AppModule (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('/health (GET)', () => {
    return request(testApp.server)
      .get('/health')
      .expect(200)
      .expect((res) => {
        const body = res.body as HealthCheckResult;
        expect(body.status).toBe('ok');
        expect(body.info?.database?.status).toBe('up');
      });
  });
});
