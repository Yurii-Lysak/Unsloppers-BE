import { PrismaClient } from '../../src/generated/prisma/client';
import { assertOwnedSchema, testSchemaName } from './test-schema';

/**
 * In-test database helpers. Imports the generated Prisma client, so this module
 * is only usable from test code — see `schema-provisioning.ts` for the setup-time
 * equivalent and `test-schema.ts` for the parts both sides share.
 */

/**
 * Empties every application table in the schema, leaving the migration history
 * intact. Cheaper than recreating the schema between files, and it keeps each
 * file independent of whatever ran before it.
 */
export async function truncateAllTables(
  client: PrismaClient,
  schema: string = testSchemaName(),
): Promise<void> {
  assertOwnedSchema(schema);

  const tables = await client.$queryRawUnsafe<{ tablename: string }[]>(
    'SELECT tablename FROM pg_tables WHERE schemaname = $1',
    schema,
  );

  const targets = tables
    .map((row) => row.tablename)
    .filter((name) => name !== '_prisma_migrations');

  if (targets.length === 0) {
    return;
  }

  const list = targets.map((name) => `"${schema}"."${name}"`).join(', ');
  await client.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}
