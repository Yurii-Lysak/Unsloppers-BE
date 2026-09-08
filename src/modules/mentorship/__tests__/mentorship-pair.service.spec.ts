import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { MentorshipPairService } from '../mentorship-pair.service';

describe('MentorshipPairService', () => {
  let service: MentorshipPairService;
  const prisma = {
    mentorshipPair: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.mentorshipPair.findFirst.mockResolvedValue(null);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MentorshipPairService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(MentorshipPairService);
  });

  it('rejects self-pair creation', async () => {
    await expect(
      service.createActivePair('employee-1', 'employee-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.mentorshipPair.findFirst).not.toHaveBeenCalled();
    expect(prisma.mentorshipPair.create).not.toHaveBeenCalled();
  });

  it('rejects a second active pair for the same mentee', async () => {
    prisma.mentorshipPair.findFirst.mockResolvedValue({ id: 'existing-pair' });

    await expect(
      service.createActivePair('mentor-2', 'mentee-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.mentorshipPair.create).not.toHaveBeenCalled();
  });

  it('routes createActivePair reads and writes through the supplied transaction client', async () => {
    const tx = {
      mentorshipPair: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'pair-tx',
          mentorId: 'mentor-1',
          menteeId: 'mentee-1',
          startedAt: new Date('2026-09-08T12:00:00.000Z'),
        }),
      },
    };

    await service.createActivePair('mentor-1', 'mentee-1', tx);

    expect(tx.mentorshipPair.findFirst).toHaveBeenCalled();
    expect(tx.mentorshipPair.create).toHaveBeenCalled();
    expect(prisma.mentorshipPair.findFirst).not.toHaveBeenCalled();
    expect(prisma.mentorshipPair.create).not.toHaveBeenCalled();
  });

  it('creates an active pair for distinct mentor and mentee', async () => {
    prisma.mentorshipPair.create.mockResolvedValue({
      id: 'pair-1',
      mentorId: 'mentor-1',
      menteeId: 'mentee-1',
      startedAt: new Date('2026-09-08T12:00:00.000Z'),
    });

    await expect(
      service.createActivePair('mentor-1', 'mentee-1'),
    ).resolves.toEqual({
      id: 'pair-1',
      mentorId: 'mentor-1',
      menteeId: 'mentee-1',
      startedAt: new Date('2026-09-08T12:00:00.000Z'),
    });
  });

  it('ends an active pair with closure feedback', async () => {
    const endedAt = new Date('2026-09-02T12:00:00.000Z');
    prisma.mentorshipPair.updateMany.mockResolvedValue({ count: 1 });
    prisma.mentorshipPair.findUnique.mockResolvedValue({
      id: 'pair-1',
      mentorId: 'mentor-1',
      menteeId: 'mentee-1',
      startedAt: new Date('2026-01-01T12:00:00.000Z'),
      endedAt,
      closureFeedback: 'Great progress.',
    });

    await expect(
      service.endActivePair('pair-1', 'Great progress.', endedAt),
    ).resolves.toEqual({
      id: 'pair-1',
      mentorId: 'mentor-1',
      menteeId: 'mentee-1',
      startedAt: new Date('2026-01-01T12:00:00.000Z'),
      endedAt,
      closureFeedback: 'Great progress.',
    });

    expect(prisma.mentorshipPair.updateMany).toHaveBeenCalledWith({
      where: { id: 'pair-1', endedAt: null },
      data: { endedAt, closureFeedback: 'Great progress.' },
    });
  });

  it('rejects ending an already-ended pair with conflict', async () => {
    prisma.mentorshipPair.updateMany.mockResolvedValue({ count: 0 });
    prisma.mentorshipPair.findUnique.mockResolvedValue({
      endedAt: new Date('2026-09-01T12:00:00.000Z'),
    });

    await expect(
      service.endActivePair('pair-1', 'Late feedback.', new Date()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects ending a missing pair with not found', async () => {
    prisma.mentorshipPair.updateMany.mockResolvedValue({ count: 0 });
    prisma.mentorshipPair.findUnique.mockResolvedValue(null);

    await expect(
      service.endActivePair('missing', 'Feedback.', new Date()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
