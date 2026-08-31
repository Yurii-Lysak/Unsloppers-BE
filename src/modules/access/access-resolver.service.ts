import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Clock } from '../../clock/clock.service';
import {
  AccessResolver,
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

const COLLEAGUE_SECTIONS: Record<SectionId, SectionAccessLevel> = {
  S1: 'none',
  S2: 'none',
  S3: 'none',
  S4: 'none',
  S5: 'none',
  S6: 'none',
  S7: 'none',
  S8: 'none',
  S9: 'none',
  S10: 'none',
  S11: 'none',
  S12: 'none',
  S13: 'none',
  S14: 'none',
  S15: 'none',
  S16: 'none',
};

/**
 * C1 — real implementation. Resolves `Self` and `ReportingLine` (transitive,
 * cycle-safe) from live `managerId` values; every other role stays on the
 * existing coarse `Colleague` deny-all-sections default until its own story
 * (1.2, 1.7-1.10) lands. Never cached across requests (per `access-model.md`'s
 * "next request" revocation rule) — recomputed from the DB on every call.
 */
@Injectable()
export class AccessResolverService extends AccessResolver {
  private readonly logger = new Logger(AccessResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAssignment: ProjectAssignment,
    private readonly clock: Clock,
  ) {
    super();
  }

  async resolveAudience(
    viewerId: string,
    subjectId: string,
  ): Promise<ResolvedAudience> {
    if (viewerId && subjectId && viewerId === subjectId) {
      return { role: 'Self', sections: { ...SELF_SECTIONS } };
    }

    if (await this.isInReportingLine(viewerId, subjectId)) {
      return {
        role: 'ReportingLine',
        sections: { ...REPORTING_LINE_SECTIONS },
      };
    }

    const projectLine = await this.resolveProjectLine(viewerId, subjectId);
    if (projectLine) {
      return projectLine;
    }

    return { role: 'Colleague', sections: { ...COLLEAGUE_SECTIONS } };
  }

  /**
   * Manager access via project assignment (Story 1.2): the PM/DM of a
   * subject's confirmed, fresh, still-active `ProjectAssignment` rows, and
   * everyone above them via the reports-to walk, rooted at each row's
   * `pmId`/`dmId` instead of the subject. Checks every surviving row (not
   * just the first match) because a DM-leg match on *any* row sets S7 `'RW'`
   * — see the "PM on one project, DM on another" matrix scenario.
   */
  private async resolveProjectLine(
    viewerId: string,
    subjectId: string,
  ): Promise<ResolvedAudience | null> {
    const assignments = await this.projectAssignment.listByEmployee(subjectId);

    // Memoized per `id` (not per row) so a PM/DM shared across multiple rows
    // for the same subject only walks the reports-to chain once.
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
        // S7 is already at its maximum (RW) and access is already granted —
        // no remaining row can add anything further.
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

  /**
   * `decisions.md` D3/D19: a row grants access only when `confirmed` is
   * true, `confirmedAt` is non-null, not in the future (a future or
   * clock-skewed confirmation is never treated as fresh), and within the
   * freshness window (boundary inclusive — a null `confirmedAt` is always
   * stale regardless of `confirmed`); and the row is active: `startDate <=
   * now` and (`endDate` null or `endDate >= now`, boundary inclusive).
   * `startDate`/`endDate` are `@db.Date` — Postgres/Prisma always returns
   * these as UTC midnight of that calendar date, never a time-of-day — so
   * they're compared against today's UTC midnight, not the full-precision
   * `nowMs`, so a row that starts or ends "today" stays active for the
   * whole calendar day. Any unparseable date (`NaN` from `getTime()`) is
   * rejected outright rather than silently falling through every
   * comparison as `false` and reaching the permissive default. Re-checked
   * on every call against `Clock`, never cached.
   */
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

  /**
   * Walks `subjectId`'s `managerId` chain looking for `viewerId`. Plain loop,
   * not a recursive CTE (Design Notes) — one query per level, bounded by a
   * visited-id `Set` guard independent of the write-time cycle guard (D15).
   * Stops on a null lookup result (dangling/invalid id) without dereferencing
   * it, and never throws for that case or a cyclical chain — a genuine
   * Prisma/DB-level failure still propagates, which is correct: this method
   * makes no attempt to mask infrastructure errors as an access decision.
   */
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
        // A real cycle in the manager chain, not just chain exhaustion —
        // surfaces org-data corruption instead of silently degrading to
        // Colleague with no trace.
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
