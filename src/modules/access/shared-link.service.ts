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
import {
  RelationshipJournal,
  SharedLinkAccessJournalAfter,
} from '../contracts/relationship-journal.contract';
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

const MANAGE_GATE_ROLES = new Set<AccessRole>([
  'ReportingLine',
  'ProjectLine',
  'PP',
  'FullAccess',
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

const DEFAULT_EXPIRES_IN_HOURS = 24;
const MS_PER_HOUR = 3_600_000;
export const INACTIVE_LINK_MESSAGE = 'Shared link not found';

export type SharedLinkLifecycleDenial = 'expired' | 'revoked';

export interface SharedLinkRecord {
  id: string;
  token: string;
  subjectEmployeeId: string;
  creatorEmployeeId: string;
  recipientEmployeeId: string;
  sectionIds: SectionId[];
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface SharedLinkSummary {
  id: string;
  recipient: { id: string; displayName: string };
  creator: { id: string; displayName: string };
  expiresAt: string;
  createdAt: string;
  sectionIds: SectionId[];
}

export interface SharedLinkAccessLogEntry {
  accessedAt: string;
  outcome: 'granted' | 'denied';
  denialReason?: 'expired' | 'revoked' | 'wrong_recipient';
  originIp: string | null;
  recipientEmployeeId: string | null;
}

@Injectable()
export class SharedLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessResolver: AccessResolver,
    private readonly relationshipJournal: RelationshipJournal,
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
    const expiresAt = this.resolveExpiresAt(dto.expiresInHours);

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
      throw new NotFoundException(INACTIVE_LINK_MESSAGE);
    }

    return this.toRecord(link);
  }

  getLifecycleDenial(link: SharedLinkRecord): SharedLinkLifecycleDenial | null {
    if (link.revokedAt !== null) {
      return 'revoked';
    }
    if (this.clock.now().getTime() >= link.expiresAt.getTime()) {
      return 'expired';
    }
    return null;
  }

  async recordAccessAttempt(
    link: SharedLinkRecord,
    viewerEmployeeId: string,
    originIp: string | null,
    outcome: 'granted' | 'denied',
    denialReason?: 'expired' | 'revoked' | 'wrong_recipient',
  ): Promise<void> {
    const after: SharedLinkAccessJournalAfter = {
      sharedLinkId: link.id,
      outcome,
      originIp,
      recipientEmployeeId: viewerEmployeeId,
    };
    if (denialReason) {
      after.denialReason = denialReason;
    }

    await this.relationshipJournal.record(
      viewerEmployeeId,
      link.subjectEmployeeId,
      'shared_link_access',
      null,
      after,
    );
  }

  async listActiveForSubject(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
  ): Promise<SharedLinkSummary[]> {
    await this.assertSubjectExists(subjectEmployeeId);
    await this.assertCanManage(viewerEmployeeId, subjectEmployeeId);

    const now = this.clock.now();
    const links = await this.prisma.sharedLink.findMany({
      where: {
        subjectEmployeeId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      include: {
        sections: true,
        recipientEmployee: {
          include: { user: { select: { name: true, email: true } } },
        },
        creatorEmployee: {
          include: { user: { select: { name: true, email: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return links.map((link) => ({
      id: link.id,
      recipient: {
        id: link.recipientEmployeeId,
        displayName: this.employeeDisplayName(link.recipientEmployee.user),
      },
      creator: {
        id: link.creatorEmployeeId,
        displayName: this.employeeDisplayName(link.creatorEmployee.user),
      },
      expiresAt: link.expiresAt.toISOString(),
      createdAt: link.createdAt.toISOString(),
      sectionIds: link.sections.map((row) => row.sectionId as SectionId),
    }));
  }

  async revokeLink(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
    linkId: string,
  ): Promise<{ revoked: boolean }> {
    await this.assertSubjectExists(subjectEmployeeId);
    await this.assertCanManage(viewerEmployeeId, subjectEmployeeId);

    const link = await this.prisma.sharedLink.findFirst({
      where: { id: linkId, subjectEmployeeId },
    });
    if (!link) {
      throw new NotFoundException('Shared link not found');
    }

    if (link.revokedAt !== null) {
      return { revoked: true };
    }

    await this.prisma.sharedLink.update({
      where: { id: linkId },
      data: { revokedAt: this.clock.now() },
    });

    return { revoked: true };
  }

  async getAccessLog(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
    linkId: string,
  ): Promise<SharedLinkAccessLogEntry[]> {
    await this.assertSubjectExists(subjectEmployeeId);
    await this.assertCanManage(viewerEmployeeId, subjectEmployeeId);

    const link = await this.prisma.sharedLink.findFirst({
      where: { id: linkId, subjectEmployeeId },
    });
    if (!link) {
      throw new NotFoundException('Shared link not found');
    }

    const entries = await this.relationshipJournal.readFor(
      subjectEmployeeId,
      viewerEmployeeId,
    );

    return entries
      .filter((entry) => {
        const after = entry.after as SharedLinkAccessJournalAfter;
        return after.sharedLinkId === linkId;
      })
      .map((entry) => {
        const after = entry.after as SharedLinkAccessJournalAfter;
        return {
          accessedAt: entry.createdAt,
          outcome: after.outcome,
          denialReason: after.denialReason,
          originIp: after.originIp,
          recipientEmployeeId: after.recipientEmployeeId,
        };
      });
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

  resolveExpiresAt(expiresInHours?: number): Date {
    const hours = expiresInHours ?? DEFAULT_EXPIRES_IN_HOURS;
    return new Date(this.clock.nowMs() + hours * MS_PER_HOUR);
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

  private async assertCanManage(
    viewerEmployeeId: string,
    subjectEmployeeId: string,
  ): Promise<void> {
    const audience = await this.accessResolver.resolveAudience(
      viewerEmployeeId,
      subjectEmployeeId,
    );
    if (!MANAGE_GATE_ROLES.has(audience.role)) {
      throw new ForbiddenException(
        'You do not have permission to manage shared links for this employee',
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

  private employeeDisplayName(user: {
    name: string | null;
    email: string;
  }): string {
    return user.name?.trim() || user.email;
  }

  private toRecord(link: {
    id: string;
    token: string;
    subjectEmployeeId: string;
    creatorEmployeeId: string;
    recipientEmployeeId: string;
    expiresAt: Date;
    revokedAt: Date | null;
    sections: Array<{ sectionId: string }>;
  }): SharedLinkRecord {
    return {
      id: link.id,
      token: link.token,
      subjectEmployeeId: link.subjectEmployeeId,
      creatorEmployeeId: link.creatorEmployeeId,
      recipientEmployeeId: link.recipientEmployeeId,
      sectionIds: link.sections.map((row) => row.sectionId as SectionId),
      expiresAt: link.expiresAt,
      revokedAt: link.revokedAt,
    };
  }
}
