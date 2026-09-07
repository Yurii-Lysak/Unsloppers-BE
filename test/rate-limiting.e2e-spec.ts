import { randomBytes } from 'node:crypto';
import request from 'supertest';
import {
  LOGIN_THROTTLE_LIMIT,
  SHARED_LINK_THROTTLE_LIMIT,
} from '../src/common/throttling/throttle-limits';
import { createTestApp, TestApp } from './support/app-harness';
import {
  BOOTCAMP_COLLEAGUE_EMAIL,
  BOOTCAMP_E2E_PASSWORD,
  BootcampWhitelistGraph,
  seedBootcampWhitelistGraph,
} from './support/bootcamp-seed';

describe('Rate limiting (e2e)', () => {
  describe('POST /auth/login', () => {
    let testApp: TestApp;

    beforeAll(async () => {
      testApp = await createTestApp();
      await seedBootcampWhitelistGraph(testApp.prisma);
    });

    afterAll(async () => {
      await testApp.close();
    });

    it('returns 429 when login attempts exceed the per-IP limit', async () => {
      for (let attempt = 0; attempt < LOGIN_THROTTLE_LIMIT; attempt++) {
        await request(testApp.server)
          .post('/api/v1/auth/login')
          .send({
            email: 'nonexistent@altexsoft.com',
            password: 'wrong-password',
          })
          .expect(401);
      }

      await request(testApp.server)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@altexsoft.com',
          password: 'wrong-password',
        })
        .expect(429);
    });
  });

  describe('GET /shared-links/:token/profile', () => {
    let testApp: TestApp;
    let seeded: BootcampWhitelistGraph;
    let sharedLinkToken: string;

    beforeAll(async () => {
      testApp = await createTestApp();
      seeded = await seedBootcampWhitelistGraph(testApp.prisma);

      const managerEmployee = await testApp.prisma.employee.findFirstOrThrow({
        where: { user: { email: seeded.managerEmail } },
        select: { id: true },
      });

      sharedLinkToken = randomBytes(32).toString('base64url');
      await testApp.prisma.sharedLink.create({
        data: {
          token: sharedLinkToken,
          subjectEmployeeId: seeded.reportEmployeeId,
          creatorEmployeeId: managerEmployee.id,
          recipientEmployeeId: seeded.colleagueEmployeeId,
          expiresAt: new Date(Date.now() + 3_600_000),
          sections: { create: [{ sectionId: 'S1' }] },
        },
      });
    });

    afterAll(async () => {
      await testApp.close();
    });

    it('returns 429 when consumption exceeds the per-IP limit', async () => {
      const recipientAgent = request.agent(testApp.server);
      await recipientAgent
        .post('/api/v1/auth/login')
        .send({
          email: BOOTCAMP_COLLEAGUE_EMAIL,
          password: BOOTCAMP_E2E_PASSWORD,
        })
        .expect(200);

      for (let attempt = 0; attempt < SHARED_LINK_THROTTLE_LIMIT; attempt++) {
        await recipientAgent
          .get(`/api/v1/shared-links/${sharedLinkToken}/profile`)
          .expect(200);
      }

      await recipientAgent
        .get(`/api/v1/shared-links/${sharedLinkToken}/profile`)
        .expect(429);
    });
  });
});
