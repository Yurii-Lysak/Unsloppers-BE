import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type MentorshipPairWriteClient = Pick<PrismaService, 'mentorshipPair'>;

/**
 * Internal write path for `MentorshipPair` (Story 1.7). Not Epic 9's hub —
 * no permission checks, closure notes, or consent gates until that story lands.
 */
@Injectable()
export class MentorshipPairService {
  constructor(private readonly prisma: PrismaService) {}

  async createActivePair(
    mentorId: string,
    menteeId: string,
    tx?: MentorshipPairWriteClient,
  ): Promise<{
    id: string;
    mentorId: string;
    menteeId: string;
    startedAt: Date;
  }> {
    const db = tx ?? this.prisma;

    if (mentorId === menteeId) {
      throw new BadRequestException(
        'A mentorship pair cannot link an employee to themselves.',
      );
    }

    const existingActive = await db.mentorshipPair.findFirst({
      where: { menteeId, endedAt: null },
      select: { id: true },
    });
    if (existingActive) {
      throw new BadRequestException(
        'This mentee already has an active mentorship pair.',
      );
    }

    const row = await db.mentorshipPair.create({
      data: { mentorId, menteeId },
      select: {
        id: true,
        mentorId: true,
        menteeId: true,
        startedAt: true,
      },
    });

    return row;
  }

  async endActivePairForMentee(
    menteeId: string,
    endedAt: Date = new Date(),
  ): Promise<{ count: number }> {
    const result = await this.prisma.mentorshipPair.updateMany({
      where: { menteeId, endedAt: null },
      data: { endedAt },
    });

    return { count: result.count };
  }
}
