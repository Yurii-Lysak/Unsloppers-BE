import { hash } from 'bcryptjs';
import request from 'supertest';
import { BUILTIN_FIELD_IDS } from '../src/modules/contracts/field-registry.contract';
import { createTestApp, TestApp } from './support/app-harness';
import { FixedClock } from './support/fixed-clock';

const PASSWORD = 'test-only-saved-views-password';

interface SavedViewResponse {
  id: string;
  name: string;
  filters: Array<{ fieldId: string; operator: string; value: unknown }>;
  columnIds: string[];
  isOwner: boolean;
  canEdit: boolean;
  sharedWith: Array<{ employeeId: string; name: string }>;
}

async function createEmployeeUser(
  testApp: TestApp,
  email: string,
  name: string,
): Promise<{ userId: string; employeeId: string; email: string }> {
  const user = await testApp.prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hash(PASSWORD, 12),
    },
  });
  const employee = await testApp.prisma.employee.create({
    data: { id: user.id, userId: user.id },
  });

  const effectiveFrom = new Date('2020-01-01T00:00:00.000Z');
  await testApp.prisma.gradeHistory.create({
    data: { employeeId: employee.id, value: 'Senior', effectiveFrom },
  });
  await testApp.prisma.positionHistory.create({
    data: { employeeId: employee.id, value: 'Engineer', effectiveFrom },
  });
  await testApp.prisma.departmentHistory.create({
    data: { employeeId: employee.id, value: 'Engineering', effectiveFrom },
  });
  await testApp.prisma.employmentTypeHistory.create({
    data: { employeeId: employee.id, value: 'Full-time', effectiveFrom },
  });

  return { userId: user.id, employeeId: employee.id, email };
}

async function loginAs(
  testApp: TestApp,
  email: string,
): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(testApp.server);
  await agent
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return agent;
}

describe('Saved views (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      clock: new FixedClock(new Date('2026-08-31T12:00:00.000Z')),
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
  });

  it('POST /api/v1/saved-views persists a named view', async () => {
    const owner = await createEmployeeUser(
      testApp,
      'saved-view-owner@example.com',
      'Owner User',
    );
    const agent = await loginAs(testApp, owner.email);

    const res = await agent
      .post('/api/v1/saved-views')
      .send({
        name: 'Needs a conversation',
        filters: [
          {
            fieldId: BUILTIN_FIELD_IDS.grade,
            operator: 'eq',
            value: 'Senior',
          },
        ],
        columnIds: [BUILTIN_FIELD_IDS.name, BUILTIN_FIELD_IDS.grade],
        sort: BUILTIN_FIELD_IDS.name,
        order: 'asc',
      })
      .expect(201);

    const body = res.body as SavedViewResponse;
    expect(body.name).toBe('Needs a conversation');
    expect(body.isOwner).toBe(true);
    expect(body.columnIds).toEqual([
      BUILTIN_FIELD_IDS.name,
      BUILTIN_FIELD_IDS.grade,
    ]);

    const listRes = await agent.get('/api/v1/saved-views').expect(200);
    const views = listRes.body as SavedViewResponse[];
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe(body.id);
  });

  it('shared views appear for recipients and remain read-only', async () => {
    const owner = await createEmployeeUser(
      testApp,
      'saved-view-share-owner@example.com',
      'Owner User',
    );
    const recipient = await createEmployeeUser(
      testApp,
      'saved-view-share-recipient@example.com',
      'Recipient User',
    );

    const ownerAgent = await loginAs(testApp, owner.email);
    const createRes = await ownerAgent
      .post('/api/v1/saved-views')
      .send({
        name: 'Shared bench',
        filters: [],
        columnIds: [BUILTIN_FIELD_IDS.name],
      })
      .expect(201);
    const view = createRes.body as SavedViewResponse;

    await ownerAgent
      .put(`/api/v1/saved-views/${view.id}/shares`)
      .send({ recipientEmployeeIds: [recipient.employeeId] })
      .expect(200);

    const recipientAgent = await loginAs(testApp, recipient.email);
    const listRes = await recipientAgent.get('/api/v1/saved-views').expect(200);
    const views = listRes.body as SavedViewResponse[];
    expect(views).toHaveLength(1);
    expect(views[0].isOwner).toBe(false);
    expect(views[0].canEdit).toBe(false);

    await recipientAgent
      .patch(`/api/v1/saved-views/${view.id}`)
      .send({ name: 'Hijacked' })
      .expect(403);
  });

  it('DELETE /api/v1/saved-views/:viewId removes the view for the owner', async () => {
    const owner = await createEmployeeUser(
      testApp,
      'saved-view-delete-owner@example.com',
      'Owner User',
    );
    const agent = await loginAs(testApp, owner.email);

    const createRes = await agent
      .post('/api/v1/saved-views')
      .send({ name: 'Temporary', filters: [], columnIds: [BUILTIN_FIELD_IDS.name] })
      .expect(201);
    const view = createRes.body as SavedViewResponse;

    await agent.delete(`/api/v1/saved-views/${view.id}`).expect(200);

    const listRes = await agent.get('/api/v1/saved-views').expect(200);
    expect(listRes.body as SavedViewResponse[]).toHaveLength(0);
  });

  it('reducing the share list removes access for the dropped recipient', async () => {
    const owner = await createEmployeeUser(
      testApp,
      'saved-view-reduce-owner@example.com',
      'Owner User',
    );
    const keptRecipient = await createEmployeeUser(
      testApp,
      'saved-view-reduce-kept@example.com',
      'Kept Recipient',
    );
    const droppedRecipient = await createEmployeeUser(
      testApp,
      'saved-view-reduce-dropped@example.com',
      'Dropped Recipient',
    );

    const ownerAgent = await loginAs(testApp, owner.email);
    const createRes = await ownerAgent
      .post('/api/v1/saved-views')
      .send({ name: 'Two recipients', filters: [], columnIds: [BUILTIN_FIELD_IDS.name] })
      .expect(201);
    const view = createRes.body as SavedViewResponse;

    await ownerAgent
      .put(`/api/v1/saved-views/${view.id}/shares`)
      .send({
        recipientEmployeeIds: [
          keptRecipient.employeeId,
          droppedRecipient.employeeId,
        ],
      })
      .expect(200);

    // Owner drops one recipient, keeping the other.
    await ownerAgent
      .put(`/api/v1/saved-views/${view.id}/shares`)
      .send({ recipientEmployeeIds: [keptRecipient.employeeId] })
      .expect(200);

    const keptAgent = await loginAs(testApp, keptRecipient.email);
    const keptListRes = await keptAgent.get('/api/v1/saved-views').expect(200);
    expect(keptListRes.body as SavedViewResponse[]).toHaveLength(1);

    const droppedAgent = await loginAs(testApp, droppedRecipient.email);
    const droppedListRes = await droppedAgent
      .get('/api/v1/saved-views')
      .expect(200);
    expect(droppedListRes.body as SavedViewResponse[]).toHaveLength(0);
  });

  it('unsharing down to zero recipients removes the view from everyone', async () => {
    const owner = await createEmployeeUser(
      testApp,
      'saved-view-unshare-all-owner@example.com',
      'Owner User',
    );
    const recipient = await createEmployeeUser(
      testApp,
      'saved-view-unshare-all-recipient@example.com',
      'Recipient User',
    );

    const ownerAgent = await loginAs(testApp, owner.email);
    const createRes = await ownerAgent
      .post('/api/v1/saved-views')
      .send({ name: 'Solo share', filters: [], columnIds: [BUILTIN_FIELD_IDS.name] })
      .expect(201);
    const view = createRes.body as SavedViewResponse;

    await ownerAgent
      .put(`/api/v1/saved-views/${view.id}/shares`)
      .send({ recipientEmployeeIds: [recipient.employeeId] })
      .expect(200);

    // Owner unshares the view from its only recipient.
    await ownerAgent
      .put(`/api/v1/saved-views/${view.id}/shares`)
      .send({ recipientEmployeeIds: [] })
      .expect(200);

    const recipientAgent = await loginAs(testApp, recipient.email);
    const listRes = await recipientAgent.get('/api/v1/saved-views').expect(200);
    expect(listRes.body as SavedViewResponse[]).toHaveLength(0);
  });

  it('rejects sharing a view with oneself', async () => {
    const owner = await createEmployeeUser(
      testApp,
      'saved-view-self-share-owner@example.com',
      'Owner User',
    );
    const agent = await loginAs(testApp, owner.email);

    const createRes = await agent
      .post('/api/v1/saved-views')
      .send({ name: 'Self share', filters: [], columnIds: [BUILTIN_FIELD_IDS.name] })
      .expect(201);
    const view = createRes.body as SavedViewResponse;

    await agent
      .put(`/api/v1/saved-views/${view.id}/shares`)
      .send({ recipientEmployeeIds: [owner.employeeId] })
      .expect(403);
  });

  it('rejects a whitespace-only view name with 400', async () => {
    const owner = await createEmployeeUser(
      testApp,
      'saved-view-whitespace-name@example.com',
      'Owner User',
    );
    const agent = await loginAs(testApp, owner.email);

    await agent
      .post('/api/v1/saved-views')
      .send({ name: '   ', filters: [], columnIds: [BUILTIN_FIELD_IDS.name] })
      .expect(400);
  });
});
