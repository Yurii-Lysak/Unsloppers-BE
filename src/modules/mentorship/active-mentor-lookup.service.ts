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

  private relationDisplayName(user: {
    name: string | null;
    email: string;
  }): string | null {
    const trimmed = user.name?.trim();
    return trimmed || user.email || null;
  }
}
