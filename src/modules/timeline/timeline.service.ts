import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TimelineEvent } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccessResolver,
  AccessRole,
  ResolvedAudience,
} from '../contracts/access-resolver.contract';
import { TimelineEventWriter } from '../contracts/timeline-event-writer.contract';
import { CreateTimelineEventDto } from './dto/create-timeline-event.dto';
import { UpdateTimelineEventDto } from './dto/update-timeline-event.dto';
import { TimelineEventEntity } from './entities/timeline-event.entity';

const TIMELINE_WRITE_ROLES: readonly AccessRole[] = ['ReportingLine', 'PP'];

@Injectable()
export class TimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessResolver: AccessResolver,
    private readonly timelineEventWriter: TimelineEventWriter,
  ) {}

  async listEvents(
    viewerId: string,
    employeeId: string,
    preResolvedAudience?: ResolvedAudience,
  ): Promise<TimelineEventEntity[]> {
    if (preResolvedAudience) {
      if (preResolvedAudience.sections.S9 === 'none') {
        throw new ForbiddenException('Career timeline is not accessible');
      }
    } else {
      await this.assertCanReadTimeline(viewerId, employeeId);
    }
    await this.assertEmployeeExists(employeeId);

    const rows = await this.prisma.timelineEvent.findMany({
      where: { employeeId, deletedAt: null },
      orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }],
    });

    return rows.map((row) => this.toEntity(row));
  }

  async createManualEvent(
    viewerId: string,
    employeeId: string,
    dto: CreateTimelineEventDto,
  ): Promise<TimelineEventEntity> {
    await this.assertCanWriteTimeline(viewerId, employeeId);
    await this.assertEmployeeExists(employeeId);

    try {
      await this.timelineEventWriter.recordTimelineEvent(
        employeeId,
        dto.type,
        dto.effectiveDate,
        dto.oldValue ?? null,
        dto.newValue ?? null,
        'manual',
        viewerId,
      );
    } catch (error) {
      this.rethrowKnownErrors(error);
    }

    const created = await this.prisma.timelineEvent.findFirst({
      where: {
        employeeId,
        type: dto.type,
        effectiveDate: parseEffectiveDate(dto.effectiveDate),
        source: 'manual',
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!created) {
      throw new NotFoundException('Timeline event was not persisted');
    }

    return this.toEntity(created);
  }

  async updateManualEvent(
    viewerId: string,
    employeeId: string,
    eventId: string,
    dto: UpdateTimelineEventDto,
  ): Promise<TimelineEventEntity> {
    await this.assertCanWriteTimeline(viewerId, employeeId);

    const existing = await this.findActiveEventForEmployee(employeeId, eventId);
    this.assertManualEvent(existing);

    try {
      const updated = await this.prisma.timelineEvent.update({
        where: { id: eventId },
        data: {
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.effectiveDate !== undefined
            ? { effectiveDate: parseEffectiveDate(dto.effectiveDate) }
            : {}),
          ...(dto.oldValue !== undefined
            ? { oldValue: toJsonValue(dto.oldValue) }
            : {}),
          ...(dto.newValue !== undefined
            ? { newValue: toJsonValue(dto.newValue) }
            : {}),
          updatedById: viewerId,
        },
      });
      return this.toEntity(updated);
    } catch (error) {
      this.rethrowKnownErrors(error);
    }
  }

  async softDeleteManualEvent(
    viewerId: string,
    employeeId: string,
    eventId: string,
  ): Promise<void> {
    await this.assertCanWriteTimeline(viewerId, employeeId);

    const existing = await this.findActiveEventForEmployee(employeeId, eventId);
    this.assertManualEvent(existing);

    try {
      await this.prisma.timelineEvent.update({
        where: { id: eventId },
        data: {
          deletedAt: new Date(),
          deletedById: viewerId,
          updatedById: viewerId,
        },
      });
    } catch (error) {
      this.rethrowKnownErrors(error);
    }
  }

  private async assertCanReadTimeline(
    viewerId: string,
    employeeId: string,
  ): Promise<void> {
    const audience = await this.accessResolver.resolveAudience(
      viewerId,
      employeeId,
    );
    if (audience.sections.S9 === 'none') {
      throw new ForbiddenException('Career timeline is not accessible');
    }
  }

  private async assertCanWriteTimeline(
    viewerId: string,
    employeeId: string,
  ): Promise<void> {
    const audience = await this.accessResolver.resolveAudience(
      viewerId,
      employeeId,
    );
    if (audience.sections.S9 === 'none') {
      throw new ForbiddenException('Career timeline is not accessible');
    }
    if (!TIMELINE_WRITE_ROLES.includes(audience.role)) {
      throw new ForbiddenException(
        'Only Unit Managers and People Partners may edit the career timeline',
      );
    }
  }

  private async assertEmployeeExists(employeeId: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException(`Employee "${employeeId}" not found`);
    }
  }

  private async findActiveEventForEmployee(
    employeeId: string,
    eventId: string,
  ): Promise<TimelineEvent> {
    const event = await this.prisma.timelineEvent.findFirst({
      where: { id: eventId, employeeId, deletedAt: null },
    });
    if (!event) {
      throw new NotFoundException(`Timeline event "${eventId}" not found`);
    }
    return event;
  }

  private assertManualEvent(event: TimelineEvent): void {
    if (event.source !== 'manual') {
      throw new ForbiddenException(
        'System-generated timeline events are immutable',
      );
    }
  }

  private toEntity(row: TimelineEvent): TimelineEventEntity {
    return {
      id: row.id,
      employeeId: row.employeeId,
      type: row.type,
      effectiveDate: row.effectiveDate,
      oldValue: row.oldValue,
      newValue: row.newValue,
      source: row.source,
      authorId: row.authorId,
      systemWriteSkippedAt: row.systemWriteSkippedAt,
      deletedAt: row.deletedAt,
      deletedById: row.deletedById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      updatedById: row.updatedById,
    };
  }

  private rethrowKnownErrors(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          'A timeline event with this type and effective date already exists',
        );
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Timeline event not found');
      }
    }
    throw error;
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

/** UTC date-only normalization — matches C4 / AD-7. */
function parseEffectiveDate(isoDateString: string): Date {
  const parsed = new Date(isoDateString);
  if (Number.isNaN(parsed.getTime())) {
    throw new ConflictException(`Invalid effectiveDate: ${isoDateString}`);
  }
  return new Date(
    Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate(),
    ),
  );
}
