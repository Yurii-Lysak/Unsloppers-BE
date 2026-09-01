import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeeSummaryEntity } from './entities/employee-summary.entity';

/**
 * Minimal employee directory reads for Story 1.5 navigation shell.
 * Story 1.8 adds C1 access-matrix filtering — until then every authenticated
 * user sees the full seeded list (24 bootcamp accounts).
 */
@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<EmployeeSummaryEntity[]> {
    const employees = await this.prisma.employee.findMany({
      include: {
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ user: { name: 'asc' } }, { user: { email: 'asc' } }],
    });

    return employees.map((employee) => this.toSummary(employee));
  }

  async getById(employeeId: string): Promise<EmployeeSummaryEntity> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: { select: { name: true, email: true } },
      },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return this.toSummary(employee);
  }

  private toSummary(employee: {
    id: string;
    user: { name: string | null; email: string };
  }): EmployeeSummaryEntity {
    return {
      id: employee.id,
      displayName: employee.user.name?.trim() || employee.user.email,
    };
  }
}
