import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccessResolver,
  SectionAccessLevel,
  SectionId,
} from '../contracts/access-resolver.contract';
import { SectionProvider } from '../contracts/section-provider.contract';
import { LeavesSectionEntity } from '../integrations/entities/leaves-section.entity';
import { ProviderRegistryService } from '../registry/provider-registry.service';
import {
  EmployeeProfileEntity,
  ProfileSectionUnavailableEntity,
  AssembledProfileSection,
  ProfileSectionDataEntity,
} from './entities/employee-profile.entity';
import { IdentitySectionDto } from './entities/identity-section.entity';

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
 * AD-3 profile assembly — resolves C1 once, invokes section providers for
 * granted sections only. Full-access (C13) is not resolved in C1 yet; those
 * viewers currently fall through to Colleague-equivalent grants.
 */
@Injectable()
export class ProfileAssemblerService {
  private readonly logger = new Logger(ProfileAssemblerService.name);

  constructor(
    private readonly accessResolver: AccessResolver,
    private readonly registry: ProviderRegistryService,
    private readonly prisma: PrismaService,
  ) {}

  async assembleProfile(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
  ): Promise<EmployeeProfileEntity> {
    const subject = await this.prisma.employee.findUnique({
      where: { id: subjectEmployeeId },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!subject) {
      throw new NotFoundException('Employee not found');
    }

    const audience = await this.accessResolver.resolveAudience(
      viewerEmployeeId,
      subjectEmployeeId,
    );

    const sections: Record<string, AssembledProfileSection> = {};
    let displayName = subject.user.name?.trim() || subject.user.email;

    for (const sectionId of ALL_SECTION_IDS) {
      const accessLevel = audience.sections[sectionId];
      if (accessLevel === 'none') {
        continue;
      }

      const envelope = await this.loadSection(
        sectionId,
        accessLevel,
        viewerEmployeeId,
        subjectEmployeeId,
        audience,
      );
      sections[sectionId] = envelope;

      if (sectionId === 'S1' && envelope && 'data' in envelope) {
        const s1DisplayName = this.readIdentityDisplayName(envelope.data);
        if (s1DisplayName) {
          displayName = s1DisplayName;
        }
      }
    }

    return {
      employeeId: subjectEmployeeId,
      displayName,
      audience: {
        role: audience.role,
        sections: audience.sections,
      },
      sections,
    };
  }

  private readIdentityDisplayName(data: unknown): string | null {
    if (!data || typeof data !== 'object' || !('displayName' in data)) {
      return null;
    }
    const name = (data as IdentitySectionDto).displayName?.trim();
    return name || null;
  }

  private async loadSection(
    sectionId: SectionId,
    accessLevel: SectionAccessLevel,
    viewerEmployeeId: string,
    subjectEmployeeId: string,
    audience: Awaited<ReturnType<AccessResolver['resolveAudience']>>,
  ): Promise<AssembledProfileSection> {
    const unavailable = (): ProfileSectionUnavailableEntity => ({
      accessLevel: accessLevel as 'R' | 'RW',
      status: 'unavailable',
    });

    const lookup = this.registry.get<SectionProvider>('section', sectionId);
    if (lookup.status === 'unavailable') {
      return unavailable();
    }

    try {
      const data = await lookup.provider.getSection(
        viewerEmployeeId,
        subjectEmployeeId,
        audience,
      );
      if (this.isUnavailablePayload(sectionId, data)) {
        return unavailable();
      }
      return {
        accessLevel: accessLevel as 'R' | 'RW',
        data: this.toWireSectionData(sectionId, data),
      };
    } catch (error) {
      this.logger.warn(
        `Section ${sectionId} provider failed for viewer=${viewerEmployeeId} subject=${subjectEmployeeId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return unavailable();
    }
  }

  private toWireSectionData(
    sectionId: SectionId,
    data: unknown,
  ): ProfileSectionDataEntity['data'] {
    if (
      sectionId === 'S10' &&
      data &&
      typeof data === 'object' &&
      'leaves' in data
    ) {
      const leavesSection = data as LeavesSectionEntity;
      return {
        leaves: leavesSection.leaves,
        manageLeaveUrl: leavesSection.manageLeaveUrl ?? null,
      };
    }
    return data as ProfileSectionDataEntity['data'];
  }

  private isUnavailablePayload(sectionId: SectionId, data: unknown): boolean {
    if (data == null) {
      return true;
    }
    if (
      typeof data === 'object' &&
      !Array.isArray(data) &&
      Object.keys(data).length === 0
    ) {
      return true;
    }
    if (
      sectionId === 'S10' &&
      typeof data === 'object' &&
      'availability' in data &&
      (data as { availability?: string }).availability === 'unavailable'
    ) {
      return true;
    }
    if (
      typeof data === 'object' &&
      'availability' in data &&
      (data as { availability?: string }).availability === 'unavailable'
    ) {
      return true;
    }
    return false;
  }
}
