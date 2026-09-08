import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FeedbackRecord, User } from '../../generated/prisma/client';
import { Clock } from '../../clock/clock.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ResolvedAudience,
  SectionAccessLevel,
} from '../contracts/access-resolver.contract';
import { CreateFeedbackRecordDto } from './dto/create-feedback-record.dto';
import { UpdateFeedbackRecordDto } from './dto/update-feedback-record.dto';
import {
  FeedbackRecordEntity,
  FeedbackRecordReadEntity,
  FeedbackSectionEntity,
} from './entities/feedback-record.entity';
import {
  formatFeedbackCalendarDate,
  parseFeedbackRecordedAt,
} from './feedback-input';

type RecordWithAuthor = FeedbackRecord & {
  authorEmployee: {
    id: string;
    user: Pick<User, 'name' | 'email'> | null;
  };
};

@Injectable()
export class FeedbacksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async buildSection(
    subjectEmployeeId: string,
    audience: ResolvedAudience,
    accessLevel: SectionAccessLevel,
  ): Promise<FeedbackSectionEntity> {
    const records = await this.loadRecordsForSubject(subjectEmployeeId);
    return this.toSectionDto(records, audience, accessLevel);
  }

  async createRecord(
    subjectEmployeeId: string,
    authorEmployeeId: string,
    dto: CreateFeedbackRecordDto,
  ): Promise<FeedbackRecordEntity> {
    const recordedAt = parseFeedbackRecordedAt(dto.recordedAt, this.clock);
    const record = await this.prisma.feedbackRecord.create({
      data: {
        subjectEmployeeId,
        authorEmployeeId,
        recordedAt,
        context: dto.context,
        body: dto.body,
        sharedWithEmployee: dto.sharedWithEmployee ?? false,
      },
      include: this.authorInclude,
    });
    return this.toRwDto(record);
  }

  async updateRecord(
    subjectEmployeeId: string,
    feedbackId: string,
    dto: UpdateFeedbackRecordDto,
  ): Promise<FeedbackRecordEntity> {
    this.assertPatchHasFields(dto);
    const existing = await this.findRecordForSubject(
      subjectEmployeeId,
      feedbackId,
    );
    const record = await this.prisma.feedbackRecord.update({
      where: { id: existing.id },
      data: {
        ...(dto.recordedAt !== undefined
          ? {
              recordedAt: parseFeedbackRecordedAt(dto.recordedAt, this.clock),
            }
          : {}),
        ...(dto.context !== undefined ? { context: dto.context } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.sharedWithEmployee !== undefined
          ? { sharedWithEmployee: dto.sharedWithEmployee }
          : {}),
      },
      include: this.authorInclude,
    });
    return this.toRwDto(record);
  }

  async deleteRecord(
    subjectEmployeeId: string,
    feedbackId: string,
  ): Promise<void> {
    const existing = await this.findRecordForSubject(
      subjectEmployeeId,
      feedbackId,
    );
    await this.prisma.feedbackRecord.delete({ where: { id: existing.id } });
  }

  private readonly authorInclude = {
    authorEmployee: {
      include: {
        user: { select: { name: true, email: true } },
      },
    },
  } as const;

  private async loadRecordsForSubject(
    subjectEmployeeId: string,
  ): Promise<RecordWithAuthor[]> {
    return this.prisma.feedbackRecord.findMany({
      where: { subjectEmployeeId },
      include: this.authorInclude,
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  private toSectionDto(
    records: RecordWithAuthor[],
    audience: ResolvedAudience,
    accessLevel: SectionAccessLevel,
  ): FeedbackSectionEntity {
    if (accessLevel === 'RW') {
      return { records: records.map((record) => this.toRwDto(record)) };
    }

    if (accessLevel === 'R') {
      const visible = records.filter((record) => record.sharedWithEmployee);
      return { records: visible.map((record) => this.toReadDto(record)) };
    }

    throw new ForbiddenException('Unsupported S8 read audience');
  }

  private toRwDto(record: RecordWithAuthor): FeedbackRecordEntity {
    return {
      ...this.toReadDto(record),
      sharedWithEmployee: record.sharedWithEmployee,
    };
  }

  private toReadDto(record: RecordWithAuthor): FeedbackRecordReadEntity {
    return {
      id: record.id,
      recordedAt: formatFeedbackCalendarDate(record.recordedAt),
      context: record.context,
      body: record.body,
      author: {
        id: record.authorEmployee.id,
        displayName: this.authorDisplayName(record.authorEmployee.user),
      },
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private authorDisplayName(user: Pick<User, 'name' | 'email'> | null): string {
    const name = user?.name?.trim();
    if (name) {
      return name;
    }
    if (user?.email) {
      return user.email;
    }
    return 'Unknown author';
  }

  private async findRecordForSubject(
    subjectEmployeeId: string,
    feedbackId: string,
  ): Promise<FeedbackRecord> {
    const record = await this.prisma.feedbackRecord.findFirst({
      where: { id: feedbackId, subjectEmployeeId },
    });
    if (!record) {
      throw new NotFoundException(`Feedback record ${feedbackId} not found`);
    }
    return record;
  }

  private assertPatchHasFields(dto: UpdateFeedbackRecordDto): void {
    const hasField =
      dto.recordedAt !== undefined ||
      dto.context !== undefined ||
      dto.body !== undefined ||
      dto.sharedWithEmployee !== undefined;
    if (!hasField) {
      throw new BadRequestException(
        'At least one of recordedAt, context, body, or sharedWithEmployee is required',
      );
    }
  }
}
