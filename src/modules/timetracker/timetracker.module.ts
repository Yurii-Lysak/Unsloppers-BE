import { Module } from '@nestjs/common';
import { TimetrackerService } from './timetracker.service';

/**
 * `timetracker` — HTTP client for the TimeTracker External API, consumed
 * only by `prisma/seed.ts` (Story 1.16) via `NestFactory.createApplicationContext`.
 * No controller: this is a seed-time infrastructure client, not an
 * HTTP-facing feature (see `timetracker.types.ts` header).
 */
@Module({
  providers: [TimetrackerService],
  exports: [TimetrackerService],
})
export class TimetrackerModule {}
