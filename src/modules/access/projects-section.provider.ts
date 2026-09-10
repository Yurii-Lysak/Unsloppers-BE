import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAssignmentDto } from '../contracts/project-assignment.contract';
import { ResolvedAudience } from '../contracts/access-resolver.contract';
import { ProjectAssignment } from '../contracts/project-assignment.contract';
import { SectionProvider } from '../contracts/section-provider.contract';
import { RegisterProvider } from '../registry/register-provider.decorator';
import {
  ProjectNameEntryEntity,
  ProjectsSectionDto,
} from './entities/projects-section.entity';

/**
 * S11 projects — project names for Colleague viewers; PM/DM display names and
 * assignment period for every other audience holding S11 `R`.
 */
@Injectable()
@RegisterProvider('section', 'S11')
export class ProjectsSectionProvider extends SectionProvider {
  constructor(
    private readonly projectAssignment: ProjectAssignment,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async getSection(
    _viewerId: string,
    subjectId: string,
    audience?: ResolvedAudience,
  ): Promise<ProjectsSectionDto> {
    const rows = await this.projectAssignment.listByEmployee(subjectId);
    const activeRows = this.filterActiveAssignments(rows);

    if (!audience || audience.role === 'Colleague') {
      return {
        projects: activeRows.map((row) => ({ name: row.projectId })),
      };
    }

    const displayNames = await this.resolveDisplayNames(
      activeRows.flatMap((row) => [row.pmId, row.dmId]),
    );

    return {
      projects: activeRows.map((row) =>
        this.toEnrichedEntry(row, displayNames),
      ),
    };
  }

  private filterActiveAssignments(
    rows: ProjectAssignmentDto[],
  ): ProjectAssignmentDto[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return rows.filter((row) => {
      if (!row.confirmed) {
        return false;
      }
      if (row.endDate && new Date(row.endDate) < today) {
        return false;
      }
      return true;
    });
  }

  private async resolveDisplayNames(
    employeeIds: string[],
  ): Promise<Map<string, string | null>> {
    const uniqueIds = [...new Set(employeeIds)];
    const resolved = new Map<string, string | null>();
    for (const id of uniqueIds) {
      resolved.set(id, null);
    }

    if (uniqueIds.length === 0) {
      return resolved;
    }

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: uniqueIds } },
      include: { user: { select: { name: true, email: true } } },
    });

    for (const employee of employees) {
      resolved.set(employee.id, this.relationDisplayName(employee.user));
    }

    return resolved;
  }

  private toEnrichedEntry(
    row: ProjectAssignmentDto,
    displayNames: Map<string, string | null>,
  ): ProjectNameEntryEntity {
    return {
      name: row.projectId,
      pm: displayNames.get(row.pmId) ?? null,
      dm: displayNames.get(row.dmId) ?? null,
      startDate: row.startDate,
      endDate: row.endDate,
    };
  }

  private relationDisplayName(user: {
    name: string | null;
    email: string;
  }): string {
    return user.name?.trim() || user.email;
  }
}
