import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import type { OpenAPIObject } from '@nestjs/swagger';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { Clock } from '../../src/clock/clock.service';
import { PrismaClient } from '../../src/generated/prisma/client';
import { TimelineEventWriter } from '../../src/modules/contracts/timeline-event-writer.contract';
import { createTemporalHistoryExtension } from '../../src/prisma/extensions/temporal-history.extension';
import { PrismaService } from '../../src/prisma/prisma.service';
import { truncateAllTables } from './test-database';
import { databaseUrl, testSchemaName } from './test-schema';

/**
 * Boots the application for an e2e test against this worker's own schema.
 *
 * Every e2e file previously repeated the same bootstrap, and each one had to
 * remember that the test app does not inherit `main.ts` — so the global
 * ValidationPipe had to be re-applied by hand or validation quietly did
 * nothing. That bootstrap lives here once, together with the schema wiring
 * that makes parallel workers safe.
 */

/**
 * The application's `PrismaService` reads a bare connection string, which lands
 * every worker in `public`. This variant pins the client to one schema through
 * the adapter's `schema` option, which is what keeps workers off each other's
 * rows.
 */
class SchemaScopedPrismaService extends PrismaClient {
  constructor(schema: string) {
    super({
      adapter: new PrismaPg({ connectionString: databaseUrl() }, { schema }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

export interface TestAppOptions {
  /**
   * Substitutes the injectable clock, so time-dependent behaviour can be moved
   * on purpose. Omit to keep the system clock.
   */
  readonly clock?: Clock;
  /**
   * Set to false to keep whatever rows are already in the schema. Defaults to
   * truncating, so a file cannot inherit state from the file before it.
   */
  readonly truncate?: boolean;
}

export interface TestApp {
  readonly app: INestApplication<App>;
  readonly prisma: PrismaService;
  /** Pass to `request(...)` from supertest. */
  readonly server: App;
  /** The Postgres schema this app is pinned to. */
  readonly schema: string;
  readonly openApiDocument: OpenAPIObject;
  /** Empties every application table, keeping the migration history. */
  resetDatabase(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestApp(
  options: TestAppOptions = {},
): Promise<TestApp> {
  const schema = testSchemaName();

  let builder: TestingModuleBuilder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useFactory({
      factory: (timelineEventWriter: TimelineEventWriter) => {
        const raw = new SchemaScopedPrismaService(schema);
        const extended = raw.$extends(
          createTemporalHistoryExtension(timelineEventWriter, raw),
        );

        (extended as unknown as PrismaService).onModuleInit =
          raw.onModuleInit.bind(raw);
        (extended as unknown as PrismaService).onModuleDestroy =
          raw.onModuleDestroy.bind(raw);

        return extended;
      },
      inject: [TimelineEventWriter],
    });

  if (options.clock !== undefined) {
    builder = builder.overrideProvider(Clock).useValue(options.clock);
  }

  const moduleRef = await builder.compile();

  const app: INestApplication<App> = moduleRef.createNestApplication();
  // main.ts bootstrap is not inherited by the test app — mirror production
  // prefix, versioning, cookies, CORS, and Swagger (Story 1.18).
  const openApiDocument = configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  const resetDatabase = () => truncateAllTables(prisma, schema);

  if (options.truncate !== false) {
    await resetDatabase();
  }

  return {
    app,
    prisma,
    server: app.getHttpServer(),
    schema,
    openApiDocument,
    resetDatabase,
    close: async () => {
      await app.close();
    },
  };
}
