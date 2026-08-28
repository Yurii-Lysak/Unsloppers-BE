/**
 * Prisma-standard seed entrypoint (Story 1.16), registered under
 * `migrations.seed` in `prisma.config.ts` for `prisma migrate dev` only.
 * `npm run db:seed` and `postbuild` run `nest build && node dist/prisma/seed.js`
 * directly — bypassing Prisma's `db seed` wrapper (see prisma.config.ts).
 *
 * Deliberately thin: `NestFactory.createApplicationContext(AppModule)` gets
 * the real, extension-wrapped `PrismaService` (Story 1.20's temporal-history
 * guarantees intact) and `TimetrackerService` via normal DI, then hands both
 * to `SeedService` (`src/prisma/seed/seed.service.ts`), which holds all the
 * actual logic and is unit-tested there — Jest's `rootDir` is `src`, so a
 * `prisma/*.spec.ts` file would never be discovered.
 *
 * `prisma/seed.ts` is intentionally outside `.dependency-cruiser.cjs`'s
 * module-boundary rule (that rule only constrains `src/modules/**`) — it may
 * import `PrismaService` and the `timetracker` module's service directly.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TimetrackerService } from '../src/modules/timetracker/timetracker.service';
import { SeedService } from '../src/prisma/seed/seed.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const seedService = new SeedService(
      app.get(PrismaService),
      app.get(TimetrackerService),
    );
    await seedService.run();
  } finally {
    await app.close();
  }
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', error);
  process.exit(1);
});
