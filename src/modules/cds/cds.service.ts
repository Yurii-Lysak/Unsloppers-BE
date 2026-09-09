import { Injectable } from '@nestjs/common';
import type { CDSAssessment } from '../../generated/prisma/client';
import { DepartmentDirectory } from '../contracts/department-directory.contract';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CdsAssessmentEntryEntity,
  CdsSectionEntity,
} from './entities/cds-section.entity';

@Injectable()
export class CdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departmentDirectory: DepartmentDirectory,
  ) {}

  async buildSection(subjectEmployeeId: string): Promise<CdsSectionEntity> {
    const [matrixLink, assessments] = await Promise.all([
      this.resolveMatrixLink(subjectEmployeeId),
      this.loadAssessmentsForSubject(subjectEmployeeId),
    ]);

    return {
      matrixLink,
      assessments,
    };
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
}

function formatCdsCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
