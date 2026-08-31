import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAssignment as ProjectAssignmentRow } from '../../generated/prisma/client';
import {
  ProjectAssignment,
  ProjectAssignmentDto,
} from '../contracts/project-assignment.contract';

/**
 * C3 — real implementation, backed by the `ProjectAssignment` Prisma model
 * (Story 1.2). `access` seeds/creates rows here; `integrations` becomes the
 * real timetracker-sync writer once Epic 13 lands, with zero change to
 * consumers (`AccessResolverService`, `resourcing`).
 */
export interface CreateProjectAssignmentInput {
  employeeId: string;
  projectId: string;
  pmId: string;
  dmId: string;
  startDate: Date;
  endDate?: Date | null;
  confirmed?: boolean;
  confirmedAt?: Date | null;
}

@Injectable()
export class ProjectAssignmentService extends ProjectAssignment {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listByEmployee(employeeId: string): Promise<ProjectAssignmentDto[]> {
    const rows = await this.prisma.projectAssignment.findMany({
      where: { employeeId },
    });
    return rows.map((row) => this.toDto(row));
  }

  async listByProject(projectId: string): Promise<ProjectAssignmentDto[]> {
    const rows = await this.prisma.projectAssignment.findMany({
      where: { projectId },
    });
    return rows.map((row) => this.toDto(row));
  }

  /**
   * Outside the C3 contract — the internal-write path for seeding/manual
   * inserts. `confirmed`/`confirmedAt` are caller-supplied so a test or
   * manual insert can produce an already-confirmed row directly, defaulting
   * to the schema's `false`/`null` when omitted.
   */
  async create(
    input: CreateProjectAssignmentInput,
  ): Promise<ProjectAssignmentDto> {
    const row = await this.prisma.projectAssignment.create({
      data: {
        employeeId: input.employeeId,
        projectId: input.projectId,
        pmId: input.pmId,
        dmId: input.dmId,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        confirmed: input.confirmed ?? false,
        confirmedAt: input.confirmedAt ?? null,
      },
    });
    return this.toDto(row);
  }

  private toDto(row: ProjectAssignmentRow): ProjectAssignmentDto {
    return {
      employeeId: row.employeeId,
      projectId: row.projectId,
      pmId: row.pmId,
      dmId: row.dmId,
      startDate: row.startDate.toISOString(),
      endDate: row.endDate ? row.endDate.toISOString() : null,
      confirmed: row.confirmed,
      confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    };
  }
}
