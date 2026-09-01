import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AccessResolver,
  ResolvedAudience,
  SectionAccessLevel,
  SectionId,
} from '../contracts/access-resolver.contract';
import { SectionAccessGate } from '../contracts/section-access-gate.contract';

const ACCESS_LEVEL_RANK: Record<SectionAccessLevel, number> = {
  none: 0,
  R: 1,
  RW: 2,
};

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
  constructor(private readonly accessResolver: AccessResolver) {
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
}
