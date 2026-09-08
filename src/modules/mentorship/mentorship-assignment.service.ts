import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import { SectionAccessGate } from '../contracts/section-access-gate.contract';

import {
  TimelineEventWriter,
  TimelineEventWriteContext,
} from '../contracts/timeline-event-writer.contract';

import { MentorshipPairService } from './mentorship-pair.service';

import { MentorshipService } from './mentorship.service';

export interface AssignableMentee {
  id: string;

  displayName: string;
}

export type MentorshipPairListFilter = 'active' | 'ended' | 'all';

export interface ActiveMentorshipPair {
  id: string;

  mentorId: string;

  mentorDisplayName: string;

  menteeId: string;

  menteeDisplayName: string;

  startedAt: string;

  endedAt: string | null;

  status: 'active' | 'ended';
}

export interface CreatedMentorshipPair {
  id: string;

  mentorId: string;

  menteeId: string;

  startedAt: string;

  mentorStatus: 'mentor' | 'openToMentoring' | 'none';
}

export interface EndedMentorshipPair {
  id: string;

  mentorId: string;

  menteeId: string;

  startedAt: string;

  endedAt: string;

  closureFeedback: string;

  mentorStatus: 'mentor' | 'openToMentoring' | 'none';
}

@Injectable()
export class MentorshipAssignmentService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly sectionGate: SectionAccessGate,

    private readonly pairService: MentorshipPairService,

    private readonly mentorship: MentorshipService,

    private readonly timelineWriter: TimelineEventWriter,
  ) {}

  async listAssignableMentees(
    viewerEmployeeId: string,
  ): Promise<AssignableMentee[]> {
    const subjectIds =
      await this.sectionGate.listS6SubjectIds(viewerEmployeeId);

    if (subjectIds.length === 0) {
      return [];
    }

    const activeMenteePairs = await this.prisma.mentorshipPair.findMany({
      where: { menteeId: { in: subjectIds }, endedAt: null },

      select: { menteeId: true },
    });

    const activeMenteeIds = new Set(
      activeMenteePairs.map((pair) => pair.menteeId),
    );

    const eligibleSubjectIds = subjectIds.filter(
      (id) => !activeMenteeIds.has(id),
    );

    if (eligibleSubjectIds.length === 0) {
      return [];
    }

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: eligibleSubjectIds } },

      include: {
        user: { select: { name: true, email: true } },
      },

      orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
    });

    return employees.map((employee) => ({
      id: employee.id,

      displayName: this.displayName(employee.user),
    }));
  }

  async listPairs(
    viewerEmployeeId: string,
    status: MentorshipPairListFilter = 'all',
  ): Promise<ActiveMentorshipPair[]> {
    const subjectIds =
      await this.sectionGate.listS6SubjectIds(viewerEmployeeId);

    if (subjectIds.length === 0) {
      return [];
    }

    const endedAtFilter =
      status === 'active'
        ? { endedAt: null }
        : status === 'ended'
          ? { endedAt: { not: null } }
          : {};

    const pairs = await this.prisma.mentorshipPair.findMany({
      where: {
        ...endedAtFilter,

        OR: [
          { mentorId: { in: subjectIds } },

          { menteeId: { in: subjectIds } },
        ],
      },

      include: {
        mentor: {
          include: { user: { select: { name: true, email: true } } },
        },

        mentee: {
          include: { user: { select: { name: true, email: true } } },
        },
      },

      orderBy: { startedAt: 'desc' },
    });

    return pairs.map((pair) => ({
      id: pair.id,

      mentorId: pair.mentorId,

      mentorDisplayName: this.displayName(pair.mentor.user),

      menteeId: pair.menteeId,

      menteeDisplayName: this.displayName(pair.mentee.user),

      startedAt: pair.startedAt.toISOString(),

      endedAt: pair.endedAt?.toISOString() ?? null,

      status: pair.endedAt ? 'ended' : 'active',
    }));
  }

  async createPair(
    assignerEmployeeId: string,

    mentorId: string,

    menteeId: string,
  ): Promise<CreatedMentorshipPair> {
    const subjectIds =
      await this.sectionGate.listS6SubjectIds(assignerEmployeeId);

    if (!subjectIds.includes(menteeId)) {
      throw new ForbiddenException(
        'Mentee is outside your access scope for mentorship assignment.',
      );
    }

    const pair = await this.prisma.$transaction(async (tx) => {
      const mentor = await tx.employee.findUnique({
        where: { id: mentorId },

        select: { openToMentoring: true },
      });

      if (!mentor) {
        throw new NotFoundException(`Employee ${mentorId} not found`);
      }

      if (!mentor.openToMentoring) {
        throw new BadRequestException(
          'Mentor is not open to mentoring at this time.',
        );
      }

      const mentee = await tx.employee.findUnique({
        where: { id: menteeId },

        select: { id: true },
      });

      if (!mentee) {
        throw new NotFoundException(`Employee ${menteeId} not found`);
      }

      const created = await this.pairService.createActivePair(
        mentorId,

        menteeId,

        tx,
      );

      const effectiveDate = toDateOnlyIso(created.startedAt);

      await this.timelineWriter.recordTimelineEvent(
        mentorId,

        'mentorshipStart',

        effectiveDate,

        null,

        menteeId,

        'system',

        assignerEmployeeId,

        tx as unknown as TimelineEventWriteContext,
      );

      await this.timelineWriter.recordTimelineEvent(
        menteeId,

        'mentorshipStart',

        effectiveDate,

        null,

        mentorId,

        'system',

        assignerEmployeeId,

        tx as unknown as TimelineEventWriteContext,
      );

      return created;
    });

    const mentorStatus = await this.mentorship.deriveMentorStatus(mentorId);

    return {
      id: pair.id,

      mentorId: pair.mentorId,

      menteeId: pair.menteeId,

      startedAt: pair.startedAt.toISOString(),

      mentorStatus,
    };
  }

  async endPair(
    enderEmployeeId: string,

    pairId: string,

    closureFeedback: string,
  ): Promise<EndedMentorshipPair> {
    const feedback = closureFeedback.trim();

    if (!feedback) {
      throw new BadRequestException(
        'Closing feedback is required to end a mentorship pair.',
      );
    }

    const subjectIds = await this.sectionGate.listS6SubjectIds(enderEmployeeId);

    const existingPair = await this.prisma.mentorshipPair.findUnique({
      where: { id: pairId },

      select: { mentorId: true, menteeId: true },
    });

    if (!existingPair) {
      throw new NotFoundException(`Mentorship pair ${pairId} not found`);
    }

    if (
      !subjectIds.includes(existingPair.mentorId) &&
      !subjectIds.includes(existingPair.menteeId)
    ) {
      throw new ForbiddenException(
        'This mentorship pair is outside your access scope.',
      );
    }

    const endedAt = new Date();

    const pair = await this.prisma.$transaction(async (tx) => {
      const ended = await this.pairService.endActivePair(
        pairId,

        feedback,

        endedAt,

        tx,
      );

      const effectiveDate = toDateOnlyIso(ended.endedAt);

      await this.timelineWriter.recordTimelineEvent(
        ended.mentorId,

        'mentorshipEnd',

        effectiveDate,

        null,

        ended.menteeId,

        'system',

        enderEmployeeId,

        tx as unknown as TimelineEventWriteContext,
      );

      await this.timelineWriter.recordTimelineEvent(
        ended.menteeId,

        'mentorshipEnd',

        effectiveDate,

        null,

        ended.mentorId,

        'system',

        enderEmployeeId,

        tx as unknown as TimelineEventWriteContext,
      );

      return ended;
    });

    const mentorStatus = await this.mentorship.deriveMentorStatus(
      pair.mentorId,
    );

    return {
      id: pair.id,

      mentorId: pair.mentorId,

      menteeId: pair.menteeId,

      startedAt: pair.startedAt.toISOString(),

      endedAt: pair.endedAt.toISOString(),

      closureFeedback: pair.closureFeedback,

      mentorStatus,
    };
  }

  private displayName(user: { name: string | null; email: string }): string {
    return user.name?.trim() || user.email;
  }
}

function toDateOnlyIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
