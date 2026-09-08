import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../clock/clock.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccessResolver,
  ResolvedAudience,
  SectionAccessLevel,
  SectionId,
} from '../contracts/access-resolver.contract';
import {
  ProjectAssignment,
  ProjectAssignmentDto,
} from '../contracts/project-assignment.contract';
import { SectionAccessGate } from '../contracts/section-access-gate.contract';

const ACCESS_LEVEL_RANK: Record<SectionAccessLevel, number> = {
  none: 0,
  R: 1,
  RW: 2,
};

/** `decisions.md` D3/D19 — matches `AccessResolverService`. */
const CONFIRMATION_FRESHNESS_WINDOW_MS = 4 * 60 * 60 * 1000;

const ALL_SECTION_IDS: SectionId[] = [
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  'S6',
  'S7',
  'S8',
  'S9',
  'S10',
  'S11',
  'S12',
  'S13',
  'S14',
  'S15',
  'S16',
];

/**
 * Shared C1 section gate for parallel routes (AD-5). Field narrowing inside
 * section providers happens after the gate passes.
 *
 * Campaign-sender exception (access-model Rule 7 / Epic 10) is deferred — no
 * runtime hook here until that epic lands.
 */
@Injectable()
export class SectionAccessGateService extends SectionAccessGate {
  private readonly logger = new Logger(SectionAccessGateService.name);

  constructor(
    private readonly accessResolver: AccessResolver,
    private readonly prisma: PrismaService,
    private readonly projectAssignment: ProjectAssignment,
    private readonly clock: Clock,
  ) {
    super();
  }

  async requireSection(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
    sectionId: SectionId,
    minLevel: SectionAccessLevel = 'R',
  ): Promise<ResolvedAudience> {
    const audience = await this.accessResolver.resolveAudience(
      viewerEmployeeId,
      subjectEmployeeId,
    );
    const grant = audience.sections[sectionId];
    if (
      grant === 'none' ||
      ACCESS_LEVEL_RANK[grant] < ACCESS_LEVEL_RANK[minLevel]
    ) {
      throw new ForbiddenException(
        `Section ${sectionId} is not accessible to this viewer`,
      );
    }
    return audience;
  }

  listGrantedSections(audience: ResolvedAudience): SectionId[] {
    return ALL_SECTION_IDS.filter((id) => audience.sections[id] !== 'none');
  }

  async canAccessRiskDashboard(viewerEmployeeId: string): Promise<boolean> {
    const subjects = await this.listS6SubjectIds(viewerEmployeeId);
    return subjects.length > 0;
  }

  async listS6SubjectIds(viewerEmployeeId: string): Promise<string[]> {
    const subjectIds = new Set<string>();

    for (const id of await this.listReportingLineDescendantIds(
      viewerEmployeeId,
    )) {
      if (id !== viewerEmployeeId) {
        subjectIds.add(id);
      }
    }

    const ppAssignments = await this.prisma.employee.findMany({
      where: { peoplePartnerId: viewerEmployeeId },
      select: { id: true },
    });
    for (const row of ppAssignments) {
      if (row.id !== viewerEmployeeId) {
        subjectIds.add(row.id);
      }
    }

    for (const id of await this.listProjectLineSubjectIds(viewerEmployeeId)) {
      if (id !== viewerEmployeeId) {
        subjectIds.add(id);
      }
    }

    return [...subjectIds];
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

  private async listProjectLineSubjectIds(
    viewerEmployeeId: string,
  ): Promise<string[]> {
    const rows = await this.prisma.projectAssignment.findMany();
    const subjectIds = new Set<string>();
    const reportingLineCache = new Map<string, Promise<boolean>>();

    const isViewerInReportingLine = (anchorId: string): Promise<boolean> => {
      let result = reportingLineCache.get(anchorId);
      if (!result) {
        result = this.isInReportingLine(viewerEmployeeId, anchorId);
        reportingLineCache.set(anchorId, result);
      }
      return result;
    };

    for (const row of rows) {
      const dto = this.toProjectAssignmentDto(row);
      if (!this.isProjectAssignmentActive(dto)) {
        continue;
      }

      const [pmMatch, dmMatch] = await Promise.all([
        isViewerInReportingLine(dto.pmId),
        isViewerInReportingLine(dto.dmId),
      ]);

      if (pmMatch || dmMatch) {
        subjectIds.add(dto.employeeId);
      }
    }

    return [...subjectIds];
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

  private async isInReportingLine(
    viewerId: string,
    subjectId: string,
  ): Promise<boolean> {
    const visited = new Set<string>();
    let currentId: string | null = subjectId;

    while (currentId) {
      if (currentId === viewerId) {
        return true;
      }

      if (visited.has(currentId)) {
        this.logger.warn(
          `Cycle detected while walking manager chain for subjectId=${subjectId}`,
        );
        break;
      }
      visited.add(currentId);

      const employee: { managerId: string | null } | null =
        await this.prisma.employee.findUnique({
          where: { id: currentId },
          select: { managerId: true },
        });
      if (!employee) {
        break;
      }

      currentId = employee.managerId;
    }

    return false;
  }
}
