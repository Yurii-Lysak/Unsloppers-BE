import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Clock } from '../../clock/clock.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccessResolver,
  AccessRole,
  ResolvedAudience,
  SectionAccessLevel,
  SectionId,
} from '../contracts/access-resolver.contract';
import { CreateSharedLinkDto } from './dto/create-shared-link.dto';
import {
  assertNoDuplicateSections,
  getSharedLinkDefaultSections,
  isSharedLinkNeverSection,
  isValidSectionId,
  isValidSharedLinkToken,
  listShareableCfgSections,
} from './shared-link-matrix';

const LINK_CREATOR_ROLES = new Set<AccessRole>([
  'ReportingLine',
  'ProjectLine',
  'PP',
]);

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

const SHARED_LINK_TTL_MS = 24 * 60 * 60 * 1000;

export interface SharedLinkRecord {
  id: string;
  token: string;
  subjectEmployeeId: string;
  creatorEmployeeId: string;
  recipientEmployeeId: string;
  sectionIds: SectionId[];
}

@Injectable()
export class SharedLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessResolver: AccessResolver,
    private readonly clock: Clock,
  ) {}

  async createLink(
    creatorEmployeeId: string,
    subjectEmployeeId: string,
    dto: CreateSharedLinkDto,
  ): Promise<{ token: string; url: string }> {
    if (creatorEmployeeId === subjectEmployeeId) {
      throw new BadRequestException(
        'Cannot create a shared link for your own profile',
      );
    }
    if (dto.recipientEmployeeId === creatorEmployeeId) {
      throw new BadRequestException('Cannot name yourself as the recipient');
    }

    await this.assertSubjectExists(subjectEmployeeId);
    await this.assertCanCreate(creatorEmployeeId, subjectEmployeeId);
    await this.assertValidRecipient(dto.recipientEmployeeId);

    const requestedSections = this.normalizeRequestedSections(dto.sections);
    const creatorAudience = await this.accessResolver.resolveAudience(
      creatorEmployeeId,
      subjectEmployeeId,
    );
    const grantedSections = this.intersectWithCreatorGrants(
      requestedSections,
      creatorAudience,
    );
    if (grantedSections.length !== requestedSections.length) {
      throw new BadRequestException(
        'One or more requested sections exceed the creator current access',
      );
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.clock.nowMs() + SHARED_LINK_TTL_MS);

    await this.prisma.sharedLink.create({
      data: {
        token,
        subjectEmployeeId,
        creatorEmployeeId,
        recipientEmployeeId: dto.recipientEmployeeId,
        expiresAt,
        sections: {
          create: grantedSections.map((sectionId) => ({ sectionId })),
        },
      },
    });

    return { token, url: `/shared-links/${token}` };
  }

  async findLinkByToken(token: string): Promise<SharedLinkRecord> {
    if (!isValidSharedLinkToken(token)) {
      throw new BadRequestException('Malformed shared link token');
    }

    const link = await this.prisma.sharedLink.findUnique({
      where: { token },
      include: { sections: true },
    });
    if (!link) {
      throw new NotFoundException('Shared link not found');
    }

    return {
      id: link.id,
      token: link.token,
      subjectEmployeeId: link.subjectEmployeeId,
      creatorEmployeeId: link.creatorEmployeeId,
      recipientEmployeeId: link.recipientEmployeeId,
      sectionIds: link.sections.map((row) => row.sectionId as SectionId),
    };
  }

  assertRecipient(link: SharedLinkRecord, viewerEmployeeId: string): void {
    if (link.recipientEmployeeId !== viewerEmployeeId) {
      throw new ForbiddenException('You are not the recipient of this link');
    }
  }

  async computeClampedSectionIds(link: SharedLinkRecord): Promise<SectionId[]> {
    const creatorAudience = await this.accessResolver.resolveAudience(
      link.creatorEmployeeId,
      link.subjectEmployeeId,
    );
    return link.sectionIds.filter(
      (sectionId) => creatorAudience.sections[sectionId] !== 'none',
    );
  }

  buildSharedLinkAudience(clampedSections: SectionId[]): ResolvedAudience {
    const sections = Object.fromEntries(
      ALL_SECTION_IDS.map((id) => [id, 'none']),
    ) as Record<SectionId, SectionAccessLevel>;
    for (const sectionId of clampedSections) {
      sections[sectionId] = 'R';
    }
    return { role: 'SharedLink', sections };
  }

  async getCreatorAudienceForLink(
    link: SharedLinkRecord,
  ): Promise<ResolvedAudience> {
    return this.accessResolver.resolveAudience(
      link.creatorEmployeeId,
      link.subjectEmployeeId,
    );
  }

  private normalizeRequestedSections(sections?: SectionId[]): SectionId[] {
    const cfgEnables = sections ?? [];
    for (const section of cfgEnables) {
      if (!isValidSectionId(section)) {
        throw new BadRequestException(`Unknown section id: ${String(section)}`);
      }
      if (isSharedLinkNeverSection(section)) {
        throw new BadRequestException(
          `Section ${section} cannot be shared under any configuration`,
        );
      }
      if (!listShareableCfgSections().includes(section)) {
        throw new BadRequestException(
          `Section ${section} is not configurable for shared links`,
        );
      }
    }

    try {
      assertNoDuplicateSections(cfgEnables);
    } catch {
      throw new BadRequestException('Duplicate section ids in request');
    }

    const merged = new Set<SectionId>([
      ...getSharedLinkDefaultSections(),
      ...cfgEnables,
    ]);
    return [...merged];
  }

  private intersectWithCreatorGrants(
    sections: SectionId[],
    creatorAudience: ResolvedAudience,
  ): SectionId[] {
    return sections.filter(
      (sectionId) => creatorAudience.sections[sectionId] !== 'none',
    );
  }

  private async assertCanCreate(
    creatorEmployeeId: string,
    subjectEmployeeId: string,
  ): Promise<void> {
    const audience = await this.accessResolver.resolveAudience(
      creatorEmployeeId,
      subjectEmployeeId,
    );
    if (!LINK_CREATOR_ROLES.has(audience.role)) {
      throw new ForbiddenException(
        'Only Reporting-line, Project-line, or PP access holders may create shared links',
      );
    }
  }

  private async assertSubjectExists(subjectEmployeeId: string): Promise<void> {
    const subject = await this.prisma.employee.findUnique({
      where: { id: subjectEmployeeId },
      select: { id: true },
    });
    if (!subject) {
      throw new NotFoundException('Employee not found');
    }
  }

  private async assertValidRecipient(
    recipientEmployeeId: string,
  ): Promise<void> {
    const recipient = await this.prisma.employee.findUnique({
      where: { id: recipientEmployeeId },
      include: { user: { select: { id: true } } },
    });
    if (!recipient) {
      throw new BadRequestException('Recipient employee not found');
    }
    if (recipient.employmentStatus === 'dismissed') {
      throw new BadRequestException('Recipient employee is dismissed');
    }
    if (!recipient.user) {
      throw new BadRequestException('Recipient has no linked user account');
    }
  }
}
