import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Clock } from '../../clock/clock.service';
import {
  AccessResolver,
  AccessRole,
  COLLEAGUE_SECTION_GRANTS,
  ResolvedAudience,
  SectionId,
  SectionAccessLevel,
} from '../contracts/access-resolver.contract';
import {
  ProjectAssignment,
  ProjectAssignmentDto,
} from '../contracts/project-assignment.contract';

/** `decisions.md` D3/D19 — a confirmation is fresh for 4h, boundary inclusive. */
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
 * Section grants transcribed verbatim from `access-model.md`'s "Section
 * access matrix" (Reporting-line and Self columns, lines 94-111) — coarse
 * section-level R/RW/none only, no field-level nuance (that's a later
 * story's concern per spec-1-1's "Never" boundary).
 */
const REPORTING_LINE_SECTIONS: Record<SectionId, SectionAccessLevel> = {
  S1: 'RW',
  S2: 'R',
  S3: 'R',
  S4: 'RW',
  S5: 'R',
  S6: 'RW',
  S7: 'RW',
  S8: 'RW',
  S9: 'RW',
  S10: 'R',
  S11: 'R',
  S12: 'RW',
  S13: 'RW',
  S14: 'RW',
  S15: 'R',
  S16: 'RW',
};

const SELF_SECTIONS: Record<SectionId, SectionAccessLevel> = {
  S1: 'R',
  S2: 'RW',
  S3: 'RW',
  S4: 'R',
  S5: 'R',
  S6: 'none',
  S7: 'R',
  S8: 'R',
  S9: 'R',
  S10: 'R',
  S11: 'R',
  S12: 'R',
  S13: 'RW',
  S14: 'R',
  S15: 'none',
  S16: 'R',
};

/**
 * `access-model.md` Rule 2/3 — ProjectLine grants equal ReportingLine's for
 * every section except S2/S3 (`none`, out of scope until a `SectionProvider`
 * exists) and S7, which stays `RW` only when a surviving row's DM leg
 * matched the viewer (else `R` for a PM-only match) — set per-call in
 * `resolveAudience`, this base value is the PM-only ('R') default.
 */
const PROJECT_LINE_SECTIONS: Record<SectionId, SectionAccessLevel> = {
  ...REPORTING_LINE_SECTIONS,
  S2: 'none',
  S3: 'none',
  S7: 'R',
};

/** PP column — `access-model.md` matrix (Story 1.3). */
const PP_SECTIONS: Record<SectionId, SectionAccessLevel> = {
  S1: 'RW',
  S2: 'RW',
  S3: 'RW',
  S4: 'RW',
  S5: 'RW',
  S6: 'RW',
  S7: 'RW',
  S8: 'RW',
  S9: 'RW',
  S10: 'R',
  S11: 'R',
  S12: 'RW',
  S13: 'RW',
  S14: 'RW',
  S15: 'R',
  S16: 'RW',
};

/** `access-model.md` Rule 4 — Colleague whitelist (S1, S10, S11 only). */
const COLLEAGUE_SECTIONS = COLLEAGUE_SECTION_GRANTS;

const ACCESS_LEVEL_RANK: Record<SectionAccessLevel, number> = {
  none: 0,
  R: 1,
  RW: 2,
};

/** Backward-compat label rank when multiple audiences match (D13). */
const ROLE_RANK: Record<AccessRole, number> = {
  Colleague: 0,
  SharedLink: 0,
  ProjectLine: 1,
  PP: 2,
  ReportingLine: 3,
  Self: 4,
  FullAccess: 5,
};

function maxAccessLevel(
  a: SectionAccessLevel,
  b: SectionAccessLevel,
): SectionAccessLevel {
  return ACCESS_LEVEL_RANK[a] >= ACCESS_LEVEL_RANK[b] ? a : b;
}

function unionSectionMaps(
  maps: Record<SectionId, SectionAccessLevel>[],
): Record<SectionId, SectionAccessLevel> {
  const result = { ...COLLEAGUE_SECTIONS };
  for (const map of maps) {
    for (const sectionId of ALL_SECTION_IDS) {
      result[sectionId] = maxAccessLevel(result[sectionId], map[sectionId]);
    }
  }
  return result;
}

/**
 * C1 — real implementation. Resolves `Self`, `ReportingLine`, `ProjectLine`
 * (Stories 1.1–1.2), and `PP` (Story 1.3) from live relationship data.
 * Effective section access is the least-restrictive union across all matched
 * audiences (D13 / Rule 10). Never cached across requests.
 */
@Injectable()
export class AccessResolverService extends AccessResolver {
  private readonly logger = new Logger(AccessResolverService.name);
  private readonly hrDepartmentValue: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAssignment: ProjectAssignment,
    private readonly clock: Clock,
    configService: ConfigService,
  ) {
    super();
    this.hrDepartmentValue =
      configService.get<string>('HR_DEPARTMENT_VALUE') ?? 'HR';
  }

  async resolveAudience(
    viewerId: string,
    subjectId: string,
  ): Promise<ResolvedAudience> {
    if (viewerId && subjectId && viewerId === subjectId) {
      return { role: 'Self', sections: { ...SELF_SECTIONS } };
    }

    const matched: ResolvedAudience[] = [];

    const reportingLineMatched = await this.isInReportingLine(
      viewerId,
      subjectId,
    );
    if (reportingLineMatched) {
      matched.push({
        role: 'ReportingLine',
        sections: { ...REPORTING_LINE_SECTIONS },
      });
    } else {
      const projectLine = await this.resolveProjectLine(viewerId, subjectId);
      if (projectLine) {
        matched.push(projectLine);
      }
    }

    const pp = await this.resolvePp(viewerId, subjectId);
    if (pp) {
      matched.push(pp);
    }

    if (matched.length === 0) {
      return { role: 'Colleague', sections: { ...COLLEAGUE_SECTIONS } };
    }

    const sections = unionSectionMaps(matched.map((m) => m.sections));
    const role = matched.reduce((best, current) =>
      ROLE_RANK[current.role] > ROLE_RANK[best.role] ? current : best,
    ).role;

    return { role, sections };
  }

  private async resolvePp(
    viewerId: string,
    subjectId: string,
  ): Promise<ResolvedAudience | null> {
    const subject = await this.prisma.employee.findUnique({
      where: { id: subjectId },
      select: { peoplePartnerId: true },
    });
    if (!subject?.peoplePartnerId) {
      return null;
    }

    const ppMatched = await this.isInHrLine(viewerId, subject.peoplePartnerId);
    if (!ppMatched) {
      return null;
    }

    return { role: 'PP', sections: { ...PP_SECTIONS } };
  }

  /**
   * PP HR-line walk: the assigned PP plus everyone above them through
   * `managerId`, stopping at the first node whose open department ≠ HR.
   */
  private async isInHrLine(
    viewerId: string,
    assignedPpId: string,
  ): Promise<boolean> {
    if (viewerId === assignedPpId) {
      return true;
    }

    const visited = new Set<string>();
    let currentId: string | null = assignedPpId;

    const ppRow = await this.prisma.employee.findUnique({
      where: { id: assignedPpId },
      select: { managerId: true },
    });
    if (!ppRow) {
      return false;
    }
    currentId = ppRow.managerId;

    while (currentId) {
      const departmentValue = await this.getOpenDepartmentValue(currentId);
      if (departmentValue !== this.hrDepartmentValue) {
        break;
      }

      if (currentId === viewerId) {
        return true;
      }

      if (visited.has(currentId)) {
        this.logger.warn(
          `Cycle detected while walking HR line for assignedPpId=${assignedPpId}`,
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

  private async getOpenDepartmentValue(
    employeeId: string,
  ): Promise<string | null> {
    const row = await this.prisma.departmentHistory.findFirst({
      where: { employeeId, effectiveTo: null },
      select: { value: true },
    });
    return row?.value ?? null;
  }

  /**
   * Manager access via project assignment (Story 1.2): the PM/DM of a
   * subject's confirmed, fresh, still-active `ProjectAssignment` rows, and
   * everyone above them via the reports-to walk, rooted at each row's
   * `pmId`/`dmId` instead of the subject.
   */
  private async resolveProjectLine(
    viewerId: string,
    subjectId: string,
  ): Promise<ResolvedAudience | null> {
    const assignments = await this.projectAssignment.listByEmployee(subjectId);

    const reportingLineCache = new Map<string, Promise<boolean>>();
    const isViewerInReportingLine = (id: string): Promise<boolean> => {
      let result = reportingLineCache.get(id);
      if (!result) {
        result = this.isInReportingLine(viewerId, id);
        reportingLineCache.set(id, result);
      }
      return result;
    };

    let granted = false;
    let dmMatched = false;

    for (const row of assignments) {
      if (!this.isProjectAssignmentActive(row)) {
        continue;
      }

      const [pmMatch, dmMatch] = await Promise.all([
        isViewerInReportingLine(row.pmId),
        isViewerInReportingLine(row.dmId),
      ]);

      if (pmMatch || dmMatch) {
        granted = true;
      }
      if (dmMatch) {
        dmMatched = true;
        break;
      }
    }

    if (!granted) {
      return null;
    }

    return {
      role: 'ProjectLine',
      sections: { ...PROJECT_LINE_SECTIONS, S7: dmMatched ? 'RW' : 'R' },
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
    if (Number.isNaN(startMs)) {
      return false;
    }
    if (startMs > nowDateMs) {
      return false;
    }

    if (row.endDate) {
      const endMs = new Date(row.endDate).getTime();
      if (Number.isNaN(endMs)) {
        return false;
      }
      if (endMs < nowDateMs) {
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
