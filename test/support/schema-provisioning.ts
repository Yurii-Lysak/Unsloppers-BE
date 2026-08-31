import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import {
  assertLocalDatabase,
  assertOwnedSchema,
  databaseUrl,
  schemaScopedUrl,
} from './test-schema';

/**
 * Creates and drops the per-worker schemas through the Prisma CLI.
 *
 * The CLI is used rather than the generated client because this runs from Jest's
 * `globalSetup`, where the client cannot be loaded. Both commands take their
 * datasource from `prisma.config.ts`, which reads `DATABASE_URL` — and dotenv
 * does not override a variable that is already set, so passing it in the child
 * environment is what selects the target schema.
 */

const execFileAsync = promisify(execFile);

const serviceRoot = join(__dirname, '..', '..');

function prismaCliPath(): string {
  return join(
    dirname(require.resolve('prisma/package.json')),
    'build',
    'index.js',
  );
}

async function runPrisma(args: string[], url: string): Promise<void> {
  await execFileAsync(process.execPath, [prismaCliPath(), ...args], {
    cwd: serviceRoot,
    env: { ...process.env, DATABASE_URL: url },
  });
}

/**
 * Drops the schemas and recreates them with the migrations applied.
 *
 * `migrate deploy` creates the schema named in the URL when it is missing, so
 * dropping first is what guarantees a clean start rather than whatever a
 * previous interrupted run left behind.
 */
export async function provisionSchemas(schemas: string[]): Promise<void> {
  assertLocalDatabase(databaseUrl());

  await dropSchemas(schemas);

  try {
    await Promise.all(
      schemas.map((schema) =>
        runPrisma(['migrate', 'deploy'], schemaScopedUrl(schema)),
      ),
    );
  } catch (error) {
    throw new Error(
      `Failed to apply migrations to the test schemas. Is Postgres up (\`npm run db:up\`)?\n${describe(error)}`,
    );
  }
}

export async function dropSchemas(schemas: string[]): Promise<void> {
  assertLocalDatabase(databaseUrl());
  for (const schema of schemas) {
    assertOwnedSchema(schema);
  }

  const statements = schemas
    .map((schema) => `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`)
    .join('\n');

  const directory = await mkdtemp(join(tmpdir(), 'tea-schema-'));
  const scriptPath = join(directory, 'drop-schemas.sql');

  try {
    await writeFile(scriptPath, statements, 'utf8');
    await runPrisma(['db', 'execute', '--file', scriptPath], databaseUrl());
  } catch (error) {
    throw new Error(
      `Failed to drop the test schemas. Is Postgres up (\`npm run db:up\`)?\n${describe(error)}`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
