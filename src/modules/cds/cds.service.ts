import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CDSAssessment, IDPRecord } from '../../generated/prisma/client';
import { Clock } from '../../clock/clock.service';
import { DepartmentDirectory } from '../contracts/department-directory.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateIdpRecordDto } from './dto/create-idp-record.dto';
import { UpdateIdpRecordDto } from './dto/update-idp-record.dto';
import {
  formatIdpCalendarDate,
  normalizeCreateIdpRecordFields,
  normalizeUpdateIdpRecordFields,
} from './idp-record-input';
import {
  CdsAssessmentEntryEntity,
  CdsIdpRecordEntity,
  CdsSectionEntity,
} from './entities/cds-section.entity';

@Injectable()
export class CdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departmentDirectory: DepartmentDirectory,
    private readonly clock: Clock,
  ) {}

  async buildSection(subjectEmployeeId: string): Promise<CdsSectionEntity> {
    const [matrixLink, assessments, idpRecords] = await Promise.all([
      this.resolveMatrixLink(subjectEmployeeId),
      this.loadAssessmentsForSubject(subjectEmployeeId),
      this.loadIdpRecordsForSubject(subjectEmployeeId),
    ]);

    return {
      matrixLink,
      assessments,
      idpRecords,
    };
  }

  async createIdpRecord(
    subjectEmployeeId: string,
    dto: CreateIdpRecordDto,
  ): Promise<CdsIdpRecordEntity> {
    const normalized = normalizeCreateIdpRecordFields(dto);
    const record = await this.prisma.iDPRecord.create({
      data: {
        employeeId: subjectEmployeeId,
        description: normalized.description,
        deadline: normalized.deadline,
        fileUrl: normalized.fileUrl,
      },
    });
    return this.toIdpRecordDto(record);
  }

  async updateIdpRecord(
    subjectEmployeeId: string,
    idpId: string,
    dto: UpdateIdpRecordDto,
  ): Promise<CdsIdpRecordEntity> {
    const normalized = normalizeUpdateIdpRecordFields(dto);
    if (Object.keys(normalized).length === 0) {
      const existing = await this.findIdpRecordForSubject(
        subjectEmployeeId,
        idpId,
      );
      if (!existing) {
        throw new NotFoundException(`IDP record ${idpId} not found`);
      }
      if (existing.completedAt !== null) {
        throw new ConflictException('IDP record is already completed');
      }
      return this.toIdpRecordDto(existing);
    }

    const result = await this.prisma.iDPRecord.updateMany({
      where: {
        id: idpId,
        employeeId: subjectEmployeeId,
        completedAt: null,
      },
      data: normalized,
    });
    if (result.count === 0) {
      await this.assertOpenIdpRecord(subjectEmployeeId, idpId);
    }

    const updated = await this.findIdpRecordForSubject(
      subjectEmployeeId,
      idpId,
    );
    if (!updated) {
      throw new NotFoundException(`IDP record ${idpId} not found`);
    }
    return this.toIdpRecordDto(updated);
  }

  async completeIdpRecord(
    subjectEmployeeId: string,
    idpId: string,
  ): Promise<CdsIdpRecordEntity> {
    const result = await this.prisma.iDPRecord.updateMany({
      where: {
        id: idpId,
        employeeId: subjectEmployeeId,
        completedAt: null,
      },
      data: {
        completedAt: this.clock.now(),
      },
    });
    if (result.count === 0) {
      await this.assertOpenIdpRecord(subjectEmployeeId, idpId);
    }

    const updated = await this.findIdpRecordForSubject(
      subjectEmployeeId,
      idpId,
    );
    if (!updated) {
      throw new NotFoundException(`IDP record ${idpId} not found`);
    }
    return this.toIdpRecordDto(updated);
  }

  private async resolveMatrixLink(
    subjectEmployeeId: string,
  ): Promise<string | null> {
    const [departmentHistory, positionHistory] = await Promise.all([
      this.prisma.departmentHistory.findFirst({
        where: { employeeId: subjectEmployeeId, effectiveTo: null },
        select: { value: true },
      }),
      this.prisma.positionHistory.findFirst({
        where: { employeeId: subjectEmployeeId, effectiveTo: null },
        select: { value: true },
      }),
    ]);

    if (!departmentHistory?.value || !positionHistory?.value) {
      return null;
    }

    const department = await this.departmentDirectory.getDepartmentByName(
      departmentHistory.value,
    );
    if (!department) {
      return null;
    }

    const entry = await this.prisma.skillsMatrixEntry.findUnique({
      where: {
        departmentId_position: {
          departmentId: department.id,
          position: positionHistory.value,
        },
      },
      select: { fileUrl: true },
    });

    return entry?.fileUrl ?? null;
  }

  private async loadAssessmentsForSubject(
    subjectEmployeeId: string,
  ): Promise<CdsAssessmentEntryEntity[]> {
    const rows = await this.prisma.cDSAssessment.findMany({
      where: { employeeId: subjectEmployeeId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });

    return rows.map((row) => this.toAssessmentDto(row));
  }

  private async loadIdpRecordsForSubject(
    subjectEmployeeId: string,
  ): Promise<CdsIdpRecordEntity[]> {
    const rows = await this.prisma.iDPRecord.findMany({
      where: { employeeId: subjectEmployeeId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return rows.map((row) => this.toIdpRecordDto(row));
  }

  private findIdpRecordForSubject(
    subjectEmployeeId: string,
    idpId: string,
  ): Promise<IDPRecord | null> {
    return this.prisma.iDPRecord.findFirst({
      where: { id: idpId, employeeId: subjectEmployeeId },
    });
  }

  private async assertOpenIdpRecord(
    subjectEmployeeId: string,
    idpId: string,
  ): Promise<void> {
    const record = await this.findIdpRecordForSubject(subjectEmployeeId, idpId);
    if (!record) {
      throw new NotFoundException(`IDP record ${idpId} not found`);
    }
    if (record.completedAt !== null) {
      throw new ConflictException('IDP record is already completed');
    }
  }

  private toAssessmentDto(row: CDSAssessment): CdsAssessmentEntryEntity {
    return {
      id: row.id,
      date: formatCdsCalendarDate(row.date),
      assessor: row.assessor,
      resultLink: row.resultLink,
      conclusion: row.conclusion,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toIdpRecordDto(row: IDPRecord): CdsIdpRecordEntity {
    return {
      id: row.id,
      description: row.description,
      deadline: formatIdpCalendarDate(row.deadline),
      fileUrl: row.fileUrl,
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }
}

function formatCdsCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
