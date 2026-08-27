import { Injectable, Logger } from '@nestjs/common';
import {
  TimelineEventWriter,
  TimelineEventSource,
} from '../timeline-event-writer.contract';

/** Wave-0 stub — logs and no-ops, so callers can integrate before `timeline` (Epic 7) lands. */
@Injectable()
export class TimelineEventWriterStub extends TimelineEventWriter {
  private readonly logger = new Logger(TimelineEventWriterStub.name);

  recordTimelineEvent(
    employeeId: string,
    type: string,
    effectiveDate: string,
    _oldValue: unknown,
    _newValue: unknown,
    source: TimelineEventSource,
    authorId?: string,
  ): Promise<void> {
    this.logger.debug(
      `Wave-0 stub no-op: recordTimelineEvent(employeeId=${employeeId}, type=${type}, ` +
        `effectiveDate=${effectiveDate}, source=${source}, authorId=${authorId ?? 'n/a'})`,
    );
    return Promise.resolve();
  }

  markSystemWriteSkipped(
    manualEventId: string,
    skippedAt: string,
  ): Promise<void> {
    this.logger.debug(
      `Wave-0 stub no-op: markSystemWriteSkipped(manualEventId=${manualEventId}, skippedAt=${skippedAt})`,
    );
    return Promise.resolve();
  }
}
