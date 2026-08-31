import { createTestApp, TestApp } from './support/app-harness';
import { loginAsOperator } from './support/login';

/**
 * Proves the isolation mechanism itself. Without these assertions a broken
 * schema wiring looks exactly like a passing suite, right up to the point where
 * two workers start deleting each other's rows.
 */
describe('per-worker database isolation (e2e)', () => {
  let testApp: TestApp;

  const countRows = async (app: TestApp, table: string): Promise<number> => {
    const rows = await app.prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM "${app.schema}"."${table}"`,
    );
    return rows[0].count;
  };

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
  });

  it('pins the app to the schema owned by this Jest worker', () => {
    const workerId = process.env.JEST_WORKER_ID ?? '1';

    expect(testApp.schema).toBe(`tea_test_w${workerId}`);
  });

  it('has the migrated tables inside that schema', async () => {
    const tables = await testApp.prisma.$queryRawUnsafe<
      { tablename: string }[]
    >('SELECT tablename FROM pg_tables WHERE schemaname = $1', testApp.schema);

    expect(tables.map((row) => row.tablename)).toContain('users');
  });

  it('writes rows into that schema rather than public', async () => {
    const agent = await loginAsOperator(testApp);
    await agent
      .post('/api/v1/users')
      .send({ email: 'isolation@example.com' })
      .expect(201);

    await expect(countRows(testApp, 'users')).resolves.toBe(2);
  });

  it('empties the tables on resetDatabase', async () => {
    const agent = await loginAsOperator(testApp);
    await agent
      .post('/api/v1/users')
      .send({ email: 'to-be-cleared@example.com' })
      .expect(201);

    await testApp.resetDatabase();

    await expect(countRows(testApp, 'users')).resolves.toBe(0);
  });

  it('keeps the migration history through a reset', async () => {
    await testApp.resetDatabase();

    const rows = await testApp.prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM "${testApp.schema}"."_prisma_migrations"`,
    );

    expect(rows[0].count).toBeGreaterThan(0);
  });

  it('hands every new app an empty schema', async () => {
    const agent = await loginAsOperator(testApp);
    await agent
      .post('/api/v1/users')
      .send({ email: 'leftover@example.com' })
      .expect(201);

    const secondApp = await createTestApp();
    try {
      await expect(countRows(secondApp, 'users')).resolves.toBe(0);
      expect(secondApp.schema).toBe(testApp.schema);
    } finally {
      await secondApp.close();
    }
  });

  it('lets a fixed email be reused, because the schema is private to the worker', async () => {
    const agent = await loginAsOperator(testApp);
    await agent
      .post('/api/v1/users')
      .send({ email: 'fixed@example.com' })
      .expect(201);

    await testApp.resetDatabase();

    const again = await loginAsOperator(testApp);
    await again
      .post('/api/v1/users')
      .send({ email: 'fixed@example.com' })
      .expect(201);
  });
});
