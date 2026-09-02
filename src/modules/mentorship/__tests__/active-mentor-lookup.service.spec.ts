import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActiveMentorLookupService } from '../active-mentor-lookup.service';

describe('ActiveMentorLookupService', () => {
  let service: ActiveMentorLookupService;
  const prisma = {
    mentorshipPair: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActiveMentorLookupService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ActiveMentorLookupService);
  });

  it('returns null when no active pair exists', async () => {
    prisma.mentorshipPair.findFirst.mockResolvedValue(null);

    await expect(
      service.getActiveMentorForMentee('mentee-1'),
    ).resolves.toBeNull();
  });

  it('returns mentor display name from the latest active pair', async () => {
    prisma.mentorshipPair.findFirst.mockResolvedValue({
      mentor: {
        id: 'mentor-1',
        user: { name: 'Mentor Name', email: 'mentor@example.com' },
      },
    });

    await expect(service.getActiveMentorForMentee('mentee-1')).resolves.toEqual(
      {
        id: 'mentor-1',
        displayName: 'Mentor Name',
      },
    );

    expect(prisma.mentorshipPair.findFirst).toHaveBeenCalledWith({
      where: { menteeId: 'mentee-1', endedAt: null },
      orderBy: { startedAt: 'desc' },
      include: {
        mentor: {
          include: { user: { select: { name: true, email: true } } },
        },
      },
    });
  });

  it('returns null when mentor employee row is missing', async () => {
    prisma.mentorshipPair.findFirst.mockResolvedValue({
      mentor: null,
    });

    await expect(
      service.getActiveMentorForMentee('mentee-1'),
    ).resolves.toBeNull();
  });

  it('falls back to email when mentor name is blank', async () => {
    prisma.mentorshipPair.findFirst.mockResolvedValue({
      mentor: {
        id: 'mentor-1',
        user: { name: '   ', email: 'mentor@example.com' },
      },
    });

    await expect(service.getActiveMentorForMentee('mentee-1')).resolves.toEqual(
      {
        id: 'mentor-1',
        displayName: 'mentor@example.com',
      },
    );
  });
});
