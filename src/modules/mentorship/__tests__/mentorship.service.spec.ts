import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActiveMentorLookup } from '../../contracts/active-mentor-lookup.contract';
import { PrismaService } from '../../../prisma/prisma.service';
import { MentorshipService } from '../mentorship.service';

describe('MentorshipService', () => {
  let service: MentorshipService;
  const prisma = {
    employee: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    mentorshipPair: {
      findFirst: jest.fn(),
    },
  };
  const activeMentorLookup = {
    getActiveMentorForMentee: jest.fn(),
    getActiveMenteesForMentor: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MentorshipService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActiveMentorLookup, useValue: activeMentorLookup },
      ],
    }).compile();
    service = module.get(MentorshipService);
  });

  it('derives mentor status from active mentor pair', async () => {
    prisma.mentorshipPair.findFirst.mockResolvedValue({ id: 'pair-1' });

    await expect(service.deriveMentorStatus('emp-1', true)).resolves.toBe(
      'mentor',
    );
  });

  it('derives openToMentoring when flag is on and no active pair', async () => {
    prisma.mentorshipPair.findFirst.mockResolvedValue(null);

    await expect(service.deriveMentorStatus('emp-1', true)).resolves.toBe(
      'openToMentoring',
    );
  });

  it('derives none when flag is off and no active pair', async () => {
    prisma.mentorshipPair.findFirst.mockResolvedValue(null);

    await expect(service.deriveMentorStatus('emp-1', false)).resolves.toBe(
      'none',
    );
  });

  it('buildSection loads mentor, mentees, flag, and derived status', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      id: 'subject-1',
      openToMentoring: true,
    });
    prisma.mentorshipPair.findFirst.mockResolvedValue(null);
    activeMentorLookup.getActiveMentorForMentee.mockResolvedValue({
      id: 'mentor-1',
      displayName: 'Mentor',
    });
    activeMentorLookup.getActiveMenteesForMentor.mockResolvedValue([
      { id: 'mentee-1', displayName: 'Mentee' },
    ]);

    await expect(service.buildSection('subject-1')).resolves.toEqual({
      openToMentoring: true,
      mentorStatus: 'openToMentoring',
      mentor: { id: 'mentor-1', displayName: 'Mentor' },
      mentees: [{ id: 'mentee-1', displayName: 'Mentee' }],
    });
  });

  it('throws when subject employee is missing', async () => {
    prisma.employee.findUnique.mockResolvedValue(null);

    await expect(service.buildSection('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists willing mentors with identity-card fields only', async () => {
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'emp-1',
        user: { name: 'Alice', email: 'alice@example.com' },
      },
    ]);

    await expect(service.listWillingMentors()).resolves.toEqual([
      {
        id: 'emp-1',
        displayName: 'Alice',
        openToMentoring: true,
      },
    ]);
  });
});
