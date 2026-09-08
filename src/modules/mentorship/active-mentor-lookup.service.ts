import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ActiveMentorDto,
  ActiveMentorLookup,
} from '../contracts/active-mentor-lookup.contract';

@Injectable()
export class ActiveMentorLookupService extends ActiveMentorLookup {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async getActiveMentorForMentee(
    menteeId: string,
  ): Promise<ActiveMentorDto | null> {
    const pair = await this.prisma.mentorshipPair.findFirst({
      where: { menteeId, endedAt: null },
      orderBy: { startedAt: 'desc' },
      include: {
        mentor: {
          include: { user: { select: { name: true, email: true } } },
        },
      },
    });

    if (!pair?.mentor) {
      return null;
    }

    const displayName = this.relationDisplayName(pair.mentor.user);
    if (!displayName) {
      return null;
    }

    return { id: pair.mentor.id, displayName };
  }

  async getActiveMenteesForMentor(
    mentorId: string,
  ): Promise<ActiveMentorDto[]> {
    const pairs = await this.prisma.mentorshipPair.findMany({
      where: { mentorId, endedAt: null },
      orderBy: { startedAt: 'desc' },
      include: {
        mentee: {
          include: { user: { select: { name: true, email: true } } },
        },
      },
    });

    const mentees: ActiveMentorDto[] = [];
    for (const pair of pairs) {
      const displayName = this.relationDisplayName(pair.mentee.user);
      if (displayName) {
        mentees.push({ id: pair.mentee.id, displayName });
      }
    }
    return mentees;
  }

  private relationDisplayName(user: {
    name: string | null;
    email: string;
  }): string | null {
    const trimmed = user.name?.trim();
    return trimmed || user.email || null;
  }
}
