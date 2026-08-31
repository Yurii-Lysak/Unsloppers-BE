import { Global, Module } from '@nestjs/common';
import { TimelineEventWriter } from '../contracts/timeline-event-writer.contract';
import { TimelineController } from './timeline.controller';
import { TimelineEventWriterService } from './timeline-event-writer.service';
import { TimelineSectionProvider } from './timeline-section.provider';
import { TimelineService } from './timeline.service';

/**
 * `timeline` — implements C4 `TimelineEventWriter` (Story 7.1) and S9
 * read/write API + SectionProvider (Story 7.2). C4 is bound directly here
 * (mirroring C1/C7). @Global() so every module injects the real writer
 * without importing this module explicitly.
 */
@Global()
@Module({
  controllers: [TimelineController],
  providers: [
    TimelineEventWriterService,
    TimelineService,
    TimelineSectionProvider,
    { provide: TimelineEventWriter, useClass: TimelineEventWriterService },
  ],
  exports: [TimelineEventWriter, TimelineService],
})
export class TimelineModule {}
