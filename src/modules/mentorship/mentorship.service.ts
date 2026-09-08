import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActiveMentorLookup } from '../contracts/active-mentor-lookup.contract';
import {
  MentorStatus,
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
  ): Promise<MentorshipSectionEntity> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: subjectEmployeeId },
      select: { id: true, openToMentoring: true },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${subjectEmployeeId} not found`);
    }

    const mentor =
      await this.activeMentorLookup.getActiveMentorForMentee(subjectEmployeeId);
    const mentees =
      await this.activeMentorLookup.getActiveMenteesForMentor(
        subjectEmployeeId,
      );
    const mentorStatus = await this.deriveMentorStatus(
      subjectEmployeeId,
      employee.openToMentoring,
    );

    return {
      openToMentoring: employee.openToMentoring,
      mentorStatus,
      mentor,
      mentees,
    };
  }

  async updateOpenToMentoring(
    subjectEmployeeId: string,
    openToMentoring: boolean,
  ): Promise<MentorshipSectionEntity> {
    const employee = await this.prisma.employee.update({
      where: { id: subjectEmployeeId },
      data: { openToMentoring },
      select: { id: true, openToMentoring: true },
    });

    const mentor =
      await this.activeMentorLookup.getActiveMentorForMentee(subjectEmployeeId);
    const mentees =
      await this.activeMentorLookup.getActiveMenteesForMentor(
        subjectEmployeeId,
      );
    const mentorStatus = await this.deriveMentorStatus(
      subjectEmployeeId,
      employee.openToMentoring,
    );

    return {
      openToMentoring: employee.openToMentoring,
      mentorStatus,
      mentor,
      mentees,
    };
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

  private displayName(user: { name: string | null; email: string }): string {
    return user.name?.trim() || user.email;
  }
}
