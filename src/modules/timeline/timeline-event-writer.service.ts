import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TimelineEventWriter,
  TimelineEventSource,
  TimelineEventWriteContext,
} from '../contracts/timeline-event-writer.contract';

@Injectable()
export class TimelineEventWriterService extends TimelineEventWriter {
  private readonly logger = new Logger(TimelineEventWriterService.name);

  constructor(
    @Inject(forwardRef(() => PrismaService))
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async recordTimelineEvent(
    employeeId: string,
    type: string,
    effectiveDate: string,
    oldValue: unknown,
    newValue: unknown,
    source: TimelineEventSource,
    authorId?: string,
    tx?: TimelineEventWriteContext,
  ): Promise<void> {
    const db = tx ?? this.prisma;

    try {
      await db.timelineEvent.create({
        data: {
          employeeId,
          type,
          effectiveDate: new Date(effectiveDate),
          oldValue: toJsonValue(oldValue),
          newValue: toJsonValue(newValue),
          source,
          authorId: authorId ?? null,
        },
      });
    } catch (error) {
      if (tx) {
        throw error;
      }

      this.logger.error(
        `TIMELINE_WRITE_RETRY ${JSON.stringify({
          employeeId,
          type,
          effectiveDate,
          source,
          error: error instanceof Error ? error.message : String(error),
        })}`,
      );
    }
  }

  async markSystemWriteSkipped(
    manualEventId: string,
    skippedAt: string,
    tx?: TimelineEventWriteContext,
  ): Promise<void> {
    const db = tx ?? this.prisma;

    await db.timelineEvent.update({
      where: { id: manualEventId },
      data: { systemWriteSkippedAt: new Date(skippedAt) },
    });
  }
}

function toJsonValue(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === null || value === undefined) {
    return Prisma.DbNull;
  }
  return value;
}
