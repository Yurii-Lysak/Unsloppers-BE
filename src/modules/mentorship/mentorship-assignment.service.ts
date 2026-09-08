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

export interface CreatedMentorshipPair {
  id: string;
  mentorId: string;
  menteeId: string;
  startedAt: string;
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

  private displayName(user: { name: string | null; email: string }): string {
    return user.name?.trim() || user.email;
  }
}

function toDateOnlyIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
