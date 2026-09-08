import { Injectable, NotFoundException } from '@nestjs/common';
import { AccessRole } from '../contracts/access-resolver.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { ActiveMentorLookup } from '../contracts/active-mentor-lookup.contract';
import {
  MentorStatus,
  MentorshipPairHistoryEntity,
  MentorshipRelationEntity,
  MentorshipSectionEntity,
  WillingMentorEntity,
} from './entities/mentorship-section.entity';

@Injectable()
export class MentorshipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activeMentorLookup: ActiveMentorLookup,
  ) {}

  async buildSection(
    subjectEmployeeId: string,
    audienceRole?: AccessRole,
  ): Promise<MentorshipSectionEntity> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: subjectEmployeeId },
      select: { id: true, openToMentoring: true },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${subjectEmployeeId} not found`);
    }

    const activeMentorPair = await this.prisma.mentorshipPair.findFirst({
      where: { menteeId: subjectEmployeeId, endedAt: null },
      select: { id: true },
    });
    const activeMentor =
      await this.activeMentorLookup.getActiveMentorForMentee(subjectEmployeeId);
    const activeMenteePairs = await this.prisma.mentorshipPair.findMany({
      where: { mentorId: subjectEmployeeId, endedAt: null },
      orderBy: { startedAt: 'desc' },
      include: {
        mentee: {
          include: { user: { select: { name: true, email: true } } },
        },
      },
    });

    const mentees: MentorshipRelationEntity[] = activeMenteePairs.map(
      (pair) => ({
        id: pair.mentee.id,
        displayName: this.displayName(pair.mentee.user),
        pairId: pair.id,
      }),
    );

    const mentorStatus = await this.deriveMentorStatus(
      subjectEmployeeId,
      employee.openToMentoring,
    );

    const pairHistory = await this.loadPairHistory(
      subjectEmployeeId,
      audienceRole,
    );

    return {
      openToMentoring: employee.openToMentoring,
      mentorStatus,
      mentor: activeMentor
        ? {
            id: activeMentor.id,
            displayName: activeMentor.displayName,
            pairId: activeMentorPair?.id,
          }
        : null,
      mentees,
      pairHistory,
    };
  }

  async updateOpenToMentoring(
    subjectEmployeeId: string,
    openToMentoring: boolean,
    audienceRole?: AccessRole,
  ): Promise<MentorshipSectionEntity> {
    await this.prisma.employee.update({
      where: { id: subjectEmployeeId },
      data: { openToMentoring },
      select: { id: true },
    });

    return this.buildSection(subjectEmployeeId, audienceRole);
  }

  async listWillingMentors(): Promise<WillingMentorEntity[]> {
    const employees = await this.prisma.employee.findMany({
      where: { openToMentoring: true },
      include: {
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
    });

    return employees.map((employee) => ({
      id: employee.id,
      displayName: this.displayName(employee.user),
      openToMentoring: true as const,
    }));
  }

  async deriveMentorStatus(
    employeeId: string,
    openToMentoring?: boolean,
  ): Promise<MentorStatus> {
    const activeAsMentor = await this.prisma.mentorshipPair.findFirst({
      where: { mentorId: employeeId, endedAt: null },
      select: { id: true },
    });
    if (activeAsMentor) {
      return 'mentor';
    }

    const flag =
      openToMentoring ??
      (
        await this.prisma.employee.findUnique({
          where: { id: employeeId },
          select: { openToMentoring: true },
        })
      )?.openToMentoring;

    if (flag) {
      return 'openToMentoring';
    }

    return 'none';
  }

  private async loadPairHistory(
    subjectEmployeeId: string,
    audienceRole?: AccessRole,
  ): Promise<MentorshipPairHistoryEntity[]> {
    const endedPairs = await this.prisma.mentorshipPair.findMany({
      where: {
        endedAt: { not: null },
        OR: [{ mentorId: subjectEmployeeId }, { menteeId: subjectEmployeeId }],
      },
      include: {
        mentor: {
          include: { user: { select: { name: true, email: true } } },
        },
        mentee: {
          include: { user: { select: { name: true, email: true } } },
        },
      },
      orderBy: { endedAt: 'desc' },
    });

    const canViewClosureFeedback = this.canViewClosureFeedback(audienceRole);

    return endedPairs.map((pair) => {
      const isMentor = pair.mentorId === subjectEmployeeId;
      const counterpart = isMentor ? pair.mentee : pair.mentor;

      return {
        id: pair.id,
        role: isMentor ? 'mentor' : 'mentee',
        counterpart: {
          id: counterpart.id,
          displayName: this.displayName(counterpart.user),
        },
        startedAt: pair.startedAt.toISOString(),
        endedAt: pair.endedAt!.toISOString(),
        closureFeedback: canViewClosureFeedback
          ? pair.closureFeedback
          : undefined,
      };
    });
  }

  private canViewClosureFeedback(audienceRole?: AccessRole): boolean {
    return (
      audienceRole === 'ReportingLine' ||
      audienceRole === 'ProjectLine' ||
      audienceRole === 'PP' ||
      audienceRole === 'FullAccess'
    );
  }

  private displayName(user: { name: string | null; email: string }): string {
    return user.name?.trim() || user.email;
  }
}
