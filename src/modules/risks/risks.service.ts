import { Injectable } from '@nestjs/common';
import type { RiskRecord, User } from '../../generated/prisma/client';
import { Clock } from '../../clock/clock.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRiskRecordDto } from './dto/create-risk-record.dto';
import {
  formatRiskCalendarDate,
  normalizeRiskRecordFields,
} from './risk-input';
import {
  RiskRecordReadEntity,
  RisksSectionEntity,
} from './entities/risk-record.entity';

type RiskRecordWithAuthor = RiskRecord & {
  authorEmployee: {
    id: string;
    user: Pick<User, 'name' | 'email'>;
  };
};

@Injectable()
export class RisksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async buildSection(subjectEmployeeId: string): Promise<RisksSectionEntity> {
    const records = await this.loadRecordsForSubject(subjectEmployeeId);
    return this.toSectionDto(records);
  }

  async createRecord(
    subjectEmployeeId: string,
    authorEmployeeId: string,
    dto: CreateRiskRecordDto,
  ): Promise<RiskRecordReadEntity> {
    const normalized = normalizeRiskRecordFields(dto, this.clock);
    const record = await this.prisma.riskRecord.create({
      data: {
        subjectEmployeeId,
        authorEmployeeId,
        level: normalized.level,
        description: normalized.description,
        details: normalized.details,
        recordedAt: normalized.recordedAt,
      },
      include: this.authorInclude,
    });
    return this.toReadDto(record);
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
  ): Promise<RiskRecordWithAuthor[]> {
    return this.prisma.riskRecord.findMany({
      where: { subjectEmployeeId },
      include: this.authorInclude,
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  private toSectionDto(records: RiskRecordWithAuthor[]): RisksSectionEntity {
    const mapped = records.map((record) => this.toReadDto(record));
    return {
      records: mapped,
      ...(mapped.length > 0 ? { currentLevel: mapped[0].level } : {}),
    };
  }

  private toReadDto(record: RiskRecordWithAuthor): RiskRecordReadEntity {
    return {
      id: record.id,
      level: record.level,
      description: record.description,
      details: record.details,
      recordedAt: formatRiskCalendarDate(record.recordedAt),
      author: {
        id: record.authorEmployee.id,
        displayName: this.authorDisplayName(record.authorEmployee.user),
      },
      createdAt: record.createdAt.toISOString(),
    };
  }

  private authorDisplayName(user: Pick<User, 'name' | 'email'>): string {
    const name = user.name?.trim();
    if (name) {
      return name;
    }
    if (user.email) {
      return user.email;
    }
    return 'Unknown author';
  }
}
