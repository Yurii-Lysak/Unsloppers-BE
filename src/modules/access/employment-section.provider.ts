import { Injectable } from '@nestjs/common';
import { ResolvedAudience } from '../contracts/access-resolver.contract';
import {
  currentHistoryValue,
  HistoryRowSnapshot,
} from '../directory/employee-query.helpers';
import { PrismaService } from '../../prisma/prisma.service';
import { SectionProvider } from '../contracts/section-provider.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import { EmploymentSectionDto } from './entities/employment-section.entity';

@Injectable()
@RegisterProvider('section', 'S4')
export class EmploymentSectionProvider extends SectionProvider {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async getSection(
    _viewerId: string,
    subjectId: string,
    audience?: ResolvedAudience,
  ): Promise<EmploymentSectionDto> {
    void audience;

    const employee = await this.prisma.employee.findUnique({
      where: { id: subjectId },
      select: {
        seniority: true,
        englishLevel: true,
        probationStatus: true,
        contractType: true,
        gradeHistory: {
          select: { value: true, effectiveFrom: true, effectiveTo: true },
        },
        positionHistory: {
          select: { value: true, effectiveFrom: true, effectiveTo: true },
        },
        employmentTypeHistory: {
          select: { value: true, effectiveFrom: true, effectiveTo: true },
        },
      },
    });

    if (!employee) {
      throw new Error(`Employee ${subjectId} not found`);
    }

    const gradeHistory = employee.gradeHistory as HistoryRowSnapshot[];
    const positionHistory = employee.positionHistory as HistoryRowSnapshot[];
    const employmentTypeHistory =
      employee.employmentTypeHistory as HistoryRowSnapshot[];

    return {
      grade: currentHistoryValue(gradeHistory)?.value ?? null,
      position: currentHistoryValue(positionHistory)?.value ?? null,
      employmentType: currentHistoryValue(employmentTypeHistory)?.value ?? null,
      seniority: employee.seniority,
      englishLevel: employee.englishLevel,
      probationStatus: employee.probationStatus,
      contractType: employee.contractType,
    };
  }
}
