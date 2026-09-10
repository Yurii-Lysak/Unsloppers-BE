import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../clock/clock.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DashboardAudience,
  DashboardProjectGroup,
} from '../contracts/dashboard-audience.contract';
import { ProjectAssignmentDto } from '../contracts/project-assignment.contract';

/** `decisions.md` D3/D19 — matches `SectionAccessGateService`. */
const CONFIRMATION_FRESHNESS_WINDOW_MS = 4 * 60 * 60 * 1000;

@Injectable()
export class DashboardAudienceService extends DashboardAudience {
  private readonly logger = new Logger(DashboardAudienceService.name);
  private readonly hrDepartmentValue: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    configService: ConfigService,
  ) {
    super();
    this.hrDepartmentValue =
      configService.get<string>('HR_DEPARTMENT_VALUE') ?? 'HR';
  }

  async listManagerSubordinateIds(viewerEmployeeId: string): Promise<string[]> {
    const descendants =
      await this.listReportingLineDescendantIds(viewerEmployeeId);
    return descendants.filter((id) => id !== viewerEmployeeId);
  }

  async listPpAssignedIds(viewerEmployeeId: string): Promise<string[]> {
    const anchors = await this.collectPpAnchorIds(viewerEmployeeId);
    if (anchors.size === 0) {
      return [];
    }

    const employees = await this.prisma.employee.findMany({
      where: { peoplePartnerId: { in: [...anchors] } },
      select: { id: true },
    });

    return employees.map((employee) => employee.id);
  }

  async listProjectGroups(
    viewerEmployeeId: string,
    responsibility: 'dm' | 'pm',
  ): Promise<DashboardProjectGroup[]> {
    const assignments = await this.prisma.projectAssignment.findMany({
      where:
        responsibility === 'dm'
          ? { dmId: viewerEmployeeId }
          : { pmId: viewerEmployeeId },
      select: {
        projectId: true,
        employeeId: true,
        pmId: true,
        dmId: true,
        startDate: true,
        endDate: true,
        confirmed: true,
        confirmedAt: true,
      },
    });

    const groups = new Map<string, Set<string>>();
    for (const assignment of assignments) {
      if (
        !this.isProjectAssignmentActive(this.toProjectAssignmentDto(assignment))
      ) {
        continue;
      }

      const existing = groups.get(assignment.projectId) ?? new Set<string>();
      existing.add(assignment.employeeId);
      groups.set(assignment.projectId, existing);
    }

    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([projectId, subjectIds]) => ({
        projectId,
        projectName: projectId,
        subjectIds: [...subjectIds],
      }));
  }

  private async collectPpAnchorIds(
    viewerEmployeeId: string,
  ): Promise<Set<string>> {
    const anchors = new Set<string>([viewerEmployeeId]);

    if (!(await this.isHrDepartment(viewerEmployeeId))) {
      return anchors;
    }

    const visited = new Set<string>([viewerEmployeeId]);
    const queue = [viewerEmployeeId];

    while (queue.length > 0) {
      const currentManagerId = queue.shift()!;
      const directReports = await this.prisma.employee.findMany({
        where: { managerId: currentManagerId },
        select: { id: true },
      });

      for (const report of directReports) {
        if (visited.has(report.id)) {
          this.logger.warn(
            `Cycle detected while walking PP audience from viewerId=${viewerEmployeeId}`,
          );
          continue;
        }

        visited.add(report.id);
        anchors.add(report.id);

        if (await this.isHrDepartment(report.id)) {
          queue.push(report.id);
        }
      }
    }

    return anchors;
  }

  private async isHrDepartment(employeeId: string): Promise<boolean> {
    const departmentValue = await this.getOpenDepartmentValue(employeeId);
    return departmentValue === this.hrDepartmentValue;
  }

  private async getOpenDepartmentValue(
    employeeId: string,
  ): Promise<string | null> {
    const row = await this.prisma.departmentHistory.findFirst({
      where: { employeeId, effectiveTo: null },
      select: { value: true },
    });
    return row?.value ?? null;
  }

  private async listReportingLineDescendantIds(
    managerId: string,
  ): Promise<string[]> {
    const result: string[] = [];
    const queue = [managerId];

    while (queue.length > 0) {
      const currentManagerId = queue.shift()!;
      const directReports = await this.prisma.employee.findMany({
        where: { managerId: currentManagerId },
        select: { id: true },
      });
      for (const report of directReports) {
        result.push(report.id);
        queue.push(report.id);
      }
    }

    return result;
  }

  private toProjectAssignmentDto(row: {
    employeeId: string;
    projectId: string;
    pmId: string;
    dmId: string;
    startDate: Date;
    endDate: Date | null;
    confirmed: boolean;
    confirmedAt: Date | null;
  }): ProjectAssignmentDto {
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

  private isProjectAssignmentActive(row: ProjectAssignmentDto): boolean {
    if (!row.confirmed || !row.confirmedAt) {
      return false;
    }

    const now = this.clock.now();
    const nowMs = now.getTime();
    const confirmedAtMs = new Date(row.confirmedAt).getTime();
    if (Number.isNaN(confirmedAtMs)) {
      return false;
    }
    if (confirmedAtMs > nowMs) {
      return false;
    }
    if (nowMs - confirmedAtMs > CONFIRMATION_FRESHNESS_WINDOW_MS) {
      return false;
    }

    const nowDateMs = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const startMs = new Date(row.startDate).getTime();
    if (Number.isNaN(startMs) || startMs > nowDateMs) {
      return false;
    }

    if (row.endDate) {
      const endMs = new Date(row.endDate).getTime();
      if (Number.isNaN(endMs) || endMs < nowDateMs) {
        return false;
      }
    }

    return true;
  }
}
