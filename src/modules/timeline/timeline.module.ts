import { Global, Module } from '@nestjs/common';
import { TimelineEventWriter } from '../contracts/timeline-event-writer.contract';
import { TimelineEventWriterService } from './timeline-event-writer.service';

/**
 * `timeline` — implements C4 `TimelineEventWriter` for real (Story 7.1),
 * taking over the DI token that `contracts` binds to a Wave-0 stub.
 * @Global() so every module (including `PrismaModule`'s extension factory)
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
