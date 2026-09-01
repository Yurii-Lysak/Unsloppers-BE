import { Global, Module } from '@nestjs/common';
import { TimetrackerClient } from '../contracts/timetracker-client.contract';
import { TimetrackerService } from './timetracker.service';

/**
 * `timetracker` — HTTP client for the TimeTracker External API. Bound as
 * `TimetrackerClient` so `integrations` and seed paths consume via contracts (AD-1).
 */
@Global()
@Module({
  providers: [
    TimetrackerService,
    { provide: TimetrackerClient, useExisting: TimetrackerService },
  ],
  exports: [TimetrackerClient],
})
export class TimetrackerModule {}
