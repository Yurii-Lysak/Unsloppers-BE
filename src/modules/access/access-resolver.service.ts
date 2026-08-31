import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccessResolver,
  ResolvedAudience,
  SectionId,
  SectionAccessLevel,
} from '../contracts/access-resolver.contract';

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

  constructor(private readonly prisma: PrismaService) {
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

    return { role: 'Colleague', sections: { ...COLLEAGUE_SECTIONS } };
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
