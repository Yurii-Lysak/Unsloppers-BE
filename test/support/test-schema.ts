/**
 * Naming and safety rules for the per-worker test schemas.
 *
 * Deliberately free of any Prisma client import: Jest's `globalSetup` runs
 * outside the module registry that applies `moduleNameMapper`, so the generated
 * client cannot be loaded from there. Everything in this file is safe to import
 * from both setup and test code.
 */

const SCHEMA_PREFIX = process.env.TEA_TEST_SCHEMA_PREFIX ?? 'tea_test';

const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'host.docker.internal',
]);

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error(
      'DATABASE_URL is not set. The e2e suite needs the docker Postgres: run `npm run db:up` and check your .env.',
    );
  }
  return url;
}

/**
 * Refuses to provision against anything but a local database unless the
 * operator opts in explicitly. The setup drops schemas, and a shared or staging
 * database is the one place where that is not a harmless statement.
 */
export function assertLocalDatabase(url: string): void {
  if (process.env.TEA_ALLOW_REMOTE_TEST_DB === '1') {
    return;
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('DATABASE_URL is not a parseable URL.');
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to create or drop test schemas on "${host}": the e2e setup drops schemas and is meant for a local database only. ` +
        'Set TEA_ALLOW_REMOTE_TEST_DB=1 if you genuinely intend to target this host.',
    );
  }
}

/** Guards every destructive statement, so only harness-owned schemas can be hit. */
export function assertOwnedSchema(schema: string): void {
  if (!schema.startsWith(`${SCHEMA_PREFIX}_w`)) {
    throw new Error(
      `Refusing to touch schema "${schema}": only schemas prefixed "${SCHEMA_PREFIX}_w" are managed by the test harness.`,
    );
  }
}

/** The schema belonging to the current Jest worker. */
export function testSchemaName(
  workerId: string = process.env.JEST_WORKER_ID ?? '1',
): string {
  return `${SCHEMA_PREFIX}_w${workerId}`;
}

/** Schemas for workers 1..count, matching the ids Jest hands to its workers. */
export function testSchemaNames(workerCount: number): string[] {
  const count =
    Number.isFinite(workerCount) && workerCount > 0 ? workerCount : 1;
  return Array.from({ length: count }, (_, index) =>
    testSchemaName(String(index + 1)),
  );
}

/** Base URL with the schema query parameter pointed at `schema`. */
export function schemaScopedUrl(schema: string): string {
  const url = new URL(databaseUrl());
  url.searchParams.set('schema', schema);
  return url.toString();
}
