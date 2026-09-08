import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccessResolver,
  ResolvedAudience,
  SectionId,
} from '../contracts/access-resolver.contract';
import { SectionAccessGate } from '../contracts/section-access-gate.contract';

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

const COLLEAGUE_CATALOG_SECTIONS = new Set<SectionId>([
  'S1',
  'S10',
  'S11',
  'S16',
]);

export type ListCatalogAccessResult = {
  sections: Set<SectionId>;
  /** True when the viewer manages, is PP for, or is PM/DM on at least one employee. */
  elevated: boolean;
};

function unionGrantedSections(
  gate: SectionAccessGate,
  audiences: ResolvedAudience[],
): Set<SectionId> {
  const sections = new Set<SectionId>();
  for (const audience of audiences) {
    for (const sectionId of gate.listGrantedSections(audience)) {
      sections.add(sectionId);
    }
  }
  return sections;
}

/**
 * Computes the union of profile sections a viewer may ever see on the list
 * catalog, without scanning every employee (Story 3.6).
 */
@Injectable()
export class ListCatalogAccessService {
  constructor(
    private readonly accessResolver: AccessResolver,
    private readonly sectionGate: SectionAccessGate,
    private readonly prisma: PrismaService,
  ) {}

  async resolveCatalogSections(viewerEmployeeId: string): Promise<Set<SectionId>> {
    const result = await this.resolveCatalogAccess(viewerEmployeeId);
    return result.sections;
  }

  async resolveCatalogAccess(
    viewerEmployeeId: string,
  ): Promise<ListCatalogAccessResult> {
    if (await this.hasActiveFullAccessGrant(viewerEmployeeId)) {
      return { sections: new Set(ALL_SECTION_IDS), elevated: true };
    }

    const elevated = await this.hasElevatedRelationship(viewerEmployeeId);
    if (!elevated) {
      const sections = new Set(COLLEAGUE_CATALOG_SECTIONS);
      const selfAudience = await this.accessResolver.resolveAudience(
        viewerEmployeeId,
        viewerEmployeeId,
      );
      if (selfAudience.sections.S4 !== 'none') {
        sections.add('S4');
      }
      return { sections, elevated: false };
    }

    const audiences: ResolvedAudience[] = [
      await this.accessResolver.resolveAudience(
        viewerEmployeeId,
        viewerEmployeeId,
      ),
    ];

    const report = await this.prisma.employee.findFirst({
      where: { managerId: viewerEmployeeId },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (report) {
      audiences.push(
        await this.accessResolver.resolveAudience(viewerEmployeeId, report.id),
      );
    }

    const ppSubject = await this.prisma.employee.findFirst({
      where: { peoplePartnerId: viewerEmployeeId },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (ppSubject) {
      audiences.push(
        await this.accessResolver.resolveAudience(
          viewerEmployeeId,
          ppSubject.id,
        ),
      );
    }

    const projectSubject = await this.prisma.projectAssignment.findFirst({
      where: {
        OR: [{ pmId: viewerEmployeeId }, { dmId: viewerEmployeeId }],
      },
      orderBy: { id: 'asc' },
      select: { employeeId: true },
    });
    if (projectSubject) {
      audiences.push(
        await this.accessResolver.resolveAudience(
          viewerEmployeeId,
          projectSubject.employeeId,
        ),
      );
    }

    const peer = await this.prisma.employee.findFirst({
      where: { id: { not: viewerEmployeeId } },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (peer) {
      audiences.push(
        await this.accessResolver.resolveAudience(viewerEmployeeId, peer.id),
      );
    }

    return {
      sections: unionGrantedSections(this.sectionGate, audiences),
      elevated: true,
    };
  }

  private async hasElevatedRelationship(viewerEmployeeId: string): Promise<boolean> {
    const report = await this.prisma.employee.findFirst({
      where: { managerId: viewerEmployeeId },
      select: { id: true },
    });
    if (report) {
      return true;
    }

    const ppSubject = await this.prisma.employee.findFirst({
      where: { peoplePartnerId: viewerEmployeeId },
      select: { id: true },
    });
    if (ppSubject) {
      return true;
    }

    const projectSubject = await this.prisma.projectAssignment.findFirst({
      where: {
        OR: [{ pmId: viewerEmployeeId }, { dmId: viewerEmployeeId }],
      },
      select: { id: true },
    });
    return projectSubject !== null;
  }

  private async hasActiveFullAccessGrant(
    viewerEmployeeId: string,
  ): Promise<boolean> {
    const grant = await this.prisma.fullAccessGrant.findFirst({
      where: { employeeId: viewerEmployeeId, revokedAt: null },
      select: { id: true },
    });
    return grant !== null;
  }
}
