import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type MentorshipPairWriteClient = Pick<PrismaService, 'mentorshipPair'>;

/**
 * Internal write path for `MentorshipPair` (Story 1.7). Not Epic 9's hub —
 * no permission checks or consent gates until the orchestration layer calls in.
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

  async endActivePair(
    pairId: string,
    closureFeedback: string,
    endedAt: Date,
    tx?: MentorshipPairWriteClient,
  ): Promise<{
    id: string;
    mentorId: string;
    menteeId: string;
    startedAt: Date;
    endedAt: Date;
    closureFeedback: string;
  }> {
    const db = tx ?? this.prisma;

    const result = await db.mentorshipPair.updateMany({
      where: { id: pairId, endedAt: null },
      data: { endedAt, closureFeedback },
    });

    if (result.count === 0) {
      const existing = await db.mentorshipPair.findUnique({
        where: { id: pairId },
        select: { endedAt: true },
      });
      if (!existing) {
        throw new NotFoundException(`Mentorship pair ${pairId} not found`);
      }
      throw new ConflictException('This mentorship pair has already ended.');
    }

    const pair = await db.mentorshipPair.findUnique({
      where: { id: pairId },
      select: {
        id: true,
        mentorId: true,
        menteeId: true,
        startedAt: true,
        endedAt: true,
        closureFeedback: true,
      },
    });

    if (!pair?.endedAt || !pair.closureFeedback) {
      throw new NotFoundException(`Mentorship pair ${pairId} not found`);
    }

    return {
      id: pair.id,
      mentorId: pair.mentorId,
      menteeId: pair.menteeId,
      startedAt: pair.startedAt,
      endedAt: pair.endedAt,
      closureFeedback: pair.closureFeedback,
    };
  }
}
