import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { MentorshipPairService } from '../mentorship-pair.service';

describe('MentorshipPairService', () => {
  let service: MentorshipPairService;
  const prisma = {
    mentorshipPair: {
      create: jest.fn(),
      findFirst: jest.fn(),
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

  it('creates an active pair for distinct mentor and mentee', async () => {
    prisma.mentorshipPair.create.mockResolvedValue({
      id: 'pair-1',
      mentorId: 'mentor-1',
      menteeId: 'mentee-1',
    });

    await expect(
      service.createActivePair('mentor-1', 'mentee-1'),
    ).resolves.toEqual({
      id: 'pair-1',
      mentorId: 'mentor-1',
      menteeId: 'mentee-1',
    });
  });

  it('ends active pairs for a mentee', async () => {
    prisma.mentorshipPair.updateMany.mockResolvedValue({ count: 1 });
    const endedAt = new Date('2026-09-02T12:00:00.000Z');

    await expect(
      service.endActivePairForMentee('mentee-1', endedAt),
    ).resolves.toEqual({ count: 1 });

    expect(prisma.mentorshipPair.updateMany).toHaveBeenCalledWith({
      where: { menteeId: 'mentee-1', endedAt: null },
      data: { endedAt },
    });
  });
});
