/**
 * Prisma-standard seed entrypoint (Story 1.16), registered under
 * `migrations.seed` in `prisma.config.ts` for `prisma migrate dev` only.
 * `npm run db:seed` and `postbuild` run `nest build && node dist/prisma/seed.js`
 * directly — bypassing Prisma's `db seed` wrapper (see prisma.config.ts).
 *
 * Loads the bundled bootcamp identity manifest — no TimeTracker/VPN required.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SeedService } from '../src/prisma/seed/seed.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const seedService = new SeedService(app.get(PrismaService));
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
