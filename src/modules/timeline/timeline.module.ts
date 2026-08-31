import { Global, Module } from '@nestjs/common';
import { TimelineEventWriter } from '../contracts/timeline-event-writer.contract';
import { TimelineEventWriterService } from './timeline-event-writer.service';

/**
 * `timeline` — implements C4 `TimelineEventWriter` for real (Story 7.1),
 * bound directly here (C4 is deliberately unbound in `ContractsModule`,
 * mirroring C1/C7). @Global() so every module (including `PrismaModule`'s
 * injects the real writer without importing this module explicitly.
 *
 * Deliberate exception to `nest-modules.md`'s standard module anatomy — no
 * controller until Story 7.2 adds S9 read/write API endpoints.
 */
@Global()
@Module({
  providers: [
    { provide: TimelineEventWriter, useClass: TimelineEventWriterService },
  ],
  exports: [TimelineEventWriter],
})
export class TimelineModule {}
